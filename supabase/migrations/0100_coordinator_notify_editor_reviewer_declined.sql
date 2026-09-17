-- ==========================================
-- Module 100: a Coordinator-facing "Notify Editor" button for a declined
-- reviewer, same nudge pattern as coordinator_notify_gd_member() (0074).
-- The Editor already sees the replacement picker automatically (Module 99
-- fix) -- this doesn't change any routing, it just pushes a notification so
-- the Editor doesn't have to happen to notice on their own.
-- ==========================================

create or replace function public.coordinator_notify_editor_reviewer_declined(p_manuscript_id text, p_reviewer_name text default null)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may notify the Editor'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.assigned_editor_id is null then raise exception 'No Editor is assigned to this manuscript'; end if;

  perform public._notify(m.assigned_editor_id, 'REVIEWER_DECLINED_NOTIFY_EDITOR', p_manuscript_id,
    'A reviewer declined -- choose a replacement: ' || coalesce(m.title, p_manuscript_id),
    case when p_reviewer_name is not null then p_reviewer_name || ' declined the review invitation.' else '' end);

  return m;
end;
$$;

revoke all on function public.coordinator_notify_editor_reviewer_declined(text, text) from public;
grant execute on function public.coordinator_notify_editor_reviewer_declined(text, text) to authenticated;
