-- ==========================================
-- Migration 0022: Target "Send to Publisher" at one specific account
--
-- send_to_publisher() previously only set production_stage, which the
-- manuscripts_select RLS policy treated as "visible to every active
-- Publisher" -- there was no way to route a manuscript to one specific
-- Publisher account. This adds a real assignment:
--
-- 1. manuscripts.assigned_publisher_id -- which Publisher this manuscript
--    was handed to.
-- 2. manuscripts_select now scopes Publisher visibility to
--    assigned_publisher_id = auth.uid() instead of "any active publisher".
-- 3. send_to_publisher(text, uuid) takes the target publisher's profile id,
--    validates they're an active Publisher, and notifies only that account.
--
-- Depends on: 0002_manuscripts_workflow.sql, 0011_publisher_and_reasons.sql.
-- Safe to re-run.
-- ==========================================

alter table public.manuscripts add column if not exists assigned_publisher_id uuid references public.profiles(id);

drop policy if exists "manuscripts_select" on public.manuscripts;
create policy "manuscripts_select" on public.manuscripts
  for select using (
    author_id = auth.uid()
    or assigned_editor_id = auth.uid()
    or public.is_invited_editor_of(id)
    or public.is_reviewer_of(id)
    or public.is_active_coordinator()
    or (public.is_active_publisher() and status in ('ACCEPTED','PUBLISHED') and assigned_publisher_id = auth.uid())
  );

drop function if exists public.send_to_publisher(text);

create or replace function public.send_to_publisher(p_manuscript_id text, p_publisher_id uuid)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may move a manuscript to Publisher'; end if;

  if not exists (select 1 from public.profiles where id = p_publisher_id and role = 'PUBLISHER' and status = 'ACTIVE') then
    raise exception 'Selected account is not an active Publisher';
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.status is distinct from 'ACCEPTED' then raise exception 'Manuscript is not accepted yet (status=%)', m.status; end if;
  if m.production_stage is not null then raise exception 'Manuscript has already been moved to production (stage=%)', m.production_stage; end if;

  update public.manuscripts set production_stage = 'SENT_TO_PUBLISHER', assigned_publisher_id = p_publisher_id, updated_at = timezone('utc', now())
  where id = p_manuscript_id returning * into m;

  perform public._record_transition(p_manuscript_id, 'ACCEPTED', 'ACCEPTED', 'send_to_publisher');

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  values (p_publisher_id, 'MOVED_TO_PUBLISHER', p_manuscript_id, 'Ready for production: ' || m.title, '');

  return m;
end;
$$;

revoke all on function public.send_to_publisher(text, uuid) from public;
grant execute on function public.send_to_publisher(text, uuid) to authenticated;
