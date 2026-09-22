/**
 * Shared, framework-agnostic implementation of the Coordinator "create an
 * Editor/Reviewer/Publisher/GD Member account" admin operation. Both the local Express dev
 * server (server.ts) and the Vercel serverless function
 * (api/create-user.ts) call this, matching the pattern in
 * passwordResetHandler.ts -- one implementation, two thin adapters.
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

export interface CreateUserResult {
  status: number;
  body: { error: string } | { user: unknown };
}

const ALLOWED_ROLES = ['EDITOR', 'REVIEWER', 'PUBLISHER', 'GD_MEMBER'];
// Module-wise access control (Phase 3): which Access-page module governs
// creating each target role. See supabase/migrations/0118_module_access_control.sql.
const MODULE_FOR_ROLE: Record<string, string> = { EDITOR: 'EDITORIAL_BOARD', REVIEWER: 'REVIEWERS', PUBLISHER: 'PUBLISHERS', GD_MEMBER: 'GD_MEMBERS' };

export async function handleCreateUserRequest(
  authHeader: string | undefined,
  payload: { email?: unknown; password?: unknown; fullName?: unknown; role?: unknown; metadata?: unknown }
): Promise<CreateUserResult> {
  const { email, password, fullName, role, metadata } = payload || {};

  if (
    typeof email !== 'string' || !email ||
    typeof password !== 'string' || !password ||
    typeof fullName !== 'string' || !fullName ||
    typeof role !== 'string' || !ALLOWED_ROLES.includes(role)
  ) {
    return { status: 400, body: { error: 'Missing or invalid user account fields.' } };
  }

  if (password.length < 8) {
    return { status: 400, body: { error: 'Password must be at least 8 characters.' } };
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { status: 401, body: { error: 'Unauthorized: Missing authentication token.' } };
  }

  const token = authHeader.slice(7);
  const { data: tokenUser, error: tokenError } = await supabaseAdmin.auth.getUser(token);
  if (tokenError || !tokenUser?.user) {
    return { status: 401, body: { error: 'Unauthorized: Your session is invalid or has expired. Please sign in again.' } };
  }

  const { data: callerProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, name, email, role, status')
    .eq('id', tokenUser.user.id)
    .single();

  if (profileError || !callerProfile) {
    return { status: 403, body: { error: 'Forbidden: Unable to verify your authorization.' } };
  }
  if (callerProfile.role !== 'COORDINATOR' || callerProfile.status !== 'ACTIVE') {
    return { status: 403, body: { error: 'Forbidden: Only an active Coordinator can create Editor/Reviewer/Publisher/GD Member accounts.' } };
  }

  const { data: allowed, error: permError } = await supabaseAdmin.rpc('has_permission', { p_user_id: callerProfile.id, p_module: MODULE_FOR_ROLE[role], p_action: 'CREATE' });
  if (permError || !allowed) {
    return { status: 403, body: { error: 'Forbidden: You do not have permission to create this kind of account.' } };
  }

  try {
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
      return { status: 400, body: { error: error.message } };
    }

    await recordActivity(supabaseAdmin, callerProfile, { action: 'user_created', target: { id: data.user?.id, name: fullName, email, role }, details: { created_by: 'coordinator' } });
    return { status: 200, body: { user: data.user } };
  } catch (error: any) {
    return { status: 500, body: { error: error?.message || 'Unable to create user account.' } };
  }
}
