-- 홍보물 = 캠페인, 그 안에 규격(매체 유형)별 인쇄 파일.
--
-- 같은 캠페인이라도 웨더워리어용(900×1800)과 듀라트란스용(1030×1456)은 물리적으로 다른
-- 인쇄물이라 파일이 따로 있다. 지금까지는 postings에 type과 이미지가 한 벌만 있어서, 같은
-- 캠페인을 유형 수만큼 별개 홍보물로 등록해야 했고 서로 묶이지도 않았다. 게다가 등록 시
-- 고른 type을 나중에 고칠 방법이 없어서, 잘못 고르면 그 홍보물은 영영 못 걸었다.
--
-- 배치(placements)는 손대지 않는다 — 어느 규격 파일을 쓰는지는 그 배치가 걸린 매체의
-- 유형이 이미 결정하므로, 따로 기록할 필요가 없다.
create table if not exists public.posting_variants (
  id          uuid primary key default gen_random_uuid(),
  posting_id  uuid not null references public.postings(id) on delete cascade,
  type        text not null references public.media_types(code),
  thumb_path  text,
  view_path   text,
  bytes_orig  int  not null default 0,
  bytes_light int  not null default 0,
  created_at  timestamptz not null default now(),
  -- 한 캠페인에 같은 규격이 두 벌 있을 이유가 없다.
  unique (posting_id, type)
);

create index if not exists posting_variants_posting_idx on public.posting_variants(posting_id);

-- 기존 홍보물의 type·이미지를 규격 한 벌로 옮긴다.
insert into public.posting_variants (posting_id, type, thumb_path, view_path, bytes_orig, bytes_light, created_at)
select id, type, thumb_path, view_path, bytes_orig, bytes_light, created_at
from public.postings
on conflict (posting_id, type) do nothing;

alter table public.posting_variants enable row level security;

-- postings와 동일한 정책: 직원은 읽고, 편집자만 쓴다.
create policy posting_variants_select on public.posting_variants for select using (is_staff());
create policy posting_variants_insert on public.posting_variants for insert with check (is_editor());
create policy posting_variants_update on public.posting_variants for update using (is_editor()) with check (is_editor());
create policy posting_variants_delete on public.posting_variants for delete using (is_editor());
