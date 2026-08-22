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
    .select('role, status')
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
    .select('id, role')
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

  return { status: 200, body: { success: true, message: 'Password updated successfully.' } };
}
