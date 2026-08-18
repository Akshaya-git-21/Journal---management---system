/**
 * Vercel serverless function -- production entrypoint for the Coordinator
 * "reset a user's password" admin operation.
 *
 * vercel.json deploys this app as a static SPA (framework: vite,
 * outputDirectory: dist) with a catch-all rewrite to index.html for
 * client-side routing. That rewrite only applies to paths that don't match
 * an actual file or Serverless Function -- Vercel resolves files under /api
 * as Functions *before* applying user-defined rewrites, so this file is
 * reachable at POST /api/reset-user-password in production without any
 * vercel.json changes. (The Express route of the same name in server.ts is
 * for local `npm run dev` only; it is never invoked in the Vercel
 * deployment, since nothing there runs server.cjs as a server process.)
 *
 * All authorization/validation logic lives in handlePasswordResetRequest so
 * this and the Express route both call one shared implementation instead of
 * duplicating it.
 */
import { handlePasswordResetRequest } from '../src/lib/passwordResetHandler.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const result = await handlePasswordResetRequest(req.headers?.authorization, body.userId, body.newPassword);
    res.status(result.status).json(result.body);
  } catch (error: any) {
    console.error('[api/reset-user-password] Unexpected error:', error);
    res.status(500).json({ error: error?.message || 'Unable to reset password.' });
  }
}
