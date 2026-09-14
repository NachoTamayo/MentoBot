const { Client, GatewayIntentBits } = require("discord.js");
const CronJob = require("cron").CronJob;
const fs = require("fs");
const path = require("path");
const { guildId, token, dryRunRoleSync } = require("../config/config.json");
const { createRoleHelpers } = require("./roleHelpers");
const { getAccessBatch } = require("./v4Client");
const { planRoleMap, managedRoleIds, resolveRoleFamilyConflicts } = require("./planRoleMap");

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
    return { decision: "preserve", add: [], remove: [], unknownSlugs: [], conflicts: [] };
  }

  if (access.status === "inactive") {
    return {
      decision: "reconcile",
      add: [],
      remove: managedRoleIds.filter((id) => current.has(id)),
      unknownSlugs: [],
      conflicts: [],
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
      conflicts: [],
    };
  }
  if (wanted.size === 0) {
    // Nothing resolvable (only unknown slugs) — preserve, don't strip.
    return { decision: "preserve", add: [], remove: [], unknownSlugs, conflicts: [] };
  }

  const { resolved, conflicts } = resolveRoleFamilyConflicts(wanted);

  return {
    decision: "reconcile",
    add: [...resolved].filter((id) => !current.has(id)),
    remove: managedRoleIds.filter((id) => current.has(id) && !resolved.has(id)),
    unknownSlugs,
    conflicts,
  };
}

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
let sweeping = false;

async function reconcileMember(member, access) {
  const report = computeReconcile(access, [...member.roles.cache.keys()]);
  if (report.unknownSlugs.length > 0) {
    log(`roleSync unknown plan slug discordUserId=${member.id} slugs=${report.unknownSlugs.join(",")}`);
  }
  for (const conflict of report.conflicts) {
    log(
      `roleSync role family conflict discordUserId=${member.id} family=${conflict.family} kept=${conflict.kept} dropped=${conflict.dropped.join(",")}`
    );
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
  // Remove before add, per member: a member must never briefly hold both an
  // old and a new tier role at once (confirmed requirement — do not reorder).
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
  if (sweeping) {
    log("roleSync sweep skipped: previous sweep still running");
    return;
  }
  if (!guild) {
    log("roleSync sweep skipped: guild not found (check guildId in config)");
    return;
  }
  sweeping = true;
  try {
    const members = await guild.members.fetch();
    const humans = [...members.values()].filter((m) => !m.user.bot);
    const chunks = chunk(humans, BATCH_SIZE);
    log(`roleSync sweep starting members=${humans.length} chunks=${chunks.length} dryRun=${dryRunRoleSync !== false}`);
    for (const c of chunks) {
      await syncChunk(c);
    }
    log("roleSync sweep completed");
  } finally {
    sweeping = false;
  }
}

function start() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

  client.once("ready", () => {
    log("Ready!");
    const guild = client.guilds.cache.get(guildId);
    sweep(guild).catch((err) => log(`roleSync sweep failed error=${err.message}`));
    new CronJob(
      "30 */2 * * *",
      () => {
        sweep(guild).catch((err) => log(`roleSync sweep failed error=${err.message}`));
      },
      null,
      true,
      "Europe/Madrid"
    );
  });

  client.login(token).catch((err) => log(`roleSync login failed error=${err.message}`));
}

module.exports = { chunk, validateBatchItems, computeReconcile, reconcileMember, syncChunk, sweep, start };

if (require.main === module) {
  start();
}
