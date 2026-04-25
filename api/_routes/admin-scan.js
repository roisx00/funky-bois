// Admin: scan a task's tweet for real engagement and auto-approve matches.
//
// Flow:
//   1. Scrape likes / retweets / replies from Nitter → real X handles
//   2. For every pending self-submission on this task (users who clicked
//      "I've liked it" / "I've retweeted" / "I've replied"):
//        • if the scraper also found them on X → auto-approve + credit BUSTS
//        • if the scraper did NOT find them     → surface as 'fake_claim'
//      so the admin can reject with one click
//   3. For engagers the scraper found who HAVEN'T self-reported yet, queue
//      a pending_verifications row so they'll appear in the manual queue
//      (optional credit — admin can approve later)
//
// Returns a detailed report for the admin UI: scraped handles, auto-
// approved users, fake self-claims, and queued scraper-sourced pendings.
import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { scrapeTweetEngagement } from '../_lib/nitter.js';
import { approveVerification } from '../_lib/taskApprove.js';

// Split pending rows into "on scrape list" (auto-approve) and "fake claim"
// (on our DB as pending, but not found on X).
async function matchAndApprove(task, action, scrapedSet, adminHandle) {
  const result = {
    autoApproved: [],       // { userId, xUsername, awarded, trifectaBonus? }
    fakeClaims:   [],       // { userId, xUsername, verifId }
    scraperQueued: [],      // { userId, xUsername, verifId }  (engagers we just queued)
  };
  if (!scrapedSet) return result;
  const pointsCol = action === 'like' ? 'reward_like' : action === 'rt' ? 'reward_rt' : 'reward_reply';
  const points = task[pointsCol];

  // 1. Fetch every pending self-submission for this (task, action)
  const pending = await sql`
    SELECT pv.id, pv.user_id, u.x_username
      FROM pending_verifications pv
      JOIN users u ON u.id = pv.user_id
     WHERE pv.task_id = ${task.id}
       AND pv.action_type = ${action}
       AND pv.status = 'pending'
  `;

  for (const p of pending) {
    if (scrapedSet.has(p.x_username.toLowerCase())) {
      // Genuine — auto-approve
      // eslint-disable-next-line no-await-in-loop
      const r = await approveVerification(p.id, adminHandle);
      if (r.approved) {
        result.autoApproved.push({
          userId: p.user_id,
          xUsername: p.x_username,
          awarded: r.awarded,
          trifectaBonus: r.trifectaBonus,
        });
      }
    } else {
      // Claimed to have done it, but not on X — surface for rejection
      result.fakeClaims.push({
        userId: p.user_id,
        xUsername: p.x_username,
        verifId: p.id,
      });
    }
  }

  // 2. Engagers scraped but who haven't self-reported yet → queue them
  //    (they'll see "pending review" next time they open the task card).
  const pendingHandles = new Set(pending.map((p) => p.x_username.toLowerCase()));
  const unclaimedEngagers = Array.from(scrapedSet).filter((h) => !pendingHandles.has(h));
  if (unclaimedEngagers.length) {
    const matched = await sql`
      SELECT id, x_username FROM users
      WHERE LOWER(x_username) = ANY(${unclaimedEngagers})
    `;
    for (const u of matched) {
      // eslint-disable-next-line no-await-in-loop
      const inserted = one(await sql`
        INSERT INTO pending_verifications (user_id, task_id, action_type, points, source, status)
        VALUES (${u.id}, ${task.id}, ${action}, ${points}, 'scraper', 'pending')
        ON CONFLICT (user_id, task_id, action_type) DO NOTHING
        RETURNING id
      `);
      if (inserted) {
        result.scraperQueued.push({
          userId: u.id,
          xUsername: u.x_username,
          verifId: inserted.id,
        });
      }
    }
  }

  // 3. Snapshot every scraped handle for audit
  for (const h of scrapedSet) {
    // eslint-disable-next-line no-await-in-loop
    await sql`
      INSERT INTO scrape_snapshots (task_id, action_type, x_username)
      VALUES (${task.id}, ${action}, ${h})
      ON CONFLICT (task_id, action_type, x_username_lc) DO NOTHING
    `;
  }

  return result;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { taskId } = await readBody(req) || {};
  if (!taskId) return bad(res, 400, 'missing_taskId');

  const task = one(await sql`SELECT * FROM tasks WHERE id = ${taskId} LIMIT 1`);
  if (!task) return bad(res, 404, 'task_not_found');

  // Wrapped so a Nitter mirror throwing mid-scrape doesn't 500 the
  // admin endpoint. On error we treat all engagement lists as null,
  // which the manual-review fallback below already handles.
  let eng;
  try {
    eng = await scrapeTweetEngagement(task.tweet_id);
  } catch (e) {
    console.warn('[admin-scan] scrape threw:', e?.message);
    eng = { likes: null, retweets: null, replies: null, diag: [], counts: null };
  }

  // If Nitter is entirely unreachable (all mirrors dead), eng.likes etc
  // will be null. Surface that clearly instead of silently approving 0.
  const scrapeFailed = eng.likes === null && eng.retweets === null && eng.replies === null;

  const results = {
    like:  await matchAndApprove(task, 'like',  eng.likes,    admin.x_username),
    rt:    await matchAndApprove(task, 'rt',    eng.retweets, admin.x_username),
    reply: await matchAndApprove(task, 'reply', eng.replies,  admin.x_username),
  };

  // Manual-review fallback: when scraping fails we list every pending
  // self-claim so the admin can review them by opening each X profile.
  const pendingForManualReview = await sql`
    SELECT pv.id, pv.user_id, pv.action_type, pv.points, pv.created_at,
           u.x_username, u.x_avatar
      FROM pending_verifications pv
      JOIN users u ON u.id = pv.user_id
     WHERE pv.task_id = ${task.id}
       AND pv.status = 'pending'
     ORDER BY pv.created_at ASC
  `;

  const totalApproved = results.like.autoApproved.length + results.rt.autoApproved.length + results.reply.autoApproved.length;
  const totalFakeClaims = results.like.fakeClaims.length + results.rt.fakeClaims.length + results.reply.fakeClaims.length;
  const totalQueued = results.like.scraperQueued.length + results.rt.scraperQueued.length + results.reply.scraperQueued.length;

  ok(res, {
    taskId,
    scrapeFailed,
    scraped: {
      likes:    eng.likes    ? Array.from(eng.likes)    : null,
      retweets: eng.retweets ? Array.from(eng.retweets) : null,
      replies:  eng.replies  ? Array.from(eng.replies)  : null,
    },
    counts: {
      // Prefer scraped handle counts; fall back to X syndication counts
      // (which work even when every Nitter is dead).
      likes:    eng.likes    ? eng.likes.size    : (eng.counts ? eng.counts.likes    : null),
      retweets: eng.retweets ? eng.retweets.size : (eng.counts ? eng.counts.retweets : null),
      replies:  eng.replies  ? eng.replies.size  : (eng.counts ? eng.counts.replies  : null),
    },
    countsSource: (eng.likes || eng.retweets || eng.replies) ? 'nitter' : (eng.counts ? 'syndication' : 'none'),
    syndication: eng.counts || null,
    results,
    summary: {
      autoApproved: totalApproved,
      fakeClaims:   totalFakeClaims,
      scraperQueued: totalQueued,
    },
    tweetUrl: task.tweet_url,
    diag: eng.diag || [],
    pendingForManualReview: pendingForManualReview.map((p) => ({
      verifId:   p.id,
      userId:    p.user_id,
      xUsername: p.x_username,
      xAvatar:   p.x_avatar,
      action:    p.action_type,
      points:    p.points,
      claimedAt: new Date(p.created_at).getTime(),
    })),
  });
}
