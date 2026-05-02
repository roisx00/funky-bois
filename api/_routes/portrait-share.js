// Portrait-share reward retired post-mint. The 200-BUSTS-per-share
// surface was a sybil vector (every fresh X account could share a
// portrait and collect). Closed permanently — endpoint returns 410
// regardless of input, no internal flag, no bypass.
import { bad } from '../_lib/json.js';

export default async function handler(req, res) {
  return bad(res, 410, 'portrait_share_retired', {
    message: 'Portrait share rewards retired post-mint. No new credits will be issued.',
  });
}
