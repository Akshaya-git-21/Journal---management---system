// ==========================================
// Test-only Supabase Edge Function: sends ONE email through Resend to prove
// the email infrastructure works end to end (Resend account + API key +
// Edge Function secrets + this function).
//
// NOT wired into the manuscript workflow. It does not read or write any
// application table, and no other file in this repo calls it. It exists
// purely so the sending pipeline can be tested before any workflow
// notification is connected to it.
//
// Required secrets (set with `supabase secrets set ...` -- never commit
// these, never put them in a VITE_ variable):
//   RESEND_API_KEY   - Resend API key (Sending access, scoped to your domain
//                      once you have one -- a resend.dev test key works too)
//   EMAIL_FROM       - the "from" address this app sends as, e.g.
//                      "onboarding@resend.dev" for now, later
//                      "noreply@tulitics.com". Change this secret whenever
//                      you want to change the sender -- no code change needed.
//   EMAIL_FROM_NAME  - optional display name, defaults to "Tulitics Journal"
//
// Invoke (see the chat explanation for the exact command with your project
// ref and key filled in):
//   curl -i --location --request POST \
//     'https://<project-ref>.functions.supabase.co/send-test-email' \
//     --header 'Authorization: Bearer <anon-or-service-key>' \
//     --header 'Content-Type: application/json' \
//     --data '{"to":"you@example.com"}'
// ==========================================

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const EMAIL_FROM = Deno.env.get('EMAIL_FROM');
const EMAIL_FROM_NAME = Deno.env.get('EMAIL_FROM_NAME') || 'Tulitics Journal';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  if (!RESEND_API_KEY) {
    return json(500, { error: 'Server misconfiguration: RESEND_API_KEY secret is not set.' });
  }
  if (!EMAIL_FROM) {
    return json(500, { error: 'Server misconfiguration: EMAIL_FROM secret is not set.' });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // no/invalid JSON body -- handled by the missing-"to" check below
  }

  const to = typeof body?.to === 'string' ? body.to.trim() : '';
  if (!to) {
    return json(400, { error: 'Missing "to" address in request body, e.g. {"to":"you@example.com"}.' });
  }

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
        to: [to],
        subject: 'Tulitics Journal -- test email',
        html: '<p>This is a test email confirming the Resend + Supabase Edge Function setup works.</p>' +
          '<p>This message was not triggered by any manuscript workflow action.</p>',
      }),
    });

    const resendBody = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      return json(502, { error: 'Resend rejected the request.', details: resendBody });
    }

    return json(200, { success: true, id: resendBody?.id ?? null });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'Unexpected error calling Resend.' });
  }
});
