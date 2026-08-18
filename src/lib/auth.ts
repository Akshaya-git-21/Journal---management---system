import { supabase } from './supabase';
import { Role, ProfileStatus } from '../types';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: ProfileStatus;
}

interface ProfileRow {
  id: string;
  email: string;
  name: string;
  role: Role | null;
  requested_role: Role;
  status: ProfileStatus;
}

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, role, requested_role, status')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // no row found
    throw new Error(error.message);
  }
  return data as ProfileRow;
}

function toAuthUser(profile: ProfileRow): AuthUser {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: (profile.role || profile.requested_role) as Role,
    status: profile.status
  };
}

export interface RegisterResult {
  requiresEmailConfirmation: boolean;
  pendingApproval: boolean;
  user: AuthUser | null;
}

/**
 * Registers a new account. The profile row (and its role/status) is created
 * server-side by the handle_new_user() trigger from `requested_role` in the
 * signup metadata -- the client never writes role/status directly.
 */
export async function registerAccount(
  email: string,
  password: string,
  fullName: string,
  role: Role,
  metadata: Record<string, any> = {}
): Promise<RegisterResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        requested_role: role,
        ...metadata
      }
    }
  });

  if (error) throw new Error(error.message);

  const user = data.user;
  if (!user) throw new Error('Registration failed: no user returned.');

  if (!data.session) {
    // Email confirmation is required before a session exists.
    return { requiresEmailConfirmation: true, pendingApproval: role !== 'AUTHOR', user: null };
  }

  if (role !== 'AUTHOR') {
    // Elevated roles must wait for Coordinator approval even though the
    // auth session exists -- sign out immediately so no unapproved access.
    await supabase.auth.signOut();
    return { requiresEmailConfirmation: false, pendingApproval: true, user: null };
  }

  const profile = await fetchProfile(user.id);
  if (!profile) throw new Error('Account created but profile was not provisioned. Contact support.');

  return { requiresEmailConfirmation: false, pendingApproval: false, user: toAuthUser(profile) };
}

/**
 * Logs in with real credentials only. Role is resolved from the account's
 * own profile row -- it is never taken from client input.
 */
export async function loginAccount(email: string, password: string): Promise<AuthUser> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) throw new Error(error.message || 'Invalid email or password.');

  const user = data.user;
  if (!user) throw new Error('Login failed: no session returned.');

  const profile = await fetchProfile(user.id);
  if (!profile) {
    await supabase.auth.signOut();
    throw new Error('No profile found for this account. Contact your Coordinator.');
  }

  if (profile.status === 'PENDING_APPROVAL') {
    await supabase.auth.signOut();
    throw new Error(`Your ${profile.requested_role.toLowerCase()} account is awaiting Coordinator approval.`);
  }

  if (profile.status === 'REJECTED') {
    await supabase.auth.signOut();
    throw new Error('This account request was rejected. Contact your Coordinator.');
  }

  return toAuthUser(profile);
}

export async function logoutAccount(): Promise<void> {
  await supabase.auth.signOut();
}

export async function createUserAccount(
  email: string,
  password: string,
  fullName: string,
  role: 'EDITOR' | 'REVIEWER',
  metadata: Record<string, any> = {}
): Promise<void> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) {
    throw new Error('Your session has expired. Please sign in again before creating an account.');
  }

  const response = await fetch('/api/create-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      email,
      password,
      fullName,
      role,
      metadata
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to create user account.');
  }
}

export async function createEditorAccount(email: string, password: string, fullName: string, specialization: string, editorialRole: string): Promise<void> {
  return createUserAccount(email, password, fullName, 'EDITOR', {
    specialization,
    editorial_role: editorialRole,
    invited_by: 'coordinator',
    created_without_email: true
  });
}

export async function createReviewerAccount(email: string, password: string, fullName: string, specialization: string): Promise<void> {
  return createUserAccount(email, password, fullName, 'REVIEWER', {
    specialization,
    invited_by: 'coordinator',
    created_without_email: true
  });
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/?mode=reset-password`
  });
  if (error) throw new Error(error.message);
}

export async function resetPasswordWithToken(newPassword: string, confirmPassword: string): Promise<void> {
  if (!newPassword || !confirmPassword) {
    throw new Error('Password and confirm password are required.');
  }

  if (newPassword !== confirmPassword) {
    throw new Error('Passwords do not match.');
  }

  if (newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message || 'Failed to update password.');
}

export async function verifyResetToken(): Promise<boolean> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) return false;

    const user = session.user;
    return user.email_confirmed_at !== null || user.user_metadata?.email_verified === true;
  } catch {
    return false;
  }
}

/**
 * Admin-only: Reset a user's password directly.
 * Used by Coordinators for testing access to editor accounts.
 * Returns the new password that was set.
 */
export async function resetUserPassword(userId: string, newPassword: string, authToken?: string): Promise<void> {
  // Always use a freshly-read session token rather than one captured earlier
  // in a component's lifetime -- Supabase silently rotates access_token on
  // refresh, and a token grabbed once on mount can go stale for a Coordinator
  // who has had the page open for a while.
  const token = authToken || (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) {
    throw new Error('Your session has expired. Please sign in again before changing a password.');
  }

  let response: Response;
  try {
    response = await fetch('/api/reset-user-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        userId,
        newPassword
      })
    });
  } catch (networkError: any) {
    // fetch() only throws for a true network-level failure (DNS, connection
    // refused, CORS block) -- never for a non-2xx HTTP response.
    console.error('[resetUserPassword] Network error calling /api/reset-user-password:', networkError);
    throw new Error('Network error: could not reach the password reset service. Check your connection and try again.');
  }

  let payload: any = null;
  let parseFailed = false;
  try {
    payload = await response.json();
  } catch (parseError) {
    parseFailed = true;
    console.error('[resetUserPassword] Non-JSON response from /api/reset-user-password:', {
      status: response.status,
      statusText: response.statusText,
      parseError
    });
  }

  if (parseFailed) {
    throw new Error(`API unavailable: the password reset endpoint returned an unexpected response (HTTP ${response.status}). It may not be deployed at this URL.`);
  }

  if (!response.ok) {
    console.error('[resetUserPassword] /api/reset-user-password returned an error:', { status: response.status, payload });
    const message: string = payload?.error || 'Unable to reset password.';
    // Re-categorize by HTTP status so the Coordinator sees a specific,
    // actionable message instead of a raw server string.
    if (response.status === 401) throw new Error(`Unauthorized: ${message}`);
    if (response.status === 403) throw new Error(`Not permitted: ${message}`);
    if (response.status === 404) throw new Error(`Invalid target user: ${message}`);
    if (response.status === 400) throw new Error(message); // validation or Supabase Auth error, already descriptive
    if (response.status >= 500) throw new Error(`Server error: ${message}`);
    throw new Error(message);
  }
}

/**
 * Resolves the currently active Supabase session (if any) into an AuthUser.
 * Used on app boot to restore a session without trusting client-stored role.
 * Silently signs out and returns null for any non-active session state.
 */
export async function restoreSession(): Promise<AuthUser | null> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;

  const profile = await fetchProfile(user.id);
  if (!profile || profile.status !== 'ACTIVE') {
    await supabase.auth.signOut();
    return null;
  }

  return toAuthUser(profile);
}

/**
 * Subscribes to Supabase auth state changes (e.g. sign-out in another tab,
 * or a token expiring). Calls back with null when the session ends.
 */
export function onAuthChange(callback: (user: AuthUser | null) => void): () => void {
  const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      callback(null);
    }
  });

  return () => subscription.subscription.unsubscribe();
}
