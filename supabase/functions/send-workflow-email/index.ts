// ==========================================
// Sends the real workflow emails. Triggered automatically by a Supabase
// Database Webhook on INSERT into public.email_outbox (configured in the
// Supabase Dashboard, not in code -- see the setup instructions given
// alongside this file).
//
// Only one event type has a template right now: MANUSCRIPT_SUBMITTED.
// Adding the next workflow event later means:
//   1. one INSERT into public.email_enabled_types (see migration 0131), and
//   2. one more `case` added to buildEmail() below.
// No other file changes and no redeploying anything else.
//
// Required secrets (set with `supabase secrets set ...`):
//   RESEND_API_KEY   - already set in Phase 1
//   EMAIL_FROM       - already set in Phase 1 (change this any time to
//                      switch the sender address, e.g. to noreply@tulitics.com
//                      -- no code change needed)
//   EMAIL_FROM_NAME  - optional, defaults to "Tulitics Journal"
//   WEBHOOK_SECRET   - a random string you choose, shared with the Database
//                      Webhook's custom header so random internet requests
//                      can't trigger emails. See setup instructions.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically to
// every Edge Function by Supabase -- they are not set manually here.
// ==========================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const EMAIL_FROM = Deno.env.get('EMAIL_FROM');
const EMAIL_FROM_NAME = Deno.env.get('EMAIL_FROM_NAME') || 'Tulitics Journal';
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

interface OutboxRow {
  id: string;
  recipient_id: string;
  type: string;
  manuscript_id: string | null;
  title: string;
  body: string;
}

/** One case per email-enabled notification type. Unknown types are refused, not guessed at. */
function buildEmail(row: OutboxRow, recipientName: string): { subject: string; html: string } | null {
  switch (row.type) {
    case 'MANUSCRIPT_SUBMITTED':
      return {
        subject: row.title || 'New manuscript submission',
        html:
          `<p>Hello ${escapeHtml(recipientName)},</p>` +
          `<p>${escapeHtml(row.title)}</p>` +
          (row.manuscript_id ? `<p>Manuscript ID: ${escapeHtml(row.manuscript_id)}</p>` : '') +
          `<p>Please sign in to the journal system to review it.</p>`,
      };
    default:
      return null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  if (!RESEND_API_KEY || !EMAIL_FROM) {
    return json(500, { error: 'Server misconfiguration: RESEND_API_KEY/EMAIL_FROM secret is not set.' });
  }
  if (!WEBHOOK_SECRET) {
    return json(500, { error: 'Server misconfiguration: WEBHOOK_SECRET secret is not set.' });
  }
  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return json(401, { error: 'Unauthorized.' });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const record: OutboxRow | undefined = payload?.record;
  if (!record?.id) {
    return json(400, { error: 'Missing "record" in webhook payload.' });
  }

  try {
    const { data: recipient, error: profileError } = await admin
      .from('profiles')
      .select('email, name, status')
      .eq('id', record.recipient_id)
      .maybeSingle();

    if (profileError || !recipient) {
      await markFailed(record.id, 'Recipient profile not found.');
      return json(200, { skipped: true, reason: 'recipient not found' });
    }
    if (recipient.status !== 'ACTIVE' || !recipient.email) {
      await markFailed(record.id, 'Recipient is not an active user with an email.');
      return json(200, { skipped: true, reason: 'recipient inactive or no email' });
    }

    const email = buildEmail(record, recipient.name || 'there');
    if (!email) {
      await markFailed(record.id, `No email template for type "${record.type}".`);
      return json(200, { skipped: true, reason: 'no template' });
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
        to: [recipient.email],
        subject: email.subject,
        html: email.html,
      }),
    });
    const resendBody = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      await markFailed(record.id, `Resend error: ${JSON.stringify(resendBody)}`);
      return json(502, { error: 'Resend rejected the request.', details: resendBody });
    }

    await admin
      .from('email_outbox')
      .update({ status: 'SENT', sent_at: new Date().toISOString(), attempts: 1 })
      .eq('id', record.id);

    return json(200, { success: true, id: resendBody?.id ?? null });
  } catch (e) {
    await markFailed(record.id, e instanceof Error ? e.message : 'Unexpected error.');
    return json(500, { error: 'Unexpected error.' });
  }
});

async function markFailed(outboxId: string, message: string) {
  await admin
    .from('email_outbox')
    .update({ status: 'FAILED', last_error: message, attempts: 1 })
    .eq('id', outboxId);
}
