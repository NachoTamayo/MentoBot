# purgeRoles/removeRoles → V4 roleSync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `bot/purgeRoles.js` and `bot/removeRoles.js` (MySQL-based, 2h cron, separate pm2 processes) with a single V4-backed `bot/roleSync.js`.

**Architecture:** Extract `planRoleMap`/`managedRoleIds` and `addRoleSafe`/`removeRoleSafe` out of `bot/daily.js` into two shared modules so `daily.js` and the new `roleSync.js` can never drift apart again. Add a batch-access method to `bot/v4Client.js`. Build `roleSync.js` as pure, testable reconcile logic plus a thin Discord/cron orchestration layer, with a dry-run mode for safe first rollout.

**Tech Stack:** Node.js, discord.js v14, `cron` package, axios (via existing `v4Client.js`). No test framework in this repo by design (`CLAUDE.md`: "There are no tests, `npm test` exits with an error by default") — verification uses throwaway Node scripts in the session scratchpad directory, run with plain `node`, asserting on pure functions. This mirrors what was already done for the `!sub` migration in this project.

**Spec:** `docs/superpowers/specs/2026-09-11-mentobot-rolesync-migration-design.md`

## Global Constraints

- Never touch MySQL from `roleSync.js` — V4 (`v4Client.js`) is the only data source.
- Only roles present in `planRoleMap`'s values (`managedRoleIds`) are ever added/removed by `roleSync.js` — never touch admin/staff/other roles.
- Every Discord role add/remove goes through `addRoleSafe`/`removeRoleSafe` — never a bare `member.roles.add/remove` that can crash the process on rejection.
- `dryRunRoleSync` in `config/config.json` defaults to `true` (safe) when absent — logging-only until a human explicitly flips it to `false`.
- Batch size to V4's `/access/batch` is capped at 100 IDs per call.
- Per member: remove roles first, then add roles, before moving to the next member (confirmed requirement, not a suggestion).
- `bot/purgeRoles.js`, `bot/removeRoles.js`, their pm2 processes, and their lines in `.github/workflows/deploy.yml` are **not** touched/removed by this plan — that cutover step requires Nacho's explicit go-ahead after production dry-run validation (see spec's "Cutover plan").

---

### Task 1: Extract `bot/planRoleMap.js`

**Files:**
- Create: `bot/planRoleMap.js`
- Modify: `bot/daily.js:21-48`
- Verify: scratchpad script (see Step 1)

**Interfaces:**
- Produces: `planRoleMap` (object, V4 slug string → array of Discord role ID strings) and `managedRoleIds` (deduped flat array of every role ID appearing in `planRoleMap`'s values). Both used by `daily.js` (already) and `bot/roleSync.js` (Task 5).

- [ ] **Step 1: Write a verification script in the scratchpad directory**

Create `/private/tmp/claude-501/-Users-nacho-Documents-MentoProjects-MentoBot-bot/2ccb241f-1642-4ad2-9716-31fc6ed01883/scratchpad/verify-planRoleMap.js` (adjust the scratchpad path to whatever this session's actual scratchpad directory is — check the system prompt/environment block for the current value, it changes per session):

```js
const path = require("path");
const Module = require("module");

const fixtureConfigPath = path.resolve(__dirname, "../../../../../Documents/MentoProjects/MentoBot/config/config.json");
const realConfigPath = require.resolve(fixtureConfigPath);

require.cache[realConfigPath] = {
  id: realConfigPath,
  filename: realConfigPath,
  loaded: true,
  exports: {
    roles: {
      cashBasic: "R_CASH_BASIC",
      cashPro: "R_CASH_PRO",
      cashUltra: "R_CASH_ULTRA",
      spinBasic: "R_SPIN_BASIC",
      spinPro: "R_SPIN_PRO",
      spinUltra: "R_SPIN_ULTRA",
      torneosBasic: "R_TORNEOS_BASIC",
      torneosPro: "R_TORNEOS_PRO",
      torneosUltra: "R_TORNEOS_ULTRA",
      pLOBasic: "R_PLO_BASIC",
      pLOPro: "R_PLO_PRO",
    },
  },
};

const { planRoleMap, managedRoleIds } = require("../../../../../Documents/MentoProjects/MentoBot/bot/planRoleMap");

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`FAIL ${label}: got ${a}, want ${e}`);
  console.log(`PASS ${label}`);
}

assertEqual(planRoleMap["cash-elite"], ["R_CASH_ULTRA"], "cash-elite maps to Ultra role");
assertEqual(planRoleMap["cash-pro"], ["R_CASH_PRO"], "cash-pro maps to Pro role");
assertEqual(planRoleMap["mento-free"], [], "mento-free maps to no roles");
assertEqual(
  planRoleMap["mento-total-elite"],
  ["R_CASH_ULTRA", "R_SPIN_ULTRA", "R_TORNEOS_ULTRA", "R_PLO_PRO"],
  "mento-total-elite bundles Ultra+Ultra+Ultra+PLO Pro"
);
assertEqual("plo-elite" in planRoleMap, false, "plo-elite is not a key");
assertEqual(managedRoleIds.length, 11, "managedRoleIds has exactly the 11 unique roles referenced");
console.log("All planRoleMap checks passed.");
```

Note the absolute path to the real `config/config.json` and to `bot/planRoleMap.js` must match this machine's actual repo location (`/Users/nacho/Documents/MentoProjects/MentoBot`) — adjust the relative `../../../../../` segments to whatever gets you from the scratchpad directory to the repo root; simplest is to just hardcode the full absolute paths instead of relative ones.

- [ ] **Step 2: Run it to confirm it fails (module doesn't exist yet)**

Run: `node /path/to/scratchpad/verify-planRoleMap.js`
Expected: `Error: Cannot find module '.../bot/planRoleMap'`

- [ ] **Step 3: Create `bot/planRoleMap.js`**

```js
const { roles } = require("../config/config.json");

// V4 plan slug -> Discord role IDs.
//
// The old third-tier "Elite" roles (roles.cashElite/spinElite/torneosElite) were
// deleted from Discord; the role formerly named "Pro" was renamed to "Élite"
// (kept its ID, roles.cashPro/spinPro/torneosPro), and a new top tier "Ultra"
// role was created (roles.cashUltra/spinUltra/torneosUltra). -elite plan slugs
// map to the new Ultra roles.
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
  // No "plo-elite" plan exists — PLO only has Basic/Pro tiers.
  "mento-total-basic": [roles.cashBasic, roles.spinBasic, roles.torneosBasic, roles.pLOBasic],
  "mento-total-pro": [roles.cashPro, roles.spinPro, roles.torneosPro, roles.pLOPro],
  "mento-total-elite": [roles.cashUltra, roles.spinUltra, roles.torneosUltra, roles.pLOPro],
  "mento-free": [], // Intentionally empty — free plan has no Discord group access
};

// Only roles this map knows about are ever added/removed by !sub or roleSync.
const managedRoleIds = Array.from(new Set(Object.values(planRoleMap).flat()));

module.exports = { planRoleMap, managedRoleIds };
```

- [ ] **Step 4: Run the verification script again**

Run: `node /path/to/scratchpad/verify-planRoleMap.js`
Expected: all `PASS` lines, ending in `All planRoleMap checks passed.`

- [ ] **Step 5: Replace the inline map in `bot/daily.js` with the import**

In `bot/daily.js`, replace lines 21-48 (the comment block, `const planRoleMap = {...}`, and `const managedRoleIds = ...`) with:

```js
const { planRoleMap, managedRoleIds } = require("./planRoleMap");
```

- [ ] **Step 6: Syntax-check and confirm no leftover references**

Run: `node --check bot/daily.js`
Expected: no output (success).

Run: `grep -n "roles.cashUltra\|roles.spinUltra\|roles.torneosUltra" bot/daily.js`
Expected: no matches outside of `desasignarRoles`'s unrelated `rolesConditions` table (that table uses `roles.cashElite`/`spinElite`/`torneosElite`, not Ultra — confirm those are still there untouched, since `desasignarRoles` is explicitly out of scope for this plan).

- [ ] **Step 7: Commit**

```bash
git add bot/planRoleMap.js bot/daily.js
git commit -m "Extract planRoleMap/managedRoleIds into shared bot/planRoleMap.js"
```

---

### Task 2: Extract `bot/roleHelpers.js`

**Files:**
- Create: `bot/roleHelpers.js`
- Modify: `bot/daily.js:72` (add require), `bot/daily.js:264-284` (remove inline definitions)
- Verify: scratchpad script

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `createRoleHelpers(log)` → `{ addRoleSafe(member, roleId), removeRoleSafe(member, roleId) }`, both `async`, both returning `boolean` (never throwing). `log` is any `(message: string) => void` function — each caller (`daily.js`, `roleSync.js` in Task 5) passes its own logger so log lines land in that process's own log file.

- [ ] **Step 1: Write a verification script in the scratchpad directory**

```js
const { createRoleHelpers } = require("/Users/nacho/Documents/MentoProjects/MentoBot/bot/roleHelpers");

const logs = [];
const log = (msg) => logs.push(msg);
const { addRoleSafe, removeRoleSafe } = createRoleHelpers(log);

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`FAIL ${label}: got ${actual}, want ${expected}`);
  console.log(`PASS ${label}`);
}

async function main() {
  // Success path
  const okMember = { id: "1", roles: { add: async () => {}, remove: async () => {} } };
  assertEqual(await addRoleSafe(okMember, "R1"), true, "addRoleSafe returns true on success");
  assertEqual(await removeRoleSafe(okMember, "R1"), true, "removeRoleSafe returns true on success");
  assertEqual(logs.length, 0, "no log lines on success");

  // Rejection path — must not throw, must log, must return false
  const failMember = {
    id: "2",
    roles: {
      add: async () => { throw new Error("Missing Permissions"); },
      remove: async () => { throw new Error("Unknown Role"); },
    },
  };
  assertEqual(await addRoleSafe(failMember, "R2"), false, "addRoleSafe returns false on rejection");
  assertEqual(await removeRoleSafe(failMember, "R2"), false, "removeRoleSafe returns false on rejection");
  assertEqual(
    logs.some((l) => l.includes("role add failed discordUserId=2 roleId=R2 error=Missing Permissions")),
    true,
    "add failure logged with discordUserId/roleId/error"
  );
  assertEqual(
    logs.some((l) => l.includes("role remove failed discordUserId=2 roleId=R2 error=Unknown Role")),
    true,
    "remove failure logged with discordUserId/roleId/error"
  );

  console.log("All roleHelpers checks passed.");
}

main();
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node /path/to/scratchpad/verify-roleHelpers.js`
Expected: `Error: Cannot find module '.../bot/roleHelpers'`

- [ ] **Step 3: Create `bot/roleHelpers.js`**

```js
// Discord role add/remove can reject (missing permissions, role hierarchy, rate
// limits...); an unawaited/unhandled rejection here would crash the whole
// process. Every caller must go through these instead of a bare
// member.roles.add/remove.
function createRoleHelpers(log) {
  async function addRoleSafe(member, roleId) {
    try {
      await member.roles.add(roleId);
      return true;
    } catch (err) {
      log(`role add failed discordUserId=${member.id} roleId=${roleId} error=${err.message}`);
      return false;
    }
  }

  async function removeRoleSafe(member, roleId) {
    try {
      await member.roles.remove(roleId);
      return true;
    } catch (err) {
      log(`role remove failed discordUserId=${member.id} roleId=${roleId} error=${err.message}`);
      return false;
    }
  }

  return { addRoleSafe, removeRoleSafe };
}

module.exports = { createRoleHelpers };
```

- [ ] **Step 4: Run the verification script again**

Run: `node /path/to/scratchpad/verify-roleHelpers.js`
Expected: all `PASS` lines, ending in `All roleHelpers checks passed.`

- [ ] **Step 5: Wire `bot/daily.js` to use it**

Replace line 72 (`const { linkEmail, getAccess } = require("./v4Client");`) with:

```js
const { linkEmail, getAccess } = require("./v4Client");
const { createRoleHelpers } = require("./roleHelpers");
```

Then delete the inline `addRoleSafe`/`removeRoleSafe` function declarations at lines 264-284 (the block starting with the `// Discord role add/remove can reject...` comment and ending after `removeRoleSafe`'s closing brace), and in their place add:

```js
const { addRoleSafe, removeRoleSafe } = createRoleHelpers(log);
```

`log` is already defined earlier in `daily.js` (the module-level `function log(message) {...}` at line 57), so this must go *after* that definition and *before* the first use of `addRoleSafe`/`removeRoleSafe` (the earliest use is inside `desasignarRoles`, defined at line 148) — placing it where the old function declarations were (around line 264) still works because `desasignarRoles` doesn't call `addRoleSafe`/`removeRoleSafe` until it's actually invoked at runtime, well after module load finishes; but for clarity, put the `createRoleHelpers(log)` call right after the new `require("./roleHelpers")` line instead, so it's not physically separated from its import.

- [ ] **Step 6: Syntax-check**

Run: `node --check bot/daily.js`
Expected: no output (success).

- [ ] **Step 7: Commit**

```bash
git add bot/roleHelpers.js bot/daily.js
git commit -m "Extract addRoleSafe/removeRoleSafe into shared bot/roleHelpers.js"
```

---

### Task 3: Add `getAccessBatch` to `bot/v4Client.js`

**Files:**
- Modify: `bot/v4Client.js:49-62`
- Verify: scratchpad script (mocks `axios`-like behavior isn't practical here since the module builds its own axios instance at load time — instead this step does a syntax/shape check and a live call is deferred to Task 7's sandbox verification)

**Interfaces:**
- Consumes: nothing new — same `client` (axios instance) already built at the top of `v4Client.js`, same `logCall`/`normalizeError` helpers already defined there.
- Produces: `getAccessBatch(discordUserIds: string[])` → `Promise<{ok: true, data} | {ok: false, status, code}>`, same result shape as `linkEmail`/`getAccess`. `data.items` is expected to be an array of `{discordUserId, status, planSlugs, checkedAt}` on success — validated by the caller (Task 4), not by this function.

- [ ] **Step 1: Read the current end of the file to confirm exact insertion point**

Run: `sed -n '45,63p' bot/v4Client.js`
Expected output matches the `getAccess` function and the final `module.exports = { linkEmail, getAccess };` line.

- [ ] **Step 2: Add `getAccessBatch` and update the export**

Insert this function between `getAccess` and `module.exports`:

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

Then change the final line to:

```js
module.exports = { linkEmail, getAccess, getAccessBatch };
```

- [ ] **Step 3: Syntax-check**

Run: `node --check bot/v4Client.js`
Expected: no output (success).

- [ ] **Step 4: Confirm the export shape with a quick require (no network call)**

Run: `node -e "const m = require('/Users/nacho/Documents/MentoProjects/MentoBot/bot/v4Client'); console.log(typeof m.getAccessBatch)"`

This will throw if `config/config.json` is missing `v4ApiBase`/`v4ApiKey` (the module validates that at load time) — it should succeed in this repo since those fields already exist. Expected output: `function`.

- [ ] **Step 5: Commit**

```bash
git add bot/v4Client.js
git commit -m "Add getAccessBatch to v4Client for the roleSync migration"
```

---

### Task 4: `bot/roleSync.js` — pure logic (`validateBatchItems`, `computeReconcile`)

**Files:**
- Create: `bot/roleSync.js` (this task writes only the pure-logic top portion; Task 5 appends the orchestration layer to the same file)
- Verify: scratchpad script

**Interfaces:**
- Consumes: `planRoleMap`, `managedRoleIds` from `bot/planRoleMap.js` (Task 1).
- Produces: `validateBatchItems(items, requestedIds)` → `{ok: true, byId: Map<string, item>} | {ok: false, reason: string}`. `computeReconcile(access, currentRoleIds)` → `{decision: "preserve"|"reconcile", add: string[], remove: string[], unknownSlugs: string[]}`, where `access` is one item shape `{status, planSlugs}` and `currentRoleIds` is an array of role ID strings the member currently holds. Both exported for the verification script and reused by Task 5's orchestration in the same file.

- [ ] **Step 1: Write a verification script in the scratchpad directory**

```js
const {
  validateBatchItems,
  computeReconcile,
  chunk,
} = require("/Users/nacho/Documents/MentoProjects/MentoBot/bot/roleSync");

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`FAIL ${label}: got ${a}, want ${e}`);
  console.log(`PASS ${label}`);
}

const now = new Date().toISOString();

// --- validateBatchItems ---
assertEqual(
  validateBatchItems(
    [{ discordUserId: "1", status: "active", planSlugs: ["cash-pro"], checkedAt: now }],
    ["1"]
  ).ok,
  true,
  "valid single-item batch passes"
);
assertEqual(
  validateBatchItems([], ["1"]).reason,
  "count_mismatch",
  "count mismatch rejected"
);
assertEqual(
  validateBatchItems(
    [
      { discordUserId: "1", status: "active", planSlugs: ["cash-pro"], checkedAt: now },
      { discordUserId: "1", status: "inactive", planSlugs: [], checkedAt: now },
    ],
    ["1", "1"]
  ).reason,
  "duplicate_discord_user_id",
  "duplicate discordUserId rejected"
);
assertEqual(
  validateBatchItems([{ discordUserId: "1", status: "bogus", planSlugs: [], checkedAt: now }], ["1"]).reason,
  "invalid_status",
  "unknown status rejected"
);
assertEqual(
  validateBatchItems([{ discordUserId: "1", status: "active", planSlugs: [], checkedAt: now }], ["1"]).reason,
  "active_without_plans",
  "active with empty planSlugs rejected"
);
assertEqual(
  validateBatchItems(
    [{ discordUserId: "1", status: "inactive", planSlugs: ["cash-pro"], checkedAt: now }],
    ["1"]
  ).reason,
  "plans_without_active",
  "non-active with non-empty planSlugs rejected"
);
assertEqual(
  validateBatchItems(
    [{ discordUserId: "1", status: "active", planSlugs: ["cash-pro"], checkedAt: "2020-01-01T00:00:00.000Z" }],
    ["1"]
  ).reason,
  "stale_checked_at",
  "checkedAt older than 120s rejected"
);
assertEqual(
  validateBatchItems(
    [{ discordUserId: "1", status: "active", planSlugs: ["cash-pro"], checkedAt: now }],
    ["2"]
  ).reason,
  "missing_requested_id",
  "response missing a requested id rejected"
);

// --- computeReconcile ---
assertEqual(
  computeReconcile({ status: "unlinked", planSlugs: [] }, ["R_CASH_PRO"]),
  { decision: "preserve", add: [], remove: [], unknownSlugs: [] },
  "unlinked preserves"
);
assertEqual(
  computeReconcile({ status: "unavailable", planSlugs: [] }, ["R_CASH_PRO"]),
  { decision: "preserve", add: [], remove: [], unknownSlugs: [] },
  "unavailable preserves"
);
assertEqual(
  computeReconcile({ status: "inactive", planSlugs: [] }, ["R_CASH_PRO"]),
  { decision: "reconcile", add: [], remove: ["R_CASH_PRO"], unknownSlugs: [] },
  "inactive strips managed roles held"
);
assertEqual(
  computeReconcile({ status: "active", planSlugs: ["cash-pro"] }, []),
  { decision: "reconcile", add: ["R_CASH_PRO"], remove: [], unknownSlugs: [] },
  "active adds missing wanted role"
);
assertEqual(
  computeReconcile({ status: "active", planSlugs: ["cash-pro"] }, ["R_CASH_PRO", "R_SPIN_PRO"]),
  { decision: "reconcile", add: [], remove: ["R_SPIN_PRO"], unknownSlugs: [] },
  "active removes managed role not in target, keeps the rest"
);
assertEqual(
  computeReconcile({ status: "active", planSlugs: ["mento-free"] }, ["R_CASH_PRO"]),
  { decision: "reconcile", add: [], remove: ["R_CASH_PRO"], unknownSlugs: [] },
  "active mento-free-only strips managed roles (parity with !sub)"
);
assertEqual(
  computeReconcile({ status: "active", planSlugs: ["some-unmapped-plan"] }, ["R_CASH_PRO"]),
  { decision: "preserve", add: [], remove: [], unknownSlugs: ["some-unmapped-plan"] },
  "active with only unknown slug preserves and reports it"
);

// --- chunk ---
assertEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]], "chunk splits into groups of size N");
assertEqual(chunk([], 100), [], "chunk of empty array is empty");

console.log("All roleSync pure-logic checks passed.");
```

Note: `computeReconcile`'s test cases above use fake role IDs like `"R_CASH_PRO"` directly, which means for this step `bot/roleSync.js` must read `managedRoleIds`/`planRoleMap` from `bot/planRoleMap.js` — and since that module requires the *real* `config/config.json`, these fake IDs won't actually appear in `managedRoleIds` when running against real config. To make the verification script deterministic, mock `config/config.json` via `require.cache` exactly like Task 1's script does (same fixture roles), **before** requiring `bot/roleSync.js`, so `bot/planRoleMap.js` (which `bot/roleSync.js` requires) picks up the fixture. Add that `require.cache` setup block (copied from Task 1 Step 1) to the top of this script, and change the `cash-pro`/`spins-pro`/`mento-free` test IDs above to the matching fixture values (`R_CASH_PRO`, `R_SPIN_PRO`) — already done above, just make sure the fixture-injection block runs first.

- [ ] **Step 2: Run it to confirm it fails**

Run: `node /path/to/scratchpad/verify-roleSync-pure.js`
Expected: `Error: Cannot find module '.../bot/roleSync'`

- [ ] **Step 3: Create `bot/roleSync.js` with the pure-logic portion**

```js
const { planRoleMap, managedRoleIds } = require("./planRoleMap");

const VALID_STATUSES = ["unlinked", "inactive", "active", "unavailable"];
const MAX_CHECKED_AT_AGE_MS = 120000;
const MAX_CHECKED_AT_SKEW_MS = 30000;

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function validateBatchItems(items, requestedIds) {
  if (!Array.isArray(items) || items.length !== requestedIds.length) {
    return { ok: false, reason: "count_mismatch" };
  }
  const byId = new Map();
  for (const item of items) {
    if (!item || typeof item.discordUserId !== "string") {
      return { ok: false, reason: "missing_discord_user_id" };
    }
    if (byId.has(item.discordUserId)) {
      return { ok: false, reason: "duplicate_discord_user_id" };
    }
    if (!VALID_STATUSES.includes(item.status)) {
      return { ok: false, reason: "invalid_status" };
    }
    if (!Array.isArray(item.planSlugs) || item.planSlugs.some((s) => typeof s !== "string")) {
      return { ok: false, reason: "invalid_plan_slugs" };
    }
    if (item.status === "active" && item.planSlugs.length === 0) {
      return { ok: false, reason: "active_without_plans" };
    }
    if (item.status !== "active" && item.planSlugs.length > 0) {
      return { ok: false, reason: "plans_without_active" };
    }
    const checkedAtMs = Date.parse(item.checkedAt);
    if (!Number.isFinite(checkedAtMs)) {
      return { ok: false, reason: "invalid_checked_at" };
    }
    if (Date.now() - checkedAtMs > MAX_CHECKED_AT_AGE_MS) {
      return { ok: false, reason: "stale_checked_at" };
    }
    if (checkedAtMs > Date.now() + MAX_CHECKED_AT_SKEW_MS) {
      return { ok: false, reason: "future_checked_at" };
    }
    byId.set(item.discordUserId, item);
  }
  for (const id of requestedIds) {
    if (!byId.has(id)) return { ok: false, reason: "missing_requested_id" };
  }
  return { ok: true, byId };
}

function computeReconcile(access, currentRoleIds) {
  const current = new Set(currentRoleIds);

  if (access.status === "unlinked" || access.status === "unavailable") {
    return { decision: "preserve", add: [], remove: [], unknownSlugs: [] };
  }

  if (access.status === "inactive") {
    return {
      decision: "reconcile",
      add: [],
      remove: managedRoleIds.filter((id) => current.has(id)),
      unknownSlugs: [],
    };
  }

  // active
  const wanted = new Set();
  const unknownSlugs = [];
  let hasFreePlan = false;
  for (const slug of access.planSlugs) {
    const mapped = planRoleMap[slug];
    if (mapped && mapped.length > 0) {
      mapped.forEach((id) => wanted.add(id));
    } else if (slug === "mento-free") {
      hasFreePlan = true;
    } else {
      unknownSlugs.push(slug);
    }
  }

  if (wanted.size === 0 && unknownSlugs.length === 0 && hasFreePlan) {
    // Free-only plan: actively revoke managed roles, same as !sub.
    return {
      decision: "reconcile",
      add: [],
      remove: managedRoleIds.filter((id) => current.has(id)),
      unknownSlugs: [],
    };
  }
  if (wanted.size === 0) {
    // Nothing resolvable (only unknown slugs) — preserve, don't strip.
    return { decision: "preserve", add: [], remove: [], unknownSlugs };
  }

  return {
    decision: "reconcile",
    add: [...wanted].filter((id) => !current.has(id)),
    remove: managedRoleIds.filter((id) => current.has(id) && !wanted.has(id)),
    unknownSlugs,
  };
}

module.exports = { chunk, validateBatchItems, computeReconcile };
```

- [ ] **Step 4: Run the verification script again**

Run: `node /path/to/scratchpad/verify-roleSync-pure.js`
Expected: all `PASS` lines, ending in `All roleSync pure-logic checks passed.`

- [ ] **Step 5: Syntax-check**

Run: `node --check bot/roleSync.js`
Expected: no output (success).

- [ ] **Step 6: Commit**

```bash
git add bot/roleSync.js
git commit -m "Add roleSync pure reconcile/validation logic"
```

---

### Task 5: `bot/roleSync.js` — orchestration (Discord login, sweep, cron, dry-run)

**Files:**
- Modify: `bot/roleSync.js` (append to the file created in Task 4)
- Verify: scratchpad script using fake `member`/`guild`/`getAccessBatch` objects (no real Discord/network)

**Interfaces:**
- Consumes: `chunk`, `validateBatchItems`, `computeReconcile` (Task 4, same file); `createRoleHelpers` (Task 2); `getAccessBatch` (Task 3); `guildId`, `token`, `dryRunRoleSync` from `config/config.json`.
- Produces: `reconcileMember(member, access)`, `syncChunk(members)`, `sweep(guild)`, `start()` — `start()` is the process entry point, called when the file is run directly.

- [ ] **Step 1: Write a verification script in the scratchpad directory**

This exercises `reconcileMember` and `syncChunk` with fake Discord-shaped objects and a fake `getAccessBatch`, without any real network or Discord connection. Since `getAccessBatch` is required directly inside `roleSync.js` from `./v4Client`, mock it the same way Task 1/4 mocked `config/config.json` — via `require.cache`, pointing at the resolved path of `bot/v4Client.js`, **before** requiring `bot/roleSync.js`.

```js
const path = require("path");
const repoRoot = "/Users/nacho/Documents/MentoProjects/MentoBot";

const v4ClientPath = require.resolve(path.join(repoRoot, "bot/v4Client.js"));
let batchCalls = [];
let batchResponse = null;
require.cache[v4ClientPath] = {
  id: v4ClientPath,
  filename: v4ClientPath,
  loaded: true,
  exports: {
    linkEmail: async () => { throw new Error("not used in this test"); },
    getAccess: async () => { throw new Error("not used in this test"); },
    getAccessBatch: async (ids) => {
      batchCalls.push(ids);
      return batchResponse;
    },
  },
};

const configPath = require.resolve(path.join(repoRoot, "config/config.json"));
require.cache[configPath] = {
  id: configPath,
  filename: configPath,
  loaded: true,
  exports: {
    guildId: "GUILD1",
    token: "fake-token",
    dryRunRoleSync: false,
    roles: {
      cashBasic: "R_CASH_BASIC", cashPro: "R_CASH_PRO", cashUltra: "R_CASH_ULTRA",
      spinBasic: "R_SPIN_BASIC", spinPro: "R_SPIN_PRO", spinUltra: "R_SPIN_ULTRA",
      torneosBasic: "R_TORNEOS_BASIC", torneosPro: "R_TORNEOS_PRO", torneosUltra: "R_TORNEOS_ULTRA",
      pLOBasic: "R_PLO_BASIC", pLOPro: "R_PLO_PRO",
    },
  },
};

const { reconcileMember, syncChunk } = require(path.join(repoRoot, "bot/roleSync.js"));

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`FAIL ${label}: got ${a}, want ${e}`);
  console.log(`PASS ${label}`);
}

function makeMember(id, roleIds) {
  const added = [];
  const removed = [];
  return {
    id,
    roles: {
      cache: new Map(roleIds.map((r) => [r, true])),
      add: async (roleId) => { added.push(roleId); },
      remove: async (roleId) => { removed.push(roleId); },
    },
    _added: added,
    _removed: removed,
  };
}

async function main() {
  // reconcileMember: active plan, member has nothing yet -> adds, in dry-run-off mode
  const m1 = makeMember("1", []);
  const now = new Date().toISOString();
  await reconcileMember(m1, { status: "active", planSlugs: ["cash-pro"], checkedAt: now });
  assertEqual(m1._added, ["R_CASH_PRO"], "reconcileMember adds the wanted role for an active member with none yet");
  assertEqual(m1._removed, [], "reconcileMember removes nothing when member had no managed roles");

  // reconcileMember: inactive member holding a managed role -> removes it
  const m2 = makeMember("2", ["R_CASH_PRO"]);
  await reconcileMember(m2, { status: "inactive", planSlugs: [], checkedAt: now });
  assertEqual(m2._removed, ["R_CASH_PRO"], "reconcileMember removes managed role for inactive member");
  assertEqual(m2._added, [], "reconcileMember adds nothing for inactive member");

  // reconcileMember: unlinked -> touches nothing
  const m3 = makeMember("3", ["R_CASH_PRO"]);
  await reconcileMember(m3, { status: "unlinked", planSlugs: [], checkedAt: now });
  assertEqual(m3._added, [], "reconcileMember adds nothing for unlinked member");
  assertEqual(m3._removed, [], "reconcileMember removes nothing for unlinked member");

  // syncChunk: valid batch response drives reconcileMember for each member
  batchCalls = [];
  batchResponse = {
    ok: true,
    data: {
      items: [
        { discordUserId: "10", status: "active", planSlugs: ["spins-pro"], checkedAt: now },
        { discordUserId: "11", status: "inactive", planSlugs: [], checkedAt: now },
      ],
    },
  };
  const m10 = makeMember("10", []);
  const m11 = makeMember("11", ["R_SPIN_PRO"]);
  await syncChunk([m10, m11]);
  assertEqual(batchCalls, [["10", "11"]], "syncChunk calls getAccessBatch with both member ids");
  assertEqual(m10._added, ["R_SPIN_PRO"], "syncChunk applies add via reconcileMember for member 10");
  assertEqual(m11._removed, ["R_SPIN_PRO"], "syncChunk applies remove via reconcileMember for member 11");

  // syncChunk: failed batch call touches nobody
  batchResponse = { ok: false, status: 503, code: "n/a" };
  const m20 = makeMember("20", ["R_CASH_PRO"]);
  await syncChunk([m20]);
  assertEqual(m20._added, [], "syncChunk adds nothing when the batch call fails");
  assertEqual(m20._removed, [], "syncChunk removes nothing when the batch call fails");

  // syncChunk: invalid batch shape touches nobody
  batchResponse = { ok: true, data: { items: [] } }; // count mismatch vs 1 requested member
  const m21 = makeMember("21", ["R_CASH_PRO"]);
  await syncChunk([m21]);
  assertEqual(m21._added, [], "syncChunk adds nothing when batch validation fails");
  assertEqual(m21._removed, [], "syncChunk removes nothing when batch validation fails");

  console.log("All roleSync orchestration checks passed.");
}

main();
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node /path/to/scratchpad/verify-roleSync-orchestration.js`
Expected: `TypeError: reconcileMember is not a function` (or similar — the functions don't exist in `bot/roleSync.js` yet).

- [ ] **Step 3: Append the orchestration layer to `bot/roleSync.js`**

Add these requires to the top of `bot/roleSync.js` (alongside the existing `require("./planRoleMap")`):

```js
const { Client, GatewayIntentBits } = require("discord.js");
const CronJob = require("cron").CronJob;
const fs = require("fs");
const path = require("path");
const { guildId, token, dryRunRoleSync } = require("../config/config.json");
const { createRoleHelpers } = require("./roleHelpers");
const { getAccessBatch } = require("./v4Client");
```

Then, after the existing `chunk`/`validateBatchItems`/`computeReconcile` definitions and before `module.exports`, add:

```js
const logFilePath = path.join(__dirname, "roleSync.log");

function log(message) {
  const now = new Date();
  const timestamp = `[${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(
    now.getSeconds()
  ).padStart(2, "0")}]`;
  fs.appendFile(logFilePath, `${timestamp} ${message}\n`, (err) => {
    if (err) console.error("Error al escribir en log:", err);
  });
}

const { addRoleSafe, removeRoleSafe } = createRoleHelpers(log);
const BATCH_SIZE = 100;

async function reconcileMember(member, access) {
  const report = computeReconcile(access, [...member.roles.cache.keys()]);
  if (report.unknownSlugs.length > 0) {
    log(`roleSync unknown plan slug discordUserId=${member.id} slugs=${report.unknownSlugs.join(",")}`);
  }
  if (report.decision === "preserve") {
    return report;
  }
  const isDryRun = dryRunRoleSync !== false;
  if (isDryRun) {
    log(
      `roleSync dry-run discordUserId=${member.id} add=${report.add.join(",")} remove=${report.remove.join(",")}`
    );
    return report;
  }
  for (const roleId of report.remove) {
    await removeRoleSafe(member, roleId);
  }
  for (const roleId of report.add) {
    await addRoleSafe(member, roleId);
  }
  return report;
}

async function syncChunk(members) {
  const ids = members.map((m) => m.id);
  const result = await getAccessBatch(ids);
  if (!result.ok) {
    log(
      `roleSync batch call failed size=${ids.length} status=${result.status ?? "n/a"} code=${result.code ?? "n/a"}`
    );
    return;
  }
  const validated = validateBatchItems(result.data.items, ids);
  if (!validated.ok) {
    log(`roleSync batch invalid size=${ids.length} reason=${validated.reason}`);
    return;
  }
  for (const member of members) {
    try {
      await reconcileMember(member, validated.byId.get(member.id));
    } catch (err) {
      log(`roleSync member sync failed discordUserId=${member.id} error=${err.message}`);
    }
  }
}

async function sweep(guild) {
  const members = await guild.members.fetch();
  const humans = [...members.values()].filter((m) => !m.user.bot);
  const chunks = chunk(humans, BATCH_SIZE);
  log(`roleSync sweep starting members=${humans.length} chunks=${chunks.length} dryRun=${dryRunRoleSync !== false}`);
  for (const c of chunks) {
    await syncChunk(c);
  }
  log("roleSync sweep completed");
}

function start() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

  client.once("ready", () => {
    log("Ready!");
    const guild = client.guilds.cache.get(guildId);
    sweep(guild).catch((err) => log(`roleSync sweep failed error=${err.message}`));
    new CronJob(
      "0 */2 * * *",
      () => {
        sweep(guild).catch((err) => log(`roleSync sweep failed error=${err.message}`));
      },
      null,
      true,
      "Europe/Madrid"
    );
  });

  client.login(token);
}
```

And change the final `module.exports` line to:

```js
module.exports = { chunk, validateBatchItems, computeReconcile, reconcileMember, syncChunk, sweep, start };
```

Finally, at the very end of the file, add:

```js
if (require.main === module) {
  start();
}
```

This makes `node bot/roleSync.js` run the process, while `require("./roleSync")` (used by the verification scripts and Task 6) never triggers a Discord login as a side effect.

- [ ] **Step 4: Run the verification script again**

Run: `node /path/to/scratchpad/verify-roleSync-orchestration.js`
Expected: all `PASS` lines, ending in `All roleSync orchestration checks passed.`

- [ ] **Step 5: Syntax-check**

Run: `node --check bot/roleSync.js`
Expected: no output (success).

- [ ] **Step 6: Confirm it doesn't log in when merely required**

Run: `node -e "require('/Users/nacho/Documents/MentoProjects/MentoBot/bot/roleSync.js'); console.log('required OK, no login attempted');"`
Expected: prints `required OK, no login attempted` and exits — no Discord connection attempt, no hang.

- [ ] **Step 7: Commit**

```bash
git add bot/roleSync.js
git commit -m "Add roleSync orchestration: sweep, cron, dry-run, Discord login"
```

---

### Task 6: Config wiring and test launcher

**Files:**
- Modify: `config/config.test.json` (add `dryRunRoleSync`)
- Modify: `bot/run-test-instance.cjs` (accept an optional entry-file argument, default unchanged)
- Manual: add `dryRunRoleSync` to the real `config/config.json` on Nacho's machine and on the production server (not committed — gitignored, same pattern as `v4ApiBase`/`v4ApiKey` in the original `!sub` migration)

**Interfaces:**
- Consumes: nothing new — `bot/run-test-instance.cjs` already knows how to swap `config/config.json` for `config/config.test.json` via `require.cache` (built during the `!sub` migration).
- Produces: `node bot/run-test-instance.cjs roleSync.js` — same safety guarantees as today's `node bot/run-test-instance.cjs` (daily.js), just able to target either script.

- [ ] **Step 1: Add `dryRunRoleSync: false` to `config/config.test.json`**

Read the current file first (`bot/run-test-instance.cjs`'s TODO-placeholder scanner walks the whole object, so this addition must not use a `"TODO..."`-prefixed string). Add a top-level field:

```json
"dryRunRoleSync": false,
```

Set to `false` (not the production-safe default of `true`) because sandbox testing is specifically meant to exercise real role mutations against the disposable test server — dry-run would make Task 7's verification pointless.

- [ ] **Step 2: Read the current `bot/run-test-instance.cjs`**

It currently hardcodes `require("./daily.js")` at the end. Confirm the exact current content before editing (it was written during the `!sub` migration and validated end-to-end against the sandbox already).

- [ ] **Step 3: Make the entry file configurable via `process.argv`**

Replace the final section of the file (from the `require.cache[realConfigPath] = {...}` assignment onward) so that instead of always requiring `./daily.js`, it requires whichever file is named on the command line, defaulting to `daily.js` for backward compatibility:

```js
require.cache[realConfigPath] = {
  id: realConfigPath,
  filename: realConfigPath,
  loaded: true,
  exports: testConfig,
};

const entryFile = process.argv[2] || "daily.js";
const entryPath = path.resolve(__dirname, entryFile);
if (!fs.existsSync(entryPath)) {
  console.error(`No existe ${entryPath}.`);
  process.exit(1);
}

console.log(`Instancia de PRUEBAS: cargando ${entryFile} con config/config.test.json (no se toca config.json real).`);
require(entryPath);
```

- [ ] **Step 4: Syntax-check**

Run: `node --check bot/run-test-instance.cjs`
Expected: no output (success).

- [ ] **Step 5: Confirm default behavior is unchanged**

Run: `node bot/run-test-instance.cjs` (same as before this change), interrupt after confirming it logs in as the test bot exactly like it did before this task (this exercises `daily.js`, the default). Expected: identical behavior to before Task 6 — no regression for the existing `!sub` test flow.

- [ ] **Step 6: Commit**

```bash
git add config/config.test.json bot/run-test-instance.cjs
git commit -m "Allow run-test-instance.cjs to target roleSync.js; add dryRunRoleSync to test config"
```

- [ ] **Step 7 (manual, not a code change): tell Nacho to add `dryRunRoleSync` to the real configs**

Ask Nacho to add `"dryRunRoleSync": true` to the local `config/config.json` and to the production server's `config/config.json` (same SSH-with-backup procedure used for `v4ApiBase`/`v4ApiKey` and for the Ultra role IDs earlier in this project) before `roleSync.js` is ever deployed there — `true` is also the built-in default when the field is absent, so this step is a documentation/explicitness step, not a functional requirement, but it's committed to memory that config drift between Nacho's machine and the server has already caused one production incident this project (the Elite/Ultra rename) — don't skip it.

---

### Task 7: Manual verification against the kit-nacho sandbox

**Files:** none (verification only, no code changes)

**Interfaces:** none — this task exercises everything built in Tasks 1-6 together, end-to-end, against the real (disposable) test Discord server via `kit-nacho`'s hosted sandbox, same infrastructure already validated during the `!sub` migration (`bot/kit-nacho/`, `bot/configuracion-privada/`).

- [ ] **Step 1: Set up sandbox scenarios covering the reconcile matrix**

Using `node --env-file=bot/configuracion-privada/control.env bot/kit-nacho/control.mjs scenario ...` (same tool already used for `!sub` testing), set up at least these accounts against the test Discord server, each a distinct authorized test Discord ID with a distinct `@example.invalid` email:
- unlinked (never call `setup`/`!email` for this one — or `reset` an existing link).
- active, single plan (`cash-pro`).
- active, multiple plans (`cash-pro` + `spins-basic`).
- inactive/expired.
- active, `mento-free` only — while the member still holds a paid managed role from a previous scenario (to confirm the sweep revokes it, not just `!sub`).
- active with an unmapped/unknown plan slug mixed with a known one (`--plans cash-pro,unmapped-test-plan`) — to confirm the known role is still granted and the unknown one is logged, not silently dropped.

- [ ] **Step 2: Run `roleSync.js` against the sandbox in dry-run first**

Temporarily set `"dryRunRoleSync": true` in `config/config.test.json`, then:

```bash
node bot/run-test-instance.cjs roleSync.js
```

Let it run one sweep (it sweeps immediately on `ready`), then check `bot/roleSync.log` for `roleSync dry-run discordUserId=... add=... remove=...` lines matching every scenario account's expected outcome. Stop the process (it's a long-running Discord client — interrupt it, same as any test instance run today).

- [ ] **Step 3: Run `roleSync.js` against the sandbox for real**

Set `config/config.test.json`'s `dryRunRoleSync` back to `false` (matches Task 6 Step 1's committed value — if it's already `false`, skip this). Run again:

```bash
node bot/run-test-instance.cjs roleSync.js
```

In the actual test Discord server, confirm real role changes landed correctly for every scenario account: correct roles added, correct roles removed, unlinked/unavailable accounts untouched, the `mento-free`-with-leftover-paid-role account had its paid role stripped.

- [ ] **Step 4: Confirm crash-safety under a real permission failure**

Reuse the same setup that caught the original `!sub` crash bug: temporarily make the test bot's role lower in the hierarchy than one of the test roles it's supposed to manage (or otherwise force a `DiscordAPIError[50013]`), run the sweep, and confirm `bot/roleSync.log` shows `role add failed ...` / `role remove failed ...` lines and the process stays alive and completes the sweep for the remaining members — it must not crash. Restore the role hierarchy afterward.

- [ ] **Step 5: Stop the test instance**

Interrupt `node bot/run-test-instance.cjs roleSync.js`. Same reminder as always with this test harness: it's a separate live process — don't leave it running.

---

### Task 8: Wire `roleSync` into the deploy pipeline (additive only)

**Files:**
- Modify: `.github/workflows/deploy.yml`

**Interfaces:** none — this is an ops/CI change, not a code interface.

This task only adds `roleSync` to the restart list so future pushes to `master` also restart it once it exists as a pm2 process on the server — it does **not** remove `addRoles`/`removeRoles` from the list (per the plan's Global Constraints, that cutover step is explicitly out of scope here and requires Nacho's separate go-ahead per the spec's cutover plan).

- [ ] **Step 1: Read the current restart line**

Run: `grep -n "pm2 restart" .github/workflows/deploy.yml`
Expected: `pm2 restart MentoBot MentoAPI removeRoles addRoles`

- [ ] **Step 2: Add `roleSync` to the list**

Change that line to:

```yaml
            pm2 restart MentoBot MentoAPI removeRoles addRoles roleSync
```

pm2's `restart` on a process name that doesn't exist yet on the server will fail for that one name but not block the others — this is safe to merge before the process exists on the server, though the cleaner order (and the one this plan recommends telling Nacho) is: merge this change, then create the `roleSync` pm2 process on the server (`pm2 start bot/roleSync.js --name roleSync`, `pm2 save`) in the same session, exactly like the `MentoBot` pm2 process was recreated earlier in this project — this is a manual SSH step for Nacho to approve, not a plan checkbox.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "CI: also restart roleSync on deploy"
```

Do not push this commit as part of unattended plan execution — per this project's established workflow, every push to `master` triggers an immediate production deploy, and pushing this before `roleSync` is validated in the sandbox (Task 7) and before Nacho has agreed to create the pm2 process on the server would restart a process pm2 doesn't have yet for no benefit. Stop after the local commit and hand back to Nacho.

---

## Not in this plan (explicit follow-ups)

Per the spec's "Cutover plan" section, all of the following require Nacho's direct confirmation and happen only after Task 7's sandbox verification and a real production dry-run cycle:

- Flipping `dryRunRoleSync` to `false` in the production `config/config.json`.
- Creating the `roleSync` pm2 process on the production server.
- Stopping and deleting the `addRoles`/`removeRoles` pm2 processes.
- Removing `removeRoles addRoles` from `.github/workflows/deploy.yml`'s restart line.
- Deleting `bot/purgeRoles.js`, `bot/removeRoles.js`, and `bot/config.json` from the repo.
- Migrating `bot/daily.js`'s 02:00 `desasignarRoles` cron (explicitly deferred by Nacho to a separate future task, 2026-09-11).
