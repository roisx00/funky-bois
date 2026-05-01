// GET /api/admin-discord-diagnose
//
// Returns a focused diagnostic for why role-assign is failing. Lists:
//   • bot's own role + its position
//   • each tier role + its position
//   • whether the bot's role is BELOW any tier role (hierarchy block)
//
// Discord blocks role mutations on roles higher than the actor's own
// position, regardless of MANAGE_ROLES permission. The fix is to drag
// the bot's role above all tier roles in Server Settings → Roles.
import { ok, bad } from '../_lib/json.js';
import { listGuildRoles } from '../_lib/discordApi.js';
import { DISCORD_GUILD_ID, TIER_LADDER, STRANGER_ROLE_ID } from '../_lib/discordConfig.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  // Public diagnostic — only returns role IDs + positions which are
  // already visible to anyone in the guild. No admin gate.

  let roles;
  try { roles = await listGuildRoles(DISCORD_GUILD_ID); }
  catch (e) { return bad(res, 502, 'discord_roles_failed', { msg: e?.message }); }

  // Bot's own role: managed=true, tags.bot_id present.
  // Discord auto-creates one role per bot; that's the role our bot writes from.
  const botRole = roles
    .filter((r) => r.managed && r.tags?.bot_id)
    .sort((a, b) => b.position - a.position)[0] || null;

  const tierInfo = TIER_LADDER.map((t) => {
    const r = roles.find((x) => x.id === t.roleId);
    return r
      ? { name: t.name, roleId: t.roleId, position: r.position, found: true }
      : { name: t.name, roleId: t.roleId, position: null, found: false };
  });

  const stranger = roles.find((r) => r.id === STRANGER_ROLE_ID);

  const blockers = tierInfo.filter((t) => t.found && botRole && t.position >= botRole.position);

  let diagnosis;
  if (!botRole) {
    diagnosis = 'no_managed_bot_role_found';
  } else if (blockers.length > 0) {
    diagnosis = 'bot_role_below_tier_roles';
  } else {
    diagnosis = 'hierarchy_ok';
  }

  ok(res, {
    diagnosis,
    botRole: botRole
      ? { id: botRole.id, name: botRole.name, position: botRole.position }
      : null,
    stranger: stranger
      ? { id: stranger.id, name: stranger.name, position: stranger.position }
      : null,
    tierRoles: tierInfo,
    blockers: blockers.map((b) => b.name),
    fix: blockers.length > 0
      ? `In Discord: Server Settings → Roles → drag "${botRole?.name}" ABOVE: ${blockers.map((b) => '"' + b.name + '"').join(', ')}`
      : null,
  });
}
