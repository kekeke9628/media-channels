-- 철거한 배치는 그 면을 더 이상 점유하지 않는다.
--
-- 지금까지 배제 제약이 removed_at을 안 봤다. 그래서 홍보물을 철거해도 그 배치의 기간이
-- 그대로 남아 면을 계속 잡고 있었다 — 특히 "종료일 미정"으로 걸어 둔 배치를 철거하면
-- daterange(start, null, '[]')가 [시작일, 무한대)라, 그 면에는 앞으로 아무것도 못 걸었다.
--
-- 화면에서는 이게 "겹치는 배치가 있습니다 — 빌리지 리워드 (2026-08-26 ~ 미정). 그대로
-- 진행하면 종료일이 조정됩니다"로 나타났다. 이미 철거한 것을 두고 겹친다고 하니 사용자가
-- 무엇을 잘못했는지 알 수 없고, "그대로 진행"을 눌러야만 넘어갈 수 있었다.
--
-- 철거일(removed_at)과 종료일(end_date)은 서로 다른 것이라 합치지 않는다 — 종료일은
-- "언제까지 걸기로 한 것", 철거일은 "실제로 뗀 날"이고, 만료 판정(종료일이 지났는데 아직
-- 안 뗌)이 둘의 차이로 계산된다. 그래서 종료일을 철거일로 덮어쓰는 대신, 철거된 행을
-- 제약에서 빼는 쪽으로 푼다. 자리를 비우는 건 물리적으로도 철거가 맞다.
alter table public.placements drop constraint if exists placements_media_id_face_daterange_excl;
alter table public.placements add constraint placements_media_id_face_daterange_excl
  exclude using gist (
    media_id with =,
    face with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (removed_at is null);
