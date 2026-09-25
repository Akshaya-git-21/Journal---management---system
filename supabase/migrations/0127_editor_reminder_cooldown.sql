-- ==========================================
-- Editor acceptance-window reminder rules (server-side enforcement).
--
-- For an INVITED assignment made on/after the acceptance-window cutoff
-- (2026-09-25 07:50 UTC -- keep in sync with EDITOR_ACCEPTANCE_RULES_START in
-- src/lib/editorAcceptance.ts):
--   * a reminder can only be sent from 48 hours after assignment,
--   * not once the 4-day (96h) window has passed (reassign instead),
--   * and at most one per 24 hours.
-- Every other case (already-accepted editors, older assignments) behaves
-- exactly as before. Only the guard clauses below are new; the rest of the
-- function is unchanged from 0097.
-- ==========================================

create or replace function public.coordinator_send_editor_reminder(p_manuscript_id text)
returns public.editor_assignments language plpgsql security definer set search_path = public as $$
declare a public.editor_assignments; m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may send this reminder'; end if;

  select * into a from public.editor_assignments
  where manuscript_id = p_manuscript_id and status in ('INVITED', 'ACCEPTED')
  order by assigned_at desc limit 1
  for update;
  if a.id is null then raise exception 'No active editor assignment found for this manuscript'; end if;
  if a.assessment_status = 'SUBMITTED' then
    raise exception 'The editor has already completed the first evaluation -- no reminder needed';
  end if;

  if a.status = 'INVITED' and a.assigned_at >= timestamptz '2026-09-25 07:50:00+00' then
    if timezone('utc', now()) < a.assigned_at + interval '48 hours' then
      raise exception 'A reminder can be sent 48 hours after the editor was assigned';
    end if;
    if timezone('utc', now()) >= a.assigned_at + interval '96 hours' then
      raise exception 'The 4-day acceptance window has passed -- please reassign the editor instead';
    end if;
    if a.last_reminder_sent_at is not null and timezone('utc', now()) < a.last_reminder_sent_at + interval '24 hours' then
      raise exception 'A reminder was already sent -- the next one can be sent 24 hours after the last';
    end if;
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id;

  update public.editor_assignments set last_reminder_sent_at = timezone('utc', now())
  where id = a.id returning * into a;

  perform public._notify(a.editor_id, 'EDITORIAL_TIMELINE_REMINDER', p_manuscript_id,
    'Reminder: editorial evaluation due -- ' || coalesce(m.title, p_manuscript_id),
    case when a.timeline_end_date is not null
      then 'Please complete your initial editorial evaluation by ' || to_char(a.timeline_end_date, 'DD Mon YYYY') || '.'
      else 'Please complete your initial editorial evaluation as soon as possible.' end);

  return a;
end;
$$;

revoke all on function public.coordinator_send_editor_reminder(text) from public;
grant execute on function public.coordinator_send_editor_reminder(text) to authenticated;
