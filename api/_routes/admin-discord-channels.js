// GET /api/admin-discord-channels
//
// Lists guild channels the bot can see. Includes the verify channel's
// permission_overwrites so we can spot a deny that's blocking the
// holder verification post.
import { ok, bad } from '../_lib/json.js';
import { DISCORD_GUILD_ID } from '../_lib/discordConfig.js';

const VERIFY_CHANNEL_ID = '1499859007257444693';

export default async function handler(req, res) {
  if (req.method !== 'GET') return bad(res, 405, 'method_not_allowed');

  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return bad(res, 503, 'bot_token_missing');

  // List all channels (bot must have View Channel to see one).
  const rList = await fetch(
    `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/channels`,
    { headers: { Authorization: `Bot ${botToken}` } }
  );
  const channels = rList.ok ? await rList.json() : [];

  const verifyChannel = channels.find((c) => c.id === VERIFY_CHANNEL_ID);

  ok(res, {
    botCanSeeChannelCount: channels.length,
    verifyChannel: verifyChannel ? {
      id: verifyChannel.id,
      name: verifyChannel.name,
      type: verifyChannel.type,
      permissionOverwriteCount: (verifyChannel.permission_overwrites || []).length,
      permission_overwrites: verifyChannel.permission_overwrites,
    } : null,
    visible: !!verifyChannel,
    sample: channels.slice(0, 10).map((c) => ({ id: c.id, name: c.name })),
  });
}
