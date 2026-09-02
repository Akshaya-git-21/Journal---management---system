-- ==========================================
-- Module 47: Production module.
--
-- Adds a Coordinator-owned post-acceptance production/proofing workflow as
-- a completely separate layer on top of an ACCEPTED manuscript. This
-- migration never modifies `manuscripts.status`, its check constraint, or
-- any existing RPC (publish_decision / mark_published / send_to_publisher
-- are untouched -- production_publish() below only *calls* the existing
-- mark_published() to actually flip status to PUBLISHED, reusing its
-- security/behavior rather than duplicating it).
--
-- New tables: manuscript_production (1 row per manuscript, production
-- sub-status), manuscript_production_checklist (11 copyediting items),
-- manuscript_proofs (versioned, never overwritten), and
-- manuscript_production_corrections (author correction submissions).
-- Communication history reuses manuscript_discussions (new 'PRODUCTION'
-- channel), notifications reuse workflow_notifications/_notify(), and the
-- audit trail reuses manuscript_status_history/audit_log/_record_transition()
-- -- all untouched, just called from the new RPCs below.
--
-- Depends on: 0002_manuscripts_workflow.sql, 0011_publisher_and_reasons.sql,
-- 0016_private_coordinator_author_channel.sql. Safe to re-run.
-- ==========================================

-- ------------------------------------------
-- 1. Tables
-- ------------------------------------------

create table if not exists public.manuscript_production (
  manuscript_id text primary key references public.manuscripts(id) on delete cascade
);
alter table public.manuscript_production add column if not exists production_status text not null default 'NOT_STARTED';
alter table public.manuscript_production add column if not exists assigned_to uuid references public.profiles(id);
alter table public.manuscript_production add column if not exists current_proof_version int not null default 0;
alter table public.manuscript_production add column if not exists accepted_at timestamptz not null default timezone('utc', now());
alter table public.manuscript_production add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.manuscript_production add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.manuscript_production drop constraint if exists manuscript_production_status_check;
alter table public.manuscript_production add constraint manuscript_production_status_check
  check (production_status in (
    'NOT_STARTED','IN_PRODUCTION','COPYEDITING','FORMATTING','TYPESETTING',
    'PROOF_GENERATED','PROOF_SENT_TO_AUTHOR','AUTHOR_PROOF_REVIEW',
    'CORRECTIONS_SUBMITTED','PRODUCTION_REVIEW','PROOF_UPDATED',
    'CLARIFICATION_REQUESTED','AUTHOR_APPROVED','READY_FOR_PUBLICATION','PUBLISHED'
  ));

create table if not exists public.manuscript_production_checklist (id uuid primary key default gen_random_uuid());
alter table public.manuscript_production_checklist add column if not exists manuscript_id text references public.manuscripts(id) on delete cascade;
alter table public.manuscript_production_checklist add column if not exists item_key text not null default '';
alter table public.manuscript_production_checklist add column if not exists item_label text not null default '';
alter table public.manuscript_production_checklist add column if not exists status text not null default 'PENDING';
alter table public.manuscript_production_checklist add column if not exists updated_by uuid references public.profiles(id);
alter table public.manuscript_production_checklist add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.manuscript_production_checklist drop constraint if exists manuscript_production_checklist_status_check;
alter table public.manuscript_production_checklist add constraint manuscript_production_checklist_status_check
  check (status in ('PENDING','IN_PROGRESS','COMPLETED'));
alter table public.manuscript_production_checklist drop constraint if exists manuscript_production_checklist_unique_item;
alter table public.manuscript_production_checklist add constraint manuscript_production_checklist_unique_item
  unique (manuscript_id, item_key);

create table if not exists public.manuscript_proofs (id uuid primary key default gen_random_uuid());
alter table public.manuscript_proofs add column if not exists manuscript_id text references public.manuscripts(id) on delete cascade;
alter table public.manuscript_proofs add column if not exists version int not null default 1;
alter table public.manuscript_proofs add column if not exists file_name text not null default '';
alter table public.manuscript_proofs add column if not exists storage_path text not null default '';
alter table public.manuscript_proofs add column if not exists public_url text;
alter table public.manuscript_proofs add column if not exists uploaded_by uuid references public.profiles(id);
alter table public.manuscript_proofs add column if not exists uploaded_at timestamptz not null default timezone('utc', now());
alter table public.manuscript_proofs add column if not exists sent_to_author_at timestamptz;
alter table public.manuscript_proofs add column if not exists approved_at timestamptz;

alter table public.manuscript_proofs drop constraint if exists manuscript_proofs_unique_version;
alter table public.manuscript_proofs add constraint manuscript_proofs_unique_version unique (manuscript_id, version);

create table if not exists public.manuscript_production_corrections (id uuid primary key default gen_random_uuid());
alter table public.manuscript_production_corrections add column if not exists manuscript_id text references public.manuscripts(id) on delete cascade;
alter table public.manuscript_production_corrections add column if not exists proof_version int not null default 1;
alter table public.manuscript_production_corrections add column if not exists comments text not null default '';
alter table public.manuscript_production_corrections add column if not exists attachment_storage_path text not null default '';
alter table public.manuscript_production_corrections add column if not exists attachment_public_url text;
alter table public.manuscript_production_corrections add column if not exists attachment_file_name text;
alter table public.manuscript_production_corrections add column if not exists status text not null default 'SUBMITTED';
alter table public.manuscript_production_corrections add column if not exists submitted_at timestamptz not null default timezone('utc', now());
alter table public.manuscript_production_corrections add column if not exists reviewed_by uuid references public.profiles(id);
alter table public.manuscript_production_corrections add column if not exists reviewed_at timestamptz;

alter table public.manuscript_production_corrections drop constraint if exists manuscript_production_corrections_status_check;
alter table public.manuscript_production_corrections add constraint manuscript_production_corrections_status_check
  check (status in ('SUBMITTED','REVIEWED'));

create index if not exists idx_production_checklist_manuscript on public.manuscript_production_checklist(manuscript_id);
create index if not exists idx_proofs_manuscript on public.manuscript_proofs(manuscript_id, version);
create index if not exists idx_production_corrections_manuscript on public.manuscript_production_corrections(manuscript_id, submitted_at desc);

-- 'PRODUCTION' channel on the existing discussion thread -- reused for
-- clarification request/response history instead of a new comms table.
alter table public.manuscript_discussions drop constraint if exists manuscript_discussions_channel_check;
alter table public.manuscript_discussions add constraint manuscript_discussions_channel_check
  check (channel in ('GENERAL', 'COORDINATOR_AUTHOR', 'PRODUCTION'));

-- ------------------------------------------
-- 2. RLS -- coordinator sees everything, author sees only their own
--    manuscript's production rows. No direct write grants: all writes go
--    through the security-definer RPCs below.
-- ------------------------------------------

alter table public.manuscript_production enable row level security;
alter table public.manuscript_production_checklist enable row level security;
alter table public.manuscript_proofs enable row level security;
alter table public.manuscript_production_corrections enable row level security;

drop policy if exists "manuscript_production_select" on public.manuscript_production;
create policy "manuscript_production_select" on public.manuscript_production
  for select using (
    public.is_active_coordinator()
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
  );

drop policy if exists "manuscript_production_checklist_select" on public.manuscript_production_checklist;
create policy "manuscript_production_checklist_select" on public.manuscript_production_checklist
  for select using (
    public.is_active_coordinator()
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
  );

drop policy if exists "manuscript_proofs_select" on public.manuscript_proofs;
create policy "manuscript_proofs_select" on public.manuscript_proofs
  for select using (
    public.is_active_coordinator()
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
  );

drop policy if exists "manuscript_production_corrections_select" on public.manuscript_production_corrections;
create policy "manuscript_production_corrections_select" on public.manuscript_production_corrections
  for select using (
    public.is_active_coordinator()
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
  );

-- Coordinator/Author write proof + correction files under a new
-- ${manuscriptId}/production/... prefix in the existing bucket, mirroring
-- manuscript_files_production_write from 0011_publisher_and_reasons.sql.
drop policy if exists "manuscript_files_production_module_write" on storage.objects;
create policy "manuscript_files_production_module_write" on storage.objects
  for insert with check (
    bucket_id = 'manuscript-files'
    and exists (
      select 1 from public.manuscripts m
      where m.id = split_part(name, '/', 1)
        and (
          public.is_active_coordinator()
          or (m.author_id = auth.uid() and name like '%/production/corrections/%')
        )
    )
  );

-- ------------------------------------------
-- 3. RPCs
-- ------------------------------------------

create or replace function public.start_production(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare m public.manuscripts; p public.manuscript_production;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may start production'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.status is distinct from 'ACCEPTED' then raise exception 'Manuscript is not accepted yet (status=%)', m.status; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is not null and p.production_status <> 'NOT_STARTED' then
    raise exception 'Production has already started for this manuscript';
  end if;

  if p.manuscript_id is null then
    insert into public.manuscript_production (manuscript_id, production_status, assigned_to)
    values (p_manuscript_id, 'IN_PRODUCTION', auth.uid())
    returning * into p;
  else
    update public.manuscript_production
    set production_status = 'IN_PRODUCTION', assigned_to = auth.uid(), updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id
    returning * into p;
  end if;

  insert into public.manuscript_production_checklist (manuscript_id, item_key, item_label)
  values
    (p_manuscript_id, 'grammar_spelling', 'Grammar & Spelling'),
    (p_manuscript_id, 'language_corrections', 'Language Corrections'),
    (p_manuscript_id, 'formatting', 'Formatting'),
    (p_manuscript_id, 'journal_template_formatting', 'Journal Template Formatting'),
    (p_manuscript_id, 'references_checking', 'References Checking'),
    (p_manuscript_id, 'figures_placement', 'Figures Placement'),
    (p_manuscript_id, 'tables_placement', 'Tables Placement'),
    (p_manuscript_id, 'captions_legends', 'Captions / Legends'),
    (p_manuscript_id, 'author_names_affiliations', 'Author Names & Affiliations'),
    (p_manuscript_id, 'metadata_verification', 'Metadata Verification'),
    (p_manuscript_id, 'doi_metadata_prep', 'DOI / Article Metadata Preparation')
  on conflict (manuscript_id, item_key) do nothing;

  perform public._record_transition(p_manuscript_id, 'ACCEPTED', 'IN_PRODUCTION', 'start_production');
  return p;
end;
$$;

revoke all on function public.start_production(text) from public;
grant execute on function public.start_production(text) to authenticated;

create or replace function public.update_checklist_item(p_manuscript_id text, p_item_key text, p_status text)
returns public.manuscript_production_checklist language plpgsql security definer set search_path = public as $$
declare item public.manuscript_production_checklist; p public.manuscript_production;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may update the checklist'; end if;
  if p_status not in ('PENDING','IN_PROGRESS','COMPLETED') then raise exception 'Invalid status'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;

  update public.manuscript_production_checklist
  set status = p_status, updated_by = auth.uid(), updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id and item_key = p_item_key
  returning * into item;
  if item.id is null then raise exception 'Checklist item not found'; end if;

  if p.production_status = 'IN_PRODUCTION' and p_status <> 'PENDING' then
    update public.manuscript_production set production_status = 'COPYEDITING', updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id;
    perform public._record_transition(p_manuscript_id, 'IN_PRODUCTION', 'COPYEDITING', 'update_checklist_item');
  end if;

  return item;
end;
$$;

revoke all on function public.update_checklist_item(text, text, text) from public;
grant execute on function public.update_checklist_item(text, text, text) to authenticated;

create or replace function public.advance_production_stage(p_manuscript_id text, p_to_stage text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; incomplete int;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may advance the production stage'; end if;
  if p_to_stage not in ('FORMATTING','TYPESETTING') then raise exception 'Invalid target stage'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;

  if p_to_stage = 'FORMATTING' then
    if p.production_status <> 'COPYEDITING' then raise exception 'Manuscript is not in Copyediting (status=%)', p.production_status; end if;
    select count(*) into incomplete from public.manuscript_production_checklist
    where manuscript_id = p_manuscript_id and status <> 'COMPLETED';
    if incomplete > 0 then raise exception 'All copyediting checklist items must be completed first'; end if;
  elsif p_to_stage = 'TYPESETTING' then
    if p.production_status <> 'FORMATTING' then raise exception 'Manuscript is not in Formatting (status=%)', p.production_status; end if;
  end if;

  update public.manuscript_production set production_status = p_to_stage, updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  perform public._record_transition(p_manuscript_id, p.production_status, p_to_stage, 'advance_production_stage');
  return p;
end;
$$;

revoke all on function public.advance_production_stage(text, text) from public;
grant execute on function public.advance_production_stage(text, text) to authenticated;

create or replace function public.generate_proof(p_manuscript_id text, p_storage_path text, p_public_url text, p_file_name text)
returns public.manuscript_proofs language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; proof public.manuscript_proofs; next_version int;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may generate a proof'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status not in ('TYPESETTING','PROOF_SENT_TO_AUTHOR','CORRECTIONS_SUBMITTED','PRODUCTION_REVIEW') then
    raise exception 'Manuscript is not ready for a proof (status=%)', p.production_status;
  end if;

  next_version := p.current_proof_version + 1;

  insert into public.manuscript_proofs (manuscript_id, version, file_name, storage_path, public_url, uploaded_by)
  values (p_manuscript_id, next_version, p_file_name, p_storage_path, p_public_url, auth.uid())
  returning * into proof;

  update public.manuscript_production
  set current_proof_version = next_version,
      production_status = case when next_version = 1 then 'PROOF_GENERATED' else 'PROOF_UPDATED' end,
      updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  perform public._record_transition(p_manuscript_id, p.production_status, p.production_status, 'generate_proof',
    'Proof v' || next_version || ' generated');
  return proof;
end;
$$;

revoke all on function public.generate_proof(text, text, text, text) from public;
grant execute on function public.generate_proof(text, text, text, text) to authenticated;

create or replace function public.send_proof_to_author(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may send the proof to the Author'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status not in ('PROOF_GENERATED','PROOF_UPDATED') then
    raise exception 'No new proof to send (status=%)', p.production_status;
  end if;

  update public.manuscript_proofs set sent_to_author_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id and version = p.current_proof_version;

  update public.manuscript_production set production_status = 'PROOF_SENT_TO_AUTHOR', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'PROOF_GENERATED', 'PROOF_SENT_TO_AUTHOR', 'send_proof_to_author',
    'Proof v' || p.current_proof_version || ' sent to author');
  perform public._notify(m.author_id, 'PROOF_SENT', p_manuscript_id,
    'Your final proof is ready: ' || m.title, 'Proof v' || p.current_proof_version || ' is ready for your review.');

  return p;
end;
$$;

revoke all on function public.send_proof_to_author(text) from public;
grant execute on function public.send_proof_to_author(text) to authenticated;

create or replace function public.author_open_proof(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.author_id is distinct from auth.uid() then raise exception 'Not your manuscript'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;

  if p.production_status = 'PROOF_SENT_TO_AUTHOR' then
    update public.manuscript_production set production_status = 'AUTHOR_PROOF_REVIEW', updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;
    perform public._record_transition(p_manuscript_id, 'PROOF_SENT_TO_AUTHOR', 'AUTHOR_PROOF_REVIEW', 'author_open_proof',
      'Author opened Proof v' || p.current_proof_version);
  end if;

  return p;
end;
$$;

revoke all on function public.author_open_proof(text) from public;
grant execute on function public.author_open_proof(text) to authenticated;

create or replace function public.author_approve_proof(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.author_id is distinct from auth.uid() then raise exception 'Not your manuscript'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status not in ('AUTHOR_PROOF_REVIEW','PROOF_SENT_TO_AUTHOR') then
    raise exception 'No proof awaiting your approval (status=%)', p.production_status;
  end if;

  update public.manuscript_proofs set approved_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id and version = p.current_proof_version;

  update public.manuscript_production set production_status = 'AUTHOR_APPROVED', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  perform public._record_transition(p_manuscript_id, 'AUTHOR_PROOF_REVIEW', 'AUTHOR_APPROVED', 'author_approve_proof',
    'Author approved Proof v' || p.current_proof_version);

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'PROOF_APPROVED', p_manuscript_id, 'Author approved the final proof: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return p;
end;
$$;

revoke all on function public.author_approve_proof(text) from public;
grant execute on function public.author_approve_proof(text) to authenticated;

create or replace function public.author_submit_corrections(
  p_manuscript_id text, p_comments text, p_storage_path text, p_public_url text, p_file_name text
) returns public.manuscript_production_corrections language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; c public.manuscript_production_corrections;
begin
  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.author_id is distinct from auth.uid() then raise exception 'Not your manuscript'; end if;
  if coalesce(trim(p_storage_path), '') = '' then raise exception 'An attachment is required to request corrections'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status not in ('AUTHOR_PROOF_REVIEW','PROOF_SENT_TO_AUTHOR') then
    raise exception 'No proof awaiting your review (status=%)', p.production_status;
  end if;

  insert into public.manuscript_production_corrections
    (manuscript_id, proof_version, comments, attachment_storage_path, attachment_public_url, attachment_file_name)
  values (p_manuscript_id, p.current_proof_version, p_comments, p_storage_path, p_public_url, p_file_name)
  returning * into c;

  update public.manuscript_production set production_status = 'CORRECTIONS_SUBMITTED', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id;

  perform public._record_transition(p_manuscript_id, 'AUTHOR_PROOF_REVIEW', 'CORRECTIONS_SUBMITTED', 'author_submit_corrections',
    'Author submitted corrections for Proof v' || p.current_proof_version);

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'CORRECTIONS_SUBMITTED', p_manuscript_id, 'Author submitted proof corrections: ' || m.title, p_comments
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return c;
end;
$$;

revoke all on function public.author_submit_corrections(text, text, text, text, text) from public;
grant execute on function public.author_submit_corrections(text, text, text, text, text) to authenticated;

create or replace function public.request_clarification(p_manuscript_id text, p_message text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may request clarification'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;

  insert into public.manuscript_discussions (manuscript_id, sender_id, message, channel)
  values (p_manuscript_id, auth.uid(), p_message, 'PRODUCTION');

  update public.manuscript_production set production_status = 'CLARIFICATION_REQUESTED', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  perform public._record_transition(p_manuscript_id, 'CORRECTIONS_SUBMITTED', 'CLARIFICATION_REQUESTED', 'request_clarification', p_message);
  perform public._notify(m.author_id, 'CLARIFICATION_REQUESTED', p_manuscript_id, 'Clarification requested: ' || m.title, p_message);

  return p;
end;
$$;

revoke all on function public.request_clarification(text, text) from public;
grant execute on function public.request_clarification(text, text) to authenticated;

create or replace function public.respond_clarification(p_manuscript_id text, p_message text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.author_id is distinct from auth.uid() then raise exception 'Not your manuscript'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'CLARIFICATION_REQUESTED' then
    raise exception 'No clarification request is pending (status=%)', p.production_status;
  end if;

  insert into public.manuscript_discussions (manuscript_id, sender_id, message, channel)
  values (p_manuscript_id, auth.uid(), p_message, 'PRODUCTION');

  update public.manuscript_production set production_status = 'PRODUCTION_REVIEW', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  perform public._record_transition(p_manuscript_id, 'CLARIFICATION_REQUESTED', 'PRODUCTION_REVIEW', 'respond_clarification', p_message);

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'CLARIFICATION_RESPONSE', p_manuscript_id, 'Author responded to clarification request: ' || m.title, p_message
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return p;
end;
$$;

revoke all on function public.respond_clarification(text, text) from public;
grant execute on function public.respond_clarification(text, text) to authenticated;

create or replace function public.accept_corrections(p_manuscript_id text, p_correction_id uuid)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may review corrections'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;

  update public.manuscript_production_corrections
  set status = 'REVIEWED', reviewed_by = auth.uid(), reviewed_at = timezone('utc', now())
  where id = p_correction_id and manuscript_id = p_manuscript_id;

  if p.production_status in ('CORRECTIONS_SUBMITTED','CLARIFICATION_REQUESTED') then
    update public.manuscript_production set production_status = 'PRODUCTION_REVIEW', updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;
    perform public._record_transition(p_manuscript_id, 'CORRECTIONS_SUBMITTED', 'PRODUCTION_REVIEW', 'accept_corrections');
  end if;

  return p;
end;
$$;

revoke all on function public.accept_corrections(text, uuid) from public;
grant execute on function public.accept_corrections(text, uuid) to authenticated;

create or replace function public.production_publish(p_manuscript_id text, p_doi text, p_volume text, p_issue text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; latest_url text; m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may publish'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'AUTHOR_APPROVED' then
    raise exception 'Manuscript is not approved by the author yet (status=%)', p.production_status;
  end if;

  select public_url into latest_url from public.manuscript_proofs
  where manuscript_id = p_manuscript_id and version = p.current_proof_version;

  update public.manuscript_production set production_status = 'READY_FOR_PUBLICATION', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'AUTHOR_APPROVED', 'READY_FOR_PUBLICATION', 'production_publish');

  -- Reuse the existing, unmodified publication RPC -- this is the only
  -- place the Production module ever touches manuscripts.status.
  select * into m from public.mark_published(p_manuscript_id, p_doi, p_volume, p_issue, latest_url);

  update public.manuscript_production set production_status = 'PUBLISHED', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'READY_FOR_PUBLICATION', 'PUBLISHED', 'production_publish');

  return m;
end;
$$;

revoke all on function public.production_publish(text, text, text, text) from public;
grant execute on function public.production_publish(text, text, text, text) to authenticated;

-- ------------------------------------------
-- 4. Realtime
-- ------------------------------------------

do $$
declare
  t text;
  tables text[] := array[
    'manuscript_production',
    'manuscript_production_checklist',
    'manuscript_proofs',
    'manuscript_production_corrections'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      )
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
