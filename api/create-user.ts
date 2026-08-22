/**
 * Vercel serverless function -- production entrypoint for the Coordinator
 * "create an Editor/Reviewer account" admin operation. Mirrors
 * api/reset-user-password.ts: resolvable at POST /api/create-user in
 * production because Vercel resolves files under /api as Functions before
 * applying the SPA catch-all rewrite in vercel.json.
 *
 * All authorization/validation logic lives in handleCreateUserRequest so
 * this and the Express route in server.ts both call one shared
 * implementation instead of duplicating it.
 */
import { handleCreateUserRequest } from '../src/lib/createUserHandler';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const result = await handleCreateUserRequest(req.headers?.authorization, body);
    res.status(result.status).json(result.body);
  } catch (error: any) {
    console.error('[api/create-user] Unexpected error:', error);
    res.status(500).json({ error: error?.message || 'Unable to create user account.' });
  }
}
