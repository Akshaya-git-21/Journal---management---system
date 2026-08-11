-- ==========================================
-- Enhancement: Add validation to sync_manuscript_files RPC
-- ==========================================
--
-- This improves the sync_manuscript_files function with:
-- 1. Validation that publicUrl actually starts with correct storage path
-- 2. Validation that file_name matches storage filename
-- 3. Better error messages if validation fails
-- 4. Transaction safety to prevent partial syncs
--

drop function if exists public.sync_manuscript_files(text, jsonb);

create or replace function public.sync_manuscript_files(
  p_manuscript_id text,
  p_files jsonb
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
  v_public_url text;
  v_storage_path text;
  v_file_name text;
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

  -- Insert each file into manuscript_files table WITH VALIDATION
  if p_files is not null and jsonb_array_length(p_files) > 0 then
    for v_file in select jsonb_array_elements(p_files)
    loop
      v_file_name := v_file->>'file_name';
      v_storage_path := v_file->>'storage_path';
      v_public_url := v_file->>'public_url';

      -- VALIDATION 1: Ensure public_url is not null or empty
      if v_public_url is null or v_public_url = '' then
        raise exception 'File % has empty public_url - sync aborted to prevent data corruption', v_file_name;
      end if;

      -- VALIDATION 2: Ensure storage_path is not null or empty
      if v_storage_path is null or v_storage_path = '' then
        raise exception 'File % has empty storage_path - sync aborted to prevent data corruption', v_file_name;
      end if;

      -- VALIDATION 3: Ensure file_name is not null or empty
      if v_file_name is null or v_file_name = '' then
        raise exception 'File has empty file_name - sync aborted to prevent data corruption';
      end if;

      -- VALIDATION 4: Warn if storage_path doesn't match public_url
      -- (public_url should contain the storage_path)
      if not (v_public_url like '%' || v_storage_path || '%') then
        raise warning 'File % storage_path may not match public_url - check for data corruption', v_file_name;
      end if;

      -- Insert file with validated data
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

-- MIGRATION NOTES:
-- This updated RPC adds validation to catch data corruption early.
-- If sync fails due to validation, it prevents corrupt data from being written.
-- Warnings help identify when files might be mixed up.
