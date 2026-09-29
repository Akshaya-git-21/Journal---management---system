// ==========================================
// Sends the real workflow emails. Triggered automatically by a Supabase
// Database Webhook on INSERT into public.email_outbox (configured in the
// Supabase Dashboard, not in code -- see the setup instructions given
// alongside this file).
//
// BATCH 1: Author-facing events only. Adding the next batch (Editor,
// Reviewer, Coordinator, Production) later means adding more `case`s to
// buildEmail() below and, where no existing notification exists yet, one
// additive _notify() line in the relevant RPC (see migration 0132 for the
// pattern). No other file changes needed for that.
//
// Required secrets (RESEND_API_KEY/EMAIL_FROM/EMAIL_FROM_NAME already set
// in Phase 1). New for this batch:
//   WEBHOOK_SECRET   - a random string you choose, shared with the Database
//                      Webhook's custom header so random internet requests
//                      can't trigger emails.
//   APP_URL          - optional. The app's real URL, so emails can link back
//                      to it. If unset, emails omit the link line.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically to
// every Edge Function by Supabase.
// ==========================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const EMAIL_FROM = Deno.env.get('EMAIL_FROM');
const EMAIL_FROM_NAME = Deno.env.get('EMAIL_FROM_NAME') || 'Tulitics Journal';
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');
const APP_URL = Deno.env.get('APP_URL');

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

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Common footer: link to the app + journal contact info, only if configured -- never hard-coded. */
function footer(journalContactEmail: string | null): string {
  const parts: string[] = [];
  if (APP_URL) parts.push(`<p><a href="${escapeHtml(APP_URL)}">Open the journal system</a></p>`);
  if (journalContactEmail) parts.push(`<p style="color:#666;font-size:13px;">Questions? Contact ${escapeHtml(journalContactEmail)}</p>`);
  return parts.join('');
}

async function buildEmail(
  row: OutboxRow,
  recipientName: string,
  journalName: string,
  journalContactEmail: string | null,
): Promise<{ subject: string; html: string } | null> {
  const jn = journalName || 'the journal';
  const greeting = `<p>Hello ${escapeHtml(recipientName)},</p>`;
  const manuscriptLine = row.manuscript_id ? `<p>Manuscript ID: ${escapeHtml(row.manuscript_id)}</p>` : '';

  switch (row.type) {
    case 'MANUSCRIPT_SUBMITTED_AUTHOR_ACK':
      return {
        subject: 'Manuscript Submission Received',
        html: greeting + `<p>Thank you for your submission to ${escapeHtml(jn)}. ${escapeHtml(row.body || '')}</p>` + manuscriptLine + footer(journalContactEmail),
      };

    case 'EDITORIAL_REVIEW_STARTED':
      return {
        subject: 'Your Manuscript Has Entered Editorial Review',
        html: greeting + `<p>Your manuscript is now under editorial review at ${escapeHtml(jn)}. No action is needed from you at this time.</p>` + manuscriptLine + footer(journalContactEmail),
      };

    case 'REVISION_SUBMITTED_AUTHOR_ACK':
      return {
        subject: 'Revision Submitted -- Confirmation',
        html: greeting + `<p>${escapeHtml(row.body || 'Your revised manuscript has been received.')}</p>` + manuscriptLine + footer(journalContactEmail),
      };

    case 'CORRECTIONS_SUBMITTED_AUTHOR_ACK':
      return {
        subject: 'Corrections Submitted -- Confirmation',
        html: greeting + `<p>Your proof corrections have been submitted and are being reviewed.</p>` + manuscriptLine + footer(journalContactEmail),
      };

    case 'FINAL_APPROVAL_COMPLETED_AUTHOR_ACK':
      return {
        subject: 'Final Approval Recorded -- Confirmation',
        html: greeting + `<p>Your final approval has been recorded. Your manuscript will proceed to the next production step.</p>` + manuscriptLine + footer(journalContactEmail),
      };

    case 'PROOF_SENT': {
      // Same notification type covers three moments in the proof workflow --
      // the existing title text (already written by the RPC that sent it)
      // tells us which one, no new column/type needed.
      const title = row.title || '';
      let subject = 'Proof Available for Review';
      if (/responded to your correction request/i.test(title)) subject = 'Response to Your Correction Request';
      else if (/final review/i.test(title)) subject = 'Final Approval Requested';
      return {
        subject,
        html: greeting + `<p>${escapeHtml(title)}</p>` + (row.body ? `<p>${escapeHtml(row.body)}</p>` : '') + manuscriptLine + footer(journalContactEmail),
      };
    }

    case 'DECISION_PUBLISHED': {
      // Same notification type covers accept/reject/revision -- read the
      // manuscript's current status (already set by publish_decision in
      // the same transaction) to pick the right subject, without adding a
      // new column or type.
      let subject = 'Decision on Your Manuscript';
      if (row.manuscript_id) {
        const { data: ms } = await admin.from('manuscripts').select('status').eq('id', row.manuscript_id).maybeSingle();
        if (ms?.status === 'ACCEPTED') subject = 'Manuscript Accepted';
        else if (ms?.status === 'REJECTED') subject = 'Manuscript Decision';
        else if (ms?.status === 'REVISION_REQUESTED') subject = 'Revision Required for Your Manuscript';
      }
      return {
        subject,
        html: greeting + `<p>${escapeHtml(row.title || '')}</p>` + (row.body ? `<p>${escapeHtml(row.body)}</p>` : '') + manuscriptLine + footer(journalContactEmail),
      };
    }

    case 'MANUSCRIPT_PUBLISHED': {
      let doiLine = '';
      if (row.manuscript_id) {
        const { data: ms } = await admin.from('manuscripts').select('doi, volume, issue').eq('id', row.manuscript_id).maybeSingle();
        if (ms?.doi) doiLine = `<p>DOI: ${escapeHtml(ms.doi)}${ms.volume ? ` &middot; Volume ${escapeHtml(ms.volume)}` : ''}${ms.issue ? ` &middot; Issue ${escapeHtml(ms.issue)}` : ''}</p>`;
      }
      return {
        subject: 'Your Article Has Been Published',
        html: greeting + `<p>${escapeHtml(row.title || 'Your manuscript has been published.')}</p>` + doiLine + manuscriptLine + footer(journalContactEmail),
      };
    }

    default:
      return null;
  }
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

    const { data: settingsRow } = await admin.from('journal_settings').select('settings').eq('id', 'main').maybeSingle();
    const journalName: string = settingsRow?.settings?.profile?.name || '';
    const journalContactEmail: string | null = settingsRow?.settings?.profile?.contactEmail || null;

    const email = await buildEmail(record, recipient.name || 'there', journalName, journalContactEmail);
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
