-- ==========================================
-- Module 133: Call send-workflow-email directly via pg_net instead of a
-- Database Webhook.
--
-- This project's Supabase Database Webhooks dashboard feature is not fully
-- provisioned (missing the internal supabase_functions schema), so instead
-- of depending on that dashboard feature, this trigger calls the deployed
-- Edge Function directly using pg_net (net.http_post), which is already
-- enabled on this project.
--
-- The shared secret used to authenticate this call is deliberately NOT
-- written here -- it is read from a database-level setting
-- (app.settings.webhook_secret) that must be set once, directly in the
-- Supabase SQL Editor (never committed to git, never put in a migration
-- file). See the chat instructions for the exact one-line command to run.
--
-- Purely additive: only attaches to public.email_outbox, a table this
-- session created. No existing table, RPC, or trigger is touched.
-- ==========================================

create or replace function public.notify_email_outbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare secret text;
begin
  secret := current_setting('app.settings.webhook_secret', true);
  if secret is null or secret = '' then
    -- Fail loudly in the logs but never block the insert into email_outbox --
    -- this trigger only fires notification delivery, never the workflow.
    raise warning 'app.settings.webhook_secret is not set -- skipping send-workflow-email call for outbox row %', new.id;
    return new;
  end if;

  perform net.http_post(
    url := 'https://uqevcpokthdqlispnxyz.functions.supabase.co/send-workflow-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', secret
    ),
    body := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
end;
$$;

revoke all on function public.notify_email_outbox() from public;

drop trigger if exists trg_notify_email_outbox on public.email_outbox;
create trigger trg_notify_email_outbox
  after insert on public.email_outbox
  for each row execute function public.notify_email_outbox();
