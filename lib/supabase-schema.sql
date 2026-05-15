-- trips table
create table trips (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  destination text not null,
  start_date date not null,
  end_date date not null,
  description text default '',
  cover_emoji text default '✈️',
  share_code text unique default upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz default now()
);

-- members table
create table members (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  name text not null,
  color text not null,
  created_at timestamptz default now()
);

-- activities table
create table activities (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  date date not null,
  time text default '',
  title text not null,
  location text default '',
  notes text default '',
  category text default 'other',
  assigned_to text[] default '{}',
  created_at timestamptz default now()
);

-- research_items table
create table research_items (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  title text not null,
  description text default '',
  status text default 'pending',
  priority text default 'medium',
  assigned_to text default '',
  url text default '',
  created_at timestamptz default now()
);

-- chat_messages table
create table chat_messages (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  member_name text not null,
  member_color text not null,
  message text not null,
  created_at timestamptz default now()
);

-- Enable realtime for all tables
alter publication supabase_realtime add table trips;
alter publication supabase_realtime add table members;
alter publication supabase_realtime add table activities;
alter publication supabase_realtime add table research_items;
alter publication supabase_realtime add table chat_messages;

-- RLS policies (allow all for now - public trips)
alter table trips enable row level security;
alter table members enable row level security;
alter table activities enable row level security;
alter table research_items enable row level security;
alter table chat_messages enable row level security;

create policy "Public trips" on trips for all using (true) with check (true);
create policy "Public members" on members for all using (true) with check (true);
create policy "Public activities" on activities for all using (true) with check (true);
create policy "Public research_items" on research_items for all using (true) with check (true);
create policy "Public chat_messages" on chat_messages for all using (true) with check (true);
