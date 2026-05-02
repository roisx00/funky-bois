// One-off backfill: bind users.discord_id from discord_verifications
// where the verify wallet matches users.wallet_address.
//
// Why: discord-holder-finish.js previously didn't write to users.discord_id,
// so the cron tier-sync had no way to count vault deposits by user_id for
// holders who staked from a different wallet than they verified with. Going
// forward, the verify endpoint binds the linkage on success — this script
// handles the legacy rows.
//
// Safety:
//   - Dry-run by default. Pass --apply to actually write.
//   - Skips users.discord_id rows that are already set (no overwrite).
//   - Skips multi-match wallets (one wallet → many users) — manual review.
//   - Skips multi-match discord_ids (one discord_id → many wallets in users).
//
// Run from project root with the Vercel-prod DATABASE_URL exported:
//   node scripts/backfill-discord-id.js
//   node scripts/backfill-discord-id.js --apply
import { neon } from '@neondatabase/serverless';

const apply = process.argv.includes('--apply');
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) { console.error('missing DATABASE_URL'); process.exit(1); }
const sql = neon(url);

// Candidate matches: verify rows whose wallet matches a users row that
// doesn't already have a discord_id. Case-insensitive on wallet.
const rows = await sql`
  SELECT v.discord_id,
         v.discord_username,
         LOWER(v.wallet) AS wallet,
         u.id            AS user_id,
         u.x_username    AS x_username
    FROM discord_verifications v
    JOIN users u
      ON LOWER(u.wallet_address) = LOWER(v.wallet)
   WHERE u.discord_id IS NULL
     AND v.wallet IS NOT NULL
     AND v.wallet <> ''
`;

console.log(`[backfill] ${rows.length} candidate matches (verify wallet → users with no discord_id)`);

// Dedupe: if a wallet maps to multiple user rows OR a discord_id maps to
// multiple wallets, skip and let an operator review. Both are unusual
// (would imply duplicate signups or a verify replay across accounts).
const userIdsPerWallet = new Map();
const walletsPerDiscord = new Map();
for (const r of rows) {
  const u = userIdsPerWallet.get(r.wallet) || new Set();
  u.add(r.user_id);
  userIdsPerWallet.set(r.wallet, u);

  const w = walletsPerDiscord.get(r.discord_id) || new Set();
  w.add(r.wallet);
  walletsPerDiscord.set(r.discord_id, w);
}

const safe = [];
const skipped = [];
for (const r of rows) {
  if (userIdsPerWallet.get(r.wallet).size > 1) {
    skipped.push({ ...r, reason: 'multi_user_per_wallet' });
    continue;
  }
  if (walletsPerDiscord.get(r.discord_id).size > 1) {
    skipped.push({ ...r, reason: 'multi_wallet_per_discord' });
    continue;
  }
  safe.push(r);
}

console.log(`[backfill] safe to bind: ${safe.length}`);
console.log(`[backfill] skipped:      ${skipped.length}`);
if (skipped.length) {
  console.log('[backfill] sample skipped (first 5):');
  for (const s of skipped.slice(0, 5)) {
    console.log(`  - ${s.reason}: discord=${s.discord_id} wallet=${s.wallet} user=${s.user_id}`);
  }
}

if (!apply) {
  console.log('\n[backfill] DRY RUN — pass --apply to actually update.');
  process.exit(0);
}

let updated = 0;
for (const r of safe) {
  const result = await sql`
    UPDATE users
       SET discord_id       = ${r.discord_id},
           discord_username = COALESCE(${r.discord_username}, discord_username)
     WHERE id = ${r.user_id}::uuid
       AND discord_id IS NULL
    RETURNING id
  `;
  if (result.length) updated += 1;
}

console.log(`[backfill] applied: ${updated} users.discord_id bindings`);
