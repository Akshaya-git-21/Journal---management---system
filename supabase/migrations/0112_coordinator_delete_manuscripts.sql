-- ==========================================
-- Module 112: Coordinator can delete manuscripts
--
-- manuscripts has no DELETE policy, so nobody (including a Coordinator) can
-- remove a row from the client. This adds a Coordinator-only, security
-- definer RPC that deletes one or more submitted manuscripts. Everything that
-- hangs off a manuscript (files, revisions, assignments, discussions, status
-- history, notifications, production rows, proofs...) is already
-- "on delete cascade"; audit_log.manuscript_id is "on delete set null", so a
-- MANUSCRIPT_DELETED audit row (title/status kept in metadata) is written
-- first and survives.
--
-- Files already uploaded to the manuscript-files storage bucket are NOT
-- removed by this function.
--
-- Safe to re-run.
-- ==========================================

create or replace function public.coordinator_delete_manuscripts(p_ids text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  deleted_count integer := 0;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only an active Coordinator can delete manuscripts.';
  end if;

  for m in
    select id, title, status from public.manuscripts
    where id = any(p_ids) and status <> 'DRAFT'
  loop
    insert into public.audit_log (actor_id, action, manuscript_id, before_status, after_status, metadata)
    values (auth.uid(), 'MANUSCRIPT_DELETED', null, m.status, null,
            jsonb_build_object('manuscript_id', m.id, 'title', m.title));
    delete from public.manuscripts where id = m.id;
    deleted_count := deleted_count + 1;
  end loop;

  return deleted_count;
end;
$$;

revoke all on function public.coordinator_delete_manuscripts(text[]) from public;
grant execute on function public.coordinator_delete_manuscripts(text[]) to authenticated;

-- Make PostgREST pick the new function up immediately (otherwise the API
-- reports "Could not find the function ... in the schema cache").
notify pgrst, 'reload schema';
