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

// Roles grouped by game line, ordered lowest to highest tier. A member may
// hold at most one role per family at a time — business rule: a student can
// stack Cash + Spins + PLO etc., but never two tiers of the same line (e.g.
// Cash Basic and Cash Pro together). PLO has no Ultra tier (no "plo-elite"
// plan exists).
const roleFamilies = {
  cash: [roles.cashBasic, roles.cashPro, roles.cashUltra],
  spins: [roles.spinBasic, roles.spinPro, roles.spinUltra],
  torneos: [roles.torneosBasic, roles.torneosPro, roles.torneosUltra],
  plo: [roles.pLOBasic, roles.pLOPro],
};

const roleIdToFamilyRank = new Map();
for (const [family, tiers] of Object.entries(roleFamilies)) {
  tiers.forEach((roleId, rank) => roleIdToFamilyRank.set(roleId, { family, rank }));
}

// Collapses a set of "wanted" role IDs (the union of every active plan's
// mapped roles) down to at most one role per family, keeping the highest
// tier. This should rarely trigger — it exists only for the transition
// window where V4 briefly reports two plans of the same line as active at
// once (e.g. mid plan-upgrade) — so callers should log `conflicts`.
function resolveRoleFamilyConflicts(wantedRoleIds) {
  const byFamily = new Map();
  for (const roleId of wantedRoleIds) {
    const info = roleIdToFamilyRank.get(roleId);
    if (!info) continue;
    const current = byFamily.get(info.family);
    if (!current || info.rank > current.rank) {
      byFamily.set(info.family, { roleId, rank: info.rank });
    }
  }

  const resolved = new Set(wantedRoleIds);
  const conflicts = [];
  for (const [family, kept] of byFamily) {
    const dropped = [...wantedRoleIds].filter((roleId) => {
      const info = roleIdToFamilyRank.get(roleId);
      return info && info.family === family && roleId !== kept.roleId;
    });
    if (dropped.length > 0) {
      dropped.forEach((roleId) => resolved.delete(roleId));
      conflicts.push({ family, kept: kept.roleId, dropped });
    }
  }

  return { resolved, conflicts };
}

module.exports = { planRoleMap, managedRoleIds, roleFamilies, resolveRoleFamilyConflicts };
