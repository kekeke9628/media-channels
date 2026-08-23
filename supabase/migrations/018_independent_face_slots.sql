-- 2면 이상 매체의 각 면을 독립된 슬롯으로 만든다. 지금까지는 홍보물 하나(postings.faces
-- jsonb)가 양면 이미지를 같이 들고 있어서, 앞/뒤가 항상 같은 업체·같은 기간으로 붙어
-- 다녔다 — 실제로는 앞뒤가 다른 광고주로 나가는 경우가 흔해 이 결합이 틀렸다.
--
-- 이제 홍보물(postings)은 언제나 이미지 한 장짜리 단일 시안이고, 어느 면에 걸렸는지는
-- 배치(placements)가 안다. 겹침 방지 제약도 media_id만 보던 것에서 (media_id, face)
-- 조합으로 바뀐다 — 같은 매체라도 면이 다르면 같은 기간에 동시에 걸릴 수 있어야 한다.

alter table public.placements add column face smallint not null default 1;
alter table public.placements add constraint placements_face_check check (face >= 1);
-- 면을 물리적으로 구분하는 라벨("1면", "정문 방향" 등) — 비워두면 화면에서 "N면"으로 채운다.
alter table public.placements add column face_label text;

alter table public.placements drop constraint placements_media_id_daterange_excl;
alter table public.placements add constraint placements_media_id_face_daterange_excl
  exclude using gist (media_id with =, face with =, daterange(start_date, end_date, '[]') with &&);

-- 실 데이터에 채워진 적이 없었다(1건짜리 단일 posting, faces 항상 null) — 안전하게 제거.
alter table public.postings drop column if exists faces;
