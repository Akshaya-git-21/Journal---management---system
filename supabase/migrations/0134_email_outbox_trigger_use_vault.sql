-- ==========================================
-- Module 134: switch the send-workflow-email trigger to read its shared
-- secret from Supabase Vault instead of a database-level setting.
--
-- 0133's `current_setting('app.settings.webhook_secret', true)` cannot be
-- set on a Supabase-managed database -- `ALTER DATABASE ... SET` requires a
-- privilege this project's role doesn't have (permission denied, 42501).
-- Vault is the supported way to store a secret used inside a trigger/RPC;
-- it is set once directly in the SQL Editor with
-- `select vault.create_secret('<value>', 'webhook_secret', 'description');`
-- -- never written here, never committed to git.
--
-- Purely additive/corrective to the trigger added in 0133 this session.
-- No existing table, RPC, or trigger outside this session's own work is
-- touched.
-- ==========================================

create or replace function public.notify_email_outbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'webhook_secret' limit 1;
  if secret is null or secret = '' then
    -- Fail loudly in the logs but never block the insert into email_outbox --
    -- this trigger only fires notification delivery, never the workflow.
    raise warning 'Vault secret "webhook_secret" is not set -- skipping send-workflow-email call for outbox row %', new.id;
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
