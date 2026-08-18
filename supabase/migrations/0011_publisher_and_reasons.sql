-- ==========================================
-- Module 11: Per-criterion evaluation reasons + explicit Coordinator->
-- Publisher hand-off + final published PDF storage.
--
-- Three independent additions, all additive (no data loss, no destructive
-- changes to existing rows):
--
-- 1. `criteria_reasons` jsonb on editor_assignments/reviewer_assignments --
--    lets the Editor/Reviewer attach a free-text reason to each of the 7
--    scored criteria (keyed the same as the existing camelCase score
--    fields, e.g. {"scientificMerit": "...", "noveltyInnovation": "..."}).
--    submit_editor_assessment / submit_review both gain an extra jsonb
--    parameter to accept and store it; existing rows simply default to '{}'.
--
-- 2. `production_stage` + `published_pdf_url` on manuscripts, and a new
--    send_to_publisher() RPC -- a Coordinator must explicitly hand an
--    ACCEPTED manuscript to Publishers (production_stage set) before any
--    Publisher can see it; previously any ACCEPTED/PUBLISHED manuscript was
--    visible to every Publisher the instant it was accepted.
--
-- 3. mark_published() gains an optional p_published_pdf_url param and now
--    also sets production_stage = 'PUBLISHED'.
--
-- Depends on: 0002_manuscripts_workflow.sql. Safe to re-run.
-- ==========================================

-- ------------------------------------------
-- 1. Per-criterion evaluation reasons
-- ------------------------------------------

alter table public.editor_assignments add column if not exists criteria_reasons jsonb not null default '{}'::jsonb;
alter table public.reviewer_assignments add column if not exists criteria_reasons jsonb not null default '{}'::jsonb;

drop function if exists public.submit_editor_assessment(uuid,int,int,int,int,int,int,int,text,text,text,text,jsonb);

create or replace function public.submit_editor_assessment(
  p_assignment_id uuid,
  p_scientific_merit int, p_novelty_innovation int, p_methodology_quality int,
  p_literature_adequacy int, p_ethical_compliance int, p_data_reliability int, p_writing_quality int,
  p_strengths text, p_weaknesses text, p_mandatory_revisions text, p_comments_to_coordinator text,
  p_suggested_reviewers jsonb default '[]'::jsonb, -- [{"name":"...","email":"...","note":"..."}]
  p_criteria_reasons jsonb default '{}'::jsonb -- {"scientificMerit":"...", ...}
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
    criteria_reasons = coalesce(p_criteria_reasons, '{}'::jsonb),
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

revoke all on function public.submit_editor_assessment(uuid,int,int,int,int,int,int,int,text,text,text,text,jsonb,jsonb) from public;
grant execute on function public.submit_editor_assessment(uuid,int,int,int,int,int,int,int,text,text,text,text,jsonb,jsonb) to authenticated;

drop function if exists public.submit_review(uuid,text,text,text,int,int,int,int,int,int,int);

create or replace function public.submit_review(
  p_assignment_id uuid, p_recommendation text, p_comments_to_author text, p_comments_to_editor text,
  p_scientific_merit int, p_novelty_innovation int, p_methodology_quality int,
  p_literature_adequacy int, p_ethical_compliance int, p_data_reliability int, p_writing_quality int,
  p_criteria_reasons jsonb default '{}'::jsonb
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
    ethical_compliance = p_ethical_compliance, data_reliability = p_data_reliability, writing_quality = p_writing_quality,
    criteria_reasons = coalesce(p_criteria_reasons, '{}'::jsonb)
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

revoke all on function public.submit_review(uuid,text,text,text,int,int,int,int,int,int,int,jsonb) from public;
grant execute on function public.submit_review(uuid,text,text,text,int,int,int,int,int,int,int,jsonb) to authenticated;

-- ------------------------------------------
-- 1b. Record which kind of revision was requested (MINOR/MAJOR) on the
--     manuscript_revisions row itself -- publish_decision previously only
--     stored the free-text decision_letter, so the UI had no reliable way
--     to label "Minor Revision Requested" vs "Major Revision Requested".
-- ------------------------------------------

alter table public.manuscript_revisions add column if not exists decision_type text;
alter table public.manuscript_revisions drop constraint if exists manuscript_revisions_decision_type_check;
alter table public.manuscript_revisions add constraint manuscript_revisions_decision_type_check
  check (decision_type is null or decision_type in ('MINOR_REVISION','MAJOR_REVISION'));

drop function if exists public.publish_decision(text, text, text);

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
    insert into public.manuscript_revisions (manuscript_id, revision_number, requested_by, decision_letter, decision_type, status)
    values (p_manuscript_id, rev_count + 1, auth.uid(), p_decision_letter, p_decision, 'AWAITING_AUTHOR_UPLOAD');
  end if;

  perform public._record_transition(p_manuscript_id, 'AWAITING_DECISION', next_status, 'publish_decision', p_decision_letter);
  perform public._notify(m.author_id, 'DECISION_PUBLISHED', p_manuscript_id, 'Decision on your manuscript: ' || m.title, p_decision_letter);

  select * into m from public.manuscripts where id = p_manuscript_id;
  return m;
end;
$$;

revoke all on function public.publish_decision(text, text, text) from public;
grant execute on function public.publish_decision(text, text, text) to authenticated;

-- ------------------------------------------
-- 2. Coordinator -> Publisher hand-off
-- ------------------------------------------

alter table public.manuscripts add column if not exists production_stage text;
alter table public.manuscripts add column if not exists published_pdf_url text;
alter table public.manuscripts drop constraint if exists manuscripts_production_stage_check;
alter table public.manuscripts add constraint manuscripts_production_stage_check
  check (production_stage is null or production_stage in ('SENT_TO_PUBLISHER','PUBLISHED'));

drop policy if exists "manuscripts_select" on public.manuscripts;
create policy "manuscripts_select" on public.manuscripts
  for select using (
    author_id = auth.uid()
    or assigned_editor_id = auth.uid()
    or public.is_invited_editor_of(id)
    or public.is_reviewer_of(id)
    or public.is_active_coordinator()
    or (public.is_active_publisher() and status in ('ACCEPTED','PUBLISHED') and production_stage is not null)
  );

create or replace function public.send_to_publisher(p_manuscript_id text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may move a manuscript to Publisher'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.status is distinct from 'ACCEPTED' then raise exception 'Manuscript is not accepted yet (status=%)', m.status; end if;
  if m.production_stage is not null then raise exception 'Manuscript has already been moved to production (stage=%)', m.production_stage; end if;

  update public.manuscripts set production_stage = 'SENT_TO_PUBLISHER', updated_at = timezone('utc', now())
  where id = p_manuscript_id returning * into m;

  perform public._record_transition(p_manuscript_id, 'ACCEPTED', 'ACCEPTED', 'send_to_publisher');

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'MOVED_TO_PUBLISHER', p_manuscript_id, 'Ready for production: ' || m.title, ''
  from public.profiles where role = 'PUBLISHER' and status = 'ACTIVE';

  return m;
end;
$$;

revoke all on function public.send_to_publisher(text) from public;
grant execute on function public.send_to_publisher(text) to authenticated;

-- ------------------------------------------
-- 3. mark_published gains a PDF url param and sets production_stage
-- ------------------------------------------

drop function if exists public.mark_published(text, text, text, text);

create or replace function public.mark_published(p_manuscript_id text, p_doi text, p_volume text, p_issue text, p_published_pdf_url text default null)
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
  set status = 'PUBLISHED', doi = p_doi, volume = p_volume, issue = p_issue,
      published_pdf_url = coalesce(p_published_pdf_url, published_pdf_url),
      production_stage = 'PUBLISHED',
      published_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where id = p_manuscript_id returning * into m;

  perform public._record_transition(p_manuscript_id, 'ACCEPTED', 'PUBLISHED', 'mark_published');
  perform public._notify(m.author_id, 'MANUSCRIPT_PUBLISHED', p_manuscript_id, 'Your manuscript is published: ' || m.title);

  return m;
end;
$$;

revoke all on function public.mark_published(text, text, text, text, text) from public;
grant execute on function public.mark_published(text, text, text, text, text) to authenticated;

-- Allow Coordinator/Publisher to upload the final galley PDF into a
-- manuscript's storage folder (previously only the author could write
-- there). Uploads happen under `${manuscriptId}/published/...`.
drop policy if exists "manuscript_files_production_write" on storage.objects;
create policy "manuscript_files_production_write" on storage.objects
  for insert with check (
    bucket_id = 'manuscript-files'
    and exists (
      select 1 from public.manuscripts m
      where m.id = split_part(name, '/', 1)
        and (public.is_active_coordinator() or public.is_active_publisher())
    )
  );
