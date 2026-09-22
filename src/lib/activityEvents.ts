import { supabase } from './supabase';

export type AuthEvent = 'sign_in' | 'sign_out' | 'sign_in_failed' | 'password_changed' | 'password_reset_requested';

/**
 * Reports an authentication event to the activity log (POST /api/activity).
 * Never throws and never blocks for long: recording an event must not get in
 * the way of signing in or out. Passwords are never sent.
 */
export async function logAuthEvent(event: AuthEvent, info: { email?: string; reason?: string; method?: string } = {}): Promise<void> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (event === 'sign_in' || event === 'sign_out' || event === 'password_changed') {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) return;
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      await fetch('/api/activity', { method: 'POST', headers, body: JSON.stringify({ event, ...info }), signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // best effort only
  }
}
