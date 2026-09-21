/**
 * Shared, framework-agnostic implementation of the Coordinator "edit or
 * delete a team member" admin operation (Editors, Reviewers, Publishers and
 * GD Members). The local Express server (server.ts) calls this; the Vercel
 * serverless function at api/manage-user.ts carries an inlined copy of the
 * same logic for the same reason api/reset-user-password.ts does -- keep the
 * two in sync.
 *
 * Server-only module: imports supabaseAdmin (service-role key). Never import
 * this from frontend code.
 */
import { supabaseAdmin } from './supabaseAdmin.js';

export interface ManageUserResult {
  status: number;
  body: { error: string } | { success: true; mode?: 'deleted' | 'deactivated'; message: string };
}

const MANAGED_ROLES = ['EDITOR', 'REVIEWER', 'PUBLISHER', 'GD_MEMBER'];
// Only these metadata keys may be changed through the edit form.
const EDITABLE_METADATA_KEYS = ['specialization', 'editorial_role', 'organization'];

export async function handleManageUserRequest(authHeader: string | undefined, body: any): Promise<ManageUserResult> {
  const action = body?.action;
  const userId = body?.userId;
  if ((action !== 'update' && action !== 'delete') || typeof userId !== 'string' || !userId) {
    return { status: 400, body: { error: 'Missing or invalid action / userId.' } };
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { status: 401, body: { error: 'Unauthorized: Missing authentication token.' } };
  }
  const { data: tokenUser, error: tokenError } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
  if (tokenError || !tokenUser?.user) {
    return { status: 401, body: { error: 'Unauthorized: Your session is invalid or has expired. Please sign in again.' } };
  }

  const { data: caller } = await supabaseAdmin.from('profiles').select('role, status').eq('id', tokenUser.user.id).maybeSingle();
  if (!caller || caller.role !== 'COORDINATOR' || caller.status !== 'ACTIVE') {
    return { status: 403, body: { error: 'Forbidden: Only Coordinators can manage team members.' } };
  }

  const { data: target, error: targetError } = await supabaseAdmin.from('profiles').select('id, role, email, name, metadata').eq('id', userId).maybeSingle();
  if (targetError) return { status: 500, body: { error: `Server error looking up target user: ${targetError.message}` } };
  if (!target) return { status: 404, body: { error: 'Invalid target user: no matching profile was found.' } };
  if (!MANAGED_ROLES.includes(target.role)) {
    return { status: 403, body: { error: 'Forbidden: This account is not an Editor, Reviewer, Publisher or GD Member.' } };
  }

  if (action === 'update') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!name) return { status: 400, body: { error: 'Name is required.' } };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 400, body: { error: 'A valid email address is required.' } };

    const metadata: Record<string, any> = { ...(target.metadata || {}) };
    for (const key of EDITABLE_METADATA_KEYS) {
      if (typeof body.metadata?.[key] === 'string') metadata[key] = body.metadata[key].trim();
    }

    const authUpdate: Record<string, any> = { user_metadata: { full_name: name } };
    if (email !== (target.email || '').toLowerCase()) {
      authUpdate.email = email;
      authUpdate.email_confirm = true;
    }
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, authUpdate);
    if (authError) return { status: 400, body: { error: `Supabase Auth error: ${authError.message}` } };

    const { error: profileError } = await supabaseAdmin.from('profiles').update({ name, email, metadata }).eq('id', userId);
    if (profileError) return { status: 500, body: { error: `Unable to update profile: ${profileError.message}` } };
    return { status: 200, body: { success: true, message: 'Member updated.' } };
  }

  // delete -- a hard delete is only possible for accounts with no workflow
  // history (manuscripts, assignments, discussions... all reference profiles).
  // Otherwise the account is deactivated instead: removed from every active
  // roster and blocked from signing in, while its history stays intact.
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (!deleteError) return { status: 200, body: { success: true, mode: 'deleted', message: 'Member deleted.' } };

  const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
  if (banError) return { status: 500, body: { error: `Unable to remove member: ${deleteError.message}` } };
  const { error: statusError } = await supabaseAdmin.from('profiles').update({ status: 'REJECTED' }).eq('id', userId);
  if (statusError) return { status: 500, body: { error: `Unable to deactivate member: ${statusError.message}` } };
  return { status: 200, body: { success: true, mode: 'deactivated', message: 'Member has workflow history, so the account was deactivated instead of erased.' } };
}
