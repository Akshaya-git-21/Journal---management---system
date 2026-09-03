-- ==========================================
-- Module 65: Tasks 16-21 -- Coordinator reviews the GD Member's corrected
-- proof, the existing Author-approval loop closes it out, the Coordinator
-- hands off to "Ready for Publication", and the GD Member (not a separate
-- Publisher) enters publication metadata and publishes.
--
-- Key design choice: this is almost entirely ADDITIVE reuse of existing
-- infrastructure rather than a new state machine --
--  - "Send Final Proof to Author" (Task 16) reuses send_proof_to_author()
--    (0047/0059) unchanged except one more allowed prior status.
--  - Author's Accept / Request Corrections (Task 17) reuses
--    author_approve_proof() / author_submit_corrections() (0047) verbatim --
--    those already work for ANY round, not just the first proof, so no
--    round-2 author code is needed at all.
--  - "Request Corrections" routes back through the exact same
--    Coordinator -> Editor -> Coordinator -> GD Member loop already built
--    in 0061/0062/0063/0064 -- also verbatim, no changes.
-- Only genuinely new pieces: returning a not-good-enough corrected proof
-- straight back to the GD Member (skipping the author), the Coordinator's
-- proofreading-complete handoff, and GD-Member-driven publication metadata
-- + publish (replacing the Coordinator's old one-click production_publish()
-- for this flow -- that RPC is left intact, just no longer wired to a UI
-- button, since "do not introduce a new Publisher role" but publishing
-- authority now needs to include the GD Member too).
-- ==========================================

alter table public.manuscripts add column if not exists page_numbers text;
alter table public.manuscripts add column if not exists article_url text;
alter table public.manuscripts add column if not exists publication_date date;

-- ------------------------------------------
-- Task 16a: Coordinator sends the GD Member's corrected proof on to the
-- Author, same action/RPC as the original "send proof to author", just
-- also valid once the proof has come back through a correction round.
-- ------------------------------------------

create or replace function public.send_proof_to_author(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; prior_status text;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may send the proof to the Author'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status not in ('PROOF_GENERATED','PROOF_UPDATED','PROOF_SUBMITTED_TO_COORDINATOR','FINAL_PROOF_READY') then
    raise exception 'No new proof to send (status=%)', p.production_status;
  end if;
  prior_status := p.production_status;

  update public.manuscript_proofs set sent_to_author_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id and version = p.current_proof_version;

  update public.manuscript_production set production_status = 'PROOF_SENT_TO_AUTHOR', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, prior_status, 'PROOF_SENT_TO_AUTHOR', 'send_proof_to_author',
    'Proof v' || p.current_proof_version || ' sent to author');
  perform public._notify(m.author_id, 'PROOF_SENT', p_manuscript_id,
    'Your final proof is ready: ' || m.title, 'Proof v' || p.current_proof_version || ' is ready for your review.');

  return p;
end;
$$;

revoke all on function public.send_proof_to_author(text) from public;
grant execute on function public.send_proof_to_author(text) to authenticated;

-- ------------------------------------------
-- Task 16b: Coordinator is not satisfied with the corrected proof --
-- straight back to the GD Member (skips the author entirely; the GD
-- Member's Task 15 "Corrected Proof" panel already handles this since it's
-- gated purely on production_status = 'CORRECTIONS_IN_PROGRESS', not on
-- how the manuscript got there).
-- ------------------------------------------

create or replace function public.coordinator_return_for_further_corrections(p_manuscript_id text, p_note text default null)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may return a proof for further corrections'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'FINAL_PROOF_READY' then
    raise exception 'No final proof awaiting review (status=%)', p.production_status;
  end if;
  if p.assigned_to is null then raise exception 'No GD Member is assigned to this manuscript'; end if;

  update public.manuscript_production set production_status = 'CORRECTIONS_IN_PROGRESS', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'FINAL_PROOF_READY', 'CORRECTIONS_IN_PROGRESS', 'coordinator_return_for_further_corrections', p_note);
  perform public._notify(p.assigned_to, 'CORRECTIONS_PACKAGE_READY', p_manuscript_id,
    'Further corrections requested: ' || coalesce(m.title, p_manuscript_id), coalesce(p_note, ''));

  return p;
end;
$$;

revoke all on function public.coordinator_return_for_further_corrections(text, text) from public;
grant execute on function public.coordinator_return_for_further_corrections(text, text) to authenticated;

-- ------------------------------------------
-- Task 18: Coordinator confirms proofreading is fully done -- the important
-- handoff from proofreading to publishing. Valid once the Author has
-- approved a proof (AUTHOR_APPROVED), whether that happened on the very
-- first round or after N correction rounds -- same status either way.
-- ------------------------------------------

create or replace function public.coordinator_confirm_proofreading_completed(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may confirm proofreading is completed'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'AUTHOR_APPROVED' then
    raise exception 'Author has not approved a final proof yet (status=%)', p.production_status;
  end if;

  update public.manuscript_production set production_status = 'READY_FOR_PUBLICATION', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'AUTHOR_APPROVED', 'READY_FOR_PUBLICATION', 'coordinator_confirm_proofreading_completed');
  if p.assigned_to is not null then
    perform public._notify(p.assigned_to, 'READY_FOR_PUBLICATION', p_manuscript_id,
      'Ready for publication: ' || coalesce(m.title, p_manuscript_id), 'Proofreading is complete -- enter publication metadata and publish when ready.');
  end if;

  return p;
end;
$$;

revoke all on function public.coordinator_confirm_proofreading_completed(text) from public;
grant execute on function public.coordinator_confirm_proofreading_completed(text) to authenticated;

-- ------------------------------------------
-- Task 20: GD Member enters/edits publication metadata while
-- READY_FOR_PUBLICATION. "Save Draft" and "Edit" are the same action --
-- metadata is a plain upsert onto the manuscripts row, no separate draft
-- table. Validation (required fields) is enforced at publish time, not
-- here, so the GD Member can save partial progress.
-- ------------------------------------------

create or replace function public.gd_member_save_publication_metadata(
  p_manuscript_id text, p_volume text, p_issue text, p_publication_date date,
  p_page_numbers text, p_doi text, p_article_url text
) returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if not public.is_active_gd_member() or not public.is_gd_member_assigned_to(p_manuscript_id) then
    raise exception 'Only the GD Member assigned to this manuscript may edit its publication metadata';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id;
  if p.manuscript_id is null or p.production_status <> 'READY_FOR_PUBLICATION' then
    raise exception 'Manuscript is not ready for publication metadata (status=%)', coalesce(p.production_status, 'NOT_STARTED');
  end if;

  update public.manuscripts
  set volume = p_volume, issue = p_issue, publication_date = p_publication_date,
      page_numbers = p_page_numbers, doi = p_doi, article_url = p_article_url,
      updated_at = timezone('utc', now())
  where id = p_manuscript_id
  returning * into m;

  return m;
end;
$$;

revoke all on function public.gd_member_save_publication_metadata(text, text, text, date, text, text, text) from public;
grant execute on function public.gd_member_save_publication_metadata(text, text, text, date, text, text, text) to authenticated;

-- ------------------------------------------
-- Task 21: Publish Article -- GD-Member-driven. Validates the three things
-- the confirmation dialog promises (a final proof exists, proofreading is
-- confirmed complete via the READY_FOR_PUBLICATION gate itself, and the
-- required metadata fields are filled in), then reuses the existing,
-- unmodified mark_published() to actually flip manuscripts.status.
-- ------------------------------------------

create or replace function public.gd_member_publish_article(p_manuscript_id text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; latest_url text;
begin
  if not public.is_active_gd_member() or not public.is_gd_member_assigned_to(p_manuscript_id) then
    raise exception 'Only the GD Member assigned to this manuscript may publish it';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null or p.production_status <> 'READY_FOR_PUBLICATION' then
    raise exception 'Manuscript is not ready for publication (status=%)', coalesce(p.production_status, 'NOT_STARTED');
  end if;
  if p.current_proof_version = 0 then raise exception 'No final approved proof PDF on file'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id;
  if coalesce(trim(m.volume), '') = '' or coalesce(trim(m.issue), '') = '' or coalesce(trim(m.doi), '') = '' or m.publication_date is null then
    raise exception 'Complete the required publication metadata (volume, issue, DOI, publication date) before publishing';
  end if;

  select public_url into latest_url from public.manuscript_proofs
  where manuscript_id = p_manuscript_id and version = p.current_proof_version;

  select * into m from public.mark_published(p_manuscript_id, m.doi, m.volume, m.issue, latest_url);

  update public.manuscript_production set production_status = 'PUBLISHED', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'READY_FOR_PUBLICATION', 'PUBLISHED', 'gd_member_publish_article');

  return m;
end;
$$;

revoke all on function public.gd_member_publish_article(text) from public;
grant execute on function public.gd_member_publish_article(text) to authenticated;

-- mark_published() itself is Coordinator/Publisher-only server-side --
-- broaden that (and only that) so gd_member_publish_article()'s internal
-- call succeeds under the GD Member's own auth context (nested
-- SECURITY DEFINER calls still see the original caller's auth.uid()).
-- Everything else about mark_published() -- including the Coordinator's
-- and Publisher's own ability to call it directly -- is unchanged.
create or replace function public.mark_published(p_manuscript_id text, p_doi text, p_volume text, p_issue text, p_published_pdf_url text default null)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts;
begin
  if not (public.is_active_coordinator() or public.is_active_publisher() or public.is_active_gd_member()) then
    raise exception 'Only a Coordinator, Publisher, or GD Member may publish to production';
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
