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
