-- ==========================================
-- 0130: ORCID identities ("Continue with ORCID")
--
-- One row links a verified ORCID iD to one account. Rows are written ONLY by the
-- server (api/orcid.ts, service-role key) after ORCID has confirmed the iD via
-- OAuth -- clients can read their own row but never write. Existing tables and
-- flows are untouched. Safe to re-run.
-- ==========================================

create table if not exists public.orcid_identities (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  orcid_id   text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  constraint orcid_identities_format check (orcid_id ~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$')
);

alter table public.orcid_identities enable row level security;

drop policy if exists orcid_identities_read_own on public.orcid_identities;
create policy orcid_identities_read_own on public.orcid_identities
  for select to authenticated
  using (user_id = auth.uid());
