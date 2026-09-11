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
