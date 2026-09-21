/**
 * Vercel serverless function -- production entrypoint for the login form's
 * "does this account exist?" check. Self-contained on purpose (see
 * api/reset-user-password.ts); mirrors src/lib/accountStatusHandler.ts.
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
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const email = body?.email;
    if (typeof email !== 'string' || !email.trim() || email.length > 320) {
      res.status(400).json({ error: 'A valid email address is required.' });
      return;
    }
    const pattern = email.trim().replace(/[\\%_]/g, (c: string) => `\\${c}`);
    const { data, error } = await admin.from('profiles').select('status').ilike('email', pattern).limit(1);
    if (error) {
      res.status(500).json({ error: 'Unable to check the account.' });
      return;
    }
    const profile = data?.[0];
    res.status(200).json({ exists: !!profile && profile.status !== 'DELETED' });
  } catch (error: any) {
    console.error('[api/account-status] Unexpected error:', error);
    res.status(500).json({ error: 'Unable to check the account.' });
  }
}
