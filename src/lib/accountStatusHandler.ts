/**
 * Public "does this account exist?" check used by the login form so it can say
 * "Account not exists" instead of the generic wrong-credentials message.
 * Returns only a boolean -- never the status, role or any other profile data.
 *
 * Server-only module: imports supabaseAdmin (service-role key). The Vercel
 * function api/account-status.ts carries an inlined copy -- keep in sync.
 */
import { supabaseAdmin } from './supabaseAdmin.js';

export interface AccountStatusResult {
  status: number;
  body: { error: string } | { exists: boolean };
}

export async function handleAccountStatusRequest(email: unknown): Promise<AccountStatusResult> {
  if (typeof email !== 'string' || !email.trim() || email.length > 320) {
    return { status: 400, body: { error: 'A valid email address is required.' } };
  }
  // ilike without wildcards = case-insensitive exact match.
  const pattern = email.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await supabaseAdmin.from('profiles').select('status').ilike('email', pattern).limit(1);
  if (error) return { status: 500, body: { error: 'Unable to check the account.' } };
  const profile = data?.[0];
  return { status: 200, body: { exists: !!profile && profile.status !== 'DELETED' } };
}
