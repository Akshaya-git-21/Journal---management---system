-- ==========================================
-- Module 61: Task 12 -- Coordinator sends Author's proof corrections to the
-- assigned Editor for verification (Proof PDF + Author Comments + Annotated
-- PDF). Explicitly additive: does NOT touch production_status (so it never
-- conflicts with accept_corrections/request_clarification, which are keyed
-- off CORRECTIONS_SUBMITTED/CLARIFICATION_REQUESTED) and does NOT touch any
-- Editor evaluation/decision table, RPC, or RLS policy.
-- ==========================================

alter table public.manuscript_production add column if not exists sent_to_editor_at timestamptz;
alter table public.manuscript_production add column if not exists sent_to_editor_correction_id uuid references public.manuscript_production_corrections(id);

create or replace function public.coordinator_send_corrections_to_editor(p_manuscript_id text, p_correction_id uuid, p_note text default null)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; c public.manuscript_production_corrections; editor_row record;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may send corrections to the editor'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;

  select * into c from public.manuscript_production_corrections where id = p_correction_id and manuscript_id = p_manuscript_id;
  if c.id is null then raise exception 'Correction not found for this manuscript'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;

  update public.manuscript_production
  set sent_to_editor_at = timezone('utc', now()), sent_to_editor_correction_id = p_correction_id, updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id
  returning * into p;

  perform public._record_transition(p_manuscript_id, p.production_status, p.production_status, 'coordinator_send_corrections_to_editor', p_note);

  for editor_row in
    select editor_id from public.editor_assignments where manuscript_id = p_manuscript_id and status = 'ACCEPTED'
  loop
    perform public._notify(editor_row.editor_id, 'PRODUCTION_CORRECTIONS_FOR_VERIFICATION', p_manuscript_id,
      'Author proof corrections ready for verification: ' || m.title, coalesce(p_note, ''));
  end loop;

  return p;
end;
$$;

revoke all on function public.coordinator_send_corrections_to_editor(text, uuid, text) from public;
grant execute on function public.coordinator_send_corrections_to_editor(text, uuid, text) to authenticated;

-- Editor read access -- scoped to manuscripts they're actively assigned to
-- (is_invited_editor_of already exists, SECURITY DEFINER, queries only
-- editor_assignments -- no recursion risk), and only once the Coordinator
-- has explicitly sent it (sent_to_editor_at is not null). Purely additive
-- to the existing policies from 0052 -- author/coordinator/gd_member access
-- is unchanged.
drop policy if exists "manuscript_production_select" on public.manuscript_production;
create policy "manuscript_production_select" on public.manuscript_production
  for select using (
    public.is_active_coordinator()
    or (public.is_active_gd_member() and public.is_gd_member_assigned_to(manuscript_id))
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
    or (sent_to_editor_at is not null and public.is_invited_editor_of(manuscript_id))
  );

drop policy if exists "manuscript_proofs_select" on public.manuscript_proofs;
create policy "manuscript_proofs_select" on public.manuscript_proofs
  for select using (
    public.is_active_coordinator()
    or (public.is_active_gd_member() and public.is_gd_member_assigned_to(manuscript_id))
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
    or (public.is_invited_editor_of(manuscript_id) and exists (
      select 1 from public.manuscript_production p where p.manuscript_id = manuscript_proofs.manuscript_id and p.sent_to_editor_at is not null
    ))
  );

drop policy if exists "manuscript_production_corrections_select" on public.manuscript_production_corrections;
create policy "manuscript_production_corrections_select" on public.manuscript_production_corrections
  for select using (
    public.is_active_coordinator()
    or (public.is_active_gd_member() and public.is_gd_member_assigned_to(manuscript_id))
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
    or (public.is_invited_editor_of(manuscript_id) and exists (
      select 1 from public.manuscript_production p where p.manuscript_id = manuscript_production_corrections.manuscript_id and p.sent_to_editor_at is not null
    ))
  );
