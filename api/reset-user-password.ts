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
 * vercel.json changes.
 *
 * Self-contained on purpose: Vercel's per-file Node function build does not
 * bundle relative imports into src/lib the same way local dev (tsx/Vite)
 * does, which previously caused ERR_MODULE_NOT_FOUND in production
 * regardless of the imported file's extension. This inlines the same logic
 * that used to live in src/lib/passwordResetHandler.ts so there is no
 * cross-file relative import left for Vercel's bundler to resolve.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      res.status(500).json({ error: 'Server misconfiguration: missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.' });
      return;
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const userId = body?.userId;
    const newPassword = body?.newPassword;

    if (typeof userId !== 'string' || !userId || typeof newPassword !== 'string' || !newPassword) {
      res.status(400).json({ error: 'Missing userId or newPassword.' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized: Missing authentication token.' });
      return;
    }
    const token = authHeader.slice(7);

    const { data: tokenUser, error: tokenError } = await supabaseAdmin.auth.getUser(token);
    if (tokenError || !tokenUser?.user) {
      res.status(401).json({ error: 'Unauthorized: Your session is invalid or has expired. Please sign in again.' });
      return;
    }
    const callerUserId = tokenUser.user.id;

    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, status')
      .eq('id', callerUserId)
      .single();

    if (profileError || !callerProfile) {
      res.status(403).json({ error: 'Forbidden: Unable to verify your authorization.' });
      return;
    }
    if (callerProfile.role !== 'COORDINATOR') {
      res.status(403).json({ error: 'Forbidden: Only Coordinators can reset user passwords.' });
      return;
    }

    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle();

    if (targetError) {
      res.status(500).json({ error: `Server error looking up target user: ${targetError.message}` });
      return;
    }
    if (!targetProfile) {
      res.status(404).json({ error: 'Invalid target user: no matching profile was found.' });
      return;
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
    if (updateError) {
      res.status(400).json({ error: `Supabase Auth error: ${updateError.message}` });
      return;
    }

    res.status(200).json({ success: true, message: 'Password updated successfully.' });
  } catch (error: any) {
    console.error('[api/reset-user-password] Unexpected error:', error);
    res.status(500).json({ error: error?.message || 'Unable to reset password.' });
  }
}
