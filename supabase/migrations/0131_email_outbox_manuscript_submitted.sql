-- ==========================================
-- Module 131: Email outbox + queueing trigger (Phase 2 of email integration).
--
-- Purely additive. Nothing existing is changed: workflow_notifications, its
-- columns, every workflow RPC, the NotificationBell realtime subscription,
-- RLS, ORCID, and the manuscript status machine are all untouched. This
-- only adds a side effect after a notification row is inserted -- it never
-- blocks, changes, or delays that original insert.
--
-- What this adds:
--   1. email_enabled_types -- an allow-list of workflow_notifications.type
--      values that should ALSO be emailed. Starts with just
--      'MANUSCRIPT_SUBMITTED'. Turning on another event later is one INSERT
--      into this table (plus a matching template case added to the
--      send-workflow-email Edge Function) -- no new migration required for
--      the queueing side.
--   2. email_outbox -- one row per notification that needs to be emailed.
--      Recipient email/name are looked up at send time from `profiles`
--      (not copied here), so the email always reflects current data.
--   3. A trigger on workflow_notifications that queues a row in
--      email_outbox when the notification's type is in the allow-list.
--
-- Locked down: RLS is enabled on both new tables with NO policies granted
-- to `authenticated` -- the browser/frontend cannot read or write either
-- table at all. Only server-side code using the service-role key (the
-- send-workflow-email Edge Function) can see or change these rows.
-- ==========================================

create table if not exists public.email_enabled_types (
  type text primary key
);

insert into public.email_enabled_types (type)
values ('MANUSCRIPT_SUBMITTED')
on conflict (type) do nothing;

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.workflow_notifications(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id),
  type text not null,
  manuscript_id text references public.manuscripts(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  status text not null default 'PENDING',
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz,
  constraint email_outbox_status_check check (status in ('PENDING','SENT','FAILED')),
  constraint email_outbox_notification_unique unique (notification_id)
);

create index if not exists idx_email_outbox_status on public.email_outbox(status, created_at);

alter table public.email_enabled_types enable row level security;
alter table public.email_outbox enable row level security;
-- Intentionally no policies: authenticated has zero access to either table.

create or replace function public.queue_workflow_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.email_enabled_types where type = new.type) then
    insert into public.email_outbox (notification_id, recipient_id, type, manuscript_id, title, body)
    values (new.id, new.recipient_id, new.type, new.manuscript_id, new.title, new.body)
    on conflict (notification_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.queue_workflow_email() from public;

drop trigger if exists trg_queue_workflow_email on public.workflow_notifications;
create trigger trg_queue_workflow_email
  after insert on public.workflow_notifications
  for each row execute function public.queue_workflow_email();
