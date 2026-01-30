-- Enable UUID extension (usually enabled by default, but good to ensure)
create extension if not exists "uuid-ossp";

-- 1. Dashboards Table
-- Stores the actual content synced from your local machine.
create table public.dashboards (
  id text primary key,                    -- We'll use the filename (slug) as the ID, e.g. "ai-blueprint"
  title text not null,
  content text,                           -- HTML string
  hash text,                              -- MD5 hash to detect changes
  description text,
  tags text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.dashboards enable row level security;

-- Policy: Everyone can read dashboards (Authenticated or Anonymous)
-- If you want this private to only logged-in users, change 'anon' to 'authenticated'
create policy "Public read access"
  on public.dashboards for select
  to anon, authenticated
  using (true);

-- Policy: Only Service Role (your Sync Script) can insert/update/delete
-- We don't verify user_id here because the script uses the SERVICE_KEY, which bypasses RLS.
-- So strictly speaking, we don't *need* a policy for the service role, 
-- but ensuring no regular user can write is good practice.
create policy "Service role write access"
  on public.dashboards for all
  to service_role
  using (true)
  with check (true);


-- 2. User States Table
-- Stores personalization (Read/Archived status) per user.
create table public.user_states (
  user_id uuid references auth.users not null,
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  is_read boolean default false,
  is_archived boolean default false,
  updated_at timestamptz default now(),
  state jsonb,
  primary key (user_id, dashboard_id)
);

-- Enable RLS
alter table public.user_states enable row level security;

-- Policy: Users can view their own states
create policy "Users can view own states"
  on public.user_states for select
  to authenticated
  using (auth.uid() = user_id);

-- Policy: Users can insert/update their own states
create policy "Users can update own states"
  on public.user_states for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own states (update)"
  on public.user_states for update
  to authenticated
  using (auth.uid() = user_id);


-- 3. Storage (Optional for PDFs)
-- If you plan to sync PDFs, we need a storage bucket.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

create policy "Public Access to Documents"
  on storage.objects for select
  to anon, authenticated
  using ( bucket_id = 'documents' );

create policy "Service Role Upload Documents"
  on storage.objects for insert
  to service_role
  with check ( bucket_id = 'documents' );
