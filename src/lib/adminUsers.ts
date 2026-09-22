import { getFreshAccessToken } from './auth';
import { Role } from '../types';

/** Client for /api/admin-users (Admin only; see src/lib/adminUsersHandler.ts). */
async function call(payload: Record<string, unknown>): Promise<any> {
  const token = await getFreshAccessToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');

  let response: Response;
  try {
    response = await fetch('/api/admin-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('Network error: could not reach the server. Check your connection and try again.');
  }

  let result: any = null;
  try {
    result = await response.json();
  } catch {
    throw new Error(`API unavailable: the Admin endpoint returned an unexpected response (HTTP ${response.status}).`);
  }
  if (!response.ok) throw new Error(result?.error || 'Request failed.');
  return result;
}

export interface AdminMetadata {
  editorial_role?: string;
  specialization?: string;
  organization?: string;
}

export const adminCreateUser = (fields: { role: Role; name: string; email: string; password: string; metadata?: AdminMetadata }) =>
  call({ action: 'create', ...fields }) as Promise<{ user: { id: string; email: string; name: string; role: Role } }>;

export const adminUpdateUser = (userId: string, fields: { name: string; email: string; role?: Role; status?: 'ACTIVE' | 'INACTIVE'; metadata?: AdminMetadata }) =>
  call({ action: 'update', userId, ...fields }) as Promise<{ success: true }>;

export const adminResetPassword = (userId: string, password: string) =>
  call({ action: 'reset_password', userId, password }) as Promise<{ success: true }>;

export const adminDeleteUser = (userId: string) =>
  call({ action: 'delete', userId }) as Promise<{ success: true; mode: 'deleted' | 'closed' }>;

export const adminReviewSignup = (userId: string, decision: 'APPROVE' | 'REJECT') =>
  call({ action: 'review_signup', userId, decision }) as Promise<{ success: true }>;

/** A random temporary password that is easy to read out: no look-alike characters. */
export function generateTemporaryPassword(minLength = 8): string {
  const length = Math.max(12, minLength);
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%&*?'];
  const all = sets.join('');
  const pick = (chars: string) => chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length];
  const out = sets.map(pick);
  while (out.length < length) out.push(pick(all));
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}
