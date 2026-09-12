# MentoBot legacy-code cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the now-redundant 02:00 `desasignarRoles` cron from `bot/daily.js` and delete three dead/orphaned files (`bot/bot_aux.js`, `bot/collect.js`, `bot/changeRoles.js`), updating `CLAUDE.md` so it stops describing code that no longer exists.

**Architecture:** Two independent, low-risk edits: (1) strip cron-only functions out of `bot/daily.js`, keeping everything `!subdoble` still needs; (2) `git rm` three unreferenced files. No new modules, no behavior change to anything still in use — `roleSync.js` already covers the cron's job every 2h from V4.

**Tech Stack:** Node.js, discord.js, git. No new dependencies.

**Spec:** docs/superpowers/specs/2026-09-12-mentobot-legacy-cleanup-design.md

## Global Constraints

- Do NOT remove `mysql`, `createQuery()`, or the `host`/`user`/`password`/`database`/`port` config fields from `bot/daily.js` — `!subdoble` still needs them.
- Do NOT touch `api/api.js` or its `getDiscordRol()`/`rolesToRemove()` switches — explicitly out of scope.
- Do NOT touch the "Key plan IDs" list in `CLAUDE.md` beyond re-attributing it to `api/api.js` — it is still accurate and in use there.
- No automated test suite exists (per `CLAUDE.md`); verification is `node --check` plus manual grep/diff review, exactly as each task's steps say.

---

### Task 1: Remove the 02:00 cron from `bot/daily.js`

**Files:**
- Modify: `bot/daily.js`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new. `bot/daily.js` keeps exporting nothing (it's an entry-point script, `module.exports` doesn't exist today and still won't).

- [ ] **Step 1: Remove the `CronJob` import**

In `bot/daily.js`, delete this line near the top of the file:

```js
const CronJob = require("cron").CronJob;
```

- [ ] **Step 2: Remove the unused `RequestManager` import**

Delete this line (confirmed unused anywhere in the file — grep for `RequestManager` matches only its own require):

```js
const { RequestManager } = require("@discordjs/rest");
```

- [ ] **Step 3: Drop `userTable` and `membershipTable` from the config destructure**

Find the top-of-file destructure from `../config/config.json`:

```js
const {
  clientId,
  guildId,
  token,
  user,
  password,
  host,
  database,
  port,
  adminRole,
  permisosChannelID,
  soporteChannelID,
  roles,
  userTable,
  membershipTable,
  botID,
} = require("../config/config.json");
```

Replace with (removes `userTable` and `membershipTable` only, keeps every other field — `!subdoble` and the rest of the file still need `user`/`password`/`host`/`database`/`port`/`roles`/etc.):

```js
const {
  clientId,
  guildId,
  token,
  user,
  password,
  host,
  database,
  port,
  adminRole,
  permisosChannelID,
  soporteChannelID,
  roles,
  botID,
} = require("../config/config.json");
```

- [ ] **Step 4: Remove `desasignarRoles()`**

Delete the entire function (it is only ever called from `getPlayer()`, which is removed in Step 6):

```js
async function desasignarRoles(member, guild, subCaducada, idSub) {
  const rolesConditions = {
    [roles.cashBasic]: [7, 17, 16, 42, 43, 44],
    [roles.cashPro]: [8, 18, 19, 45, 46, 47],
    [roles.cashElite]: [9, 20, 21, 48, 49, 50],
    [roles.spinBasic]: [1, 10, 11, 33, 34, 35],
    [roles.spinPro]: [2, 12, 13, 36, 37, 38],
    [roles.spinElite]: [3, 14, 15, 39, 40, 41],
    [roles.torneosBasic]: [4, 22, 23, 51, 52, 53, 54],
    [roles.torneosPro]: [5, 24, 25, 55, 56, 57],
    [roles.torneosElite]: [27, 28, 29, 30, 31, 32],
    [roles.pLOBasic]: [61, 62, 63],
    [roles.pLOPro]: [58, 59, 60],
    [roles.totalBasic]: [69, 70, 71],
    [roles.totalPro]: [67, 68, 72],
    [roles.totalElite]: [64, 65, 66],
  };

  for (const [role, conditions] of Object.entries(rolesConditions)) {
    if (member.roles.cache.has(role) && conditions.includes(subCaducada)) {
      log(`El usuario ${member.user.username} tiene rol ${role}`);
      await removeRoleSafe(member, role);
      await new Promise((resolve) => {
        createQuery(`UPDATE ${membershipTable} SET checked = 1 where id = ${idSub}`, () => resolve());
      });
      const anunciosRole = roles[getKeyByValue(roles, role) + "Anuncios"];
      log(`El usuario ${member.user.username} tiene rol ${anunciosRole}`);
      if (anunciosRole && !member.roles.cache.has(anunciosRole)) {
        log(`Le ponemos Rol ${anunciosRole}`);
        await addRoleSafe(member, anunciosRole);
      }
    }
  }
}
```

Do not keep any part of it — `rolesConditions` is a legacy numeric-plan-ID map with no other readers, confirmed by grepping the file for `roles.cashElite`, `roles.totalBasic`, etc.

- [ ] **Step 5: Remove `getFecha()`**

Delete the entire function (only ever called from the cron block removed in Step 7):

```js
function getFecha() {
  let date_ob = new Date();
  let date = ("0" + date_ob.getDate()).slice(-2);
  let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
  let year = date_ob.getFullYear();
  let hours = date_ob.getHours();
  let minutes = date_ob.getMinutes();
  let seconds = date_ob.getSeconds();

  log(year + "-" + month + "-" + date + " " + hours + ":" + minutes + ":" + seconds);
}
```

- [ ] **Step 6: Remove `getPlayer()`**

Delete the entire function (only ever called from the cron block removed in Step 7):

```js
async function getPlayer(id, subCaducada, idSub) {
  let server = client.guilds.cache.get(guildId);
  let player = await server.members.fetch(id);
  await desasignarRoles(player, server, subCaducada, idSub);
}
```

- [ ] **Step 7: Replace the `client.once("ready", ...)` block**

Find:

```js
client.once("ready", () => {
  log("Ready!");
  const list = client.guilds.cache.get(guildId);
  //En orden de asteriscos: Segundos, minutos, horas, dias, meses, años y día de la semana
  new CronJob(
    "0 2 * * *",
    function () {
      client.guilds.cache.forEach((g) => {
        g.roles.fetch();
      });

      getFecha();
      //Hacemos una query para recuperar todos los usuarios con estado de sub experied en la web
      //Necesitamos los IDs, por lo que sus tags los convertimos en IDs.
      //SELECT u.discord, m.object_id FROM ${userTable}  AS u, ${membershipTable} AS m WHERE u.id = m.user_id AND( ( m.status IN('expired') AND m.checked IS NULL ) OR( m.status IN('active') AND m.expiration_date < CURRENT_DATE AND m.checked IS NULL ) OR( m.status IN('active') AND m.expiration_date IS NULL AND m.checked IS NULL ) ) AND u.discord IS NOT NULL AND m.object_id != 26 ORDER BY u.discord ASC;
      createQuery(
        `SELECT u.discord, m.object_id, m.id FROM ${userTable}  AS u, ${membershipTable} AS m WHERE u.id = m.user_id AND( ( m.status IN('expired') AND( m.checked IS NULL OR m.checked LIKE 0 ) ) OR( m.status IN('active', 'pending', 'cancelled') AND m.expiration_date < CURRENT_DATE AND( m.checked IS NULL OR m.checked LIKE 0 ) ) OR( m.status IN('active', 'pending', 'cancelled') AND m.expiration_date IS NULL AND( m.checked IS NULL OR m.checked LIKE 0 ) ) ) AND u.discord IS NOT NULL AND m.object_id != 26 ORDER BY u.discord ASC;`,
        async function (response) {
          let subCaducada;

          for (let i = 0; i < response.length; i++) {
            const tagUser = response[i].discord;
            subCaducada = response[i].object_id;
            idSub = response[i].id;

            const list = client.guilds.cache.get(guildId);
            await list.members.fetch().then(async (members) => {
              let member = members.find((u) => u.user.id === tagUser);

              if (member === undefined) {
                member = members.find((u) => u.user.username + "#" + u.user.discriminator === tagUser);
              }
              if (member != undefined) await getPlayer(member.user.id, subCaducada, idSub);
            });
            //Nos aseguramos de que se pone como procesado aunque no haya tenido rol alguno
            createQuery(`UPDATE ${membershipTable} SET checked = 1 where id = ${idSub}`, () => {
              log("Usuario actualizado en tabla membership");
            });
          }
        }
      );
    },
    null,
    true,
    "Europe/Madrid"
  );
});
```

Replace with:

```js
client.once("ready", () => {
  log("Ready!");
});
```

- [ ] **Step 8: Verify nothing removed is still referenced**

Run:
```bash
node --check bot/daily.js
grep -nE "desasignarRoles|getFecha|getPlayer|CronJob|RequestManager|userTable|membershipTable" bot/daily.js
```
Expected: `node --check` prints nothing (syntax OK); the `grep` prints nothing (no matches, exit code 1).

- [ ] **Step 9: Verify `!subdoble`, `!email`, `!sub` are untouched**

Run:
```bash
grep -n "subdoble\|emailFunction(message)\|getAccess(message.author.id)" bot/daily.js
```
Expected: all three still present (the `!subdoble` block, the `!email` handler's call to `emailFunction`, and `!sub`'s call to `getAccess`) — confirms Steps 1-7 only removed the cron-only code.

- [ ] **Step 10: Update `CLAUDE.md`**

Four edits in this file:

**10a.** In "Running the Applications", find:
```
# Run the interactive bot + daily cron (main entry point)
node bot/daily.js

# Run the webhook API server (port 3010)
node api/api.js

# Utility scripts (run manually or on a schedule)
node bot/purgeRoles.js   # Adds roles to all active subs (runs every 2h internally)
node bot/changeRoles.js  # One-time: adds "anuncios" role to members with only @everyone
node bot/support.js      # Daily: nudges stale support tickets (>3 days inactive)
```
Replace with:
```
# Run the interactive bot (main entry point)
node bot/daily.js

# Run the webhook API server (port 3010)
node api/api.js

# Utility scripts (run manually or on a schedule)
node bot/roleSync.js     # V4-backed role sync for the whole guild (runs every 2h internally)
node bot/support.js      # Daily: nudges stale support tickets (>3 days inactive)
```

**10b.** Find:
```
### `bot/daily.js` — Interactive Bot + Nightly Cron
- Listens for messages in specific Discord channels (`permisosChannelID`, `soporteChannelID`, deals channel `1104058780645335171`)
- Commands: `!email <email>` links a user's email to their Discord ID in MySQL; `!sub` assigns Discord roles based on active WooCommerce memberships
- Nightly cron at `02:00 Europe/Madrid`: queries expired/unchecked memberships and removes the corresponding Discord roles, then marks them `checked = 1`
- Reads config from `../config/config.json`
```
Replace with:
```
### `bot/daily.js` — Interactive Bot
- Listens for messages in specific Discord channels (`permisosChannelID`, `soporteChannelID`, deals channel `1104058780645335171`)
- Commands: `!email <email>` links a user's email to their Discord ID in MySQL; `!sub` assigns Discord roles based on active WooCommerce memberships
- Reads config from `../config/config.json`
```

**10c.** Find:
```
### Database (MySQL)
Two different table prefixes appear across scripts:
- `naw_*` — used by `bot/daily.js` (`naw_users`, `naw_rcp_memberships`) — older RCP memberships schema
- `ngf_*` — used by `bot/bot_aux.js` and `bot/purgeRoles.js` (`ngf_users`, `ngf_posts` with `post_type = 'wc_user_membership'`) — WooCommerce memberships schema

Each query creates and closes a new MySQL connection (no connection pool). The `mysql` package (v2) is used in most files; `mysql2` is also a dependency but not yet used.
```
Replace with:
```
### Database (MySQL)
- `naw_*` — still used by `bot/daily.js`'s `!subdoble` admin command (`naw_rcp_memberships`) — the only remaining MySQL read/write path in the bot; everything else resolves role/plan state from the V4 API (see `bot/v4Client.js`)
- `ngf_*` — no longer used anywhere in this repo (was read by `bot/bot_aux.js` and `bot/purgeRoles.js`, both removed)

Each query creates and closes a new MySQL connection (no connection pool). The `mysql` package (v2) is used; `mysql2` is also a dependency but not yet used.
```

**10d.** Find:
```
### Subscription → Role Mapping
WooCommerce plan IDs (numeric) map to Discord role IDs. The mapping is duplicated across multiple files:
- `bot/daily.js`: `roleMappings` object (plan DB IDs → role key names) + `CONST_ROLE_NAMES` lookup
- `bot/bot_aux.js`: `getDiscordRol()` switch
- `bot/purgeRoles.js` and `bot/changeRoles.js`: `getRoles()` switch
- `api/api.js`: `getDiscordRol()` switch (with string-to-int coercion)

Key plan IDs: `8230`=cashBasic, `8185`=spinBasic, `8233`=torneosBasic, `14142`=cashPro, `8195`=spinPro, `8234`=torneosPro, `8236`=ploBasic, `8235`=ploPro, `12150`=mentoTotalBasic, `12151`=mentoTotalPro.
```
Replace with:
```
### Subscription → Role Mapping
- `bot/daily.js` (`!sub`) and `bot/roleSync.js` share `bot/planRoleMap.js`, keyed by V4 plan slug (e.g. `cash-pro`) — the only mapping either file uses.
- `api/api.js` keeps its own separate `getDiscordRol()` switch, keyed by numeric WooCommerce plan IDs (with string-to-int coercion) — it does not read V4 or `planRoleMap.js`. Key plan IDs: `8230`=cashBasic, `8185`=spinBasic, `8233`=torneosBasic, `14142`=cashPro, `8195`=spinPro, `8234`=torneosPro, `8236`=ploBasic, `8235`=ploPro, `12150`=mentoTotalBasic, `12151`=mentoTotalPro.
```

- [ ] **Step 11: Commit**

```bash
git add bot/daily.js CLAUDE.md
git commit -m "Remove redundant 02:00 desasignarRoles cron from daily.js

roleSync.js already covers this job every 2h from V4. Keeps !subdoble's
mysql/createQuery intact since that command still needs them."
```

---

### Task 2: Delete dead files (`bot_aux.js`, `collect.js`, `changeRoles.js`)

**Files:**
- Delete: `bot/bot_aux.js`
- Delete: `bot/collect.js`
- Delete: `bot/changeRoles.js`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Task 1's finished `CLAUDE.md` (this task edits it further — run after Task 1, not in parallel, to avoid two agents racing on the same file).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Re-verify nothing requires these three files**

Run, from the repo root:
```bash
grep -rln "bot_aux\|collect\.js\|changeRoles" --include="*.js" . | grep -v node_modules
```
Expected: only the three files' own filenames appear as path matches (e.g. `bot/bot_aux.js` itself), no `require(...)` of any of them from another file. If anything unexpected shows up, stop and report it instead of deleting.

- [ ] **Step 2: Delete the files**

```bash
git rm bot/bot_aux.js bot/collect.js bot/changeRoles.js
```

- [ ] **Step 3: Update `CLAUDE.md`'s "Config Files" section**

Find:
```
### Config Files
Each app has its own `config.json`:
- `config/config.json` — used by `bot/daily.js` (and most bot scripts via `../config/config.json`)
- `api/config.json` — used by `api/api.js`
- `bot/config.json` — used by standalone bot scripts that reference `./config.json`
```
Replace with:
```
### Config Files
Each app has its own `config.json`:
- `config/config.json` — used by `bot/daily.js` and `bot/roleSync.js`
- `api/config.json` — used by `api/api.js`
- `bot/config.json` — retired: was a stale duplicate read by `bot/purgeRoles.js`/`bot/removeRoles.js`/`bot/changeRoles.js`/`bot/bot_aux.js`, all now deleted. Nothing in the repo reads it any more; the file itself is gitignored and gets deleted by hand on the production server.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Delete dead files: bot_aux.js, collect.js, changeRoles.js

None are required by any other file or correspond to a running pm2
process — confirmed via grep and pm2 list on the production server."
```

- [ ] **Step 5: Report the manual post-deploy step**

This step is not git — note it for whoever deploys: after this lands on
production and the deploy is confirmed healthy, delete the orphaned
`/root/MentoBot/bot/config.json` on the server by hand (it's gitignored,
`git reset --hard` never touches it, and nothing reads it any more).
