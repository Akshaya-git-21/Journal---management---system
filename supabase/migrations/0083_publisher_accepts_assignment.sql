-- ==========================================
-- Module 83: once the Coordinator assigns a Publisher (send_to_publisher),
-- the manuscript should land in that Publisher's "Scheduled Publications"
-- list, NOT directly in "Publication Queue" -- the Publisher must
-- explicitly click "Proceed" first. Adds the one new signal needed for
-- that gate (publisher_accepted_at) and the RPC that sets it.
-- ==========================================

alter table public.manuscripts add column if not exists publisher_accepted_at timestamptz null;

create or replace function public.publisher_accept_assignment(p_manuscript_id text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts;
begin
  if not public.is_active_publisher() then
    raise exception 'Only an active Publisher may accept this assignment';
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.assigned_publisher_id is distinct from auth.uid() then
    raise exception 'This manuscript is not assigned to you';
  end if;

  update public.manuscripts
  set publisher_accepted_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where id = p_manuscript_id
  returning * into m;

  perform public._record_transition(p_manuscript_id, 'ACCEPTED', 'ACCEPTED', 'publisher_accept_assignment');

  return m;
end;
$$;

revoke all on function public.publisher_accept_assignment(text) from public;
grant execute on function public.publisher_accept_assignment(text) to authenticated;
