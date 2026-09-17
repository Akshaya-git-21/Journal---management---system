-- ==========================================
-- Module 95: the Editor's own "Return to Author" comment (why the
-- correction request needs more from the Author) wasn't showing up in the
-- Corrections list on the Editor's/Coordinator's/GD's pages -- it was only
-- ever recorded in manuscript_proof_reviews (Review History), not in
-- manuscript_production_corrections, which is what that list actually
-- reads. Same fix already applied to the "Move to GD" branch (Module 93):
-- also record it as a correction_source = 'EDITOR' row so it renders
-- alongside the Author's own requests in the existing Corrections UI,
-- reusing the exact same rendering everywhere -- no UI changes needed.
-- ==========================================

create or replace function public.editor_review_author_corrections(p_manuscript_id text, p_decision text, p_comments text default '')
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if p_decision not in ('MOVE_TO_GD','RETURN_TO_AUTHOR') then raise exception 'Invalid decision'; end if;
  if not public.is_invited_editor_of(p_manuscript_id) then raise exception 'Only the assigned Editor may review this'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'AUTHOR_FINAL_CORRECTIONS_UNDER_EDITOR_REVIEW' then
    raise exception 'No Author correction request is currently awaiting your review (status=%)', p.production_status;
  end if;

  if p_decision = 'RETURN_TO_AUTHOR' then
    if coalesce(trim(p_comments), '') = '' then raise exception 'Comments are required to return this to the Author'; end if;

    -- Module 95: also visible in the shared Corrections list, not just Review History.
    insert into public.manuscript_production_corrections (manuscript_id, proof_version, comments, correction_source)
    values (p_manuscript_id, p.current_proof_version, p_comments, 'EDITOR');

    insert into public.manuscript_proof_reviews (manuscript_id, proof_version, reviewer_role, decision, comments, decided_by)
    values (p_manuscript_id, p.current_proof_version, 'EDITOR', 'RETURNED_TO_AUTHOR', p_comments, auth.uid());

    update public.manuscript_production
    set production_status = 'AUTHOR_FINAL_RETURN_PENDING_SEND', pending_review_role = null, updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'AUTHOR_FINAL_CORRECTIONS_UNDER_EDITOR_REVIEW', 'AUTHOR_FINAL_RETURN_PENDING_SEND',
      'editor_review_author_corrections', p_comments);

    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'AUTHOR_FINAL_RETURN_PENDING_SEND', p_manuscript_id,
      'Editor responded to the Author''s correction request: ' || coalesce(m.title, p_manuscript_id), p_comments
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
  else
    if coalesce(trim(p_comments), '') <> '' then
      insert into public.manuscript_production_corrections (manuscript_id, proof_version, comments, correction_source)
      values (p_manuscript_id, p.current_proof_version, p_comments, 'EDITOR');
    end if;

    insert into public.manuscript_proof_reviews (manuscript_id, proof_version, reviewer_role, decision, comments, correction_source, decided_by)
    values (p_manuscript_id, p.current_proof_version, 'EDITOR', 'CORRECTIONS_REQUESTED', coalesce(p_comments, ''), 'AUTHOR', auth.uid());

    update public.manuscript_production
    set production_status = 'AUTHOR_FINAL_MOVE_TO_GD_PENDING_SEND', pending_review_role = null, updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'AUTHOR_FINAL_CORRECTIONS_UNDER_EDITOR_REVIEW', 'AUTHOR_FINAL_MOVE_TO_GD_PENDING_SEND',
      'editor_review_author_corrections', 'Editor moved Author''s correction request toward the GD Member');

    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'AUTHOR_FINAL_MOVE_TO_GD_PENDING_SEND', p_manuscript_id,
      'Editor moved a correction request toward the GD Member: ' || coalesce(m.title, p_manuscript_id), p_comments
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
  end if;

  return p;
end;
$$;

revoke all on function public.editor_review_author_corrections(text, text, text) from public;
grant execute on function public.editor_review_author_corrections(text, text, text) to authenticated;
