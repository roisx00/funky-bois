// Discord chat-reward (legacy). Superseded by discord-chat-tick.js
// which uses the 0.004-BUSTS-per-message accumulator. This older
// endpoint accepted 1–5 BUSTS per call from the bot and is now
// retired so there is exactly one chat-reward vector.
//
// Closed permanently — no internal flag, no bypass.
import { bad } from '../_lib/json.js';

export default async function handler(req, res) {
  return bad(res, 410, 'discord_award_retired', {
    message: 'Legacy chat reward retired. Use discord-chat-tick (0.004 BUSTS/message).',
  });
}
