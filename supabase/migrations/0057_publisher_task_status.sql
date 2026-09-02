-- ==========================================
-- Module 57: Publisher-facing overall Production Task Status.
--
-- Distinct from the GD Member's 11-item Production Checklist
-- (0055/0056_gd_member_production_checklist*.sql): the Publisher never sees
-- that item-by-item detail. Instead they see and set ONE coarse status for
-- the manuscript's production work -- NOT_STARTED / IN_PROGRESS / COMPLETE
-- -- so the Coordinator can glance at it to know production is actually
-- done before moving the manuscript to the next stage. The GD Member's
-- checklist is unaffected by this column; nothing here reads or writes it.
-- ==========================================

alter table public.manuscript_production add column if not exists publisher_task_status text not null default 'NOT_STARTED';
alter table public.manuscript_production drop constraint if exists manuscript_production_publisher_task_status_check;
alter table public.manuscript_production add constraint manuscript_production_publisher_task_status_check
  check (publisher_task_status in ('NOT_STARTED','IN_PROGRESS','COMPLETE'));

create or replace function public.set_publisher_task_status(p_manuscript_id text, p_status text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if not public.is_active_publisher() then raise exception 'Only a Publisher may set the production task status'; end if;
  if p_status not in ('NOT_STARTED','IN_PROGRESS','COMPLETE') then raise exception 'Invalid status'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;

  update public.manuscript_production
  set publisher_task_status = p_status, updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id
  returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, p.production_status, p.production_status, 'set_publisher_task_status',
    'Publisher set production task status to ' || p_status);

  if p_status = 'COMPLETE' then
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'PUBLISHER_TASK_COMPLETE', p_manuscript_id, 'Publisher marked production complete: ' || coalesce(m.title, p_manuscript_id), ''
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
  end if;

  return p;
end;
$$;

revoke all on function public.set_publisher_task_status(text, text) from public;
grant execute on function public.set_publisher_task_status(text, text) to authenticated;
