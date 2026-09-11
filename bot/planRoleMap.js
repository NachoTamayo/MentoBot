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
