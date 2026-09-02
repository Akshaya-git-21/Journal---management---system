-- ==========================================
-- Module 62: Task 13 -- Editor reviews the Author's proof corrections
-- (already visible to them since 0061) and submits editorial feedback back
-- to the Coordinator: editorial comments + an approve/verify flag on the
-- specific correction round. Additive only -- does not touch
-- production_status or any existing Editor evaluation/decision RPC.
-- ==========================================

alter table public.manuscript_production_corrections add column if not exists editor_comments text;
alter table public.manuscript_production_corrections add column if not exists editor_verified boolean;
alter table public.manuscript_production_corrections add column if not exists editor_feedback_by uuid references public.profiles(id);
alter table public.manuscript_production_corrections add column if not exists editor_feedback_at timestamptz;

create or replace function public.editor_submit_production_feedback(p_manuscript_id text, p_correction_id uuid, p_comments text, p_verified boolean)
returns public.manuscript_production_corrections language plpgsql security definer set search_path = public as $$
declare c public.manuscript_production_corrections; p public.manuscript_production; m public.manuscripts;
begin
  if not public.is_invited_editor_of(p_manuscript_id) then raise exception 'Only the assigned Editor may submit editorial feedback'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id;
  if p.manuscript_id is null or p.sent_to_editor_at is null then
    raise exception 'No proof corrections have been sent to the editor for this manuscript';
  end if;

  select * into c from public.manuscript_production_corrections where id = p_correction_id and manuscript_id = p_manuscript_id for update;
  if c.id is null then raise exception 'Correction not found for this manuscript'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id;

  update public.manuscript_production_corrections
  set editor_comments = p_comments, editor_verified = p_verified, editor_feedback_by = auth.uid(), editor_feedback_at = timezone('utc', now())
  where id = p_correction_id
  returning * into c;

  perform public._record_transition(p_manuscript_id, p.production_status, p.production_status, 'editor_submit_production_feedback', p_comments);

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'EDITOR_PRODUCTION_FEEDBACK', p_manuscript_id,
    'Editor submitted feedback on proof corrections: ' || coalesce(m.title, ''), p_comments
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return c;
end;
$$;

revoke all on function public.editor_submit_production_feedback(text, uuid, text, boolean) from public;
grant execute on function public.editor_submit_production_feedback(text, uuid, text, boolean) to authenticated;
