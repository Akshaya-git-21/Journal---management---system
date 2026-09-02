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

export interface CreateUserResult {
  status: number;
  body: { error: string } | { user: unknown };
}

const ALLOWED_ROLES = ['EDITOR', 'REVIEWER', 'PUBLISHER', 'GD_MEMBER'];

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
    .select('role, status')
    .eq('id', tokenUser.user.id)
    .single();

  if (profileError || !callerProfile) {
    return { status: 403, body: { error: 'Forbidden: Unable to verify your authorization.' } };
  }
  if (callerProfile.role !== 'COORDINATOR' || callerProfile.status !== 'ACTIVE') {
    return { status: 403, body: { error: 'Forbidden: Only an active Coordinator can create Editor/Reviewer/Publisher/GD Member accounts.' } };
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

    return { status: 200, body: { user: data.user } };
  } catch (error: any) {
    return { status: 500, body: { error: error?.message || 'Unable to create user account.' } };
  }
}
