-- ==========================================
-- Module 2: Database & Supabase -- manuscript workflow schema + RPCs
--
-- Replaces the old single `manuscripts` table (JSONB blobs for reviewers,
-- discussions, revisions, files, suggested reviewers) with real relational
-- tables, and makes every workflow transition go through a SECURITY DEFINER
-- RPC that re-checks the caller's role/relationship and the manuscript's
-- current state before mutating anything. This is what makes "no workflow
-- step can be bypassed" a server-side guarantee instead of a UI convention:
-- the client can read manuscripts (subject to RLS) and call these RPCs, but
-- cannot directly UPDATE status-bearing columns.
--
-- Depends on 0001_profiles_rbac.sql (profiles table, is_active_coordinator()).
-- Safe to re-run.
-- ==========================================

-- ------------------------------------------
-- 1. Core tables
-- ------------------------------------------
-- NOTE: run 0002a_drop_legacy_manuscripts.sql ONCE before this file, the
-- first time only -- it drops the old incompatible manuscripts table. This
-- file itself is idempotent/safe to re-run (CREATE TABLE IF NOT EXISTS
-- throughout), it just won't do anything destructive on its own.

create table if not exists public.manuscripts (
  id text primary key,
  title text not null,
  abstract text not null default '',
  "references" text not null default '',
  is_double_blind boolean not null default true,
  cover_letter text not null default '',
  language text not null default 'en',
  status text not null default 'DRAFT' check (status in (
    'DRAFT','SUBMITTED','EDITOR_REVIEW','UNDER_REVIEW','REVISION_REQUESTED',
    'AWAITING_DECISION','ACCEPTED','PUBLISHED','REJECTED'
  )),
  author_id uuid not null references public.profiles(id),
  author_name text not null default '',
  author_email text not null default '',
  assigned_editor_id uuid references public.profiles(id),
  submission_step int not null default 1,
  editors_notes text not null default '',
  doi text,
  volume text,
  issue text,
  submitted_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- A manuscript is always authored by whoever is calling insert, using their
-- own profile -- the client cannot create a manuscript "as" someone else.
create or replace function public.set_manuscript_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_name text;
  caller_email text;
begin
  select name, email into caller_name, caller_email from public.profiles where id = auth.uid();
  new.author_id := auth.uid();
  new.author_name := coalesce(caller_name, '');
  new.author_email := coalesce(caller_email, '');
  return new;
end;
$$;

drop trigger if exists trg_set_manuscript_author on public.manuscripts;
create trigger trg_set_manuscript_author
  before insert on public.manuscripts
  for each row execute function public.set_manuscript_author();

-- Every table below is built as a minimal CREATE TABLE IF NOT EXISTS
-- followed by ALTER TABLE ADD COLUMN IF NOT EXISTS for every real column.
-- `notifications` turned out to already exist in this project (from
-- something unrelated to this app) with a different shape -- the same
-- "IF NOT EXISTS silently skips an incompatible existing table" trap that
-- hit `profiles` in 0001. Rather than guess which other table names might
-- also collide, every table here gets the same defensive treatment.

create table if not exists public.manuscript_contributors (id uuid primary key default gen_random_uuid());
alter table public.manuscript_contributors add column if not exists manuscript_id text references public.manuscripts(id) on delete cascade;
alter table public.manuscript_contributors add column if not exists name text not null default '';
alter table public.manuscript_contributors add column if not exists email text not null default '';
alter table public.manuscript_contributors add column if not exists affiliation text not null default '';
alter table public.manuscript_contributors add column if not exists contributor_role text not null default 'Co-Author';
alter table public.manuscript_contributors add column if not exists "position" int not null default 0;
alter table public.manuscript_contributors add column if not exists created_at timestamptz not null default timezone('utc', now());

create table if not exists public.manuscript_revisions (id uuid primary key default gen_random_uuid());
alter table public.manuscript_revisions add column if not exists manuscript_id text references public.manuscripts(id) on delete cascade;
alter table public.manuscript_revisions add column if not exists revision_number int not null default 1;
alter table public.manuscript_revisions add column if not exists requested_by uuid references public.profiles(id);
alter table public.manuscript_revisions add column if not exists decision_letter text not null default '';
alter table public.manuscript_revisions add column if not exists status text not null default 'AWAITING_AUTHOR_UPLOAD';
alter table public.manuscript_revisions add column if not exists requested_at timestamptz not null default timezone('utc', now());
alter table public.manuscript_revisions add column if not exists submitted_at timestamptz;
alter table public.manuscript_revisions drop constraint if exists manuscript_revisions_status_check;
alter table public.manuscript_revisions add constraint manuscript_revisions_status_check
  check (status in ('AWAITING_AUTHOR_UPLOAD','REVISION_SUBMITTED','UNDER_REVIEW','COMPLETED'));

create table if not exists public.manuscript_files (id uuid primary key default gen_random_uuid());
alter table public.manuscript_files add column if not exists manuscript_id text references public.manuscripts(id) on delete cascade;
alter table public.manuscript_files add column if not exists revision_id uuid;
alter table public.manuscript_files add column if not exists file_name text not null default '';
alter table public.manuscript_files add column if not exists file_type text not null default 'Manuscript';
alter table public.manuscript_files add column if not exists file_size text;
alter table public.manuscript_files add column if not exists storage_path text;
alter table public.manuscript_files add column if not exists public_url text;
alter table public.manuscript_files add column if not exists uploaded_by uuid references public.profiles(id);
alter table public.manuscript_files add column if not exists uploaded_at timestamptz not null default timezone('utc', now());
alter table public.manuscript_files drop constraint if exists manuscript_files_revision_id_fkey;
alter table public.manuscript_files add constraint manuscript_files_revision_id_fkey
  foreign key (revision_id) references public.manuscript_revisions(id) on delete set null;

-- One row per assignment attempt (so re-assigning to a different editor
-- after a decline keeps history instead of overwriting it).
create table if not exists public.editor_assignments (id uuid primary key default gen_random_uuid());
alter table public.editor_assignments add column if not exists manuscript_id text references public.manuscripts(id) on delete cascade;
alter table public.editor_assignments add column if not exists editor_id uuid references public.profiles(id);
alter table public.editor_assignments add column if not exists assigned_by uuid references public.profiles(id);
alter table public.editor_assignments add column if not exists status text not null default 'INVITED';
alter table public.editor_assignments alter column status set default 'INVITED';
alter table public.editor_assignments add column if not exists assigned_at timestamptz not null default timezone('utc', now());
alter table public.editor_assignments add column if not exists responded_at timestamptz;
alter table public.editor_assignments add column if not exists scientific_merit int;
alter table public.editor_assignments add column if not exists novelty_innovation int;
alter table public.editor_assignments add column if not exists methodology_quality int;
alter table public.editor_assignments add column if not exists literature_adequacy int;
alter table public.editor_assignments add column if not exists ethical_compliance int;
alter table public.editor_assignments add column if not exists data_reliability int;
alter table public.editor_assignments add column if not exists writing_quality int;
alter table public.editor_assignments add column if not exists strengths text;
alter table public.editor_assignments add column if not exists weaknesses text;
alter table public.editor_assignments add column if not exists mandatory_revisions text;
alter table public.editor_assignments add column if not exists comments_to_coordinator text;
alter table public.editor_assignments add column if not exists assessment_status text not null default 'NOT_STARTED';
alter table public.editor_assignments alter column assessment_status set default 'NOT_STARTED';
alter table public.editor_assignments add column if not exists assessment_submitted_at timestamptz;
alter table public.editor_assignments add column if not exists recommendation text;
alter table public.editor_assignments add column if not exists recommendation_submitted_at timestamptz;
alter table public.editor_assignments drop constraint if exists editor_assignments_status_check;
alter table public.editor_assignments add constraint editor_assignments_status_check check (status in ('INVITED','ACCEPTED','DECLINED'));
alter table public.editor_assignments drop constraint if exists editor_assignments_assessment_status_check;
alter table public.editor_assignments add constraint editor_assignments_assessment_status_check check (assessment_status in ('NOT_STARTED','SUBMITTED'));
alter table public.editor_assignments drop constraint if exists editor_assignments_recommendation_check;
alter table public.editor_assignments add constraint editor_assignments_recommendation_check
  check (recommendation in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT','ADDITIONAL_REVIEW'));

create index if not exists idx_editor_assignments_manuscript on public.editor_assignments(manuscript_id);

-- Author-submitted (at submission time) and Editor-submitted (after
-- evaluation) suggestions are distinct steps in the workflow but the same
-- shape, so they share a table with a discriminator instead of two tables.
create table if not exists public.manuscript_suggested_reviewers (id uuid primary key default gen_random_uuid());
alter table public.manuscript_suggested_reviewers add column if not exists manuscript_id text references public.manuscripts(id) on delete cascade;
alter table public.manuscript_suggested_reviewers add column if not exists suggested_by text not null default 'AUTHOR';
alter table public.manuscript_suggested_reviewers add column if not exists suggested_by_user uuid references public.profiles(id);
alter table public.manuscript_suggested_reviewers add column if not exists name text not null default '';
alter table public.manuscript_suggested_reviewers add column if not exists email text not null default '';
alter table public.manuscript_suggested_reviewers add column if not exists note text not null default '';
alter table public.manuscript_suggested_reviewers add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.manuscript_suggested_reviewers drop constraint if exists manuscript_suggested_reviewers_suggested_by_check;
alter table public.manuscript_suggested_reviewers add constraint manuscript_suggested_reviewers_suggested_by_check check (suggested_by in ('AUTHOR','EDITOR'));

create table if not exists public.reviewer_assignments (id uuid primary key default gen_random_uuid());
alter table public.reviewer_assignments add column if not exists manuscript_id text references public.manuscripts(id) on delete cascade;
alter table public.reviewer_assignments add column if not exists reviewer_id uuid references public.profiles(id);
alter table public.reviewer_assignments add column if not exists assigned_by uuid references public.profiles(id);
alter table public.reviewer_assignments add column if not exists status text not null default 'INVITED';
alter table public.reviewer_assignments alter column status set default 'INVITED';
alter table public.reviewer_assignments add column if not exists invited_at timestamptz not null default timezone('utc', now());
alter table public.reviewer_assignments add column if not exists responded_at timestamptz;
alter table public.reviewer_assignments add column if not exists due_date date;
alter table public.reviewer_assignments add column if not exists recommendation text;
alter table public.reviewer_assignments add column if not exists comments_to_author text;
alter table public.reviewer_assignments add column if not exists comments_to_editor text;
alter table public.reviewer_assignments add column if not exists scientific_merit int;
alter table public.reviewer_assignments add column if not exists novelty_innovation int;
alter table public.reviewer_assignments add column if not exists methodology_quality int;
alter table public.reviewer_assignments add column if not exists literature_adequacy int;
alter table public.reviewer_assignments add column if not exists ethical_compliance int;
alter table public.reviewer_assignments add column if not exists data_reliability int;
alter table public.reviewer_assignments add column if not exists writing_quality int;
alter table public.reviewer_assignments add column if not exists submitted_at timestamptz;
alter table public.reviewer_assignments drop constraint if exists reviewer_assignments_status_check;
alter table public.reviewer_assignments add constraint reviewer_assignments_status_check check (status in ('INVITED','ACCEPTED','DECLINED','SUBMITTED'));
alter table public.reviewer_assignments drop constraint if exists reviewer_assignments_recommendation_check;
alter table public.reviewer_assignments add constraint reviewer_assignments_recommendation_check
  check (recommendation in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT','ADDITIONAL_REVIEW'));

create index if not exists idx_reviewer_assignments_manuscript on public.reviewer_assignments(manuscript_id);
create index if not exists idx_reviewer_assignments_reviewer on public.reviewer_assignments(reviewer_id);

create table if not exists public.manuscript_discussions (id uuid primary key default gen_random_uuid());
alter table public.manuscript_discussions add column if not exists manuscript_id text references public.manuscripts(id) on delete cascade;
alter table public.manuscript_discussions add column if not exists sender_id uuid references public.profiles(id);
alter table public.manuscript_discussions add column if not exists message text not null default '';
alter table public.manuscript_discussions add column if not exists file_name text;
alter table public.manuscript_discussions add column if not exists file_size text;
alter table public.manuscript_discussions add column if not exists created_at timestamptz not null default timezone('utc', now());

create table if not exists public.manuscript_status_history (id uuid primary key default gen_random_uuid());
alter table public.manuscript_status_history add column if not exists manuscript_id text references public.manuscripts(id) on delete cascade;
alter table public.manuscript_status_history add column if not exists from_status text;
alter table public.manuscript_status_history add column if not exists to_status text not null default '';
alter table public.manuscript_status_history add column if not exists actor_id uuid references public.profiles(id);
alter table public.manuscript_status_history add column if not exists note text;
alter table public.manuscript_status_history add column if not exists created_at timestamptz not null default timezone('utc', now());

create index if not exists idx_status_history_manuscript on public.manuscript_status_history(manuscript_id, created_at);

create table if not exists public.workflow_notifications (id uuid primary key default gen_random_uuid());
alter table public.workflow_notifications add column if not exists recipient_id uuid references public.profiles(id);
alter table public.workflow_notifications add column if not exists type text not null default '';
alter table public.workflow_notifications add column if not exists manuscript_id text references public.manuscripts(id) on delete cascade;
alter table public.workflow_notifications add column if not exists title text not null default '';
alter table public.workflow_notifications add column if not exists body text not null default '';
alter table public.workflow_notifications add column if not exists read_at timestamptz;
alter table public.workflow_notifications add column if not exists created_at timestamptz not null default timezone('utc', now());

create index if not exists idx_workflow_notifications_recipient on public.workflow_notifications(recipient_id, created_at desc);

create table if not exists public.audit_log (id uuid primary key default gen_random_uuid());
alter table public.audit_log add column if not exists actor_id uuid references public.profiles(id);
alter table public.audit_log add column if not exists action text not null default '';
alter table public.audit_log add column if not exists manuscript_id text references public.manuscripts(id) on delete set null;
alter table public.audit_log add column if not exists before_status text;
alter table public.audit_log add column if not exists after_status text;
alter table public.audit_log add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.audit_log add column if not exists created_at timestamptz not null default timezone('utc', now());

create index if not exists idx_audit_log_manuscript on public.audit_log(manuscript_id, created_at desc);

-- ------------------------------------------
-- 2. Relationship helper functions (avoid RLS recursion, see 0001's note on
--    is_active_coordinator -- same pattern applied per relationship type).
-- ------------------------------------------

create or replace function public.is_editor_of(p_manuscript_id text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.editor_assignments
    where manuscript_id = p_manuscript_id and editor_id = auth.uid() and status = 'ACCEPTED'
  );
$$;

create or replace function public.is_invited_editor_of(p_manuscript_id text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.editor_assignments
    where manuscript_id = p_manuscript_id and editor_id = auth.uid()
  );
$$;

create or replace function public.is_reviewer_of(p_manuscript_id text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.reviewer_assignments
    where manuscript_id = p_manuscript_id and reviewer_id = auth.uid()
  );
$$;

create or replace function public.is_active_publisher()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'PUBLISHER' and status = 'ACTIVE'
  );
$$;

revoke all on function public.is_editor_of(text) from public;
revoke all on function public.is_invited_editor_of(text) from public;
revoke all on function public.is_reviewer_of(text) from public;
revoke all on function public.is_active_publisher() from public;
grant execute on function public.is_editor_of(text) to authenticated;
grant execute on function public.is_invited_editor_of(text) to authenticated;
grant execute on function public.is_reviewer_of(text) to authenticated;
grant execute on function public.is_active_publisher() to authenticated;

-- ------------------------------------------
-- 3. RLS
-- ------------------------------------------

alter table public.manuscripts enable row level security;
alter table public.manuscript_contributors enable row level security;
alter table public.manuscript_files enable row level security;
alter table public.manuscript_revisions enable row level security;
alter table public.editor_assignments enable row level security;
alter table public.manuscript_suggested_reviewers enable row level security;
alter table public.reviewer_assignments enable row level security;
alter table public.manuscript_discussions enable row level security;
alter table public.manuscript_status_history enable row level security;
alter table public.workflow_notifications enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists "manuscripts_select" on public.manuscripts;
create policy "manuscripts_select" on public.manuscripts
  for select using (
    author_id = auth.uid()
    or assigned_editor_id = auth.uid()
    or public.is_invited_editor_of(id)
    or public.is_reviewer_of(id)
    or public.is_active_coordinator()
    or (public.is_active_publisher() and status in ('ACCEPTED','PUBLISHED'))
  );

-- Authors create their own drafts; author_id/author_name/author_email are
-- forced by the trigger above regardless of what the client sends.
drop policy if exists "manuscripts_insert_author" on public.manuscripts;
create policy "manuscripts_insert_author" on public.manuscripts
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'AUTHOR' and status = 'ACTIVE')
  );

-- Direct client UPDATE is limited to the author editing their own DRAFT
-- content (title/abstract/etc, not status). Every real transition goes
-- through an RPC below instead.
drop policy if exists "manuscripts_update_author_draft" on public.manuscripts;
create policy "manuscripts_update_author_draft" on public.manuscripts
  for update using (author_id = auth.uid() and status = 'DRAFT')
  with check (author_id = auth.uid() and status = 'DRAFT');

revoke update on public.manuscripts from authenticated;
grant update (title, abstract, "references", is_double_blind, cover_letter, language, submission_step, editors_notes)
  on public.manuscripts to authenticated;

drop policy if exists "contributors_select" on public.manuscript_contributors;
create policy "contributors_select" on public.manuscript_contributors
  for select using (
    exists (select 1 from public.manuscripts m where m.id = manuscript_id and (
      m.author_id = auth.uid() or m.assigned_editor_id = auth.uid() or public.is_active_coordinator()
    ))
  );

drop policy if exists "contributors_write_author" on public.manuscript_contributors;
create policy "contributors_write_author" on public.manuscript_contributors
  for all using (
    exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid() and m.status = 'DRAFT')
  ) with check (
    exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid() and m.status = 'DRAFT')
  );

drop policy if exists "files_select" on public.manuscript_files;
create policy "files_select" on public.manuscript_files
  for select using (
    exists (select 1 from public.manuscripts m where m.id = manuscript_id and (
      m.author_id = auth.uid() or m.assigned_editor_id = auth.uid()
      or public.is_reviewer_of(m.id) or public.is_active_coordinator()
    ))
  );

drop policy if exists "files_insert_author" on public.manuscript_files;
create policy "files_insert_author" on public.manuscript_files
  for insert with check (
    uploaded_by = auth.uid()
    and exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
  );

drop policy if exists "revisions_select" on public.manuscript_revisions;
create policy "revisions_select" on public.manuscript_revisions
  for select using (
    exists (select 1 from public.manuscripts m where m.id = manuscript_id and (
      m.author_id = auth.uid() or m.assigned_editor_id = auth.uid() or public.is_active_coordinator()
    ))
  );

drop policy if exists "editor_assignments_select" on public.editor_assignments;
create policy "editor_assignments_select" on public.editor_assignments
  for select using (editor_id = auth.uid() or public.is_active_coordinator());

drop policy if exists "suggested_reviewers_select" on public.manuscript_suggested_reviewers;
create policy "suggested_reviewers_select" on public.manuscript_suggested_reviewers
  for select using (
    exists (select 1 from public.manuscripts m where m.id = manuscript_id and (
      m.author_id = auth.uid() or m.assigned_editor_id = auth.uid() or public.is_active_coordinator()
    ))
  );

drop policy if exists "suggested_reviewers_insert_author" on public.manuscript_suggested_reviewers;
create policy "suggested_reviewers_insert_author" on public.manuscript_suggested_reviewers
  for insert with check (
    suggested_by = 'AUTHOR' and suggested_by_user = auth.uid()
    and exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid() and m.status = 'DRAFT')
  );

drop policy if exists "reviewer_assignments_select" on public.reviewer_assignments;
create policy "reviewer_assignments_select" on public.reviewer_assignments
  for select using (
    reviewer_id = auth.uid()
    or public.is_active_coordinator()
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.assigned_editor_id = auth.uid())
  );

drop policy if exists "discussions_select" on public.manuscript_discussions;
create policy "discussions_select" on public.manuscript_discussions
  for select using (
    exists (select 1 from public.manuscripts m where m.id = manuscript_id and (
      m.author_id = auth.uid() or m.assigned_editor_id = auth.uid()
      or public.is_reviewer_of(m.id) or public.is_active_coordinator()
    ))
  );

drop policy if exists "discussions_insert" on public.manuscript_discussions;
create policy "discussions_insert" on public.manuscript_discussions
  for insert with check (
    sender_id = auth.uid()
    and exists (select 1 from public.manuscripts m where m.id = manuscript_id and (
      m.author_id = auth.uid() or m.assigned_editor_id = auth.uid()
      or public.is_reviewer_of(m.id) or public.is_active_coordinator()
    ))
  );

drop policy if exists "status_history_select" on public.manuscript_status_history;
create policy "status_history_select" on public.manuscript_status_history
  for select using (
    exists (select 1 from public.manuscripts m where m.id = manuscript_id and (
      m.author_id = auth.uid() or m.assigned_editor_id = auth.uid() or public.is_active_coordinator()
    ))
  );

drop policy if exists "notifications_select_own" on public.workflow_notifications;
create policy "notifications_select_own" on public.workflow_notifications
  for select using (recipient_id = auth.uid());

drop policy if exists "notifications_update_own" on public.workflow_notifications;
create policy "notifications_update_own" on public.workflow_notifications
  for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

revoke update on public.workflow_notifications from authenticated;
grant update (read_at) on public.workflow_notifications to authenticated;

drop policy if exists "audit_log_select_coordinator" on public.audit_log;
create policy "audit_log_select_coordinator" on public.audit_log
  for select using (public.is_active_coordinator());

-- ------------------------------------------
-- 4. Workflow RPCs -- the only way status-bearing state actually changes.
--    Every RPC: re-validates caller identity/role, re-validates current
--    manuscript state, writes the change, appends status_history/audit_log,
--    and inserts a notification for whoever needs to act next.
-- ------------------------------------------

create or replace function public._record_transition(
  p_manuscript_id text, p_from text, p_to text, p_action text, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.manuscript_status_history (manuscript_id, from_status, to_status, actor_id, note)
  values (p_manuscript_id, p_from, p_to, auth.uid(), p_note);

  insert into public.audit_log (actor_id, action, manuscript_id, before_status, after_status)
  values (auth.uid(), p_action, p_manuscript_id, p_from, p_to);
end;
$$;

create or replace function public._notify(p_recipient uuid, p_type text, p_manuscript_id text, p_title text, p_body text default '')
returns void language sql security definer set search_path = public as $$
  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  values (p_recipient, p_type, p_manuscript_id, p_title, p_body);
$$;

-- Internal helpers only -- called from inside the RPCs below (which run as
-- the function owner regardless of these grants), never directly by a
-- client. Without this, any authenticated user could call
-- `_notify`/`_record_transition` directly to forge notifications or
-- falsify audit history for any manuscript.
revoke all on function public._record_transition(text, text, text, text, text) from public;
revoke all on function public._notify(uuid, text, text, text, text) from public;

-- Step: Author submits manuscript. DRAFT -> SUBMITTED.
create or replace function public.submit_manuscript(p_manuscript_id text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts;
begin
  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.author_id is distinct from auth.uid() then raise exception 'Only the author may submit this manuscript'; end if;
  if m.status is distinct from 'DRAFT' then raise exception 'Manuscript is not in draft (status=%)', m.status; end if;

  update public.manuscripts set status = 'SUBMITTED', submitted_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where id = p_manuscript_id returning * into m;

  perform public._record_transition(p_manuscript_id, 'DRAFT', 'SUBMITTED', 'submit_manuscript');

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'MANUSCRIPT_SUBMITTED', p_manuscript_id, 'New submission: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return m;
end;
$$;

-- Step: Coordinator assigns an Editor. SUBMITTED -> EDITOR_REVIEW.
create or replace function public.assign_editor(p_manuscript_id text, p_editor_id uuid)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may assign an editor'; end if;
  if not exists (select 1 from public.profiles where id = p_editor_id and role = 'EDITOR' and status = 'ACTIVE') then
    raise exception 'Target is not an active Editor';
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.status is distinct from 'SUBMITTED' then raise exception 'Manuscript is not awaiting editor assignment (status=%)', m.status; end if;

  insert into public.editor_assignments (manuscript_id, editor_id, assigned_by, status, assessment_status)
  values (p_manuscript_id, p_editor_id, auth.uid(), 'INVITED', 'NOT_STARTED');

  update public.manuscripts set assigned_editor_id = p_editor_id, status = 'EDITOR_REVIEW', updated_at = timezone('utc', now())
  where id = p_manuscript_id returning * into m;

  perform public._record_transition(p_manuscript_id, 'SUBMITTED', 'EDITOR_REVIEW', 'assign_editor');
  perform public._notify(p_editor_id, 'EDITOR_ASSIGNED', p_manuscript_id, 'You have been assigned: ' || m.title);

  return m;
end;
$$;

-- Step: Editor accepts/declines their assignment.
create or replace function public.respond_to_editor_assignment(p_assignment_id uuid, p_accept boolean)
returns public.editor_assignments language plpgsql security definer set search_path = public as $$
declare a public.editor_assignments; m public.manuscripts;
begin
  select * into a from public.editor_assignments where id = p_assignment_id for update;
  if a.id is null then raise exception 'Assignment not found'; end if;
  if a.editor_id is distinct from auth.uid() then raise exception 'Not your assignment'; end if;
  if a.status is distinct from 'INVITED' then raise exception 'Assignment already responded to'; end if;

  update public.editor_assignments
  set status = case when p_accept then 'ACCEPTED' else 'DECLINED' end, responded_at = timezone('utc', now())
  where id = p_assignment_id returning * into a;

  select * into m from public.manuscripts where id = a.manuscript_id for update;

  if p_accept then
    perform public._record_transition(a.manuscript_id, m.status, m.status, 'editor_accept');
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'EDITOR_ACCEPTED', a.manuscript_id, 'Editor accepted: ' || m.title, ''
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
  else
    -- Declined: reopen for the Coordinator to assign someone else.
    update public.manuscripts set assigned_editor_id = null, status = 'SUBMITTED', updated_at = timezone('utc', now())
    where id = a.manuscript_id;
    perform public._record_transition(a.manuscript_id, m.status, 'SUBMITTED', 'editor_decline');
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'EDITOR_DECLINED', a.manuscript_id, 'Editor declined, needs reassignment: ' || m.title, ''
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
  end if;

  return a;
end;
$$;

-- Step: Editor submits their evaluation (scores + comments + suggested
-- reviewers) back to the Coordinator. This is the only place suggested
-- reviewers get written with suggested_by='EDITOR'.
create or replace function public.submit_editor_assessment(
  p_assignment_id uuid,
  p_scientific_merit int, p_novelty_innovation int, p_methodology_quality int,
  p_literature_adequacy int, p_ethical_compliance int, p_data_reliability int, p_writing_quality int,
  p_strengths text, p_weaknesses text, p_mandatory_revisions text, p_comments_to_coordinator text,
  p_suggested_reviewers jsonb default '[]'::jsonb -- [{"name":"...","email":"...","note":"..."}]
) returns public.editor_assignments language plpgsql security definer set search_path = public as $$
declare a public.editor_assignments; r jsonb;
begin
  select * into a from public.editor_assignments where id = p_assignment_id for update;
  if a.id is null then raise exception 'Assignment not found'; end if;
  if a.editor_id is distinct from auth.uid() then raise exception 'Not your assignment'; end if;
  if a.status is distinct from 'ACCEPTED' then raise exception 'You must accept the assignment before submitting an assessment'; end if;

  update public.editor_assignments set
    scientific_merit = p_scientific_merit, novelty_innovation = p_novelty_innovation,
    methodology_quality = p_methodology_quality, literature_adequacy = p_literature_adequacy,
    ethical_compliance = p_ethical_compliance, data_reliability = p_data_reliability,
    writing_quality = p_writing_quality, strengths = p_strengths, weaknesses = p_weaknesses,
    mandatory_revisions = p_mandatory_revisions, comments_to_coordinator = p_comments_to_coordinator,
    assessment_status = 'SUBMITTED', assessment_submitted_at = timezone('utc', now())
  where id = p_assignment_id returning * into a;

  for r in select * from jsonb_array_elements(p_suggested_reviewers) loop
    insert into public.manuscript_suggested_reviewers (manuscript_id, suggested_by, suggested_by_user, name, email, note)
    values (a.manuscript_id, 'EDITOR', auth.uid(), r->>'name', coalesce(r->>'email',''), coalesce(r->>'note',''));
  end loop;

  perform public._record_transition(a.manuscript_id, 'EDITOR_REVIEW', 'EDITOR_REVIEW', 'submit_editor_assessment');
  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'EDITOR_ASSESSMENT_SUBMITTED', a.manuscript_id, 'Editor assessment ready for review', ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return a;
end;
$$;

-- Step: Coordinator assigns exactly 2 reviewers and sends invitations.
-- Blocked until the editor's assessment has actually been submitted --
-- this is the "Coordinator reviews assessment before assigning reviewers"
-- checkpoint from the workflow diagram, enforced server-side.
create or replace function public.assign_reviewers(p_manuscript_id text, p_reviewer_ids uuid[])
returns setof public.reviewer_assignments language plpgsql security definer set search_path = public as $$
declare m public.manuscripts; assessed boolean; rid uuid;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may assign reviewers'; end if;
  if array_length(p_reviewer_ids, 1) is distinct from 2 or p_reviewer_ids[1] = p_reviewer_ids[2] then
    raise exception 'Exactly 2 distinct reviewers are required';
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.status is distinct from 'EDITOR_REVIEW' then raise exception 'Manuscript is not ready for reviewer assignment (status=%)', m.status; end if;

  select exists (
    select 1 from public.editor_assignments
    where manuscript_id = p_manuscript_id and status = 'ACCEPTED' and assessment_status = 'SUBMITTED'
  ) into assessed;
  if not assessed then
    raise exception 'The assigned editor has not submitted an assessment yet';
  end if;

  foreach rid in array p_reviewer_ids loop
    if not exists (select 1 from public.profiles where id = rid and role = 'REVIEWER' and status = 'ACTIVE') then
      raise exception 'Reviewer % is not an active reviewer account', rid;
    end if;
    insert into public.reviewer_assignments (manuscript_id, reviewer_id, assigned_by, status)
    values (p_manuscript_id, rid, auth.uid(), 'INVITED');
    perform public._notify(rid, 'REVIEW_INVITATION', p_manuscript_id, 'You are invited to review: ' || m.title);
  end loop;

  update public.manuscripts set status = 'UNDER_REVIEW', updated_at = timezone('utc', now()) where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'EDITOR_REVIEW', 'UNDER_REVIEW', 'assign_reviewers');

  return query select * from public.reviewer_assignments where manuscript_id = p_manuscript_id and reviewer_id = any(p_reviewer_ids);
end;
$$;

-- Step: Reviewer accepts/declines their invitation.
create or replace function public.respond_to_review_invite(p_assignment_id uuid, p_accept boolean)
returns public.reviewer_assignments language plpgsql security definer set search_path = public as $$
declare a public.reviewer_assignments;
begin
  select * into a from public.reviewer_assignments where id = p_assignment_id for update;
  if a.id is null then raise exception 'Invitation not found'; end if;
  if a.reviewer_id is distinct from auth.uid() then raise exception 'Not your invitation'; end if;
  if a.status is distinct from 'INVITED' then raise exception 'Invitation already responded to'; end if;

  update public.reviewer_assignments
  set status = case when p_accept then 'ACCEPTED' else 'DECLINED' end, responded_at = timezone('utc', now())
  where id = p_assignment_id returning * into a;

  if not p_accept then
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'REVIEWER_DECLINED', a.manuscript_id, 'A reviewer declined, may need a replacement', ''
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
  end if;

  return a;
end;
$$;

-- Step: Reviewer submits their review. When both (non-declined) reviewers
-- for the manuscript have submitted, the manuscript moves to
-- AWAITING_DECISION.
create or replace function public.submit_review(
  p_assignment_id uuid, p_recommendation text, p_comments_to_author text, p_comments_to_editor text,
  p_scientific_merit int, p_novelty_innovation int, p_methodology_quality int,
  p_literature_adequacy int, p_ethical_compliance int, p_data_reliability int, p_writing_quality int
) returns public.reviewer_assignments language plpgsql security definer set search_path = public as $$
declare a public.reviewer_assignments; m public.manuscripts; still_pending int;
begin
  select * into a from public.reviewer_assignments where id = p_assignment_id for update;
  if a.id is null then raise exception 'Assignment not found'; end if;
  if a.reviewer_id is distinct from auth.uid() then raise exception 'Not your review'; end if;
  if a.status is distinct from 'ACCEPTED' then raise exception 'You must accept the invitation before submitting a review'; end if;
  if p_recommendation not in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT','ADDITIONAL_REVIEW') then
    raise exception 'Invalid recommendation';
  end if;

  update public.reviewer_assignments set
    status = 'SUBMITTED', submitted_at = timezone('utc', now()),
    recommendation = p_recommendation, comments_to_author = p_comments_to_author, comments_to_editor = p_comments_to_editor,
    scientific_merit = p_scientific_merit, novelty_innovation = p_novelty_innovation,
    methodology_quality = p_methodology_quality, literature_adequacy = p_literature_adequacy,
    ethical_compliance = p_ethical_compliance, data_reliability = p_data_reliability, writing_quality = p_writing_quality
  where id = p_assignment_id returning * into a;

  select * into m from public.manuscripts where id = a.manuscript_id for update;

  select count(*) into still_pending from public.reviewer_assignments
  where manuscript_id = a.manuscript_id and status in ('INVITED','ACCEPTED');

  if still_pending = 0 and m.status = 'UNDER_REVIEW' then
    update public.manuscripts set status = 'AWAITING_DECISION', updated_at = timezone('utc', now()) where id = a.manuscript_id;
    perform public._record_transition(a.manuscript_id, 'UNDER_REVIEW', 'AWAITING_DECISION', 'all_reviews_submitted');
    if m.assigned_editor_id is not null then
      perform public._notify(m.assigned_editor_id, 'REVIEWS_COMPLETE', a.manuscript_id, 'All reviews are in for: ' || m.title);
    end if;
  end if;

  return a;
end;
$$;

-- Step: Editor reviews submitted reviewer feedback and gives a final
-- recommendation. Blocked until the manuscript is actually AWAITING_DECISION
-- (i.e. both reviews are in) -- fixes the old UI's bug of only requiring 1.
create or replace function public.submit_editor_recommendation(p_manuscript_id text, p_recommendation text)
returns public.editor_assignments language plpgsql security definer set search_path = public as $$
declare m public.manuscripts; a public.editor_assignments;
begin
  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.assigned_editor_id is distinct from auth.uid() then raise exception 'Only the assigned editor may recommend'; end if;
  if m.status is distinct from 'AWAITING_DECISION' then raise exception 'Not all reviews are in yet (status=%)', m.status; end if;
  if p_recommendation not in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT','ADDITIONAL_REVIEW') then
    raise exception 'Invalid recommendation';
  end if;

  update public.editor_assignments
  set recommendation = p_recommendation, recommendation_submitted_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id and editor_id = auth.uid() and status = 'ACCEPTED'
  returning * into a;

  if a.id is null then raise exception 'No active editor assignment found'; end if;

  perform public._record_transition(p_manuscript_id, 'AWAITING_DECISION', 'AWAITING_DECISION', 'submit_editor_recommendation');
  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor recommendation ready to verify: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return a;
end;
$$;

-- Step: Coordinator verifies and publishes the decision to the Author.
-- Blocked until the editor has actually given a recommendation.
create or replace function public.publish_decision(p_manuscript_id text, p_decision text, p_decision_letter text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts; rec text; next_status text; rev_count int;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may publish a decision'; end if;
  if p_decision not in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT') then raise exception 'Invalid decision'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.status is distinct from 'AWAITING_DECISION' then raise exception 'Manuscript is not awaiting a decision (status=%)', m.status; end if;

  select recommendation into rec from public.editor_assignments
  where manuscript_id = p_manuscript_id and status = 'ACCEPTED' order by assigned_at desc limit 1;
  if rec is null then raise exception 'Editor has not submitted a recommendation yet'; end if;

  next_status := case p_decision
    when 'ACCEPT' then 'ACCEPTED'
    when 'REJECT' then 'REJECTED'
    else 'REVISION_REQUESTED'
  end;

  update public.manuscripts set status = next_status, updated_at = timezone('utc', now()) where id = p_manuscript_id;

  if next_status = 'REVISION_REQUESTED' then
    select count(*) into rev_count from public.manuscript_revisions where manuscript_id = p_manuscript_id;
    insert into public.manuscript_revisions (manuscript_id, revision_number, requested_by, decision_letter, status)
    values (p_manuscript_id, rev_count + 1, auth.uid(), p_decision_letter, 'AWAITING_AUTHOR_UPLOAD');
  end if;

  perform public._record_transition(p_manuscript_id, 'AWAITING_DECISION', next_status, 'publish_decision', p_decision_letter);
  perform public._notify(m.author_id, 'DECISION_PUBLISHED', p_manuscript_id, 'Decision on your manuscript: ' || m.title, p_decision_letter);

  select * into m from public.manuscripts where id = p_manuscript_id;
  return m;
end;
$$;

-- Step: Author revises and resubmits. REVISION_REQUESTED -> EDITOR_REVIEW
-- (loops back for the editor to re-evaluate, per "repeat until final decision").
create or replace function public.submit_revision(p_manuscript_id text, p_response_note text default '')
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts; rev public.manuscript_revisions;
begin
  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.author_id is distinct from auth.uid() then raise exception 'Only the author may submit a revision'; end if;
  if m.status is distinct from 'REVISION_REQUESTED' then raise exception 'No revision is pending (status=%)', m.status; end if;

  select * into rev from public.manuscript_revisions
  where manuscript_id = p_manuscript_id and status = 'AWAITING_AUTHOR_UPLOAD' order by revision_number desc limit 1;
  if rev.id is null then raise exception 'No pending revision record found'; end if;

  update public.manuscript_revisions set status = 'REVISION_SUBMITTED', submitted_at = timezone('utc', now()) where id = rev.id;
  update public.editor_assignments set assessment_status = 'NOT_STARTED', assessment_submitted_at = null
  where manuscript_id = p_manuscript_id and status = 'ACCEPTED';
  update public.manuscripts set status = 'EDITOR_REVIEW', updated_at = timezone('utc', now()) where id = p_manuscript_id;

  perform public._record_transition(p_manuscript_id, 'REVISION_REQUESTED', 'EDITOR_REVIEW', 'submit_revision', p_response_note);
  if m.assigned_editor_id is not null then
    perform public._notify(m.assigned_editor_id, 'REVISION_SUBMITTED', p_manuscript_id, 'Author submitted a revision: ' || m.title);
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id;
  return m;
end;
$$;

-- Step: production publish (DOI/volume/issue). ACCEPTED -> PUBLISHED.
-- Coordinator or Publisher role, matching the kept Publisher workspace.
create or replace function public.mark_published(p_manuscript_id text, p_doi text, p_volume text, p_issue text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts;
begin
  if not (public.is_active_coordinator() or public.is_active_publisher()) then
    raise exception 'Only a Coordinator or Publisher may publish to production';
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.status is distinct from 'ACCEPTED' then raise exception 'Manuscript is not accepted yet (status=%)', m.status; end if;

  update public.manuscripts
  set status = 'PUBLISHED', doi = p_doi, volume = p_volume, issue = p_issue, published_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where id = p_manuscript_id returning * into m;

  perform public._record_transition(p_manuscript_id, 'ACCEPTED', 'PUBLISHED', 'mark_published');
  perform public._notify(m.author_id, 'MANUSCRIPT_PUBLISHED', p_manuscript_id, 'Your manuscript is published: ' || m.title);

  return m;
end;
$$;

revoke all on function public.submit_manuscript(text) from public;
revoke all on function public.assign_editor(text, uuid) from public;
revoke all on function public.respond_to_editor_assignment(uuid, boolean) from public;
revoke all on function public.submit_editor_assessment(uuid,int,int,int,int,int,int,int,text,text,text,text,jsonb) from public;
revoke all on function public.assign_reviewers(text, uuid[]) from public;
revoke all on function public.respond_to_review_invite(uuid, boolean) from public;
revoke all on function public.submit_review(uuid,text,text,text,int,int,int,int,int,int,int) from public;
revoke all on function public.submit_editor_recommendation(text, text) from public;
revoke all on function public.publish_decision(text, text, text) from public;
revoke all on function public.submit_revision(text, text) from public;
revoke all on function public.mark_published(text, text, text, text) from public;

grant execute on function public.submit_manuscript(text) to authenticated;
grant execute on function public.assign_editor(text, uuid) to authenticated;
grant execute on function public.respond_to_editor_assignment(uuid, boolean) to authenticated;
grant execute on function public.submit_editor_assessment(uuid,int,int,int,int,int,int,int,text,text,text,text,jsonb) to authenticated;
grant execute on function public.assign_reviewers(text, uuid[]) to authenticated;
grant execute on function public.respond_to_review_invite(uuid, boolean) to authenticated;
grant execute on function public.submit_review(uuid,text,text,text,int,int,int,int,int,int,int) to authenticated;
grant execute on function public.submit_editor_recommendation(text, text) to authenticated;
grant execute on function public.publish_decision(text, text, text) to authenticated;
grant execute on function public.submit_revision(text, text) to authenticated;
grant execute on function public.mark_published(text, text, text, text) to authenticated;

-- ------------------------------------------
-- 5. Storage: manuscript-files bucket, ownership-scoped instead of
--    blanket "any authenticated user".
-- ------------------------------------------

insert into storage.buckets (id, name, public)
values ('manuscript-files', 'manuscript-files', true)
on conflict (id) do nothing;

drop policy if exists "Manuscript files are public" on storage.objects;
drop policy if exists "Authenticated users can upload manuscript files" on storage.objects;
drop policy if exists "Authenticated users can update/delete manuscript files" on storage.objects;
drop policy if exists "manuscript_files_public_read" on storage.objects;
drop policy if exists "manuscript_files_owner_write" on storage.objects;
drop policy if exists "manuscript_files_owner_manage" on storage.objects;

create policy "manuscript_files_public_read" on storage.objects
  for select using (bucket_id = 'manuscript-files');

-- Files are uploaded under `${manuscript_id}/...` -- only the manuscript's
-- own author may upload into its folder.
create policy "manuscript_files_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'manuscript-files'
    and exists (
      select 1 from public.manuscripts m
      where m.id = split_part(name, '/', 1) and m.author_id = auth.uid()
    )
  );

create policy "manuscript_files_owner_manage" on storage.objects
  for update using (
    bucket_id = 'manuscript-files'
    and exists (select 1 from public.manuscripts m where m.id = split_part(name, '/', 1) and m.author_id = auth.uid())
  );
