/**
 * Vercel serverless function -- production entrypoint for the Coordinator
 * "edit or delete a team member" admin operation. Self-contained on purpose
 * (see api/reset-user-password.ts for why); mirrors
 * src/lib/manageUserHandler.ts, which serves the local Express server.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MANAGED_ROLES = ['EDITOR', 'REVIEWER', 'PUBLISHER', 'GD_MEMBER'];
const EDITABLE_METADATA_KEYS = ['specialization', 'editorial_role', 'organization'];

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
    const action = body?.action;
    const userId = body?.userId;
    if ((action !== 'update' && action !== 'delete') || typeof userId !== 'string' || !userId) {
      res.status(400).json({ error: 'Missing or invalid action / userId.' });
      return;
    }

    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized: Missing authentication token.' });
      return;
    }
    const { data: tokenUser, error: tokenError } = await admin.auth.getUser(authHeader.slice(7));
    if (tokenError || !tokenUser?.user) {
      res.status(401).json({ error: 'Unauthorized: Your session is invalid or has expired. Please sign in again.' });
      return;
    }

    const { data: caller } = await admin.from('profiles').select('role, status').eq('id', tokenUser.user.id).maybeSingle();
    if (!caller || caller.role !== 'COORDINATOR' || caller.status !== 'ACTIVE') {
      res.status(403).json({ error: 'Forbidden: Only Coordinators can manage team members.' });
      return;
    }

    const { data: target, error: targetError } = await admin.from('profiles').select('id, role, email, name, metadata, status').eq('id', userId).maybeSingle();
    if (targetError) {
      res.status(500).json({ error: `Server error looking up target user: ${targetError.message}` });
      return;
    }
    if (!target) {
      res.status(404).json({ error: 'Invalid target user: no matching profile was found.' });
      return;
    }
    if (!MANAGED_ROLES.includes(target.role)) {
      res.status(403).json({ error: 'Forbidden: This account is not an Editor, Reviewer, Publisher or GD Member.' });
      return;
    }

    if (action === 'update') {
      const newStatus = body.status;
      if (newStatus !== undefined && newStatus !== 'ACTIVE' && newStatus !== 'INACTIVE') { res.status(400).json({ error: 'Status must be ACTIVE or INACTIVE.' }); return; }
      if (newStatus !== undefined && target.status !== 'ACTIVE' && target.status !== 'INACTIVE') { res.status(400).json({ error: 'Only Active or Inactive accounts can change status.' }); return; }
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!name) { res.status(400).json({ error: 'Name is required.' }); return; }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: 'A valid email address is required.' }); return; }

      const metadata: Record<string, any> = { ...(target.metadata || {}) };
      for (const key of EDITABLE_METADATA_KEYS) {
        if (typeof body.metadata?.[key] === 'string') metadata[key] = body.metadata[key].trim();
      }

      const authUpdate: Record<string, any> = { user_metadata: { full_name: name } };
      if (email !== (target.email || '').toLowerCase()) {
        authUpdate.email = email;
        authUpdate.email_confirm = true;
      }
      const { error: authError } = await admin.auth.admin.updateUserById(userId, authUpdate);
      if (authError) { res.status(400).json({ error: `Supabase Auth error: ${authError.message}` }); return; }

      const { error: profileError } = await admin.from('profiles').update({ name, email, metadata, ...(newStatus ? { status: newStatus } : {}) }).eq('id', userId);
      if (profileError) { res.status(500).json({ error: `Unable to update profile: ${profileError.message}` }); return; }
      res.status(200).json({ success: true, message: 'Member updated.' });
      return;
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (!deleteError) {
      res.status(200).json({ success: true, mode: 'deleted', message: 'Member deleted.' });
      return;
    }
    const { error: statusError } = await admin.from('profiles').update({ status: 'DELETED' }).eq('id', userId);
    if (statusError) { res.status(500).json({ error: `Unable to deactivate member: ${statusError.message}` }); return; }
    res.status(200).json({ success: true, mode: 'deactivated', message: 'Member has workflow history, so the account was closed (it can no longer sign in) instead of erased.' });
  } catch (error: any) {
    console.error('[api/manage-user] Unexpected error:', error);
    res.status(500).json({ error: error?.message || 'Unable to manage user.' });
  }
}
