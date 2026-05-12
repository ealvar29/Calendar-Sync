-- ============================================================
-- HangoutSync schema  (Supabase Auth — no NextAuth tables)
-- Run this in the Supabase SQL editor after creating a project
-- ============================================================

-- ------------------------------------------------------------
-- profiles: display names for each user (auto-created on signup)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  updated_at   timestamptz default now()
);

-- ------------------------------------------------------------
-- groups: a shared calendar room
-- ------------------------------------------------------------
create table if not exists public.groups (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  invite_code text unique not null,
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz default now()
);

-- ------------------------------------------------------------
-- group_members: who is in which room
-- ------------------------------------------------------------
create table if not exists public.group_members (
  id        uuid default gen_random_uuid() primary key,
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member' check (role in ('host', 'member')),
  joined_at timestamptz default now(),
  unique(group_id, user_id)
);

-- ------------------------------------------------------------
-- availability: per-user per-day status inside a room
-- ------------------------------------------------------------
create table if not exists public.availability (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  group_id   uuid not null references public.groups(id) on delete cascade,
  date       date not null,
  status     text not null check (status in ('free', 'busy')),
  updated_at timestamptz default now(),
  unique(user_id, group_id, date)
);

-- ============================================================
-- Row-Level Security
-- ============================================================

alter table public.profiles     enable row level security;
alter table public.groups       enable row level security;
alter table public.group_members enable row level security;
alter table public.availability  enable row level security;

-- profiles: anyone authenticated can read; users manage their own
create policy "profiles_select"  on public.profiles for select  using (auth.uid() is not null);
create policy "profiles_insert"  on public.profiles for insert  with check (id = auth.uid());
create policy "profiles_update"  on public.profiles for update  using (id = auth.uid());

-- Helper: check membership without triggering the group_members RLS policy
-- security definer runs as the function owner (bypasses RLS on the inner query)
create or replace function public.is_group_member(group_uuid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = group_uuid and user_id = auth.uid()
  )
$$;

-- groups: only members can see their rooms; authenticated users can create
create policy "groups_select" on public.groups for select
  using (is_group_member(id));
create policy "groups_insert" on public.groups for insert
  with check (created_by = auth.uid());

-- group_members: members see the full roster for their rooms
-- Uses is_group_member() to avoid infinite recursion (policy referencing itself)
create policy "group_members_select" on public.group_members for select
  using (is_group_member(group_id));
-- inserts go through API (service role) — keep policy for defense-in-depth
create policy "group_members_insert" on public.group_members for insert
  with check (user_id = auth.uid());
-- host can remove others; members can remove themselves
create policy "group_members_delete" on public.group_members for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.group_members gm2
      where gm2.group_id = group_members.group_id
        and gm2.user_id = auth.uid()
        and gm2.role = 'host'
    )
  );

-- availability: group members can read; users manage their own rows
create policy "availability_select" on public.availability for select
  using (is_group_member(group_id));
create policy "availability_insert" on public.availability for insert
  with check (user_id = auth.uid());
create policy "availability_update" on public.availability for update
  using (user_id = auth.uid());
create policy "availability_delete" on public.availability for delete
  using (user_id = auth.uid());

-- ============================================================
-- Realtime: push availability and membership changes to clients
-- ============================================================

-- REPLICA IDENTITY FULL ensures DELETE events include the full old row,
-- so realtime handlers can identify which record was removed.
alter table public.availability   replica identity full;
alter table public.group_members  replica identity full;

alter publication supabase_realtime add table public.availability;
alter publication supabase_realtime add table public.group_members;

-- ============================================================
-- Trigger: auto-create a profile row on every new sign-up
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
