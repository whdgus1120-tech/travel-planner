-- ⚠️ Supabase SQL Editor에서 이 파일 내용을 실행하세요 (새 쿼리로)

-- 준비물 테이블
create table packing_items (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  category text not null,
  name text not null,
  is_checked boolean default false,
  is_custom boolean default false,
  created_at timestamptz default now()
);

-- 예산/가계부 테이블
create table budget_items (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  category text not null default 'other',
  description text not null,
  amount numeric not null,
  currency text default 'KRW',
  date date default current_date,
  member_name text default '',
  created_at timestamptz default now()
);

-- 실시간 동기화 활성화
alter publication supabase_realtime add table packing_items;
alter publication supabase_realtime add table budget_items;

-- RLS 정책 (공개 접근)
alter table packing_items enable row level security;
alter table budget_items enable row level security;
create policy "Public packing_items" on packing_items for all using (true) with check (true);
create policy "Public budget_items" on budget_items for all using (true) with check (true);
