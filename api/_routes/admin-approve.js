// Admin: bulk approve / reject verifications. Shared approval logic lives
// in ../_lib/taskApprove.js (also used by admin-scan for auto-approval).
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { approveVerification, rejectVerification } from '../_lib/taskApprove.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { ids, action } = await readBody(req) || {};
  if (!Array.isArray(ids) || ids.length === 0) return bad(res, 400, 'missing_ids');
  if (action !== 'approve' && action !== 'reject') return bad(res, 400, 'invalid_action');

  const results = [];
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    results.push(action === 'approve'
      ? await approveVerification(id, admin.x_username)
      : await rejectVerification(id, admin.x_username));
  }
  ok(res, { processed: results.length, results });
}
