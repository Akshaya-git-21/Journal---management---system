-- ==========================================
-- Lets a Reviewer attach a PDF (e.g. an annotated copy of the manuscript)
-- to their own review, from the Reviewer Evaluation Workspace modal. Stored
-- separately from manuscript_files (0002) since these are the Reviewer's
-- own working files, not part of the Author's official submission set.
-- ==========================================

create table if not exists public.reviewer_review_attachments (id uuid primary key default gen_random_uuid());
alter table public.reviewer_review_attachments add column if not exists assignment_id uuid references public.reviewer_assignments(id) on delete cascade;
alter table public.reviewer_review_attachments add column if not exists file_name text not null default '';
alter table public.reviewer_review_attachments add column if not exists file_size text;
alter table public.reviewer_review_attachments add column if not exists storage_path text;
alter table public.reviewer_review_attachments add column if not exists public_url text;
alter table public.reviewer_review_attachments add column if not exists uploaded_at timestamptz not null default timezone('utc', now());

alter table public.reviewer_review_attachments enable row level security;

-- The owning Reviewer, the manuscript's assigned Editor, and an active
-- Coordinator may all see a review's attachments.
drop policy if exists "reviewer_review_attachments_select" on public.reviewer_review_attachments;
create policy "reviewer_review_attachments_select" on public.reviewer_review_attachments
  for select using (
    exists (
      select 1 from public.reviewer_assignments ra
      join public.manuscripts m on m.id = ra.manuscript_id
      where ra.id = assignment_id
        and (ra.reviewer_id = auth.uid() or m.assigned_editor_id = auth.uid() or public.is_active_coordinator())
    )
  );

revoke all on public.reviewer_review_attachments from authenticated;
grant select on public.reviewer_review_attachments to authenticated;

-- Reviewer-only: attach a file to their own review. SECURITY DEFINER so the
-- ownership check (and the insert itself, since there's no direct client
-- INSERT policy) both happen server-side.
create or replace function public.reviewer_upload_review_attachment(
  p_assignment_id uuid, p_file_name text, p_file_size text, p_storage_path text, p_public_url text
)
returns public.reviewer_review_attachments
language plpgsql security definer set search_path = public as $$
declare
  ra public.reviewer_assignments;
  inserted public.reviewer_review_attachments;
begin
  select * into ra from public.reviewer_assignments where id = p_assignment_id;
  if ra.id is null then raise exception 'Reviewer assignment not found'; end if;
  if ra.reviewer_id is distinct from auth.uid() then raise exception 'Not your review assignment'; end if;

  insert into public.reviewer_review_attachments (assignment_id, file_name, file_size, storage_path, public_url)
  values (p_assignment_id, p_file_name, p_file_size, p_storage_path, p_public_url)
  returning * into inserted;

  return inserted;
end;
$$;

revoke all on function public.reviewer_upload_review_attachment(uuid, text, text, text, text) from public;
grant execute on function public.reviewer_upload_review_attachment(uuid, text, text, text, text) to authenticated;

-- Reviewer-only: remove an attachment they added (e.g. uploaded the wrong file).
create or replace function public.reviewer_delete_review_attachment(p_attachment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  ra public.reviewer_assignments;
  att public.reviewer_review_attachments;
begin
  select * into att from public.reviewer_review_attachments where id = p_attachment_id;
  if att.id is null then raise exception 'Attachment not found'; end if;

  select * into ra from public.reviewer_assignments where id = att.assignment_id;
  if ra.id is null or ra.reviewer_id is distinct from auth.uid() then
    raise exception 'Not your review attachment';
  end if;

  delete from public.reviewer_review_attachments where id = p_attachment_id;
end;
$$;

revoke all on function public.reviewer_delete_review_attachment(uuid) from public;
grant execute on function public.reviewer_delete_review_attachment(uuid) to authenticated;
