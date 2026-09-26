/**
 * "Continue with ORCID" -- one serverless function for the whole flow, reached at
 * /api/orcid/<action> (see vercel.json rewrite; server.ts serves the same route
 * locally). Self-contained on purpose (see api/reset-user-password.ts).
 *
 *   GET  /api/orcid/start     -> sends the browser to ORCID to log in
 *   GET  /api/orcid/callback  -> ORCID sends the browser back here with a code;
 *                                we swap it for the author's verified iD
 *   POST /api/orcid/complete  -> new author: create the account from the ORCID iD
 *   POST /api/orcid/link      -> existing author: attach the iD (needs password)
 *
 * The browser is never trusted to say who it is: every step is tied to the iD
 * ORCID returned, carried in a short-lived HMAC-signed token. Only AUTHOR
 * accounts can use ORCID.
 */
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ORCID_CLIENT_ID = process.env.ORCID_CLIENT_ID;
const ORCID_CLIENT_SECRET = process.env.ORCID_CLIENT_SECRET;
const IS_SANDBOX = (process.env.ORCID_ENV || 'sandbox').toLowerCase() !== 'production';
const ORCID_BASE = IS_SANDBOX ? 'https://sandbox.orcid.org' : 'https://orcid.org';
const ORCID_PUB = IS_SANDBOX ? 'https://pub.sandbox.orcid.org/v3.0' : 'https://pub.orcid.org/v3.0';

const STATE_COOKIE = 'orcid_state';
const PENDING_TTL_S = 15 * 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORCID_RE =/^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$/;

// ---------- small helpers ----------

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

function sign(payload: Record<string, any>, ttlSeconds: number): string {
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = crypto.createHmac('sha256', SERVICE_KEY as string).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token: unknown): Record<string, any> | null {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SERVICE_KEY as string).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    return data.exp > Math.floor(Date.now() / 1000) ? data : null;
  } catch {
    return null;
  }
}

function readCookie(req: any, name: string): string | undefined {
  const header = String(req.headers?.cookie || '');
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function origin(req: any): string {
  const proto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0] || (req.socket?.encrypted ? 'https' : 'http');
  return `${proto}://${req.headers?.host}`;
}

const redirectUri = (req: any) => process.env.ORCID_REDIRECT_URI || `${origin(req)}/api/orcid/callback`;

/** Sends the browser back to the app; details travel in the #fragment so they never reach server logs. */
function backToApp(res: any, params: Record<string, string>) {
  res.setHeader('Set-Cookie', `${STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  res.redirect(302, `/#${new URLSearchParams({ orcid: params.orcid, ...params }).toString()}`);
}

const fail = (res: any, message: string) => backToApp(res, { orcid: 'error', m: message });

async function orcidJson(url: string, accessToken?: string): Promise<any | null> {
  try {
    const r = await fetch(url, {
      headers: { Accept: 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** One-time login token for an existing AUTHOR account (the browser exchanges it for a session). */
async function issueLoginToken(
  admin: any,
  userId: string,
  mail?: { anon: any; siteUrl: string }
): Promise<{ token?: string; error?: string }> {
  const { data: profile } = await admin.from('profiles').select('role, requested_role, status').eq('id', userId).single();
  if (!profile) return { error: 'No profile found for this account. Contact your Coordinator.' };
  if ((profile.role || profile.requested_role) !== 'AUTHOR') return { error: 'ORCID sign-in is only available for Author accounts.' };
  if (profile.status === 'PENDING_APPROVAL') return { error: 'Your account is awaiting approval from an Admin.' };
  if (profile.status === 'REJECTED') return { error: 'This account request was rejected. Contact your Admin.' };
  if (profile.status === 'INACTIVE') return { error: 'Account is deactivated. Contact your Coordinator to reactivate it.' };
  if (profile.status !== 'ACTIVE') return { error: 'Account not exists' };

  const { data: u } = await admin.auth.admin.getUserById(userId);
  if (!u?.user?.email) return { error: 'Account not exists' };
  if (!u.user.email_confirmed_at) {
    // Email never confirmed: send a fresh confirmation link (it goes back to the site the person is on).
    if (mail) await mail.anon.auth.signInWithOtp({ email: u.user.email, options: { shouldCreateUser: false, emailRedirectTo: mail.siteUrl } });
    return { error: 'Please confirm your email first. We sent you a new confirmation link -- open it once, then sign in with ORCID.' };
  }

  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.user.email });
  const token = data?.properties?.hashed_token;
  if (error || !token) return { error: 'Unable to sign you in. Please try again.' };
  return { token };
}

// ---------- actions ----------

function start(req: any, res: any) {
  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', `${STATE_COOKIE}=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${origin(req).startsWith('https') ? '; Secure' : ''}`);
  const q = new URLSearchParams({
    client_id: ORCID_CLIENT_ID as string,
    response_type: 'code',
    scope: '/authenticate',
    redirect_uri: redirectUri(req),
    state,
    prompt: 'login', // always show ORCID's login page, even if the browser is already signed in to ORCID
  });
  res.redirect(302, `${ORCID_BASE}/oauth/authorize?${q.toString()}`);
}

async function callback(req: any, res: any, admin: any, anon: any) {
  const { code, state, error } = req.query || {};
  if (error) return fail(res, 'ORCID sign-in was cancelled.');
  const cookieState = readCookie(req, STATE_COOKIE);
  if (!code || !state || !cookieState || state !== cookieState) return fail(res, 'ORCID sign-in expired. Please try again.');

  let tokenJson: any;
  try {
    const r = await fetch(`${ORCID_BASE}/oauth/token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: ORCID_CLIENT_ID as string,
        client_secret: ORCID_CLIENT_SECRET as string,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: redirectUri(req),
      }).toString(),
    });
    tokenJson = await r.json().catch(() => ({}));
    if (!r.ok) {
      // ORCID's error text (e.g. "invalid_client", "redirect_uri mismatch") holds no secrets.
      const reason = String(tokenJson?.error_description || tokenJson?.error || `HTTP ${r.status}`).slice(0, 160);
      console.error('[api/orcid] token exchange failed:', r.status, reason);
      return fail(res, `Could not verify your ORCID iD (${reason}).`);
    }
  } catch (e: any) {
    console.error('[api/orcid] token exchange error:', e?.message);
    return fail(res, 'Could not reach ORCID. Please try again.');
  }

  const orcid: string = tokenJson.orcid;
  if (!ORCID_RE.test(orcid || '')) return fail(res, 'ORCID returned an unexpected response.');

  // Already linked -> sign straight in.
  const { data: link } = await admin.from('orcid_identities').select('user_id').eq('orcid_id', orcid).maybeSingle();
  if (link) {
    const { data: linked } = await admin.auth.admin.getUserById(link.user_id);
    if (linked?.user && !linked.user.email_confirmed_at) {
      // An earlier sign-up with this iD never verified its email (e.g. a mistyped address). It was never
      // usable, so discard it -- the author, now ORCID-authenticated again, can start over cleanly.
      await admin.auth.admin.deleteUser(link.user_id);
    } else {
      const { token, error: tokenError } = await issueLoginToken(admin, link.user_id, { anon, siteUrl: origin(req) });
      return token ? backToApp(res, { orcid: 'login', t: token }) : fail(res, tokenError || 'Unable to sign you in.');
    }
  }

  // New iD -> gather what ORCID shows publicly (name, verified public email).
  let given = '';
  let family = '';
  const person = await orcidJson(`${ORCID_PUB}/${orcid}/person`, tokenJson.access_token);
  given = person?.name?.['given-names']?.value || '';
  family = person?.name?.['family-name']?.value || '';
  if (!given && !family && tokenJson.name) {
    const parts = String(tokenJson.name).trim().split(/\s+/);
    given = parts.slice(0, -1).join(' ') || parts[0] || '';
    family = parts.length > 1 ? parts[parts.length - 1] : '';
  }
  const emails = await orcidJson(`${ORCID_PUB}/${orcid}/email`, tokenJson.access_token);
  // Every verified, publicly visible email on the record (primary first).
  const verifiedEmails: string[] = (emails?.email || [])
    .filter((e: any) => e.verified && e.email)
    .sort((a: any, b: any) => Number(!!b.primary) - Number(!!a.primary))
    .map((e: any) => String(e.email).toLowerCase());

  // Public affiliation + country, where the author has shared them (all optional, all editable on the next screen).
  const [jobs, addresses] = await Promise.all([
    orcidJson(`${ORCID_PUB}/${orcid}/employments`, tokenJson.access_token),
    orcidJson(`${ORCID_PUB}/${orcid}/address`, tokenJson.access_token),
  ]);
  const summaries = (jobs?.['affiliation-group'] || [])
    .flatMap((g: any) => g?.summaries || [])
    .map((s: any) => s?.['employment-summary'])
    .filter((s: any) => s?.organization?.name);
  // Prefer a current position (no end date), else the first listed.
  const job = summaries.find((s: any) => !s['end-date']) || summaries[0];
  const countryCode: string = addresses?.address?.[0]?.country?.value || job?.organization?.address?.country || '';
  let country = '';
  try {
    country = countryCode ? new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode.toUpperCase()) || '' : '';
  } catch {
    country = '';
  }

  const pending = sign(
    {
      orcid,
      given,
      family,
      emails: verifiedEmails.slice(0, 5),
      affiliation: String(job?.organization?.name || '').slice(0, 200),
      department: String(job?.['department-name'] || '').slice(0, 200),
      country,
    },
    PENDING_TTL_S
  );
  backToApp(res, { orcid: 'pending', t: pending });
}

/**
 * Decides which email an ORCID sign-up may use.
 *  - ORCID shared verified email(s): only those are accepted (whatever the browser sends), and they
 *    need no further confirmation -> trusted.
 *  - ORCID shared none (private): a typed address is accepted, but it is NOT trusted -- the account
 *    stays unusable until that address is verified by link.
 */
function resolveEmail(pending: Record<string, any>, email: string): { error: { status: number; body: any } } | { trusted: boolean } {
  const orcidEmails: string[] = Array.isArray(pending.emails) ? pending.emails : [];
  if (orcidEmails.length) {
    return orcidEmails.includes(email)
      ? { trusted: true }
      : { error: { status: 400, body: { error: 'Use the email address from your ORCID record.' } } };
  }
  if (!EMAIL_RE.test(email) || email.length > 320) return { error: { status: 400, body: { error: 'Enter a valid email address.' } } };
  return { trusted: false };
}

export async function complete(body: any, admin: any, anon: any, siteUrl: string): Promise<{ status: number; body: any }> {
  const pending = verify(body?.pending);
  if (!pending) return { status: 400, body: { error: 'Your ORCID session expired. Please start again.' } };

  const email = String(body?.email || '').trim().toLowerCase();
  const firstName = String(body?.firstName || '').trim().slice(0, 100);
  const lastName = String(body?.lastName || '').trim().slice(0, 100);
  const resolved = resolveEmail(pending, email);
  if ('error' in resolved) return resolved.error;
  const { trusted } = resolved;
  if (!firstName) return { status: 400, body: { error: 'Given names are required.' } };

  const { data: taken } = await admin.from('orcid_identities').select('user_id').eq('orcid_id', pending.orcid).maybeSingle();
  if (taken) return { status: 409, body: { error: 'This ORCID iD is already linked to an account. Sign in with ORCID.' } };

  // An account with this email exists -> the person must prove it is theirs (password).
  const escaped = email.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: existing } = await admin.from('profiles').select('id').ilike('email', escaped).limit(1);
  if (existing?.length) return { status: 200, body: { status: 'link_required', email } };

  // Email from ORCID -> already verified. A typed email is created unconfirmed: nobody can sign in to it
  // (the password is random and never shown) until the verification link below has been opened.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: crypto.randomBytes(24).toString('base64url'),
    email_confirm: trusted,
    user_metadata: {
      full_name: `${firstName} ${lastName}`.trim(),
      first_name: firstName,
      last_name: lastName,
      orcid_id: pending.orcid,
      affiliation: String(body?.affiliation || '').trim().slice(0, 200),
      department: String(body?.department || '').trim().slice(0, 200),
      country: String(body?.country || '').trim().slice(0, 100),
      requested_role: 'AUTHOR',
    },
  });
  if (createError || !created?.user) {
    if (/already|registered|exists/i.test(createError?.message || '')) return { status: 200, body: { status: 'link_required', email } };
    return { status: 500, body: { error: 'Unable to create the account.' } };
  }

  const { error: linkError } = await admin.from('orcid_identities').insert({ user_id: created.user.id, orcid_id: pending.orcid });
  if (linkError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { status: 500, body: { error: 'Unable to link your ORCID iD.' } };
  }

  if (!trusted) {
    // No session is issued here. The account only becomes usable once the emailed link is opened.
    const { error: mailError } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: siteUrl } });
    if (mailError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return { status: 502, body: { error: 'We could not send the verification email. Please check the address and try again.' } };
    }
    return { status: 200, body: { status: 'verify_email', email } };
  }
  const { token, error } = await issueLoginToken(admin, created.user.id);
  return token ? { status: 200, body: { status: 'ok', token } } : { status: 403, body: { error } };
}

export async function link(body: any, admin: any, anon: any, siteUrl: string): Promise<{ status: number; body: any }> {
  const pending = verify(body?.pending);
  if (!pending) return { status: 400, body: { error: 'Your ORCID session expired. Please start again.' } };
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  if (!password) return { status: 400, body: { error: 'Email and password are required.' } };
  const resolved = resolveEmail(pending, email);
  if ('error' in resolved) return resolved.error;

  const { data: signedIn, error: pwError } = await anon.auth.signInWithPassword({ email, password });
  if (pwError || !signedIn?.user) return { status: 401, body: { error: 'Incorrect email or password.' } };
  const userId = signedIn.user.id;

  const { data: taken } = await admin.from('orcid_identities').select('user_id').eq('orcid_id', pending.orcid).maybeSingle();
  if (taken && taken.user_id !== userId) return { status: 409, body: { error: 'This ORCID iD is already linked to a different account.' } };

  const { token, error } = await issueLoginToken(admin, userId, { anon, siteUrl });
  if (!token) return { status: 403, body: { error } };

  const { error: linkError } = await admin.from('orcid_identities').upsert({ user_id: userId, orcid_id: pending.orcid }, { onConflict: 'user_id' });
  if (linkError) return { status: 500, body: { error: 'Unable to link your ORCID iD.' } };
  return { status: 200, body: { status: 'ok', token } };
}

// ---------- entrypoint ----------

export async function orcidHandler(req: any, res: any, actionOverride?: string) {
  try {
    if (!SUPABASE_URL || !SERVICE_KEY || !SUPABASE_ANON_KEY) {
      return res.status(500).json({ error: 'Server misconfiguration: missing Supabase keys.' });
    }
    if (!ORCID_CLIENT_ID || !ORCID_CLIENT_SECRET) {
      const msg = 'ORCID is not configured yet (ORCID_CLIENT_ID / ORCID_CLIENT_SECRET).';
      return req.method === 'GET' ? fail(res, msg) : res.status(500).json({ error: msg });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const action = actionOverride || req.query?.action;
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

    if (req.method === 'GET' && action === 'start') return start(req, res);
    if (req.method === 'GET' && action === 'callback') return await callback(req, res, admin, anon);
    if (req.method === 'POST' && action === 'complete') {
      const r = await complete(body, admin, anon, origin(req));
      return res.status(r.status).json(r.body);
    }
    if (req.method === 'POST' && action === 'link') {
      const r = await link(body, admin, anon, origin(req));
      return res.status(r.status).json(r.body);
    }
    return res.status(404).json({ error: 'Not found.' });
  } catch (error: any) {
    console.error('[api/orcid] Unexpected error:', error);
    return req.method === 'GET' ? fail(res, 'Something went wrong. Please try again.') : res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

export default orcidHandler;
