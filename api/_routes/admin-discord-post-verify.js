// POST /api/admin-discord-post-verify
//
// Posts the persistent #verify embed in the configured channel
// (1499859007257444693). Admin-only. Run once after deploy.
//
// The embed instructs holders to verify two ways:
//   • Connect wallet at the1969.io (auto-assign on connect, if signed in)
//   • Click the link to /discord/verify (Discord-OAuth flow, no main-site
//     account required)
import { requireAdmin } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';

const VERIFY_CHANNEL_ID = '1499859007257444693';
const SITE_URL = 'https://the1969.io';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return bad(res, 503, 'bot_token_missing');

  const embed = {
    title: 'HOLDER VERIFICATION',
    description:
      'Verify your 1969 holdings to receive your tier role. ' +
      'Roles are assigned automatically based on what you own (wallet + vault).',
    color: 0xD7FF3A,
    fields: [
      {
        name: 'TIER LADDER',
        value:
          '`THE SOLDIER`  ·  100+ held\n' +
          '`THE MONK`     ·  50+ held\n' +
          '`THE POET`     ·  20+ held\n' +
          '`THE REBEL`    ·  10+ held\n' +
          '`THE NURSE`    ·  5+ held\n' +
          '`THE QUEEN`    ·  1+ held',
      },
      {
        name: 'HOW TO VERIFY',
        value:
          `**Option A** — Connect your wallet at [the1969.io](${SITE_URL}). ` +
          'If your X account is linked to Discord, your tier role gets assigned automatically.\n\n' +
          `**Option B** — Use the standalone flow: [${SITE_URL}/discord/verify](${SITE_URL}/discord/verify). ` +
          'Sign in with Discord, connect your wallet, get your role.',
      },
    ],
    footer: {
      text: 'THE 1969 · the vault must not burn again',
    },
  };

  const r = await fetch(
    `https://discord.com/api/v10/channels/${VERIFY_CHANNEL_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ embeds: [embed] }),
    }
  );

  if (!r.ok) {
    const text = await r.text().catch(() => '');
    return bad(res, 502, 'discord_post_failed', { status: r.status, body: text.slice(0, 300) });
  }
  const d = await r.json();
  ok(res, { messageId: d.id, channelId: d.channel_id });
}
