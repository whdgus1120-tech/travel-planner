-- ⚠️ Supabase SQL Editor에서 실행하세요 (새 쿼리)

-- 항공편 정보 테이블
create table trip_flights (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  type text not null, -- 'departure' | 'return'
  airport_from text default '',
  airport_to text default '',
  flight_number text default '',
  departure_time text default '',
  arrival_time text default '',
  created_at timestamptz default now(),
  unique(trip_id, type)
);

-- 숙소 정보 테이블 (날짜별)
create table trip_accommodations (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  date date not null,
  name text default '',
  address text default '',
  created_at timestamptz default now(),
  unique(trip_id, date)
);

-- 실시간 동기화
alter publication supabase_realtime add table trip_flights;
alter publication supabase_realtime add table trip_accommodations;

-- RLS
alter table trip_flights enable row level security;
alter table trip_accommodations enable row level security;
create policy "Public trip_flights" on trip_flights for all using (true) with check (true);
create policy "Public trip_accommodations" on trip_accommodations for all using (true) with check (true);
