-- "상시"와 "기간을 아직 안 넣음"을 구분한다.
--
-- 025에서 게시 기간을 넣으면서 "둘 다 비면 상시"로 정했는데, 그 기능이 생기기 전에 등록된
-- 홍보물이 이미 23건 있었다. 그것들은 전부 날짜가 비어 있으니 화면에 모두 "상시"로 떴고,
-- 결국 "상시"라는 표시가 아무것도 알려주지 못하게 됐다 — 크록스는 인쇄물에 7/10~9/30이
-- 찍혀 있는데도 "상시"였다.
--
-- 이건 날짜에서 파생할 수 없는 정보다(빈 값 하나로 두 가지 뜻을 담을 수 없다). 그래서
-- "사용자가 상시라고 명시적으로 골랐다"만 따로 저장한다.
--   always_on = true            → 상시 (사람이 골랐다)
--   start_date/end_date 있음    → 그 기간
--   셋 다 비어 있음             → 기간 미입력 (화면에서 채우라고 표시)
--
-- 기본값이 false라 기존 23건은 자동으로 "기간 미입력"이 된다 — 의도한 결과다. 비어 있는
-- 것을 상시로 올려 두면 잘못된 값이 사실인 척 굳어 버린다.
alter table public.postings
  add column if not exists always_on boolean not null default false;

-- 상시와 기간은 서로 배타다. 한쪽만 고쳐 다른 쪽이 남는 사고를 DB에서 막는다 —
-- 화면이 세 군데(AddModal/AssignModal/PlaceOnMediaModal)라 언젠가 한 곳을 빠뜨린다.
alter table public.postings
  drop constraint if exists postings_always_on_exclusive;
alter table public.postings
  add constraint postings_always_on_exclusive
  check (not always_on or (start_date is null and end_date is null));
