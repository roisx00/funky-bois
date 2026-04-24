// Admin tweet queue.
//   GET                           : list pending drafts (newest first)
//   POST { action: 'scan' }       : run the watcher, append new drafts
//   POST { action: 'dismiss', id }: mark a draft as dismissed
//
// The watcher is idempotent. Every trigger has a unique `trigger_key`
// (UNIQUE index) so scanning twice can't double-queue. Safe to call on
// every /admin load.
//
// Triggers:
//   rare_pull    : any drop claim with rarity in (legendary, ultra_rare)
//   milestone    : completed_nfts count crosses a 50-step boundary
//   big_builder  : user with x_followers >= 50000 submits a portrait
import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';

const FOLLOWERS_THRESHOLD = 50_000;
const MILESTONE_STEP = 50;

const ELEMENT_LABELS = {
  background: 'Background', outfit: 'Outfit', skin: 'Skin', eyes: 'Eyes',
  facial_hair: 'Facial Hair', hair: 'Hair', headwear: 'Headwear', face_mark: 'Face Mark',
};

// Tweet drafts. Rules:
//   no em dashes, no emoji noise, no engagement farming.
//   US editorial voice. State the fact, then the stake, then the link.
//   Every draft is under 280 chars so it fits without threading.

function draftRarePull(row) {
  const label = (ELEMENT_LABELS[row.element_type] || row.element_type).toLowerCase();
  if (row.rarity === 'ultra_rare') {
    return `Ultra rare pull.

@${row.x_username} landed ${row.element_name} on the ${label} layer. 3 percent odds, and it just left the pool for good.

the1969.io/drop`;
  }
  return `Legendary pull.

@${row.x_username} pulled ${row.element_name} (${label}). 12 percent odds. One trait closer to the 1,969.

the1969.io/drop`;
}

function draftMilestone(count) {
  const remaining = 1969 - count;
  return `${count} busts built. ${remaining} to go.

Every one is a set of 8 traits somebody actually earned. No presale, no discounts. Just the hourly pool and the people showing up for it.

the1969.io/gallery`;
}

function draftBigBuilder(row) {
  const followers = Number(row.x_followers) || 0;
  const fmt = followers >= 1_000_000 ? `${(followers / 1_000_000).toFixed(1)}M`
            : followers >= 1000     ? `${Math.round(followers / 1000)}K`
            : String(followers);
  return `@${row.x_username} just built their bust.

${fmt} followers, one seat at the 1,969. Portrait is live in the gallery now.

the1969.io/gallery`;
}

async function scan() {
  let queued = 0;

  // ── 1. Rare pulls (legendary + ultra_rare) in the last 24h ──
  const rareRows = await sql`
    SELECT dc.id, dc.session_id, dc.user_id, dc.element_type, dc.variant,
           dc.rarity, dc.position, u.x_username,
           EXTRACT(EPOCH FROM (dc.claimed_at - to_timestamp(dc.session_id::bigint / 1000))) * 1000
             AS ms_from_open
      FROM drop_claims dc
      JOIN users u ON u.id = dc.user_id
     WHERE dc.rarity IN ('legendary', 'ultra_rare')
       AND dc.claimed_at > now() - interval '24 hours'
       AND EXTRACT(EPOCH FROM (dc.claimed_at - to_timestamp(dc.session_id::bigint / 1000))) > 1
  `;
  for (const row of rareRows) {
    // Resolve element name from the catalog (server mirror)
    const { ELEMENT_VARIANTS } = await import('../_lib/elements.js');
    const info = ELEMENT_VARIANTS[row.element_type]?.[row.variant];
    const element_name = info?.name || row.element_type;
    const key = `rare:${row.id}`;
    const payload = {
      xUsername: row.x_username,
      elementType: row.element_type,
      variant: row.variant,
      elementName: element_name,
      rarity: row.rarity,
      position: row.position,
      msFromOpen: Number(row.ms_from_open),
    };
    const text = draftRarePull({ ...row, element_name });
    const r = one(await sql`
      INSERT INTO pending_tweets (trigger_type, trigger_key, payload, draft_text, template)
      VALUES ('rare_pull', ${key}, ${JSON.stringify(payload)}::jsonb, ${text}, 'trait_flash')
      ON CONFLICT (trigger_key) DO NOTHING
      RETURNING id
    `);
    if (r) queued += 1;
  }

  // ── 2. Milestones (every MILESTONE_STEP portraits built) ──
  const countRow = one(await sql`SELECT COUNT(*)::int AS c FROM completed_nfts`);
  const total = countRow?.c || 0;
  const latestMilestone = Math.floor(total / MILESTONE_STEP) * MILESTONE_STEP;
  if (latestMilestone > 0) {
    const key = `milestone:${latestMilestone}`;
    const payload = { count: latestMilestone, remaining: 1969 - latestMilestone };
    const text = draftMilestone(latestMilestone);
    const r = one(await sql`
      INSERT INTO pending_tweets (trigger_type, trigger_key, payload, draft_text, template)
      VALUES ('milestone', ${key}, ${JSON.stringify(payload)}::jsonb, ${text}, 'grid')
      ON CONFLICT (trigger_key) DO NOTHING
      RETURNING id
    `);
    if (r) queued += 1;
  }

  // ── 3. Big-account builders (followers ≥ 50K) ──
  const bigRows = await sql`
    SELECT n.id AS portrait_id, n.elements, n.created_at,
           u.id AS user_id, u.x_username, u.x_avatar, u.x_followers
      FROM completed_nfts n
      JOIN users u ON u.id = n.user_id
     WHERE u.x_followers >= ${FOLLOWERS_THRESHOLD}
       AND n.created_at > now() - interval '7 days'
  `;
  for (const row of bigRows) {
    const key = `big:${row.portrait_id}`;
    const payload = {
      xUsername: row.x_username,
      xAvatar: row.x_avatar,
      xFollowers: Number(row.x_followers) || 0,
      portraitId: row.portrait_id,
      elements: row.elements,
    };
    const text = draftBigBuilder(row);
    const r = one(await sql`
      INSERT INTO pending_tweets (trigger_type, trigger_key, payload, draft_text, template)
      VALUES ('big_builder', ${key}, ${JSON.stringify(payload)}::jsonb, ${text}, 'portrait_showcase')
      ON CONFLICT (trigger_key) DO NOTHING
      RETURNING id
    `);
    if (r) queued += 1;
  }

  return queued;
}

async function listQueue() {
  const rows = await sql`
    SELECT id, trigger_type, trigger_key, payload, draft_text, template, status, created_at, dismissed_at
      FROM pending_tweets
     WHERE status = 'pending'
     ORDER BY created_at DESC
     LIMIT 100
  `;
  return rows.map((r) => ({
    id: r.id,
    triggerType: r.trigger_type,
    triggerKey: r.trigger_key,
    payload: r.payload,
    draftText: r.draft_text,
    template: r.template,
    status: r.status,
    createdAt: new Date(r.created_at).getTime(),
  }));
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === 'GET') {
    // Auto-scan on every open so the list is live. Cheap (indexed query +
    // single SELECT count + UPSERTs that no-op on dupes).
    try { await scan(); } catch (e) { console.warn('[tweet-queue] scan failed:', e?.message); }
    const items = await listQueue();
    return ok(res, { total: items.length, items });
  }

  if (req.method === 'POST') {
    const body = (await readBody(req)) || {};
    if (body.action === 'scan') {
      const newItems = await scan();
      const items = await listQueue();
      return ok(res, { queued: newItems, total: items.length, items });
    }
    if (body.action === 'dismiss' && body.id) {
      const r = one(await sql`
        UPDATE pending_tweets
           SET status = 'dismissed', dismissed_at = now()
         WHERE id = ${body.id} AND status = 'pending'
         RETURNING id
      `);
      return ok(res, { dismissed: !!r });
    }
    return bad(res, 400, 'invalid_action');
  }

  return bad(res, 405, 'method_not_allowed');
}
