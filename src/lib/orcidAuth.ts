import { supabase } from './supabase';
import { logAuthEvent } from './activityEvents';
import type { AuthUser } from './auth';
import type { Role } from '../types';

export interface OrcidHandoff {
  kind: 'login' | 'pending' | 'error';
  token?: string;
  message?: string;
}

let handoffRead = false;
let handoffValue: OrcidHandoff | null = null;

/** Reads (and clears from the address bar) what /api/orcid/callback put in the URL #fragment. Read once, then cached. */
export function readOrcidHandoff(): OrcidHandoff | null {
  if (handoffRead) return handoffValue;
  handoffRead = true;
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash.includes('orcid=')) return null;
  const p = new URLSearchParams(hash);
  const kind = p.get('orcid');
  if (kind !== 'login' && kind !== 'pending' && kind !== 'error') return null;
  history.replaceState(null, '', window.location.pathname + window.location.search);
  handoffValue = { kind, token: p.get('t') || undefined, message: p.get('m') || undefined };
  return handoffValue;
}

/** Exchanges the one-time token from the server for a real Supabase session. */
export async function loginWithOrcidToken(tokenHash: string): Promise<AuthUser> {
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (error || !data.user) throw new Error('ORCID sign-in expired. Please try again.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, name, role, requested_role, status')
    .eq('id', data.user.id)
    .single();
  if (profileError || !profile || profile.status !== 'ACTIVE') {
    await supabase.auth.signOut();
    throw new Error('This account is not active. Contact your Coordinator.');
  }

  void logAuthEvent('sign_in');
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: (profile.role || profile.requested_role) as Role,
    status: profile.status,
  };
}

async function post(action: 'complete' | 'link', payload: Record<string, unknown>) {
  const response = await fetch(`/api/orcid/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error || 'Something went wrong. Please try again.');
  return result as { status: 'ok' | 'link_required' | 'verify_email'; token?: string; email?: string };
}

export interface OrcidProfileFields {
  affiliation: string;
  department: string;
  country: string;
}

export const completeOrcidSignup = (pending: string, email: string, firstName: string, lastName: string, extra: OrcidProfileFields) =>
  post('complete', { pending, email, firstName, lastName, ...extra });

export const linkOrcidToAccount = (pending: string, email: string, password: string) =>
  post('link', { pending, email, password });

/** Decodes the (non-secret) name/email the server pre-filled from ORCID. */
export function readPendingClaims(
  pending: string
): ({ orcid: string; given: string; family: string; email: string } & OrcidProfileFields) | null {
  try {
    const body = pending.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const c = JSON.parse(decodeURIComponent(escape(atob(body))));
    return {
      orcid: c.orcid,
      given: c.given || '',
      family: c.family || '',
      email: c.email || '',
      affiliation: c.affiliation || '',
      department: c.department || '',
      country: c.country || '',
    };
  } catch {
    return null;
  }
}
