# MentoBot ↔ V4 integration for `!email` / `!sub`

## Context

The MentoPoker platform migrated off pure WordPress/MySQL to a stack backed by
Supabase ("V4"). V4 exposes a private HTTP API for linking a Discord account to
a student profile and for reading current plan access. This repo (MentoBot)
still runs the legacy Discord bot; the V4 side's integration doc describes an
adapter (`scripts/integrations/mentobot-v4.mjs`) that lives in the V4 repo, not
here, and is not part of this change.

## Scope

**In scope:** rewire `bot/daily.js`'s `!email` and `!sub` command handlers to
call the V4 API instead of querying MySQL directly.

**Out of scope (left running unchanged, on MySQL):**
- The nightly cron in `bot/daily.js` (expired-membership role removal).
- `bot/purgeRoles.js`, `bot/removeRoles.js` (2h cron role writers).
- `api/api.js` webhook handlers (`subUpdated`, `rankUpdated`, `orderUpdated`).
- `bot/bot_aux.js` — confirmed dead code: not in the pm2 restart list in
  `.github/workflows/deploy.yml`, and its shared log file
  (`bot/bot.log`) has no writes after the last commit that touched it,
  meaning it never ran post-edit. Left alone, not deleted.

Retiring the MySQL-based writers above (to avoid two systems granting/revoking
the same roles) is a deliberate follow-up, done only after this change is
proven in production — not part of this spec.

## Configuration

`config/config.json` (already gitignored via `config*.json`, not tracked by
git — confirmed with `git ls-files`) gains two fields:

```json
{
  "v4Origin": "https://<v4 deployment origin>",
  "v4ApiKey": "<MENTOBOT_API_KEY, 32+ random bytes, shared secret>"
}
```

The actual key value is set directly in the local `config/config.json` on
Nacho's machine / the deploy target — never written into this spec, never
logged, never committed.

## New module: `bot/v4Client.js`

Thin axios wrapper, no new dependency (axios is already in `package.json`).

- `linkEmail(discordUserId, email)` → `POST {v4Origin}/api/integrations/discord/v1/link`
  with body `{ email, discordUserId }`.
- `getAccess(discordUserId)` → `GET {v4Origin}/api/integrations/discord/v1/access/{discordUserId}`.
- Both requests: `Authorization: Bearer <v4ApiKey>`, JSON, `timeout: 10000`,
  `maxRedirects: 0`. `v4Origin` is validated to start with `https://` at
  startup (throw if not — fail loud rather than silently downgrade to HTTP).
- Both functions resolve to `{ ok: true, data }` on 2xx or
  `{ ok: false, status, code }` otherwise (HTTP error response, network error,
  or timeout all normalize to `ok: false`). Callers never see a thrown
  exception for expected failure modes.
- Logging inside this module never includes the request body (which may
  contain the student's email) or the `Authorization` header value — only
  method, path, discordUserId, and resulting status/code.

## `planRoleMap`

New const in `daily.js`, same shape/spirit as the existing `roleMappings`
object, keyed by V4 plan slug:

```js
const planRoleMap = {
  "cash-basic": [roles.cashBasic],
  "cash-pro": [roles.cashPro],
  "cash-elite": [roles.cashElite],
  "spins-basic": [roles.spinBasic],
  "spins-pro": [roles.spinPro],
  "spins-elite": [roles.spinElite],
  "torneos-basic": [roles.torneosBasic],
  "torneos-pro": [roles.torneosPro],
  "torneos-elite": [roles.torneosElite],
  "plo-basic": [roles.pLOBasic],
  "plo-pro": [roles.pLOPro],
  "plo-elite": [],           // TBD — no confirmed role ID yet
  "mento-total-basic": [],   // TBD — no confirmed role ID yet
  "mento-total-pro": [],     // TBD — no confirmed role ID yet
  "mento-total-elite": [],   // TBD — no confirmed role ID yet
  "mento-free": [],          // TBD — no confirmed role ID yet
};
```

Any slug returned by V4 that maps to `[]` (or isn't a key at all) is treated
as `unknown_plan`: logged (slug + discordUserId, never the email), and
excluded from the role computation for that response. Nacho fills in the TBD
role IDs in his own config/code before relying on those plans in production —
matches the V4 doc's own requirement to contrast slugs against the role map
before enabling writes for them.

The "managed" role set for removal purposes is the flattened union of all
`planRoleMap` values — i.e. only roles this map knows about are ever added or
removed by `!sub`. Admin/other roles are never touched.

## `!email` handler

`emailFunction` replaces its MySQL lookups with a single `linkEmail` call.
`discordUserId` always comes from `message.author.id` (never parsed from the
command argument — matches current behavior and the V4 doc's requirement).

| V4 result | Bot response |
|---|---|
| `200 linked` | Confirm the link, tell the user to run `!sub` next. |
| `404 account_not_found` | "Ese email no existe en nuestra base de datos" (same wording style as today). |
| `409 link_conflict` | "Ya está vinculado a otra cuenta — contacta con Soporte" (link to soporte channel). |
| `400 invalid_request` | Generic validation failure message (shouldn't normally trigger since the bot pre-validates email format like today). |
| `401 unauthorized`, `503 integration_unavailable`, network error, timeout | Generic "algo falló, prueba más tarde / contacta con Soporte" message; log status/code, not the email. |

A repeated identical link (same email + same discordUserId) still returns
`200` per the V4 contract, so no special-casing needed for "already linked to
the same account".

## `!sub` handler

Replaces the MySQL query in the `permisosChannelID` branch with a single
`getAccess(message.author.id)` call.

| V4 `status` | Bot behavior |
|---|---|
| `unlinked` | Keep all current roles untouched. Reply asking the user to run `!email`. |
| `unavailable`, or the HTTP call failed/timed out | Keep all current roles untouched. Reply that access couldn't be checked right now, try again later. |
| `inactive` | Remove only roles in the managed set (see above) that the member currently has. Reply that there's no active access on record. |
| `active` | Compute target = union of `planRoleMap[slug]` for each entry in `planSlugs` (skip/log unknown slugs). Add roles in target the member lacks. Remove managed roles the member has that are *not* in target (incremental diff — never a wholesale roles replace, never touches non-managed roles). Reply confirming the groups granted, same tone as the current success message. |
| `active` but target set ends up empty (all slugs unknown, or `planSlugs` empty while status is `active`) | Do **not** claim access was activated (per V4 doc). Reply that the plan couldn't be resolved and to contact Soporte. Log the raw `planSlugs` for follow-up. |

`!sub` remains restricted to the `permisosChannelID` channel, matching
current behavior — not touched in this change.

## Error handling / resilience

- Every V4 call is a single attempt per command invocation — no retries, no
  queueing. A failed/timed-out call always resolves to the "keep roles,
  apologize" branch; it is never treated as evidence of "no access."
- Nothing about this change alters Discord role-fetch/add/remove mechanics —
  same `member.roles.add/remove` calls as today, just driven by different
  source data.

## Testing

No automated test suite exists in this repo (`npm test` errors by design,
per `CLAUDE.md`). Verification is manual:
- `node --check bot/daily.js` and `node --check bot/v4Client.js` for syntax.
- Nacho exercises `!email` and `!sub` against the real V4 endpoint with test
  accounts covering: unlinked, linked+active (single and multiple plans),
  inactive, and an intentionally-unmapped plan slug — before this rolls out
  to the live channel.
