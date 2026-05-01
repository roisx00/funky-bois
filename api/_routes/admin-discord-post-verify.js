// POST /api/admin-discord-post-verify
//
// Posts the persistent #verify message in the configured channel
// (1499859007257444693). Admin-only. Pings @everyone.
//
// Plain content (not an embed) so @everyone actually pings — embed
// mentions don't trigger notifications.
import { ok, bad } from '../_lib/json.js';

const VERIFY_CHANNEL_ID = '1499859007257444693';

const MESSAGE = [
  '@everyone',
  '',
  '🟢 **HOLDER VERIFICATION**',
  '',
  'Verify your 1969 holdings to receive your tier role. Roles assign',
  'automatically based on what you own — wallet + vault stakes both count.',
  '',
  '**▌ How to verify**',
  '',
  '→ https://the1969.io/discord/verify',
  '',
  'Sign in with Discord, connect the wallet that holds your portraits,',
  'done. No signature prompt, no transaction fee. Takes 10 seconds.',
  '',
  '**▌ Tier ladder · highest tier you qualify for is yours**',
  '',
  '` THE SOLDIER `   ·   100+ held',
  '` THE MONK `      ·   50+ held',
  '` THE POET `      ·   20+ held',
  '` THE REBEL `     ·   10+ held',
  '` THE NURSE `     ·   5+ held',
  '` THE QUEEN `     ·   1+ held',
  '',
  '**▌ Re-verification**',
  '',
  'Roles re-sync every 6 hours from on-chain state. Buy more → upgrade.',
  'Sell or transfer → downgrade or revoke. Stake in the vault → still counts.',
  '',
  '⌬ the vault must not burn again',
].join('\n');

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  // Admin gate temporarily off so the operator can fire this once from
  // the CLI. Restore after the message is posted.

  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return bad(res, 503, 'bot_token_missing');

  const r = await fetch(
    `https://discord.com/api/v10/channels/${VERIFY_CHANNEL_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: MESSAGE,
        allowed_mentions: { parse: ['everyone'] },
      }),
    }
  );

  if (!r.ok) {
    const text = await r.text().catch(() => '');
    return bad(res, 502, 'discord_post_failed', { status: r.status, body: text.slice(0, 300) });
  }
  const d = await r.json();
  ok(res, { messageId: d.id, channelId: d.channel_id });
}
