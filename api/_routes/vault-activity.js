// GET /api/vault-activity
//
// Returns the current user's last ~14 vault-relevant events as a unified
// timeline so the frontend can render a "vault diary" instead of static
// stats. Sources merged in JS (UNION ALL in SQL would force a column-
// shape compromise across very different event types).
//
// Event shape (uniform across kinds):
//   { kind, at, label, amount?, sub? }
//
// Kinds:
//   'deposit'         — BUSTS deposited
//   'withdraw'        — BUSTS withdrawn (negative ledger row)
//   'portrait_bind'   — portrait bound
//   'portrait_unbind' — portrait withdrawn
//   'upgrade'         — vault_upgrades row
//   'yield_claim'     — yield settled to balance
import { sql } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return bad(res, 405, 'method_not_allowed');
  const user = await getSessionUser(req);
  if (!user) return bad(res, 401, 'not_authenticated');

  // Three small parallel queries beat one giant UNION — Neon's planner
  // gives each a tighter index path and we control the merge in JS.
  const [deposits, upgrades, ledger] = await Promise.all([
    sql`
      SELECT amount, deposited_at
        FROM vault_deposits
       WHERE user_id = ${user.id}::uuid
       ORDER BY deposited_at DESC
       LIMIT 25
    `,
    sql`
      SELECT track, tier, cost, bought_at
        FROM vault_upgrades
       WHERE user_id = ${user.id}::uuid
       ORDER BY bought_at DESC
       LIMIT 25
    `,
    sql`
      SELECT amount, reason, created_at
        FROM busts_ledger
       WHERE user_id = ${user.id}::uuid
         AND (
           reason ILIKE 'Vault%'
           OR reason ILIKE '%vault%'
         )
       ORDER BY created_at DESC
       LIMIT 25
    `,
  ]);

  const events = [];

  for (const d of deposits) {
    events.push({
      kind: d.amount >= 0 ? 'deposit' : 'withdraw',
      at:   new Date(d.deposited_at).toISOString(),
      label: d.amount >= 0 ? 'Deposited BUSTS' : 'Withdrew BUSTS',
      amount: Math.abs(Number(d.amount || 0)),
      sub: 'BUSTS',
    });
  }

  for (const u of upgrades) {
    events.push({
      kind: 'upgrade',
      at:   new Date(u.bought_at).toISOString(),
      label: `${u.track[0].toUpperCase()}${u.track.slice(1)} → tier ${u.tier}`,
      amount: Number(u.cost || 0),
      sub: 'BUSTS spent',
    });
  }

  for (const l of ledger) {
    const reason = String(l.reason || '');
    const amt = Number(l.amount || 0);
    let kind = 'yield_claim';
    let label = reason;
    let sub = amt >= 0 ? 'BUSTS in' : 'BUSTS out';

    // Categorise from the reason string we wrote in vault routes.
    if (/portrait/i.test(reason) && /(deposit|bond|bind)/i.test(reason)) {
      kind = 'portrait_bind';
      label = 'Bound portrait';
      sub = '+10 / day';
    } else if (/portrait/i.test(reason) && /(withdraw|unbind|remove)/i.test(reason)) {
      kind = 'portrait_unbind';
      label = 'Withdrew portrait';
      sub = 'bond removed';
    } else if (/yield/i.test(reason) || /claim/i.test(reason)) {
      kind = 'yield_claim';
      label = 'Yield claimed';
      sub = 'BUSTS in';
    } else if (/withdraw/i.test(reason)) {
      kind = 'withdraw';
      label = 'Withdrew from vault';
      sub = 'BUSTS out';
    } else if (/deposit/i.test(reason)) {
      kind = 'deposit';
      label = 'Deposited to vault';
      sub = 'BUSTS in';
    }

    events.push({
      kind,
      at:   new Date(l.created_at).toISOString(),
      label,
      amount: Math.abs(amt) || undefined,
      sub,
    });
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  ok(res, { events: events.slice(0, 14) });
}
