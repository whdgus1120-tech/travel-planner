-- Google Maps 링크 컬럼 추가
-- Supabase SQL Editor에서 실행하세요

alter table candidate_places add column if not exists maps_url text default '';
alter table activities add column if not exists maps_url text default '';
