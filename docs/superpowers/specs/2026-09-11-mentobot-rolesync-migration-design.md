# Migrate `purgeRoles.js` / `removeRoles.js` to V4 (`bot/roleSync.js`)

## Context

`!email`/`!sub` were already migrated to V4 (see
`2026-09-09-mentobot-v4-integration-design.md`). Two other live pm2
processes still manage Discord roles from the legacy MySQL/WooCommerce
schema (`ngf_*`), independently of `!sub`:

- `bot/purgeRoles.js` (pm2 process `addRoles`) — every 2h, adds roles to
  every guild member with an active/cancelled-but-paid-through WooCommerce
  membership.
- `bot/removeRoles.js` (pm2 process `removeRoles`) — every 2h, removes roles
  from every guild member with an expired membership, then grants a single
  "Anuncios" role.

Both open a fresh Discord login on every run, use a hardcoded WooCommerce
plan-ID switch (duplicated between the two files), and read/write MySQL
directly. This spec replaces both with one V4-backed process.

Separately, `bot/daily.js` also contains a legacy 02:00 nightly `CronJob`
(`desasignarRoles`, `naw_*` schema) that does an overlapping job. Nacho
confirmed that cron is out of scope here — `purgeRoles.js`/`removeRoles.js`
are the ones that matter operationally today. The 02:00 cron is left
running unchanged, except for an unrelated crash-safety patch already
shipped (commit `995b22a`, guarding its `member.roles.add/remove` calls with
the same `addRoleSafe`/`removeRoleSafe` helpers `!sub` uses).

## Scope

**In scope:**
- New shared module `bot/planRoleMap.js`.
- New `getAccessBatch` function in `bot/v4Client.js`.
- New process `bot/roleSync.js`, replacing `purgeRoles.js` and
  `removeRoles.js`.
- Cutover: pm2 process rename, `.github/workflows/deploy.yml` update,
  deletion of the two old files once validated.

**Out of scope:**
- `bot/daily.js`'s 02:00 `desasignarRoles` cron.
- `api/api.js` webhook handlers.
- `bot/bot_aux.js` (confirmed dead code, left alone).

## New shared module: `bot/planRoleMap.js`

`planRoleMap` and `managedRoleIds` move out of `daily.js` into their own
module, unchanged in content:

```js
const { roles } = require("../config/config.json");

const planRoleMap = {
  "cash-basic": [roles.cashBasic],
  "cash-pro": [roles.cashPro],
  "cash-elite": [roles.cashUltra],
  "spins-basic": [roles.spinBasic],
  "spins-pro": [roles.spinPro],
  "spins-elite": [roles.spinUltra],
  "torneos-basic": [roles.torneosBasic],
  "torneos-pro": [roles.torneosPro],
  "torneos-elite": [roles.torneosUltra],
  "plo-basic": [roles.pLOBasic],
  "plo-pro": [roles.pLOPro],
  "mento-total-basic": [roles.cashBasic, roles.spinBasic, roles.torneosBasic, roles.pLOBasic],
  "mento-total-pro": [roles.cashPro, roles.spinPro, roles.torneosPro, roles.pLOPro],
  "mento-total-elite": [roles.cashUltra, roles.spinUltra, roles.torneosUltra, roles.pLOPro],
  "mento-free": [],
};

const managedRoleIds = Array.from(new Set(Object.values(planRoleMap).flat()));

module.exports = { planRoleMap, managedRoleIds };
```

`daily.js` is updated to `require("./planRoleMap")` instead of defining
these inline. This is the single reason the Elite/Ultra rename (2026-09-11)
caused a live incident — two independent copies of the same map drifting
apart is exactly what this module prevents going forward.

`addRoleSafe`/`removeRoleSafe` (currently private to `daily.js`) also move
into a shared module, `bot/roleHelpers.js`, since `roleSync.js` needs the
exact same "never let a Discord API rejection crash the process" behavior:

```js
async function addRoleSafe(member, roleId) { /* unchanged body */ }
async function removeRoleSafe(member, roleId) { /* unchanged body */ }
module.exports = { addRoleSafe, removeRoleSafe };
```

`daily.js` is updated to `require("./roleHelpers")` instead of defining
these inline.

## `bot/v4Client.js`: new `getAccessBatch`

```js
async function getAccessBatch(discordUserIds) {
  const path = "/access/batch";
  try {
    const response = await client.post(path, { discordUserIds });
    logCall("POST", path, `batch(${discordUserIds.length})`, response.status, null);
    return { ok: true, data: response.data };
  } catch (err) {
    const result = normalizeError(err);
    logCall("POST", path, `batch(${discordUserIds.length})`, result.status, result.code);
    return result;
  }
}
```

- Caller is responsible for chunking `discordUserIds` to at most 100 per
  call (the V4/sandbox contract limit).
- On success, `data.items` is expected to be an array of
  `{ discordUserId, status, planSlugs, checkedAt }`, one per requested ID.
  `roleSync.js` validates the response (see below) — this function itself
  does no validation beyond the HTTP-level `ok`/`err` normalization already
  used by `linkEmail`/`getAccess`.
- Same logging discipline as the rest of the module: never logs the
  response body, only the batch size and resulting status/code.

## `bot/roleSync.js`

Replaces `bot/purgeRoles.js` and `bot/removeRoles.js`. Reads the same
`../config/config.json` `daily.js` already uses (not the separate
`bot/config.json` — confirmed to be the same bot token/guild, just a
stale duplicate config file that this change retires).

### Startup

- One Discord login (`GatewayIntentBits.Guilds`, `GatewayIntentBits.GuildMembers`),
  kept alive for the life of the process — not re-logged-in per sweep, unlike
  today's `purgeRoles.js`/`removeRoles.js`.
- On `ready`, runs one sweep immediately, then schedules a `CronJob` for
  `"0 */2 * * *"` (every 2h, same cadence as today), `Europe/Madrid`,
  matching `daily.js`'s existing cron style.

### Sweep

1. `guild.members.fetch()` to load the full member list; skip any member
   where `member.user.bot` is true.
2. Chunk the remaining members into groups of 100.
3. For each chunk, call `getAccessBatch(chunk.map(m => m.id))`.
4. Validate the batch response before acting on any of it:
   - `data.items` is an array with exactly one entry per requested ID
     (matched by `discordUserId`, no duplicates, none missing).
   - Each item's `status` is one of `unlinked | inactive | active | unavailable`.
   - Each item's `planSlugs` is an array of strings, empty unless
     `status === "active"`.
   - Each item's `checkedAt` parses to a timestamp within the last 120s
     (guards against a stale/cached response being replayed).
   - If validation fails for the chunk as a whole (bad shape, count
     mismatch), the whole chunk is skipped: log
     `roleSync batch invalid size=<n>`, touch no roles, move to the next
     chunk. A single malformed/failed batch never blocks the rest of the
     sweep.
5. For each validated member in the chunk, in this order:
   1. **Compute wanted roles**, same logic as `!sub`'s `active` branch
      (reusing `planRoleMap`): `unlinked`/`unavailable` → preserve (no
      change). `inactive` → wanted = `[]`. `active` → union of
      `planRoleMap[slug]` for known slugs; unknown slugs are logged
      (`roleSync unknown plan slug discordUserId=... slug=...`) and
      excluded, same as `!sub`.
   2. **Remove first**: for every role in `managedRoleIds` the member
      currently holds that is not in the wanted set, `await removeRoleSafe`.
   3. **Add second**: for every role in the wanted set the member does not
      currently hold, `await addRoleSafe`.
   4. This order (remove, then add, per member, before moving to the next
      member) is deliberate — confirmed by Nacho to avoid a member briefly
      holding both an old and a new tier role.
   - `active` with a resolved wanted set of size 0 splits into the same two
     cases `!sub` distinguishes: if every slug was either mapped-but-empty
     (`mento-free`) or absent, with **no unrecognized slug** in the mix,
     treat it like `inactive` — wanted = `[]`, so `remove` strips every
     managed role the member currently holds (a downgrade to free must
     actually revoke paid roles, not just leave them until the member runs
     `!sub` themselves). If instead there is at least one slug that isn't a
     known key in `planRoleMap` at all, that's "can't resolve" — preserve,
     don't remove anything, and log the unknown slug(s)
     (`roleSync unknown plan slug discordUserId=... slug=...`).
6. No direct MySQL access anywhere in this file.

### Dry-run mode

A `dryRunRoleSync` boolean in `config/config.json` (defaults to `true` if
absent — safe by default). When true, step 5.2/5.3 above log what
*would* be added/removed (`roleSync dry-run discordUserId=... add=...
remove=...`) instead of calling `addRoleSafe`/`removeRoleSafe`. First
production deploy runs with this on; Nacho compares a sweep's dry-run log
against `purgeRoles.js`/`removeRoles.js`'s actual behavior over one or two
of their 2h cycles before flipping it off.

## Cutover plan

1. Deploy `roleSync.js` alongside the existing `purgeRoles`/`removeRoles`
   pm2 processes, in dry-run mode, as a *new* pm2 process (e.g. `roleSync`)
   — old processes keep running live, unaffected.
2. Compare dry-run logs against real `purgeRoles.js`/`removeRoles.js`
   behavior for at least one full cycle.
3. Once confirmed, flip `dryRunRoleSync` to `false`, restart `roleSync`.
4. Stop and delete the `addRoles` and `removeRoles` pm2 processes, `pm2 save`.
5. Update `.github/workflows/deploy.yml`'s restart line to replace
   `removeRoles addRoles` with `roleSync`.
6. Delete `bot/purgeRoles.js`, `bot/removeRoles.js`, and the now-unused
   `bot/config.json` from the repo.

Steps 3-6 all require Nacho's direct confirmation before executing, same
as every other production change in this project — this spec does not
authorize an unattended cutover.

## Error handling / resilience

- A failed/invalid batch call never removes or adds roles for that chunk —
  same "preserve on uncertainty" principle as `!sub`.
- `addRoleSafe`/`removeRoleSafe` already guarantee a single member's failed
  role mutation (missing permissions, deleted role, rate limit) is logged
  and skipped, never an unhandled rejection that crashes the process — this
  is the exact bug class already fixed twice in `daily.js` (`!sub` in
  commit `cd931cf`, the 02:00 cron in commit `995b22a`). `roleSync.js` is
  built with these helpers from the start rather than retrofitted.
- The sweep processes chunks and members sequentially (not in parallel) —
  matches today's behavior, avoids bursting Discord's rate limits across
  potentially thousands of members.

## Testing

No automated test suite in this repo. Verification is manual, reusing the
existing test harness (`config/config.test.json` +
`bot/run-test-instance.cjs` + the kit-nacho sandbox):

- `node --check bot/roleSync.js`, `bot/planRoleMap.js`, `bot/roleHelpers.js`,
  `bot/v4Client.js` for syntax.
- Run `roleSync.js` against the sandbox test server (dry-run first, then
  live) covering: a member with no link, an inactive member who still
  holds managed roles, an active member with a single plan, an active
  member with `mento-total-*`, and an unmapped/unknown plan slug — same
  scenario set already exercised for `!sub`.
- Before touching production, dry-run against the real guild and compare
  against one live cycle of `purgeRoles.js`/`removeRoles.js`, per the
  cutover plan above.
