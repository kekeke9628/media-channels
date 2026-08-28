-- 교체 — "걸려 있던 홍보물을 내리고 그 자리에 새것을 건다"를 한 동작으로.
--
-- 지금까지는 철거를 누르고, 다시 배치를 눌러 매체·면·기간을 처음부터 다시 골라야 했다.
-- 현장에서 가장 자주 하는 일인데 가장 손이 많이 갔고, 중간에 그만두면 그 면이 빈 채로
-- 남는다. 두 가지가 한 트랜잭션 안에서 같이 되거나 같이 안 되게 묶는다.
--
-- 배제 제약이 닫힌 구간이라(daterange(start,end,'[]'), 018) 옛 배치의 종료일과 새 배치의
-- 시작일이 같으면 겹친 것으로 본다. 그래서 옛 배치는 "교체일 하루 전까지 걸려 있었다"로
-- 닫는다 — 실제로도 그게 맞다. 당일 걸었다 당일 교체하는 경우에는 시작일보다 앞설 수
-- 없으므로 시작일에서 멈춘다(하루짜리 배치로 남는다).
--
-- security invoker다 — 호출한 사람의 권한으로 돌아서 placements의 RLS(is_editor)가
-- 그대로 적용된다. 조회자가 부르면 UPDATE/INSERT 단계에서 막힌다.
create or replace function public.replace_placement(
  p_old_id     uuid,
  p_posting_id uuid,
  p_date       date,
  p_end        date
)
returns public.placements
language plpgsql
security invoker
set search_path = public
as $$
declare
  old_row public.placements;
  new_row public.placements;
begin
  select * into old_row from public.placements where id = p_old_id for update;
  if not found then
    raise exception '교체할 배치를 찾을 수 없습니다.';
  end if;
  if old_row.removed_at is not null then
    raise exception '이미 철거된 배치입니다.';
  end if;

  update public.placements
     set end_date       = greatest(old_row.start_date, p_date - 1),
         removed_at     = p_date,
         removal_source = 'manual'
   where id = p_old_id;

  -- 매체·면·방향은 자리의 속성이라 그대로 물려받는다. 사람이 다시 고를 이유가 없고,
  -- 고르게 하면 엉뚱한 면에 걸릴 여지만 생긴다.
  insert into public.placements (posting_id, media_id, face, face_label, start_date, end_date)
  values (p_posting_id, old_row.media_id, old_row.face, old_row.face_label, p_date, p_end)
  returning * into new_row;

  return new_row;
end;
$$;

revoke all on function public.replace_placement(uuid, uuid, date, date) from public;
grant execute on function public.replace_placement(uuid, uuid, date, date) to authenticated;
