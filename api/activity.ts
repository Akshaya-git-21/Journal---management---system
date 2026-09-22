/**
 * Vercel serverless function -- production entrypoint for authentication
 * events in the activity log. Self-contained on purpose (see
 * api/reset-user-password.ts); the core below is identical to
 * src/lib/activityHandler.ts -- change both together.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SIGNED_IN_EVENTS = ['sign_in', 'sign_out', 'password_changed'];
const PUBLIC_EVENTS = ['sign_in_failed', 'password_reset_requested'];

export interface ActivityResult {
  status: number;
  body: any;
}

/**
 * Records authentication events in the activity log.
 *  - sign_in / sign_out / password_changed: sent by a signed-in user; who they
 *    are comes from their session token, never from the request body.
 *  - sign_in_failed / password_reset_requested: sent before anyone is signed
 *    in. They are only recorded for an email that has an account, are
 *    throttled, and the response never reveals whether an account exists.
 * Passwords are never sent or stored.
 */
export async function runActivityRequest(
  admin: any,
  authHeader: string | undefined,
  body: any,
  meta: { ip?: string; userAgent?: string }
): Promise<ActivityResult> {
  const event = body?.event;
  if (![...SIGNED_IN_EVENTS, ...PUBLIC_EVENTS].includes(event)) {
    return { status: 400, body: { error: 'Unknown event.' } };
  }

  const details: Record<string, unknown> = {};
  if (meta.ip) details.ip = meta.ip.slice(0, 64);
  if (meta.userAgent) details.user_agent = meta.userAgent.slice(0, 160);
  if (typeof body.reason === 'string' && body.reason) details.reason = body.reason.slice(0, 120);
  if (typeof body.method === 'string' && body.method) details.method = body.method.slice(0, 40);

  const record = async (profile: any) => {
    const { error } = await admin.from('activity_log').insert({
      category: 'authentication',
      action: event,
      actor_id: profile.id,
      actor_name: profile.name,
      actor_email: profile.email,
      actor_role: profile.role ?? profile.requested_role ?? null,
      details,
    });
    if (error) console.error('[activity] could not write the activity log:', error.message);
  };

  if (SIGNED_IN_EVENTS.includes(event)) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { status: 401, body: { error: 'Unauthorized: Missing authentication token.' } };
    }
    const { data: tokenUser, error: tokenError } = await admin.auth.getUser(authHeader.slice(7));
    if (tokenError || !tokenUser?.user) {
      return { status: 401, body: { error: 'Unauthorized: Your session is invalid or has expired.' } };
    }
    const { data: profile } = await admin.from('profiles').select('id, name, email, role, requested_role').eq('id', tokenUser.user.id).maybeSingle();
    if (profile) await record(profile);
    return { status: 200, body: { ok: true } };
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email || email.length > 320) return { status: 200, body: { ok: true } };
  const pattern = email.replace(/[\\%_]/g, (c) => '\\' + c);
  const { data: matches } = await admin.from('profiles').select('id, name, email, role, requested_role').ilike('email', pattern).limit(1);
  const profile = matches?.[0];
  if (!profile) return { status: 200, body: { ok: true } };

  // At most one entry per account, event and 10 seconds.
  const since = new Date(Date.now() - 10_000).toISOString();
  const { data: recent } = await admin.from('activity_log').select('id').eq('actor_id', profile.id).eq('action', event).gte('created_at', since).limit(1);
  if (!recent || recent.length === 0) await record(profile);
  return { status: 200, body: { ok: true } };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      res.status(500).json({ error: 'Server misconfiguration: missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.' });
      return;
    }
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    const result = await runActivityRequest(admin, req.headers?.authorization, body, {
      ip: forwarded || req.socket?.remoteAddress,
      userAgent: String(req.headers?.['user-agent'] || ''),
    });
    res.status(result.status).json(result.body);
  } catch (error: any) {
    console.error('[api/activity] Unexpected error:', error);
    res.status(500).json({ error: 'Unable to record the event.' });
  }
}
