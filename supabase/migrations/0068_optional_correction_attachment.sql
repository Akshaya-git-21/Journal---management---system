-- ==========================================
-- Module 68: author_submit_corrections() required an attachment
-- (attachment_storage_path) to request proof corrections -- the Author's
-- written comments alone weren't enough. Drop that requirement: an
-- attachment is still accepted and stored if provided, but comments alone
-- are now sufficient to submit corrections.
-- ==========================================

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
    (manuscript_id, proof_version, comments, attachment_storage_path, attachment_public_url, attachment_file_name)
  values (p_manuscript_id, p.current_proof_version, p_comments, coalesce(p_storage_path, ''), p_public_url, p_file_name)
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
