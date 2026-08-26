-- 홍보물에서 규격(매체 유형) 개념을 걷어낸다.
--
-- 021에서 규격을 나눈 이유는 "웨더워리어용 900×1800과 듀라트란스용 1030×1456은 물리적으로
-- 다른 인쇄물"이라서였다. 그런데 실제로 써 보니 같은 디자인이 매체마다 크기만 조금 다를
-- 뿐이라, 규격을 나누면 똑같이 생긴 홍보물만 잔뜩 생긴다. 이 시스템의 목적은 인쇄 발주가
-- 아니라 "지금 무엇이 어디에 걸려 있는가"를 관리하는 것이므로 규격은 관리 대상이 아니다.
--
-- 옮길 때 데이터는 홍보물 4건이 전부 규격 1개씩(ww_fixed)이라 1:1로 그대로 들어갔다.
alter table public.postings
  add column if not exists thumb_path  text,
  add column if not exists view_path   text,
  add column if not exists bytes_orig  int not null default 0,
  add column if not exists bytes_light int not null default 0;

-- 홍보물마다 규격이 여럿이면 파일이 있는 것 중 가장 먼저 만든 것을 대표로 남긴다.
update public.postings p
set thumb_path  = v.thumb_path,
    view_path   = v.view_path,
    bytes_orig  = v.bytes_orig,
    bytes_light = v.bytes_light
from (
  select distinct on (posting_id) posting_id, thumb_path, view_path, bytes_orig, bytes_light
  from public.posting_variants
  order by posting_id, (thumb_path is null), created_at
) v
where v.posting_id = p.id;

drop table if exists public.posting_variants;
