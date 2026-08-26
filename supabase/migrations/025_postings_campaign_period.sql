-- 홍보물 자체의 게시 기간.
--
-- 배치(placements)의 기간은 "이 자리에 언제부터 언제까지 걸려 있었나"이고, 여기 기간은
-- "이 홍보물을 언제부터 언제까지 쓰는가"다 — 예: 8월 프로모션은 8/1~8/31이고, 그 안에서
-- 어느 자리에 언제 걸었는지는 배치가 따로 기록한다.
--
-- 둘 다 비어 있으면 상시(기간 제한 없음)로 본다. 지난 홍보물을 새로 걸 후보에서 빼는 데
-- 쓰므로 종료일만 넣고 시작일을 비워 두는 것도 허용한다.
alter table public.postings
  add column if not exists start_date date,
  add column if not exists end_date   date;

alter table public.postings
  add constraint postings_period_order check (end_date is null or start_date is null or end_date >= start_date);
