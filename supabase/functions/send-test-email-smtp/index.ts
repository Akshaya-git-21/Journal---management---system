// ==========================================
// Test-only Edge Function: sends ONE email through your own mailbox's SMTP
// (e.g. Office 365/Outlook) to prove that sending path works, before it is
// ever connected to the real manuscript workflow.
//
// Not wired into anything else. Does not read/write any application table.
// send-workflow-email (the real sender, currently using Resend) is
// untouched until this is proven working and you approve switching it.
//
// Required secrets (set with `supabase secrets set ...` -- never commit
// these, never put them in a VITE_ variable):
//   SMTP_HOST      - e.g. smtp.office365.com
//   SMTP_PORT      - e.g. 587
//   SMTP_USERNAME  - the full mailbox address, e.g. journal@yourdomain.com
//   SMTP_PASSWORD  - the mailbox's password, or an App Password if the
//                    account has MFA enabled
//   EMAIL_FROM_NAME - optional, defaults to "Tulitics Journal"
//
// Office 365 note: "Authenticated SMTP" must be turned on for this specific
// mailbox in the Microsoft 365 admin center, or every send will fail with
// an authentication error -- this is a Microsoft account setting, not
// something fixable in code.
// ==========================================

import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const SMTP_HOST = Deno.env.get('SMTP_HOST');
const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') || '587');
const SMTP_USERNAME = Deno.env.get('SMTP_USERNAME');
const SMTP_PASSWORD = Deno.env.get('SMTP_PASSWORD');
const EMAIL_FROM_NAME = Deno.env.get('EMAIL_FROM_NAME') || 'Tulitics Journal';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  if (!SMTP_HOST || !SMTP_USERNAME || !SMTP_PASSWORD) {
    return json(500, { error: 'Server misconfiguration: SMTP_HOST/SMTP_USERNAME/SMTP_PASSWORD secret is not set.' });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // handled by the missing-"to" check below
  }
  const to = typeof body?.to === 'string' ? body.to.trim() : '';
  if (!to) {
    return json(400, { error: 'Missing "to" address in request body, e.g. {"to":"you@example.com"}.' });
  }

  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      tls: SMTP_PORT === 465, // 465 = implicit SSL; 587 upgrades via STARTTLS
      auth: { username: SMTP_USERNAME, password: SMTP_PASSWORD },
    },
  });

  try {
    await client.send({
      from: `${EMAIL_FROM_NAME} <${SMTP_USERNAME}>`,
      to: [to],
      subject: 'Tulitics Journal -- SMTP test email',
      html: '<p>This is a test email confirming the Office 365/Outlook SMTP setup works.</p>' +
        '<p>This message was not triggered by any manuscript workflow action.</p>',
    });
    await client.close();
    return json(200, { success: true });
  } catch (e) {
    try { await client.close(); } catch { /* best effort */ }
    return json(500, { error: e instanceof Error ? e.message : 'Unexpected error sending via SMTP.' });
  }
});
