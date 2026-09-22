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

/** Appends one entry to the activity log. Never throws: logging must not break the action. */
async function recordActivity(client: any, actor: any, entry: { action: string; target?: any; details?: Record<string, unknown> }) {
  try {
    const { error } = await client.from('activity_log').insert({
      category: 'user_management',
      action: entry.action,
      actor_id: actor?.id ?? null, actor_name: actor?.name ?? null, actor_email: actor?.email ?? null, actor_role: actor?.role ?? null,
      target_id: entry.target?.id ?? null, target_name: entry.target?.name ?? null, target_email: entry.target?.email ?? null, target_role: entry.target?.role ?? null,
      details: entry.details ?? {},
    });
    if (error) console.error('[activity] could not write the activity log:', error.message);
  } catch (e: any) {
    console.error('[activity] could not write the activity log:', e?.message);
  }
}

export interface ManageUserResult {
  status: number;
  body: { error: string } | { success: true; mode?: 'deleted' | 'deactivated'; message: string };
}

const MANAGED_ROLES = ['EDITOR', 'REVIEWER', 'PUBLISHER', 'GD_MEMBER'];
// Only these metadata keys may be changed through the edit form.
const EDITABLE_METADATA_KEYS = ['specialization', 'editorial_role', 'organization'];
// Module-wise access control (Phase 3): which Access-page module governs
// editing/deleting each target role. See supabase/migrations/0118_module_access_control.sql.
const MODULE_FOR_ROLE: Record<string, string> = { EDITOR: 'EDITORIAL_BOARD', REVIEWER: 'REVIEWERS', PUBLISHER: 'PUBLISHERS', GD_MEMBER: 'GD_MEMBERS' };

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

  const { data: caller } = await supabaseAdmin.from('profiles').select('id, name, email, role, status').eq('id', tokenUser.user.id).maybeSingle();
  if (!caller || caller.role !== 'COORDINATOR' || caller.status !== 'ACTIVE') {
    return { status: 403, body: { error: 'Forbidden: Only Coordinators can manage team members.' } };
  }

  const { data: target, error: targetError } = await supabaseAdmin.from('profiles').select('id, role, email, name, metadata, status').eq('id', userId).maybeSingle();
  if (targetError) return { status: 500, body: { error: `Server error looking up target user: ${targetError.message}` } };
  if (!target) return { status: 404, body: { error: 'Invalid target user: no matching profile was found.' } };
  if (!MANAGED_ROLES.includes(target.role)) {
    return { status: 403, body: { error: 'Forbidden: This account is not an Editor, Reviewer, Publisher or GD Member.' } };
  }

  const { data: allowed, error: permError } = await supabaseAdmin.rpc('has_permission', { p_user_id: caller.id, p_module: MODULE_FOR_ROLE[target.role], p_action: action === 'update' ? 'EDIT' : 'DELETE' });
  if (permError || !allowed) {
    return { status: 403, body: { error: 'Forbidden: You do not have permission to do that.' } };
  }

  if (action === 'update') {
    const newStatus = body.status;
    if (newStatus !== undefined && newStatus !== 'ACTIVE' && newStatus !== 'INACTIVE') return { status: 400, body: { error: 'Status must be ACTIVE or INACTIVE.' } };
    if (newStatus !== undefined && target.status !== 'ACTIVE' && target.status !== 'INACTIVE') return { status: 400, body: { error: 'Only Active or Inactive accounts can change status.' } };
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

    const { error: profileError } = await supabaseAdmin.from('profiles').update({ name, email, metadata, ...(newStatus ? { status: newStatus } : {}) }).eq('id', userId);
    if (profileError) return { status: 500, body: { error: `Unable to update profile: ${profileError.message}` } };
    const logWho = { id: target.id, name, email, role: target.role };
    const logChanges: Record<string, unknown> = {};
    if (name !== target.name) logChanges.name = { from: target.name, to: name };
    for (const key of EDITABLE_METADATA_KEYS) {
      if ((target.metadata?.[key] ?? '') !== (metadata[key] ?? '')) logChanges[key] = { from: target.metadata?.[key] ?? '', to: metadata[key] ?? '' };
    }
    if (email !== (target.email || '').toLowerCase()) {
      await recordActivity(supabaseAdmin, caller, { action: 'user_email_changed', target: logWho, details: { changes: { email: { from: target.email, to: email } } } });
    }
    if (newStatus && newStatus !== target.status) {
      await recordActivity(supabaseAdmin, caller, { action: newStatus === 'INACTIVE' ? 'user_deactivated' : 'user_activated', target: logWho, details: { changes: { status: { from: target.status, to: newStatus } } } });
    }
    if (Object.keys(logChanges).length > 0) {
      await recordActivity(supabaseAdmin, caller, { action: 'user_updated', target: logWho, details: { changes: logChanges } });
    }
    return { status: 200, body: { success: true, message: 'Member updated.' } };
  }

  // delete -- a hard delete is only possible for accounts with no workflow
  // history (manuscripts, assignments, discussions... all reference profiles).
  // Otherwise the profile is marked DELETED instead: removed from every
  // roster and blocked from signing in ("Account not exists"), while its
  // history stays intact.
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (!deleteError) {
    await recordActivity(supabaseAdmin, caller, { action: 'user_deleted', target: target, details: { mode: 'deleted', by: 'coordinator' } });
    return { status: 200, body: { success: true, mode: 'deleted', message: 'Member deleted.' } };
  }

  const { error: statusError } = await supabaseAdmin.from('profiles').update({ status: 'DELETED' }).eq('id', userId);
  if (statusError) return { status: 500, body: { error: `Unable to deactivate member: ${statusError.message}` } };
  await recordActivity(supabaseAdmin, caller, { action: 'user_deleted', target: target, details: { mode: 'closed', by: 'coordinator' } });
  return { status: 200, body: { success: true, mode: 'deactivated', message: 'Member has workflow history, so the account was closed (it can no longer sign in) instead of erased.' } };
}
