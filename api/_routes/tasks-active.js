// Task system removed — was the largest sybil mint vector.
// Returns an empty list with a retired flag so any client still
// rendering a tasks panel collapses cleanly.
import { ok } from '../_lib/json.js';

export default async function handler(req, res) {
  return ok(res, { tasks: [], retired: true });
}
