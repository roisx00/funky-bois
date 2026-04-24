// Admin tweet queue.
//   GET                            : list pending drafts (newest first)
//   POST { action: 'scan' }        : run the watcher, append new drafts
//   POST { action: 'dismiss', id } : mark a draft as dismissed
//
// The watcher is idempotent. Every trigger has a unique `trigger_key`
// (UNIQUE index) so scanning twice can't double-queue. Safe to call on
// every /admin load.
//
// Triggers (biased toward the hourly drop):
//   drop_opening       : fires when < 15 min remain before next :00
//   drop_sealed        : fires when a session's pool fully drains
//   rare_pull          : legendary or ultra-rare drop pulls
//   builder_spotlight  : every new builder gets a tweet tagging them
//   milestone          : completed_nfts count crosses a 50-step boundary

import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { getCurrentSessionId, isSessionActive } from '../_lib/elements.js';

const SESSION_INTERVAL_MS = 60 * 60 * 1000;
const FOLLOWERS_BIG = 50_000;
const MILESTONE_STEP = 50;

const ELEMENT_LABELS = {
  background: 'Background', outfit: 'Outfit', skin: 'Skin', eyes: 'Eyes',
  facial_hair: 'Facial Hair', hair: 'Hair', headwear: 'Headwear', face_mark: 'Face Mark',
};

function fmtFollowers(n) {
  const x = Number(n) || 0;
  if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(1)}M`;
  if (x >= 1000)      return `${Math.round(x / 1000)}K`;
  return String(x);
}

// ── DRAFT COPY ────────────────────────────────────────────────────────
// Rules: no em dashes, no emoji, no "gm/gn/wagmi", no engagement
// farming. US editorial voice. State the fact, then the stake, then
// the link. Every draft tags the relevant @username when applicable.
// All under 280 chars.

function draftDropOpening(minutesUntil) {
  return `Next pool opens in ${minutesUntil} minutes.

20 traits, 5 minute window, one global pool. No queue, no guaranteed seat. Get to the page, arm the claim, hit it at :00.

the1969.io/drop`;
}

function draftDropSealed({ secondsToSellOut, minutesUntilNext }) {
  const timing =
    secondsToSellOut <= 10 ? `in ${secondsToSellOut} seconds`
    : secondsToSellOut < 60 ? `in ${secondsToSellOut} seconds`
    : `in ${Math.round(secondsToSellOut / 60)} minutes`;
  return `This hour's pool sealed ${timing}.

20 traits out, 20 holders. The next window opens in ${minutesUntilNext} minutes. Be early, it moves fast.

the1969.io/drop`;
}

function draftRarePull(row) {
  const label = (ELEMENT_LABELS[row.element_type] || row.element_type).toLowerCase();
  if (row.rarity === 'ultra_rare') {
    return `Ultra rare pull on the hourly drop.

@${row.x_username} landed ${row.element_name} on the ${label} layer. 3 percent odds, and it just left the pool for good.

the1969.io/drop`;
  }
  return `Legendary pull on the hourly drop.

@${row.x_username} pulled ${row.element_name} (${label}). 12 percent odds. One trait closer to the 1,969.

the1969.io/drop`;
}

function draftBuilderSpotlight(row) {
  const f = Number(row.x_followers) || 0;
  const fmt = fmtFollowers(f);
  if (f >= FOLLOWERS_BIG) {
    return `@${row.x_username} just built their bust.

${fmt} followers on X, one seat at the 1,969. Their portrait is live in the gallery.

the1969.io/gallery`;
  }
  return `Welcome @${row.x_username}.

Portrait assembled, whitelist secured. One more of the 1,969 who showed up for the hourly drop and earned it trait by trait.

the1969.io/gallery`;
}

function draftMilestone(count) {
  const remaining = 1969 - count;
  return `${count} busts built. ${remaining} to go.

Every one is 8 traits somebody actually pulled from the hourly drop. No presale, no discounts. Just the pool and the people showing up for it.

the1969.io/drop`;
}

// ── WATCHER ───────────────────────────────────────────────────────────

async function queueDraft({ type, key, payload, text, template }) {
  const r = one(await sql`
    INSERT INTO pending_tweets (trigger_type, trigger_key, payload, draft_text, template)
    VALUES (${type}, ${key}, ${JSON.stringify(payload)}::jsonb, ${text}, ${template})
    ON CONFLICT (trigger_key) DO NOTHING
    RETURNING id
  `);
  return !!r;
}

async function scan() {
  let queued = 0;
  const { ELEMENT_VARIANTS } = await import('../_lib/elements.js');

  // ── 1. Drop opening (< 15 min before next :00) ──
  const now = Date.now();
  const currentSess = getCurrentSessionId();
  const nextSess = currentSess + SESSION_INTERVAL_MS;
  const minutesUntilNext = Math.floor((nextSess - now) / 60000);
  if (minutesUntilNext >= 0 && minutesUntilNext <= 15) {
    const key = `drop_opening:${nextSess}`;
    if (await queueDraft({
      type: 'drop_opening', key,
      payload: { nextSessId: nextSess, minutesUntil: Math.max(1, minutesUntilNext) },
      text: draftDropOpening(Math.max(1, minutesUntilNext)),
      template: 'drop_card',
    })) queued += 1;
  }

  // ── 2. Drop sealed (pool fully drained) ──
  const sealedSessions = await sql`
    SELECT s.session_id, s.pool_size, s.pool_claimed,
           EXTRACT(EPOCH FROM (MAX(c.claimed_at) - to_timestamp(s.session_id::bigint / 1000)))::int
             AS seconds_to_sell_out
      FROM drop_sessions s
      JOIN drop_claims c ON c.session_id = s.session_id
     WHERE s.pool_claimed >= s.pool_size
       AND s.session_id >= ${(Date.now() - 24 * 60 * 60 * 1000)}
     GROUP BY s.session_id, s.pool_size, s.pool_claimed
  `;
  for (const row of sealedSessions) {
    const next = Number(row.session_id) + SESSION_INTERVAL_MS;
    const minsToNext = Math.max(1, Math.ceil((next - Date.now()) / 60000));
    const key = `drop_sealed:${row.session_id}`;
    if (await queueDraft({
      type: 'drop_sealed', key,
      payload: {
        sessionId: Number(row.session_id),
        poolSize: row.pool_size,
        secondsToSellOut: Math.max(0, row.seconds_to_sell_out || 0),
        minutesUntilNext: minsToNext,
      },
      text: draftDropSealed({
        secondsToSellOut: Math.max(1, row.seconds_to_sell_out || 1),
        minutesUntilNext: minsToNext,
      }),
      template: 'drop_card',
    })) queued += 1;
  }

  // ── 3. Rare pulls (last 24h, skip sub-second bot-looking claims) ──
  const rareRows = await sql`
    SELECT dc.id, dc.element_type, dc.variant, dc.rarity, dc.position,
           u.x_username,
           EXTRACT(EPOCH FROM (dc.claimed_at - to_timestamp(dc.session_id::bigint / 1000))) * 1000
             AS ms_from_open
      FROM drop_claims dc
      JOIN users u ON u.id = dc.user_id
     WHERE dc.rarity IN ('legendary', 'ultra_rare')
       AND dc.claimed_at > now() - interval '24 hours'
       AND EXTRACT(EPOCH FROM (dc.claimed_at - to_timestamp(dc.session_id::bigint / 1000))) > 1
  `;
  for (const row of rareRows) {
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
    if (await queueDraft({
      type: 'rare_pull', key,
      payload,
      text: draftRarePull({ ...row, element_name }),
      template: 'trait_flash',
    })) queued += 1;
  }

  // ── 4. Builder spotlight (every new portrait, last 48h) ──
  const builderRows = await sql`
    SELECT n.id AS portrait_id, n.elements,
           u.x_username, u.x_avatar, u.x_followers
      FROM completed_nfts n
      JOIN users u ON u.id = n.user_id
     WHERE n.created_at > now() - interval '48 hours'
  `;
  for (const row of builderRows) {
    const key = `spotlight:${row.portrait_id}`;
    const payload = {
      xUsername: row.x_username,
      xAvatar: row.x_avatar,
      xFollowers: Number(row.x_followers) || 0,
      portraitId: row.portrait_id,
      elements: row.elements,
    };
    if (await queueDraft({
      type: 'builder_spotlight', key,
      payload,
      text: draftBuilderSpotlight(row),
      template: 'portrait_showcase',
    })) queued += 1;
  }

  // ── 5. Milestones (every 50 built) ──
  const countRow = one(await sql`SELECT COUNT(*)::int AS c FROM completed_nfts`);
  const total = countRow?.c || 0;
  const latestMilestone = Math.floor(total / MILESTONE_STEP) * MILESTONE_STEP;
  if (latestMilestone > 0) {
    const key = `milestone:${latestMilestone}`;
    if (await queueDraft({
      type: 'milestone', key,
      payload: { count: latestMilestone, remaining: 1969 - latestMilestone },
      text: draftMilestone(latestMilestone),
      template: 'milestone',
    })) queued += 1;
  }

  void isSessionActive; // quiet the unused-import warning
  return queued;
}

async function listQueue() {
  const rows = await sql`
    SELECT id, trigger_type, trigger_key, payload, draft_text, template, status, created_at, dismissed_at
      FROM pending_tweets
     WHERE status = 'pending'
     ORDER BY
       -- Drop content first, then recency
       CASE trigger_type
         WHEN 'drop_opening' THEN 0
         WHEN 'drop_sealed'  THEN 1
         WHEN 'rare_pull'    THEN 2
         WHEN 'builder_spotlight' THEN 3
         WHEN 'milestone'    THEN 4
         ELSE 5
       END,
       created_at DESC
     LIMIT 200
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
