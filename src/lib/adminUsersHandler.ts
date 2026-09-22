/**
 * Admin "manage users" operations (create, update, reset password, delete,
 * review Admin sign-ups) for the local Express server (server.ts).
 *
 * The Vercel function api/admin-users.ts carries an identical copy of the core
 * below (Vercel's per-file build cannot import from src/lib -- see
 * api/reset-user-password.ts) -- change both together.
 *
 * Server-only module: imports supabaseAdmin (service-role key). Never import
 * this from frontend code.
 */
import { supabaseAdmin } from './supabaseAdmin.js';

const ADMIN_ROLES = ['ADMIN', 'COORDINATOR', 'EDITOR', 'REVIEWER', 'AUTHOR', 'PUBLISHER', 'GD_MEMBER'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Tables that mean "this person has workflow history". A role can't be changed
// once any of these reference the user, and the account is closed (not erased)
// on delete.
const HISTORY_CHECKS: [string, string][] = [
  ['manuscripts', 'author_id'],
  ['manuscripts', 'assigned_editor_id'],
  ['manuscripts', 'assigned_publisher_id'],
  ['editor_assignments', 'editor_id'],
  ['reviewer_assignments', 'reviewer_id'],
  ['manuscript_discussions', 'sender_id'],
  ['manuscript_status_history', 'actor_id'],
  ['manuscript_files', 'uploaded_by'],
  ['manuscript_revisions', 'requested_by'],
  ['manuscript_production', 'assigned_to'],
  ['manuscript_suggested_reviewers', 'suggested_by_user'],
  ['audit_log', 'actor_id'],
];

export interface AdminUsersResult {
  status: number;
  body: any;
}

const fail = (status: number, error: string): AdminUsersResult => ({ status, body: { error } });

/** Which profile.metadata keys make sense for a role. */
function relevantMetadataKeys(role: string): string[] {
  if (role === 'EDITOR') return ['editorial_role', 'specialization'];
  if (role === 'REVIEWER') return ['specialization'];
  if (role === 'PUBLISHER') return ['organization'];
  return [];
}

/**
 * The Admin "manage users" operations: create, update, reset_password, delete
 * and review_signup. Every call is authenticated (Supabase JWT) and requires an
 * ACTIVE Admin. Passwords are never logged or returned.
 */
export async function runAdminUsersRequest(admin: any, authHeader: string | undefined, body: any): Promise<AdminUsersResult> {
  const action = body?.action;
  if (!['create', 'update', 'reset_password', 'delete', 'review_signup'].includes(action)) {
    return fail(400, 'Unknown action.');
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return fail(401, 'Unauthorized: Missing authentication token.');
  }
  const { data: tokenUser, error: tokenError } = await admin.auth.getUser(authHeader.slice(7));
  if (tokenError || !tokenUser?.user) {
    return fail(401, 'Unauthorized: Your session is invalid or has expired. Please sign in again.');
  }
  const { data: caller } = await admin.from('profiles').select('id, name, email, role, status').eq('id', tokenUser.user.id).maybeSingle();
  if (!caller || caller.role !== 'ADMIN' || caller.status !== 'ACTIVE') {
    return fail(403, 'Forbidden: Only an active Admin can manage users.');
  }

  const log = async (logAction: string, target: any, details: Record<string, unknown> = {}) => {
    const { error } = await admin.from('activity_log').insert({
      category: 'user_management',
      actor_id: caller.id, actor_name: caller.name, actor_email: caller.email, actor_role: 'ADMIN',
      action: logAction,
      target_id: target?.id ?? null, target_name: target?.name ?? null, target_email: target?.email ?? null, target_role: target?.role ?? null,
      details,
    });
    if (error) console.error('[admin-users] could not write the activity log:', error.message);
  };
  const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => '\\' + c);
  const emailTaken = async (email: string, exceptId?: string) => {
    const { data } = await admin.from('profiles').select('id').ilike('email', escapeLike(email)).limit(5);
    return (data ?? []).some((r: any) => r.id !== exceptId);
  };
  const minPassword = async () => {
    try {
      const { data } = await admin.from('journal_settings').select('settings').eq('id', 'main').maybeSingle();
      const n = Number(data?.settings?.access?.minPasswordLength);
      return Number.isFinite(n) ? Math.max(8, Math.min(64, n)) : 8;
    } catch {
      return 8;
    }
  };
  const activeAdminCount = async () => {
    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'ADMIN').eq('status', 'ACTIVE');
    return count ?? 0;
  };
  const hasHistory = async (userId: string) => {
    const counts = await Promise.all(HISTORY_CHECKS.map(async ([table, column]) => {
      try {
        const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true }).eq(column, userId);
        return error ? 0 : (count ?? 0);
      } catch {
        return 0;
      }
    }));
    return counts.some((c) => c > 0);
  };
  const loadTarget = async (userId: unknown) => {
    if (typeof userId !== 'string' || !userId) return null;
    const { data } = await admin.from('profiles').select('id, name, email, role, requested_role, status, metadata').eq('id', userId).maybeSingle();
    return data ?? null;
  };

  // ---------------------------------------------------------------- create
  if (action === 'create') {
    const role = body.role;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!ADMIN_ROLES.includes(role)) return fail(400, 'Choose a valid role.');
    if (!name || name.length > 120) return fail(400, 'Enter a name (up to 120 characters).');
    if (!EMAIL_RE.test(email)) return fail(400, 'Enter a valid email address.');
    const min = await minPassword();
    if (password.length < min) return fail(400, `Password must be at least ${min} characters.`);
    if (await emailTaken(email)) return fail(409, 'An account with this email already exists.');

    const metadata: Record<string, string> = {};
    for (const key of relevantMetadataKeys(role)) {
      const value = body.metadata?.[key];
      if (typeof value === 'string' && value.trim()) metadata[key] = value.trim();
    }
    if (role === 'EDITOR' && !metadata.editorial_role) metadata.editorial_role = 'Editorial Board';

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        requested_role: role,
        invited_by: 'admin',
        created_without_email: true,
        password_set_by_admin: true,
        must_change_password: true,
        ...metadata,
      },
    });
    if (createError || !created?.user) {
      const message = createError?.message || 'Unable to create the account.';
      return /already|registered|exists/i.test(message) ? fail(409, 'An account with this email already exists.') : fail(400, message);
    }
    const newId: string = created.user.id;

    // handle_new_user() creates the profile row; wait for it, then make it the
    // final, active profile the Admin asked for.
    let profile: any = null;
    for (let attempt = 0; attempt < 10 && !profile; attempt += 1) {
      const { data } = await admin.from('profiles').select('id, metadata').eq('id', newId).maybeSingle();
      if (data) profile = data;
      else await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const row = {
      name, email, role, requested_role: role, status: 'ACTIVE',
      metadata: { ...(profile?.metadata ?? {}), full_name: name, ...metadata, must_change_password: true, created_by_admin: true },
      approved_by: caller.id, approved_at: new Date().toISOString(),
    };
    const { error: writeError } = profile
      ? await admin.from('profiles').update(row).eq('id', newId)
      : await admin.from('profiles').insert({ id: newId, ...row });
    if (writeError) {
      try { await admin.auth.admin.deleteUser(newId); } catch { /* best effort rollback */ }
      return fail(500, `Unable to finish creating the account: ${writeError.message}`);
    }
    await log('user_created', { id: newId, name, email, role }, { metadata_keys: Object.keys(metadata) });
    return { status: 200, body: { success: true, user: { id: newId, email, name, role } } };
  }

  // ---------------------------------------------------------- review_signup
  if (action === 'review_signup') {
    const target = await loadTarget(body.userId);
    const decision = body.decision;
    if (decision !== 'APPROVE' && decision !== 'REJECT') return fail(400, 'Decision must be APPROVE or REJECT.');
    if (!target) return fail(404, 'No matching account was found.');
    if (target.status !== 'PENDING_APPROVAL' || !ADMIN_ROLES.includes(target.requested_role)) {
      return fail(400, 'This is not a pending sign-up request.');
    }
    const update = decision === 'APPROVE'
      ? { role: target.requested_role, status: 'ACTIVE', approved_by: caller.id, approved_at: new Date().toISOString() }
      : { status: 'REJECTED', approved_by: caller.id, approved_at: new Date().toISOString() };
    const { error } = await admin.from('profiles').update(update).eq('id', target.id);
    if (error) return fail(500, `Unable to update the request: ${error.message}`);
    await log(decision === 'APPROVE' ? 'signup_approved' : 'signup_rejected', { ...target, role: target.requested_role }, { requested_role: target.requested_role });
    return { status: 200, body: { success: true } };
  }

  // -------------------------------------------- update / reset / delete
  const target = await loadTarget(body.userId);
  if (!target) return fail(404, 'No matching account was found.');
  if (target.status === 'DELETED') return fail(400, 'This account has been closed and can no longer be changed.');
  const isSelf = target.id === caller.id;

  if (action === 'update') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!name || name.length > 120) return fail(400, 'Enter a name (up to 120 characters).');
    if (!EMAIL_RE.test(email)) return fail(400, 'Enter a valid email address.');

    const newRole: string = body.role === undefined ? (target.role ?? target.requested_role ?? 'AUTHOR') : body.role;
    const roleChanged = body.role !== undefined && newRole !== target.role;
    const newStatus: string | undefined = body.status;
    const manageable = target.status === 'ACTIVE' || target.status === 'INACTIVE';

    if (!ADMIN_ROLES.includes(newRole)) return fail(400, 'Choose a valid role.');
    if (newStatus !== undefined && newStatus !== 'ACTIVE' && newStatus !== 'INACTIVE') return fail(400, 'Status must be ACTIVE or INACTIVE.');
    if (((newStatus !== undefined && newStatus !== target.status) || roleChanged) && !manageable) {
      return fail(400, 'Only Active or Inactive accounts can change role or status.');
    }

    const wasActiveAdmin = target.role === 'ADMIN' && target.status === 'ACTIVE';
    if (roleChanged) {
      if (isSelf) return fail(403, 'You cannot change your own role.');
      if (wasActiveAdmin && (await activeAdminCount()) <= 1) return fail(409, 'The last remaining Admin cannot lose Admin access.');
      if (await hasHistory(target.id)) {
        return fail(409, 'This user already has manuscripts, assignments or reviews, so their role cannot be changed. Deactivate the account instead.');
      }
    }
    if (newStatus === 'INACTIVE' && target.status !== 'INACTIVE') {
      if (isSelf) return fail(403, 'You cannot deactivate your own account.');
      if (wasActiveAdmin && (await activeAdminCount()) <= 1) return fail(409, 'The last remaining Admin cannot be deactivated.');
    }
    const emailChanged = email !== (target.email || '').toLowerCase();
    if (emailChanged && (await emailTaken(email, target.id))) return fail(409, 'Another account already uses this email.');

    const metadata: Record<string, any> = { ...(target.metadata || {}) };
    const relevant = relevantMetadataKeys(newRole);
    for (const key of ['specialization', 'editorial_role', 'organization']) {
      if (!relevant.includes(key)) delete metadata[key];
      else if (typeof body.metadata?.[key] === 'string') metadata[key] = body.metadata[key].trim();
    }
    if (newRole === 'EDITOR' && !metadata.editorial_role) metadata.editorial_role = 'Editorial Board';

    const authUpdate: Record<string, any> = { user_metadata: { full_name: name } };
    if (emailChanged) { authUpdate.email = email; authUpdate.email_confirm = true; }
    const { error: authError } = await admin.auth.admin.updateUserById(target.id, authUpdate);
    if (authError) return fail(400, `Supabase Auth error: ${authError.message}`);

    const row: Record<string, any> = { name, email, metadata };
    if (roleChanged) { row.role = newRole; row.requested_role = newRole; }
    if (newStatus !== undefined) row.status = newStatus;
    const { error: profileError } = await admin.from('profiles').update(row).eq('id', target.id);
    if (profileError) return fail(500, `Unable to update the profile: ${profileError.message}`);

    const changes: Record<string, unknown> = {};
    if (name !== target.name) changes.name = { from: target.name, to: name };
    if (emailChanged) changes.email = { from: target.email, to: email };
    if (roleChanged) changes.role = { from: target.role, to: newRole };
    if (newStatus !== undefined && newStatus !== target.status) changes.status = { from: target.status, to: newStatus };
    for (const key of ['specialization', 'editorial_role', 'organization']) {
      if ((target.metadata?.[key] ?? '') !== (metadata[key] ?? '')) changes[key] = { from: target.metadata?.[key] ?? '', to: metadata[key] ?? '' };
    }
    const who = { id: target.id, name, email, role: newRole };
    const rest: Record<string, unknown> = { ...changes };
    delete rest.role; delete rest.email; delete rest.status;
    if (changes.role) await log('user_role_changed', who, { changes: { role: changes.role } });
    if (changes.email) await log('user_email_changed', who, { changes: { email: changes.email } });
    if (changes.status) {
      await log((changes.status as any).to === 'INACTIVE' ? 'user_deactivated' : 'user_activated', who, { changes: { status: changes.status } });
    }
    if (Object.keys(rest).length > 0) await log('user_updated', who, { changes: rest });
    return { status: 200, body: { success: true } };
  }

  if (action === 'reset_password') {
    const password = typeof body.password === 'string' ? body.password : '';
    const min = await minPassword();
    if (password.length < min) return fail(400, `Password must be at least ${min} characters.`);
    const { error: authError } = await admin.auth.admin.updateUserById(target.id, { password });
    if (authError) return fail(400, `Supabase Auth error: ${authError.message}`);
    // The person must choose their own password at next sign-in (not for an
    // Admin resetting their own password).
    if (!isSelf) {
      const { error } = await admin.from('profiles').update({ metadata: { ...(target.metadata || {}), must_change_password: true } }).eq('id', target.id);
      if (error) return fail(500, `Password was changed but the change-on-first-login flag could not be set: ${error.message}`);
    }
    await log('password_reset', target, { must_change_on_next_login: !isSelf });
    return { status: 200, body: { success: true } };
  }

  // ---------------------------------------------------------------- delete
  if (isSelf) return fail(403, 'You cannot delete your own account.');
  if (target.role === 'ADMIN' && target.status === 'ACTIVE' && (await activeAdminCount()) <= 1) {
    return fail(409, 'The last remaining Admin cannot be deleted.');
  }
  // A hard delete only succeeds for accounts nothing references. Otherwise the
  // profile is closed (DELETED): it cannot sign in ("Account not exists") and
  // every related record stays intact.
  const { error: deleteError } = await admin.auth.admin.deleteUser(target.id);
  if (!deleteError) {
    await log('user_deleted', target, { mode: 'deleted' });
    return { status: 200, body: { success: true, mode: 'deleted' } };
  }
  const { error: closeError } = await admin.from('profiles').update({ status: 'DELETED' }).eq('id', target.id);
  if (closeError) return fail(500, `Unable to close the account: ${closeError.message}`);
  await log('user_deleted', target, { mode: 'closed' });
  return { status: 200, body: { success: true, mode: 'closed' } };
}

export function handleAdminUsersRequest(authHeader: string | undefined, body: any): Promise<AdminUsersResult> {
  return runAdminUsersRequest(supabaseAdmin, authHeader, body);
}
