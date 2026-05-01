// POST /api/admin-discord-purge-roles?after=<userId>&dryRun=1
//
// Strips ALL non-Stranger, non-managed roles from every member of the
// guild. Stranger stays. Bot-managed roles stay (Discord blocks
// removing managed roles anyway).
//
// Resumable: processes up to MAX_MEMBERS_PER_CALL members per
// invocation, returns the next `after` cursor. Re-fire with that
// cursor until `done: true` is returned.
//
// Use ?dryRun=1 to preview which roles would be removed without
// actually mutating Discord state.
import { requireAdmin } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';
import { listMembers, listGuildRoles, setRoles } from '../_lib/discordApi.js';
import { DISCORD_GUILD_ID, STRANGER_ROLE_ID } from '../_lib/discordConfig.js';

const MAX_MEMBERS_PER_CALL = 200;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const dryRun = String(req.query?.dryRun || '') === '1';
  const startAfter = String(req.query?.after || '') || null;

  // Identify which roles count as "purgeable": everything except
  // @everyone (which is the guild id), Stranger, and managed roles
  // (Nitro booster, integration roles, the bot's own role — Discord
  // forbids removing those anyway).
  let allRoles;
  try { allRoles = await listGuildRoles(DISCORD_GUILD_ID); }
  catch (e) { return bad(res, 502, 'discord_roles_failed', { msg: e?.message }); }

  const purgeable = new Set();
  for (const r of allRoles) {
    if (r.id === DISCORD_GUILD_ID) continue;
    if (r.id === STRANGER_ROLE_ID) continue;
    if (r.managed) continue;
    purgeable.add(r.id);
  }

  let after = startAfter;
  let processed = 0;
  let touched = 0;
  let totalRolesRemoved = 0;
  const sample = [];
  const errors = [];

  while (processed < MAX_MEMBERS_PER_CALL) {
    let members;
    try { members = await listMembers(DISCORD_GUILD_ID, after, 100); }
    catch (e) { return bad(res, 502, 'discord_list_failed', { msg: e?.message }); }
    if (!Array.isArray(members) || members.length === 0) {
      after = null;  // signal done
      break;
    }
    for (const m of members) {
      const userId = m.user?.id;
      if (!userId) continue;
      after = userId;
      processed += 1;
      if (m.user?.bot) continue;

      const current = m.roles || [];
      const filtered = current.filter((rid) => !purgeable.has(rid));
      if (filtered.length === current.length) continue; // nothing to strip

      const removedHere = current.length - filtered.length;
      totalRolesRemoved += removedHere;
      touched += 1;
      if (sample.length < 5) {
        sample.push({ userId, removed: removedHere, kept: filtered });
      }

      if (!dryRun) {
        try { await setRoles(DISCORD_GUILD_ID, userId, filtered); }
        catch (e) {
          errors.push({ userId, msg: e?.message });
          // Brief backoff on rate-limit hints.
          if (e?.status === 429) await new Promise((r) => setTimeout(r, 1000));
        }
      }
      if (processed >= MAX_MEMBERS_PER_CALL) break;
    }
    if (members.length < 100) { after = null; break; }
  }

  res.setHeader('Cache-Control', 'no-store');
  ok(res, {
    dryRun,
    processed,
    touched,
    totalRolesRemoved,
    nextAfter: after,
    done: !after,
    sample,
    errorCount: errors.length,
    errorSample: errors.slice(0, 3),
  });
}
