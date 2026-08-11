-- ==========================================
-- Module 3: Ensure Author Profile RPC
-- Server-side function to create/activate AUTHOR profile for authenticated users
-- ==========================================

-- Drop old version if it exists
drop function if exists public.ensure_author_profile();

-- Create or ensure AUTHOR profile for the current user
-- This function runs with elevated privileges (SECURITY DEFINER) to bypass RLS
create or replace function public.ensure_author_profile()
returns table(id uuid, role text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_user_name text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Get user info from auth.users
  select email, raw_user_meta_data->>'full_name'
  into v_user_email, v_user_name
  from auth.users where id = v_user_id;

  -- Upsert profile to ensure it exists and is ACTIVE with AUTHOR role
  insert into public.profiles (
    id, email, name, role, requested_role, status, metadata
  ) values (
    v_user_id,
    coalesce(v_user_email, ''),
    coalesce(v_user_name, split_part(coalesce(v_user_email, 'author'), '@', 1)),
    'AUTHOR',
    'AUTHOR',
    'ACTIVE',
    '{}'::jsonb
  )
  on conflict (id) do update set
    role = 'AUTHOR',
    status = 'ACTIVE',
    updated_at = now()
  where excluded.id = v_user_id;

  -- Return the profile
  return query select p.id, p.role, p.status from public.profiles p where p.id = v_user_id;
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function public.ensure_author_profile() to authenticated;

-- ==========================================
-- File Syncing RPC
-- ==========================================

-- Sync uploaded manuscript files to manuscript_files table with SECURITY DEFINER
-- This bypasses RLS and allows authors to sync files they uploaded to their submissions
drop function if exists public.sync_manuscript_files(text, jsonb);

create or replace function public.sync_manuscript_files(
  p_manuscript_id text,
  p_files jsonb -- Array of {file_name, file_type, file_size, storage_path, public_url}
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_file jsonb;
  v_count int := 0;
  v_result json;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Verify the manuscript exists and belongs to the current user
  if not exists (
    select 1 from public.manuscripts
    where id = p_manuscript_id and author_id = v_user_id
  ) then
    raise exception 'Manuscript not found or does not belong to this author';
  end if;

  -- Insert each file into manuscript_files table
  if p_files is not null and jsonb_array_length(p_files) > 0 then
    for v_file in select jsonb_array_elements(p_files)
    loop
      insert into public.manuscript_files (
        manuscript_id,
        file_name,
        file_type,
        file_size,
        storage_path,
        public_url,
        uploaded_by,
        uploaded_at
      ) values (
        p_manuscript_id,
        v_file->>'file_name',
        v_file->>'file_type',
        v_file->>'file_size',
        v_file->>'storage_path',
        v_file->>'public_url',
        v_user_id,
        now()
      );
      v_count := v_count + 1;
    end loop;
  end if;

  v_result := json_build_object(
    'success', true,
    'manuscript_id', p_manuscript_id,
    'files_synced', v_count
  );

  return v_result;
end;
$$;

grant execute on function public.sync_manuscript_files(text, jsonb) to authenticated;
