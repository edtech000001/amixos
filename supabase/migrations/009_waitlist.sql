-- Migration 009: Waitlist for Amixos marketing landing page
-- Run in Supabase SQL Editor

create table if not exists public.waitlist (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  first_name   text,
  business_type text,        -- 'construction' | 'landscaping' | 'cleaning' | 'plumbing' | 'other'
  referrer     text,         -- UTM source
  created_at   timestamptz not null default now()
);

-- Public insert (no auth — anyone can join waitlist)
alter table public.waitlist enable row level security;

create policy "Anyone can join waitlist"
  on public.waitlist
  for insert
  with check (true);

-- Only service role can read (for admin)
create policy "Service role reads waitlist"
  on public.waitlist
  for select
  using (auth.role() = 'service_role');
