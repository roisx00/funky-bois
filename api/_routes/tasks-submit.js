// Task system removed — was the largest sybil mint vector.
// Endpoint kept as a 410 Gone so old clients see a clean error
// instead of a blank 200 + zero credit.
import { bad } from '../_lib/json.js';

export default async function handler(req, res) {
  return bad(res, 410, 'tasks_removed', {
    message: 'The task system has been retired. Existing balances are unaffected.',
  });
}
