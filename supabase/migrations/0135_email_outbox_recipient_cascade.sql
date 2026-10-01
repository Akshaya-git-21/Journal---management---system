-- ==========================================
-- Module 135: let users be deleted even if they have email_outbox rows.
--
-- 0131 created email_outbox.recipient_id as a plain FK to profiles(id), so
-- deleting any user who had ever been sent (or queued) an email failed with
-- "Database error deleting user". Outbox rows are only a delivery log, so
-- they should go away with the user, like the other FKs on this table.
-- ==========================================

alter table public.email_outbox
  drop constraint if exists email_outbox_recipient_id_fkey;

alter table public.email_outbox
  add constraint email_outbox_recipient_id_fkey
  foreign key (recipient_id) references public.profiles(id) on delete cascade;
