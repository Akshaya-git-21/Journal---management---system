-- ==========================================
-- Module 69: Post-acceptance Proof -> GD -> Author -> Editor -> Final Author
-- Approval -> Publication workflow redesign.
--
-- Scope: ONLY the proof/correction loop after a proof exists. Does NOT touch
-- authentication, roles, the copyediting checklist (0055/0056), storage
-- bucket conventions, GD Member assignment (0051), or publication metadata
-- /publish RPCs (0065) beyond what's needed so gd_member_publish_article()
-- still fires once both approvals are present. Every existing RPC not
-- rewired below (accept_corrections, request_clarification,
-- respond_clarification, coordinator_send_corrections_to_editor,
-- coordinator_send_for_corrections, coordinator_return_proof_to_gd_member,
-- coordinator_return_for_further_corrections,
-- coordinator_confirm_proofreading_completed,
-- editor_submit_production_feedback, legacy production_publish) is left
-- installed and untouched -- the redesigned UI simply stops calling them.
--
-- New rule, enforced entirely inside the RPCs below (never inferred by the
-- frontend from separate flags):
--  - GD uploads Proof v1            -> Author (first review)
--  - GD uploads any correction round -> ALWAYS the Editor, regardless of
--    whether the correction was requested by the Author or the Editor
--    (gd_member_upload_proof_v2's version=1 vs version>1 branch is the one
--    place this is decided).
--  - Editor always gets exactly two actions on production_status =
--    'PROOF_SENT_TO_EDITOR': Approve (-> Author Final Review, never
--    publishes directly) or Corrections Required (-> back to GD, loops to
--    Editor again, never to the Author).
--  - Publication (READY_FOR_PUBLICATION) requires editor_approved_version =
--    author_final_approved_version = current_proof_version; any new
--    correction after an Editor approval nulls it out immediately.
--  - manuscript_proof_reviews is an append-only per-decision history table
--    (never overwritten) recording every Author-first/Editor/Author-final
--    decision, who made it, when, the correction source, and whether it was
--    later superseded by a newer version.
-- ==========================================

-- ------------------------------------------
-- 1. Schema
-- ------------------------------------------

alter table public.manuscript_production drop constraint if exists manuscript_production_status_check;
alter table public.manuscript_production add constraint manuscript_production_status_check
  check (production_status in (
    'NOT_STARTED','IN_PRODUCTION','COPYEDITING','FORMATTING','TYPESETTING',
    'PROOF_GENERATED','PROOF_SUBMITTED_TO_COORDINATOR','PROOF_SENT_TO_AUTHOR','AUTHOR_PROOF_REVIEW',
    'CORRECTIONS_SUBMITTED','PRODUCTION_REVIEW','PROOF_UPDATED',
    'CLARIFICATION_REQUESTED','AUTHOR_APPROVED','READY_FOR_PUBLICATION','PUBLISHED',
    'CORRECTIONS_IN_PROGRESS','FINAL_PROOF_READY',
    'PROOF_SENT_TO_EDITOR','EDITOR_CORRECTIONS_REQUESTED',
    'PROOF_SENT_TO_AUTHOR_FINAL','AUTHOR_FINAL_CORRECTIONS_REQUESTED'
  ));

alter table public.manuscript_production add column if not exists editor_approved_version int;
alter table public.manuscript_production add column if not exists editor_approved_at timestamptz;
alter table public.manuscript_production add column if not exists editor_approved_by uuid references public.profiles(id);
alter table public.manuscript_production add column if not exists author_final_approved_version int;
alter table public.manuscript_production add column if not exists author_final_approved_at timestamptz;
alter table public.manuscript_production add column if not exists pending_review_role text;
alter table public.manuscript_production drop constraint if exists manuscript_production_pending_review_role_check;
alter table public.manuscript_production add constraint manuscript_production_pending_review_role_check
  check (pending_review_role is null or pending_review_role in ('AUTHOR_FIRST','EDITOR','AUTHOR_FINAL'));

alter table public.manuscript_production_corrections add column if not exists correction_source text;
alter table public.manuscript_production_corrections drop constraint if exists manuscript_production_corrections_source_check;
alter table public.manuscript_production_corrections add constraint manuscript_production_corrections_source_check
  check (correction_source is null or correction_source in ('AUTHOR','EDITOR'));

create table if not exists public.manuscript_proof_reviews (id uuid primary key default gen_random_uuid());
alter table public.manuscript_proof_reviews add column if not exists manuscript_id text references public.manuscripts(id) on delete cascade;
alter table public.manuscript_proof_reviews add column if not exists proof_version int not null default 1;
alter table public.manuscript_proof_reviews add column if not exists reviewer_role text not null default 'AUTHOR_FIRST';
alter table public.manuscript_proof_reviews add column if not exists decision text not null default 'APPROVED';
alter table public.manuscript_proof_reviews add column if not exists comments text not null default '';
alter table public.manuscript_proof_reviews add column if not exists attachment_storage_path text;
alter table public.manuscript_proof_reviews add column if not exists attachment_public_url text;
alter table public.manuscript_proof_reviews add column if not exists attachment_file_name text;
alter table public.manuscript_proof_reviews add column if not exists correction_source text;
alter table public.manuscript_proof_reviews add column if not exists decided_by uuid references public.profiles(id);
alter table public.manuscript_proof_reviews add column if not exists decided_at timestamptz not null default timezone('utc', now());
alter table public.manuscript_proof_reviews add column if not exists superseded_at timestamptz;
alter table public.manuscript_proof_reviews add column if not exists superseded_by_version int;

alter table public.manuscript_proof_reviews drop constraint if exists manuscript_proof_reviews_role_check;
alter table public.manuscript_proof_reviews add constraint manuscript_proof_reviews_role_check
  check (reviewer_role in ('AUTHOR_FIRST','EDITOR','AUTHOR_FINAL','COORDINATOR_OVERRIDE'));
alter table public.manuscript_proof_reviews drop constraint if exists manuscript_proof_reviews_decision_check;
alter table public.manuscript_proof_reviews add constraint manuscript_proof_reviews_decision_check
  check (decision in ('APPROVED','CORRECTIONS_REQUESTED','OVERRIDE'));
alter table public.manuscript_proof_reviews drop constraint if exists manuscript_proof_reviews_source_check;
alter table public.manuscript_proof_reviews add constraint manuscript_proof_reviews_source_check
  check (correction_source is null or correction_source in ('AUTHOR','EDITOR'));

create index if not exists idx_proof_reviews_manuscript on public.manuscript_proof_reviews(manuscript_id, proof_version, decided_at desc);

alter table public.manuscript_proof_reviews enable row level security;

drop policy if exists "manuscript_proof_reviews_select" on public.manuscript_proof_reviews;
create policy "manuscript_proof_reviews_select" on public.manuscript_proof_reviews
  for select using (
    public.is_active_coordinator()
    or (public.is_active_gd_member() and public.is_gd_member_assigned_to(manuscript_id))
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
    or public.is_invited_editor_of(manuscript_id)
  );

-- ------------------------------------------
-- 2. RPCs
-- ------------------------------------------

-- Single upload entry point for this loop. Replaces gd_member_upload_proof
-- (0059) and gd_member_upload_corrected_proof (0064) for the proof/approval
-- flow -- the two prior functions are left installed, unused, for anything
-- outside this loop that might still reference them. Routing is decided
-- purely by whether this is the first version (-> Author) or a correction
-- round (-> Editor, always), never by who requested the correction.
create or replace function public.gd_member_upload_proof_v2(
  p_manuscript_id text, p_storage_path text, p_public_url text, p_file_name text, p_notes text default ''
) returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare
  p public.manuscript_production;
  proof public.manuscript_proofs;
  m public.manuscripts;
  next_version int;
  prior_status text;
  editor_row record;
begin
  if not public.is_active_gd_member() or not public.is_gd_member_assigned_to(p_manuscript_id) then
    raise exception 'Only the GD Member assigned to this manuscript may upload its proof';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;

  if p.current_proof_version = 0 then
    if p.production_status not in ('TYPESETTING','PROOF_GENERATED') then
      raise exception 'Manuscript is not ready for proof preparation (status=%)', p.production_status;
    end if;
  else
    if p.production_status not in ('CORRECTIONS_IN_PROGRESS','EDITOR_CORRECTIONS_REQUESTED','AUTHOR_FINAL_CORRECTIONS_REQUESTED') then
      raise exception 'Manuscript is not awaiting a corrected proof (status=%)', p.production_status;
    end if;
  end if;
  prior_status := p.production_status;
  next_version := p.current_proof_version + 1;

  insert into public.manuscript_proofs (manuscript_id, version, file_name, storage_path, public_url, uploaded_by, gd_notes)
  values (p_manuscript_id, next_version, p_file_name, p_storage_path, p_public_url, auth.uid(), coalesce(p_notes, ''))
  returning * into proof;

  -- Rule 6: a fresh upload always invalidates any standing approval.
  if p.editor_approved_version is not null then
    update public.manuscript_proof_reviews
    set superseded_at = timezone('utc', now()), superseded_by_version = next_version
    where manuscript_id = p_manuscript_id and reviewer_role = 'EDITOR'
      and proof_version = p.editor_approved_version and superseded_at is null;
  end if;
  if p.author_final_approved_version is not null then
    update public.manuscript_proof_reviews
    set superseded_at = timezone('utc', now()), superseded_by_version = next_version
    where manuscript_id = p_manuscript_id and reviewer_role = 'AUTHOR_FINAL'
      and proof_version = p.author_final_approved_version and superseded_at is null;
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id;

  if next_version = 1 then
    update public.manuscript_production
    set current_proof_version = next_version, production_status = 'PROOF_SENT_TO_AUTHOR', pending_review_role = 'AUTHOR_FIRST',
        editor_approved_version = null, editor_approved_at = null, editor_approved_by = null,
        author_final_approved_version = null, author_final_approved_at = null,
        updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, prior_status, 'PROOF_SENT_TO_AUTHOR', 'gd_member_upload_proof_v2',
      'GD Member uploaded Proof v' || next_version || '; sent to Author');
    perform public._notify(m.author_id, 'PROOF_SENT', p_manuscript_id, 'Your proof is ready: ' || m.title,
      'Proof v' || next_version || ' is ready for your review.');
  else
    update public.manuscript_production
    set current_proof_version = next_version, production_status = 'PROOF_SENT_TO_EDITOR', pending_review_role = 'EDITOR',
        sent_to_editor_at = timezone('utc', now()),
        editor_approved_version = null, editor_approved_at = null, editor_approved_by = null,
        author_final_approved_version = null, author_final_approved_at = null,
        updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, prior_status, 'PROOF_SENT_TO_EDITOR', 'gd_member_upload_proof_v2',
      'GD Member uploaded Proof v' || next_version || '; sent to Editor');

    for editor_row in
      select editor_id from public.editor_assignments where manuscript_id = p_manuscript_id and status = 'ACCEPTED'
    loop
      perform public._notify(editor_row.editor_id, 'PRODUCTION_CORRECTIONS_FOR_VERIFICATION', p_manuscript_id,
        'Proof v' || next_version || ' ready for your review: ' || coalesce(m.title, p_manuscript_id), '');
    end loop;
  end if;

  return p;
end;
$$;

revoke all on function public.gd_member_upload_proof_v2(text, text, text, text, text) from public;
grant execute on function public.gd_member_upload_proof_v2(text, text, text, text, text) to authenticated;

-- Author, first-round review: request corrections. Always routes to the GD
-- Member; the next proof upload always routes onward to the Editor (never
-- straight back to the Author), enforced in gd_member_upload_proof_v2 above.
create or replace function public.author_submit_corrections(
  p_manuscript_id text, p_comments text, p_storage_path text, p_public_url text, p_file_name text
) returns public.manuscript_production_corrections language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; c public.manuscript_production_corrections;
begin
  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.author_id is distinct from auth.uid() then raise exception 'Not your manuscript'; end if;
  if coalesce(trim(p_comments), '') = '' then raise exception 'Comments are required to request corrections'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status not in ('AUTHOR_PROOF_REVIEW','PROOF_SENT_TO_AUTHOR') then
    raise exception 'No proof awaiting your review (status=%)', p.production_status;
  end if;

  insert into public.manuscript_production_corrections
    (manuscript_id, proof_version, comments, attachment_storage_path, attachment_public_url, attachment_file_name, correction_source)
  values (p_manuscript_id, p.current_proof_version, p_comments, coalesce(p_storage_path, ''), p_public_url, p_file_name, 'AUTHOR')
  returning * into c;

  insert into public.manuscript_proof_reviews
    (manuscript_id, proof_version, reviewer_role, decision, comments, attachment_storage_path, attachment_public_url, attachment_file_name, correction_source, decided_by)
  values (p_manuscript_id, p.current_proof_version, 'AUTHOR_FIRST', 'CORRECTIONS_REQUESTED', p_comments,
    nullif(p_storage_path, ''), p_public_url, p_file_name, 'AUTHOR', auth.uid());

  update public.manuscript_production
  set production_status = 'CORRECTIONS_IN_PROGRESS', pending_review_role = null, updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id;

  perform public._record_transition(p_manuscript_id, p.production_status, 'CORRECTIONS_IN_PROGRESS', 'author_submit_corrections',
    'Author submitted corrections for Proof v' || p.current_proof_version);

  if p.assigned_to is not null then
    perform public._notify(p.assigned_to, 'CORRECTIONS_SUBMITTED', p_manuscript_id, 'Author submitted proof corrections: ' || m.title, p_comments);
  end if;

  return c;
end;
$$;

revoke all on function public.author_submit_corrections(text, text, text, text, text) from public;
grant execute on function public.author_submit_corrections(text, text, text, text, text) to authenticated;

-- Author, first-round review: approve. Per confirmed product decision,
-- Editor sign-off is always required before publication, even when the
-- Author approves immediately with zero corrections -- so this always
-- routes onward to the Editor, never straight to Ready for Publication.
create or replace function public.author_approve_proof(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; editor_row record;
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

  insert into public.manuscript_proof_reviews (manuscript_id, proof_version, reviewer_role, decision, comments, decided_by)
  values (p_manuscript_id, p.current_proof_version, 'AUTHOR_FIRST', 'APPROVED', '', auth.uid());

  update public.manuscript_production
  set production_status = 'PROOF_SENT_TO_EDITOR', pending_review_role = 'EDITOR', sent_to_editor_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  perform public._record_transition(p_manuscript_id, 'AUTHOR_PROOF_REVIEW', 'PROOF_SENT_TO_EDITOR', 'author_approve_proof',
    'Author approved Proof v' || p.current_proof_version || '; sent to Editor for review');

  for editor_row in
    select editor_id from public.editor_assignments where manuscript_id = p_manuscript_id and status = 'ACCEPTED'
  loop
    perform public._notify(editor_row.editor_id, 'PRODUCTION_CORRECTIONS_FOR_VERIFICATION', p_manuscript_id,
      'Author-approved proof ready for your review: ' || m.title, '');
  end loop;

  return p;
end;
$$;

revoke all on function public.author_approve_proof(text) from public;
grant execute on function public.author_approve_proof(text) to authenticated;

-- Editor's decision. Always exactly two valid actions, and the ONLY status
-- this accepts is PROOF_SENT_TO_EDITOR -- so the frontend never has to guess
-- which of several statuses means "show my two buttons".
create or replace function public.editor_review_proof(p_manuscript_id text, p_decision text, p_comments text default '')
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; c public.manuscript_production_corrections;
begin
  if p_decision not in ('APPROVE','CORRECTIONS_REQUIRED') then raise exception 'Invalid decision'; end if;
  if not public.is_invited_editor_of(p_manuscript_id) then raise exception 'Only the assigned Editor may review this proof'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'PROOF_SENT_TO_EDITOR' then
    raise exception 'No proof is currently awaiting your review (status=%)', p.production_status;
  end if;

  if p_decision = 'CORRECTIONS_REQUIRED' then
    if coalesce(trim(p_comments), '') = '' then raise exception 'Comments are required to request corrections'; end if;

    insert into public.manuscript_production_corrections (manuscript_id, proof_version, comments, correction_source)
    values (p_manuscript_id, p.current_proof_version, p_comments, 'EDITOR')
    returning * into c;

    insert into public.manuscript_proof_reviews (manuscript_id, proof_version, reviewer_role, decision, comments, correction_source, decided_by)
    values (p_manuscript_id, p.current_proof_version, 'EDITOR', 'CORRECTIONS_REQUESTED', p_comments, 'EDITOR', auth.uid());

    update public.manuscript_production
    set production_status = 'EDITOR_CORRECTIONS_REQUESTED', pending_review_role = null, updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'PROOF_SENT_TO_EDITOR', 'EDITOR_CORRECTIONS_REQUESTED', 'editor_review_proof', p_comments);

    if p.assigned_to is not null then
      perform public._notify(p.assigned_to, 'CORRECTIONS_PACKAGE_READY', p_manuscript_id,
        'Editor requested corrections: ' || coalesce(m.title, p_manuscript_id), p_comments);
    end if;
  else
    insert into public.manuscript_proof_reviews (manuscript_id, proof_version, reviewer_role, decision, comments, decided_by)
    values (p_manuscript_id, p.current_proof_version, 'EDITOR', 'APPROVED', coalesce(p_comments, ''), auth.uid());

    update public.manuscript_production
    set production_status = 'PROOF_SENT_TO_AUTHOR_FINAL', pending_review_role = 'AUTHOR_FINAL',
        editor_approved_version = current_proof_version, editor_approved_by = auth.uid(), editor_approved_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'PROOF_SENT_TO_EDITOR', 'PROOF_SENT_TO_AUTHOR_FINAL', 'editor_review_proof',
      'Editor approved Proof v' || p.current_proof_version || '; sent to Author for final review');

    perform public._notify(m.author_id, 'PROOF_SENT', p_manuscript_id,
      'Editor-approved proof ready for your final review: ' || m.title,
      'Proof v' || p.current_proof_version || ' has been approved by the editorial team.');
  end if;

  return p;
end;
$$;

revoke all on function public.editor_review_proof(text, text, text) from public;
grant execute on function public.editor_review_proof(text, text, text) to authenticated;

-- Author's Final Review, distinct from the first-round review above. Only
-- valid on PROOF_SENT_TO_AUTHOR_FINAL (i.e. only after an Editor approval).
-- Approve requires the Editor's approval to still be current for this exact
-- version (defensive Rule 5 check); requesting corrections immediately nulls
-- the Editor approval (Rule 6) and always routes the next GD upload back to
-- the Editor, never straight back to the Author.
create or replace function public.author_final_review_proof(
  p_manuscript_id text, p_decision text, p_comments text default '',
  p_storage_path text default '', p_public_url text default '', p_file_name text default ''
) returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; c public.manuscript_production_corrections;
begin
  if p_decision not in ('APPROVE','CORRECTIONS_REQUIRED') then raise exception 'Invalid decision'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.author_id is distinct from auth.uid() then raise exception 'Not your manuscript'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'PROOF_SENT_TO_AUTHOR_FINAL' then
    raise exception 'No proof is currently awaiting your final review (status=%)', p.production_status;
  end if;

  if p_decision = 'CORRECTIONS_REQUIRED' then
    if coalesce(trim(p_comments), '') = '' then raise exception 'Comments are required to request corrections'; end if;

    insert into public.manuscript_production_corrections
      (manuscript_id, proof_version, comments, attachment_storage_path, attachment_public_url, attachment_file_name, correction_source)
    values (p_manuscript_id, p.current_proof_version, p_comments, coalesce(p_storage_path, ''), p_public_url, p_file_name, 'AUTHOR')
    returning * into c;

    insert into public.manuscript_proof_reviews
      (manuscript_id, proof_version, reviewer_role, decision, comments, attachment_storage_path, attachment_public_url, attachment_file_name, correction_source, decided_by)
    values (p_manuscript_id, p.current_proof_version, 'AUTHOR_FINAL', 'CORRECTIONS_REQUESTED', p_comments,
      nullif(p_storage_path, ''), p_public_url, p_file_name, 'AUTHOR', auth.uid());

    if p.editor_approved_version is not null then
      update public.manuscript_proof_reviews
      set superseded_at = timezone('utc', now())
      where manuscript_id = p_manuscript_id and reviewer_role = 'EDITOR'
        and proof_version = p.editor_approved_version and superseded_at is null;
    end if;

    update public.manuscript_production
    set production_status = 'AUTHOR_FINAL_CORRECTIONS_REQUESTED', pending_review_role = null,
        editor_approved_version = null, editor_approved_at = null, editor_approved_by = null,
        updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'PROOF_SENT_TO_AUTHOR_FINAL', 'AUTHOR_FINAL_CORRECTIONS_REQUESTED',
      'author_final_review_proof', p_comments);

    if p.assigned_to is not null then
      perform public._notify(p.assigned_to, 'CORRECTIONS_PACKAGE_READY', p_manuscript_id,
        'Author requested corrections on final review: ' || coalesce(m.title, p_manuscript_id), p_comments);
    end if;
  else
    if p.editor_approved_version is distinct from p.current_proof_version then
      raise exception 'Editor approval is not current for this proof version -- cannot give final approval';
    end if;

    update public.manuscript_proofs set approved_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id and version = p.current_proof_version;

    insert into public.manuscript_proof_reviews (manuscript_id, proof_version, reviewer_role, decision, comments, decided_by)
    values (p_manuscript_id, p.current_proof_version, 'AUTHOR_FINAL', 'APPROVED', coalesce(p_comments, ''), auth.uid());

    update public.manuscript_production
    set production_status = 'READY_FOR_PUBLICATION', pending_review_role = null,
        author_final_approved_version = current_proof_version, author_final_approved_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'PROOF_SENT_TO_AUTHOR_FINAL', 'READY_FOR_PUBLICATION',
      'author_final_review_proof', 'Author gave final approval on Proof v' || p.current_proof_version);

    if p.assigned_to is not null then
      perform public._notify(p.assigned_to, 'READY_FOR_PUBLICATION', p_manuscript_id,
        'Ready for publication: ' || coalesce(m.title, p_manuscript_id),
        'Both editorial and author final approval are in -- enter publication metadata and publish when ready.');
    end if;
  end if;

  return p;
end;
$$;

revoke all on function public.author_final_review_proof(text, text, text, text, text, text) from public;
grant execute on function public.author_final_review_proof(text, text, text, text, text, text) to authenticated;

-- Narrow Coordinator escape hatch to un-stick a manuscript stuck in this
-- loop (e.g. wrong file uploaded). Every override is itself permanently
-- logged in manuscript_proof_reviews with the given reason.
create or replace function public.coordinator_override_route(p_manuscript_id text, p_new_status text, p_reason text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; prior_status text; new_pending text;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may override the review routing'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to override routing'; end if;
  if p_new_status not in (
    'PROOF_SENT_TO_AUTHOR','AUTHOR_PROOF_REVIEW','CORRECTIONS_IN_PROGRESS','PROOF_SENT_TO_EDITOR',
    'EDITOR_CORRECTIONS_REQUESTED','PROOF_SENT_TO_AUTHOR_FINAL','AUTHOR_FINAL_CORRECTIONS_REQUESTED','READY_FOR_PUBLICATION'
  ) then
    raise exception 'Invalid target status for override';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  prior_status := p.production_status;

  new_pending := case p_new_status
    when 'PROOF_SENT_TO_AUTHOR' then 'AUTHOR_FIRST'
    when 'AUTHOR_PROOF_REVIEW' then 'AUTHOR_FIRST'
    when 'PROOF_SENT_TO_EDITOR' then 'EDITOR'
    when 'PROOF_SENT_TO_AUTHOR_FINAL' then 'AUTHOR_FINAL'
    else null
  end;

  update public.manuscript_production
  set production_status = p_new_status, pending_review_role = new_pending, updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  insert into public.manuscript_proof_reviews (manuscript_id, proof_version, reviewer_role, decision, comments, decided_by)
  values (p_manuscript_id, p.current_proof_version, 'COORDINATOR_OVERRIDE', 'OVERRIDE', p_reason, auth.uid());

  perform public._record_transition(p_manuscript_id, prior_status, p_new_status, 'coordinator_override_route', p_reason);

  return p;
end;
$$;

revoke all on function public.coordinator_override_route(text, text, text) from public;
grant execute on function public.coordinator_override_route(text, text, text) to authenticated;

-- ------------------------------------------
-- 3. Realtime
-- ------------------------------------------

do $$
begin
  if to_regclass('public.manuscript_proof_reviews') is not null
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'manuscript_proof_reviews'
    )
  then
    execute 'alter publication supabase_realtime add table public.manuscript_proof_reviews';
  end if;
end $$;
