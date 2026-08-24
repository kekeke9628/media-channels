-- 021에서 홍보물의 유형·이미지를 posting_variants로 옮긴 뒤, 옛 컬럼은 새 배포가 실제로
-- 도는 걸 확인할 때까지 일부러 남겨 뒀다(문제가 생기면 되돌릴 자리로). 캠페인 구조 배포가
-- 정상 동작하는 것을 확인했으므로 이제 치운다.
--
-- 지우기 전에 확인한 것 — 옮겨가지 못한 데이터가 없다는 네 가지:
--   · 규격이 하나도 없는 홍보물 0건
--   · 옛 type과 같은 규격이 없는 홍보물 0건
--   · 옛 이미지 경로가 어느 규격에도 없는 홍보물 0건
--   · 옛 용량이 규격 합계와 다른 홍보물 0건
-- 그리고 이 컬럼에 매달린 뷰·함수·정책·인덱스가 없다는 것(딸린 건 postings_type_fkey
-- 하나뿐이고, 이건 컬럼과 함께 사라진다).
--
-- 앱 코드는 이미 posting_variants만 읽고 쓴다(mapPosting은 옛 컬럼을 보지 않고,
-- addPostingVariant가 이미지 경로·용량을 규격 쪽에 넣는다).
alter table public.postings
  drop column if exists type,
  drop column if exists thumb_path,
  drop column if exists view_path,
  drop column if exists bytes_orig,
  drop column if exists bytes_light;
