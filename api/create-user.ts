/**
 * Vercel serverless function -- production entrypoint for the Coordinator
 * "create an Editor/Reviewer/Publisher account" admin operation. Mirrors
 * api/reset-user-password.ts: resolvable at POST /api/create-user in
 * production because Vercel resolves files under /api as Functions before
 * applying the SPA catch-all rewrite in vercel.json.
 *
 * Self-contained on purpose -- see api/reset-user-password.ts for why.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_ROLES = ['EDITOR', 'REVIEWER', 'PUBLISHER'];

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

    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { email, password, fullName, role, metadata } = payload || {};

    if (
      typeof email !== 'string' || !email ||
      typeof password !== 'string' || !password ||
      typeof fullName !== 'string' || !fullName ||
      typeof role !== 'string' || !ALLOWED_ROLES.includes(role)
    ) {
      res.status(400).json({ error: 'Missing or invalid user account fields.' });
      return;
    }

    if (password.length < 8) {
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

    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, status')
      .eq('id', tokenUser.user.id)
      .single();

    if (profileError || !callerProfile) {
      res.status(403).json({ error: 'Forbidden: Unable to verify your authorization.' });
      return;
    }
    if (callerProfile.role !== 'COORDINATOR' || callerProfile.status !== 'ACTIVE') {
      res.status(403).json({ error: 'Forbidden: Only an active Coordinator can create Editor/Reviewer/Publisher accounts.' });
      return;
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        requested_role: role,
        ...(metadata && typeof metadata === 'object' ? metadata : {})
      }
    } as any);

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(200).json({ user: data.user });
  } catch (error: any) {
    console.error('[api/create-user] Unexpected error:', error);
    res.status(500).json({ error: error?.message || 'Unable to create user account.' });
  }
}
