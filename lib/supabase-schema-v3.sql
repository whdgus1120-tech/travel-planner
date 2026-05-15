-- ⚠️ Supabase SQL Editor에서 실행하세요 (새 쿼리)
-- research_items 테이블에 place_category 컬럼 추가

alter table research_items
  add column if not exists place_category text default 'sightseeing';
