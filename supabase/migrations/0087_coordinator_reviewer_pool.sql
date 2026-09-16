-- ==========================================
-- Coordinator-curated reviewer pool, scoped per manuscript.
--
-- Today the Editor's "Select 2 Reviewers" step (editor_select_reviewers(),
-- see EditorReviewerSelection.tsx) lets the Editor pick from every active
-- Reviewer account in the system. This introduces a Coordinator-controlled
-- subset: when the Coordinator assigns an Editor to a manuscript, they also
-- choose which reviewers from the full Reviewer Board are made available to
-- that Editor for that specific manuscript. The Editor's reviewer-selection
-- screen then only shows this curated pool instead of the global list.
--
-- This does not change assign_editor(), editor_select_reviewers(), or any
-- downstream invitation/acceptance RPC -- it only adds a new gate in front
-- of what reviewer list the Editor's UI is allowed to read.
-- ==========================================

create table if not exists public.manuscript_reviewer_pool (
  manuscript_id text not null references public.manuscripts(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (manuscript_id, reviewer_id)
);

alter table public.manuscript_reviewer_pool enable row level security;

-- Only an active Coordinator, or the Editor currently assigned to this
-- manuscript, may see its curated pool. All writes go through the
-- SECURITY DEFINER function below -- no direct client INSERT/UPDATE/DELETE.
drop policy if exists "reviewer_pool_select" on public.manuscript_reviewer_pool;
create policy "reviewer_pool_select" on public.manuscript_reviewer_pool
  for select using (
    public.is_active_coordinator()
    or exists (
      select 1 from public.manuscripts m
      where m.id = manuscript_id and m.assigned_editor_id = auth.uid()
    )
  );

revoke all on public.manuscript_reviewer_pool from authenticated;
grant select on public.manuscript_reviewer_pool to authenticated;

-- Coordinator-only: replaces a manuscript's entire reviewer pool with
-- exactly the given reviewer ids. Called when assigning (or later
-- adjusting) the Editor -- safe to call repeatedly, always ends with the
-- pool matching p_reviewer_ids exactly.
create or replace function public.coordinator_set_reviewer_pool(p_manuscript_id text, p_reviewer_ids uuid[])
returns setof public.manuscript_reviewer_pool
language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may set the reviewer pool';
  end if;
  if not exists (select 1 from public.manuscripts where id = p_manuscript_id) then
    raise exception 'Manuscript not found';
  end if;

  foreach rid in array coalesce(p_reviewer_ids, array[]::uuid[]) loop
    if not exists (select 1 from public.profiles where id = rid and role = 'REVIEWER' and status = 'ACTIVE') then
      raise exception 'Reviewer % is not an active reviewer account', rid;
    end if;
  end loop;

  delete from public.manuscript_reviewer_pool where manuscript_id = p_manuscript_id;

  if p_reviewer_ids is not null and array_length(p_reviewer_ids, 1) > 0 then
    insert into public.manuscript_reviewer_pool (manuscript_id, reviewer_id, added_by)
    select p_manuscript_id, unnest(p_reviewer_ids), auth.uid();
  end if;

  return query select * from public.manuscript_reviewer_pool where manuscript_id = p_manuscript_id;
end;
$$;

revoke all on function public.coordinator_set_reviewer_pool(text, uuid[]) from public;
grant execute on function public.coordinator_set_reviewer_pool(text, uuid[]) to authenticated;

-- Convenience read: returns the full profile rows (name/email/metadata) for
-- a manuscript's curated pool in one call, gated by the same rule as the
-- table's own SELECT policy. SECURITY DEFINER so it works regardless of
-- what the caller's own SELECT access to public.profiles looks like.
create or replace function public.get_manuscript_reviewer_pool(p_manuscript_id text)
returns setof public.profiles
language plpgsql security definer set search_path = public as $$
begin
  if not (
    public.is_active_coordinator()
    or exists (select 1 from public.manuscripts m where m.id = p_manuscript_id and m.assigned_editor_id = auth.uid())
  ) then
    raise exception 'Not authorized to view this manuscript''s reviewer pool';
  end if;

  return query
    select p.* from public.profiles p
    join public.manuscript_reviewer_pool rp on rp.reviewer_id = p.id
    where rp.manuscript_id = p_manuscript_id
    order by p.name;
end;
$$;

revoke all on function public.get_manuscript_reviewer_pool(text) from public;
grant execute on function public.get_manuscript_reviewer_pool(text) to authenticated;
