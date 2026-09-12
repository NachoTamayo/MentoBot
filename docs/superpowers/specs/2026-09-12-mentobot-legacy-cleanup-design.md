# MentoBot legacy-code cleanup: retire the 02:00 cron and three dead files

## Context

`roleSync.js` (see `2026-09-11-mentobot-rolesync-migration-design.md`) is now
live in production, running every 2h off the V4 API, replacing
`purgeRoles.js`/`removeRoles.js`. Nacho confirmed it also makes the 02:00
`desasignarRoles` cron inside `bot/daily.js` redundant — same job (remove
roles for expired subscriptions), same guild, just running more often and
from the correct data source. That cron should go.

Separately, three files under `bot/` are confirmed dead or orphaned:

- `bot/bot_aux.js` — already confirmed dead in the original V4 integration
  spec (not in the pm2 process list, its log file has no writes after the
  last commit that touched it).
- `bot/collect.js` — verified this session: `pm2 list` on the production
  server shows only `Gamification`, `MentoAPI`, `MentoAdmin`, `MentoBot`,
  `MentoSupport`, `roleSync` running (the first and the last two belong to
  other repos or to files staying in this one); nothing maps to
  `collect.js`. Not documented in `CLAUDE.md`. Not required by any other
  file in the repo.
- `bot/changeRoles.js` — documented in `CLAUDE.md` as a one-time utility
  (not scheduled), reads MySQL through the same stale `bot/config.json`
  duplicate `purgeRoles.js`/`removeRoles.js` used before their removal.

Nacho explicitly said to ignore `api/api.js`'s three webhook handlers
(`subUpdated`/`rankUpdated`/`orderUpdated`) — out of scope here, they are
going away on their own regardless of anything in this repo.

## Scope

**In scope:**
- Remove the 02:00 `desasignarRoles` `CronJob` from `bot/daily.js`, and
  every function that exists only to serve it.
- Delete `bot/bot_aux.js`, `bot/collect.js`, `bot/changeRoles.js`.
- Fix the `CLAUDE.md` passages that become factually wrong as a direct
  result of the above (it already went stale after the roleSync cutover —
  it still documents `bot/purgeRoles.js`, which no longer exists — so this
  cleanup also fixes that pre-existing drift where it overlaps with what's
  being touched here).
- Note the now-fully-orphaned `bot/config.json` on the production server as
  a manual post-deploy deletion (it is gitignored/untracked, so there is no
  git change for it — see Cutover below).

**Out of scope:**
- `api/api.js`'s webhook handlers and their numeric-plan-ID `getDiscordRol`
  switch — explicitly deferred by Nacho, not touched.
- The `!subdoble` admin command in `bot/daily.js` (the
  `message.channel.type === "DM"` branch, `!subdoble` prefix). It is a
  live, functioning manual command, independent of the automated cron, that
  deletes one expired `naw_rcp_memberships` row by email. It uses the same
  `createQuery()` helper and MySQL connection fields
  (`host`/`user`/`password`/`database`/`port`) the cron used — **those stay
  in `daily.js`** because of this command, even though the cron itself is
  being removed. This is called out explicitly so an implementer does not
  strip `createQuery`/`mysql` wholesale on the assumption the file goes
  fully MySQL-free.
- General `CLAUDE.md` staleness unrelated to files this change touches
  (e.g. its description of `!email`/`!sub` still saying "in MySQL" for the
  link step) — pre-existing drift from the earlier V4 migration, not
  reintroduced or worsened by this change, left alone.

## `bot/daily.js` changes

Remove entirely — every one of these exists only to serve the 02:00 cron,
confirmed by grepping the whole file for each name:

- `desasignarRoles(member, guild, subCaducada, idSub)` — the legacy
  numeric-plan-ID → role removal map (`rolesConditions`).
- `getFecha()` — only used to write a timestamp log line at cron start.
- `getPlayer(id, subCaducada, idSub)` — only used by the cron to resolve a
  member then call `desasignarRoles`.
- The `client.once("ready", ...)` block's `CronJob("0 2 * * *", ...)`
  registration and its `guild.roles.fetch()` forEach.
- `const CronJob = require("cron").CronJob;` — nothing else in the file
  uses `CronJob` once the 02:00 job is gone.
- `const { RequestManager } = require("@discordjs/rest");` — confirmed
  unused anywhere in the file (grepping the whole file for
  `RequestManager` matches only this one require line). It sits right next
  to the block being removed; trivial and safe to drop alongside it.
- `userTable` and `membershipTable` from the `../config/config.json`
  destructure — both become fully unused once the cron's SQL query (the
  only reader of either) is gone. `!subdoble`'s query hardcodes
  `naw_rcp_memberships` directly; it never references these variables.

Replace the removed `client.once("ready", ...)` block with a minimal
version that keeps the "did the bot log in" signal without the cron:

```js
client.once("ready", () => {
  log("Ready!");
});
```

Explicitly keep, unchanged:
- `mysql` require, `createQuery()`, and `host`/`user`/`password`/`database`/
  `port` from the config destructure — still used by `!subdoble`.
- `getKeyByValue()` — still used by the `!sub` handler.
- Everything else: `!email`, `!sub`, `!subdoble`, `!spam1111111`, message
  routing, `planRoleMap`/`managedRoleIds`/`roleHelpers` usage.

## File deletions

- `bot/bot_aux.js`
- `bot/collect.js`
- `bot/changeRoles.js`

Verified via `grep` across every `.js` file in the repo that none of the
three is `require()`'d anywhere else, and via `pm2 list` on the production
server that none corresponds to a running process.

## `CLAUDE.md` updates

Three passages become wrong as a direct result of this change (plus one
that was already wrong from the earlier roleSync cutover, fixed here since
it overlaps):

1. **"Running the Applications"** still lists `node bot/purgeRoles.js`
   (already deleted in the roleSync cutover, missed at the time) and
   `node bot/changeRoles.js` (deleted here). Replace with
   `node bot/roleSync.js` and drop the `changeRoles.js` line. Drop
   "+ daily cron" from the `daily.js` comment, since the cron is gone.

2. **`### bot/daily.js — Interactive Bot + Nightly Cron`** heading and its
   nightly-cron bullet describe behavior being removed. Drop
   " + Nightly Cron" from the heading and delete the nightly-cron bullet.

3. **"Database (MySQL)"** credits `bot/bot_aux.js` and `bot/purgeRoles.js`
   as the `ngf_*` schema's readers — both gone (purgeRoles already gone,
   bot_aux going now). Rewrite to say `ngf_*` is no longer used anywhere in
   the repo, and that `naw_*` is now only touched by `!subdoble`.

4. **"Subscription → Role Mapping"** claims `bot/daily.js` still has a
   `roleMappings`/`CONST_ROLE_NAMES` object (already false — replaced by
   `bot/planRoleMap.js` in the earlier V4 migration, never updated in the
   docs) and lists `bot/bot_aux.js`/`bot/purgeRoles.js`/`bot/changeRoles.js`
   switches, all gone. Rewrite to describe the current state: `daily.js`
   and `roleSync.js` share `planRoleMap.js` (V4 slugs); `api/api.js` keeps
   its own separate numeric-plan-ID switch, untouched by this change. Keep
   the "Key plan IDs" list — verified it's still accurate, and still used,
   for `api/api.js`'s switch specifically.

5. **"Config Files"** says `bot/config.json` is "used by standalone bot
   scripts that reference `./config.json`" — after this change nothing
   reads it any more. Update the bullet to say it's retired/orphaned.

## Cutover

Unlike the roleSync migration, this change carries no live-traffic risk —
it deletes code paths that either already have a live replacement
(`roleSync.js`) or were never running in production. No dry-run, no
parallel-run comparison needed. Deploy through the normal
push-to-master → GitHub Actions pipeline.

One manual, non-git step after the deploy is confirmed healthy: delete the
now-fully-orphaned `bot/config.json` from the production server
(`/root/MentoBot/bot/config.json`) — it is gitignored/untracked, so it is
never touched by `git reset --hard` on deploy, and nothing in the repo
reads it once `bot/changeRoles.js` and `bot/bot_aux.js` are gone.

## Testing

No automated test suite (per `CLAUDE.md`). Manual verification:
- `node --check bot/daily.js` after editing.
- Grep the finished `bot/daily.js` for `desasignarRoles`, `getFecha`,
  `getPlayer`, `CronJob`, `RequestManager`, `userTable`, `membershipTable`
  — none should remain.
- Confirm `!subdoble`, `!email`, `!sub` handlers are present and unchanged
  outside the specifically removed ranges (diff review, not a full rewrite).
- Re-run the "no other file requires this" grep for `bot_aux.js`,
  `collect.js`, `changeRoles.js` immediately before deleting them, in case
  of drift since this spec was written.
- After deploy: confirm `MentoBot` process is `online` in `pm2 list` and
  send a real `!sub` in the permisos channel to confirm the bot still
  responds normally.
