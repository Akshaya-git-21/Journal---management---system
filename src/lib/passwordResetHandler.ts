/**
 * Shared, framework-agnostic implementation of the Coordinator "reset a
 * user's password" admin operation. Both the local Express dev server
 * (server.ts) and the Vercel serverless function (api/reset-user-password.ts)
 * call this so the authorization/validation logic exists in exactly one
 * place -- the two callers are thin adapters, not a second backend.
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

export interface PasswordResetResult {
  status: number;
  body: { error: string } | { success: true; message: string };
}

export async function handlePasswordResetRequest(
  authHeader: string | undefined,
  userId: unknown,
  newPassword: unknown
): Promise<PasswordResetResult> {
  if (typeof userId !== 'string' || !userId || typeof newPassword !== 'string' || !newPassword) {
    return { status: 400, body: { error: 'Missing userId or newPassword.' } };
  }

  if (newPassword.length < 8) {
    return { status: 400, body: { error: 'Password must be at least 8 characters.' } };
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { status: 401, body: { error: 'Unauthorized: Missing authentication token.' } };
  }

  const token = authHeader.slice(7);

  // Verify the token against Supabase Auth itself (signature + expiry),
  // rather than trusting an unverified base64 decode of the JWT payload.
  const { data: tokenUser, error: tokenError } = await supabaseAdmin.auth.getUser(token);
  if (tokenError || !tokenUser?.user) {
    return { status: 401, body: { error: 'Unauthorized: Your session is invalid or has expired. Please sign in again.' } };
  }
  const callerUserId = tokenUser.user.id;

  const { data: callerProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, name, email, role, status')
    .eq('id', callerUserId)
    .single();

  if (profileError || !callerProfile) {
    return { status: 403, body: { error: 'Forbidden: Unable to verify your authorization.' } };
  }

  if (callerProfile.role !== 'COORDINATOR') {
    return { status: 403, body: { error: 'Forbidden: Only Coordinators can reset user passwords.' } };
  }

  // Confirm the target account actually exists before attempting the update,
  // so a bad/stale userId produces a clear "invalid target user" error
  // instead of an opaque Supabase Auth failure.
  const { data: targetProfile, error: targetError } = await supabaseAdmin
    .from('profiles')
    .select('id, name, email, role')
    .eq('id', userId)
    .maybeSingle();

  if (targetError) {
    return { status: 500, body: { error: `Server error looking up target user: ${targetError.message}` } };
  }
  if (!targetProfile) {
    return { status: 404, body: { error: 'Invalid target user: no matching profile was found.' } };
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });

  if (updateError) {
    return { status: 400, body: { error: `Supabase Auth error: ${updateError.message}` } };
  }

  await recordActivity(supabaseAdmin, callerProfile, { action: 'password_reset', target: targetProfile, details: { by: 'coordinator' } });
  return { status: 200, body: { success: true, message: 'Password updated successfully.' } };
}
