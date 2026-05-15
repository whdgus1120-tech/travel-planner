-- ⚠️ Supabase SQL Editor에서 실행하세요

create table candidate_places (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  name text not null,
  category text default 'sightseeing',
  notes text default '',
  created_at timestamptz default now()
);

alter publication supabase_realtime add table candidate_places;
alter table candidate_places enable row level security;
create policy "Public candidate_places" on candidate_places for all using (true) with check (true);
