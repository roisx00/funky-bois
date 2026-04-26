// The applicant's view of their own collab application.
//
// Returns: { application, wallets[], wlCutoff }
//   application — null if they haven't applied
//   wallets     — addresses they've submitted
//   wlCutoff    — global cutoff timestamp (null if not set)
import { sql, one } from '../_lib/db.js';
import { requireActiveUser } from '../_lib/auth.js';
import { ok } from '../_lib/json.js';
import { getConfigInt } from '../_lib/config.js';

export default async function handler(req, res) {
  const user = await requireActiveUser(req, res);
  if (!user) return;

  const app = one(await sql`
    SELECT id, community_name, community_url, community_size, category,
           raid_link, raid_platform, message, status, wl_allocation,
           admin_note, created_at, reviewed_at, updated_at,
           giveaway_post_url, giveaway_submitted_at, banner_bytes
      FROM collab_applications
     WHERE user_id = ${user.id}
     ORDER BY id DESC
     LIMIT 1
  `);

  let wallets = [];
  if (app) {
    wallets = await sql`
      SELECT id, wallet_address, added_at
        FROM collab_wallets
       WHERE application_id = ${app.id}
       ORDER BY id DESC
    `;
  }

  // Global wallet-submission cutoff (UNIX seconds). Admin-set via
  // admin-collab-review; once the current time exceeds it, the user
  // can no longer add wallets.
  const cutoffSecs = await getConfigInt('collab_wallet_cutoff', 0);

  ok(res, {
    application: app ? {
      id:            app.id,
      communityName: app.community_name,
      communityUrl:  app.community_url,
      communitySize: app.community_size,
      category:      app.category,
      raidLink:      app.raid_link,
      raidPlatform:  app.raid_platform,
      message:       app.message,
      status:        app.status,
      wlAllocation:  app.wl_allocation,
      adminNote:     app.admin_note,
      bannerUrl:     app.banner_bytes ? `/api/collab-banner/${app.id}` : null,
      giveawayPostUrl: app.giveaway_post_url || null,
      giveawaySubmittedAt: app.giveaway_submitted_at ? new Date(app.giveaway_submitted_at).getTime() : null,
      createdAt:     new Date(app.created_at).getTime(),
      reviewedAt:    app.reviewed_at ? new Date(app.reviewed_at).getTime() : null,
      updatedAt:     new Date(app.updated_at).getTime(),
    } : null,
    wallets: wallets.map((w) => ({
      id:      w.id,
      address: w.wallet_address,
      addedAt: new Date(w.added_at).getTime(),
    })),
    wlCutoff: cutoffSecs ? cutoffSecs * 1000 : null,
  });
}
