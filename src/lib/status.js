// 파생 상태 규칙 (사양서 4장) — 상태는 저장하지 않고 날짜에서 계산한다.
// 여기서 다루는 p는 배치(placement, 홍보물 정보가 얹혀 평탄화된 것)다 — 배치는 항상
// media_id·start_date를 갖고 생성되므로(DB 제약) "미배치" 여부는 여기서 판단할 대상이 아니다.
// 미배치는 홍보물(postings)에 배치가 0개인 상태를 뜻하며, PromosPanel이 별도로 판단한다.
//
// 매체 하나가 여러 물리적 면(face)을 가질 수 있고(웨더워리어 등), 면마다 완전히 다른
// 업체·기간의 홍보물이 걸릴 수 있다 — 앞/뒤가 항상 같은 캠페인이어야 한다는 가정이 실제와
// 달랐다. 그래서 여기서는 (media_id, face) 조합을 "슬롯"이라는 독립된 단위로 다룬다.
import { diffDays } from '../constants.js';

const slotKey = (p) => p.mediaId + '#' + (p.face || 1);

export const statusOf = (p, ref) => {
  if (p.removedAt) return 'removed';
  if (p.start > ref) return 'upcoming';
  if (!p.end) return 'open';
  if (p.end < ref) return 'overdue';
  return 'live';
};

// 후속 배치가 시작됐다면 이전 것은 물리적으로 반드시 철거됐다 (4.2). 기록 누락이면 자동으로
// 채운다 — 같은 슬롯(같은 매체의 같은 면)끼리만 비교한다. 다른 면의 새 배치는 이 면과 무관하다.
export function autoClose(placements, ref) {
  const by = {};
  placements.forEach((p) => (by[slotKey(p)] = by[slotKey(p)] || []).push(p));
  const out = [];
  Object.values(by).forEach((arr) => {
    const list = arr.slice().sort((a, b) => a.start.localeCompare(b.start));
    list.forEach((p, i) => {
      const nxt = list[i + 1];
      if (!p.removedAt && nxt && nxt.start <= ref) out.push({ ...p, removedAt: nxt.start, removalSource: 'auto' });
      else out.push(p);
    });
  });
  return out;
}

// 슬롯(면) 하나의 파생 상태 — 예전 buildState가 매체 단위로 하던 계산을 그대로 슬롯 단위에 적용한다.
function computeSlot(list, ref) {
  const sorted = list.slice().sort((a, b) => a.start.localeCompare(b.start));
  const live = sorted.find((p) => statusOf(p, ref) === 'live');
  const open = sorted.find((p) => statusOf(p, ref) === 'open');
  const overdue = sorted.find((p) => statusOf(p, ref) === 'overdue');
  const next = sorted.find((p) => statusOf(p, ref) === 'upcoming');
  const current = live || open || null;
  const removed = sorted.filter((p) => p.removedAt);
  let emptyDays = 0;
  if (!current && !overdue) {
    const last = removed.length ? removed[removed.length - 1].removedAt : null;
    emptyDays = last ? diffDays(last, ref) : 365;
  }
  return {
    current, live: live || null, open: open || null, overdue: overdue || null, next: next || null,
    history: sorted, emptyDays, isEmpty: !current && !overdue,
    openDays: open ? diffDays(open.start, ref) : null,
    dToRemove: live ? diffDays(ref, live.end) : null,
    overdueDays: overdue ? diffDays(overdue.end, ref) : null,
  };
}

// 그 면이 지금 사용 중인가 — 배치 팝업 셋이 어느 면을 기본으로 고를지, 면 버튼에
// "사용중"을 붙일지 정할 때 쓴다.
//
// 게시예정은 사용 중으로 치지 않는다: 아직 안 걸린 예약이라 그 면은 지금 비어 있고,
// 미리 잡아 두는 일이 흔하다. 철거된 배치도 statusOf가 'removed'라 자연히 빠진다.
// (겹침 판정은 이것과 다르다 — 그건 기간이 겹치는지를 보므로 constants.findOverlap.)
export const faceOccupied = (placements, mediaId, face, ref) => placements.some((pl) => {
  if (pl.mediaId !== mediaId || (pl.face || 1) !== face) return false;
  const st = statusOf(pl, ref);
  return st === 'live' || st === 'open';
});

// 매체 목록 — 지도 핀·매체 상세처럼 "이 매체 전체"를 한 항목으로 다루는 화면이 쓴다.
// 매체별로 faces(면수)만큼 슬롯을 계산해 .slots에 담고, 상단 필드(current·overdue 등)는
// 여러 슬롯 중 가장 급한 것을 대표값으로 얹는다 — 지도 핀 색처럼 값 하나가 필요한 곳에서
// 쓰되, "일부 면만 비었다" 같은 세부는 못 담으므로 정확한 면별 상태는 slots를 봐야 한다.
export function buildState(media, placements, ref) {
  const by = {};
  placements.forEach((p) => (by[slotKey(p)] = by[slotKey(p)] || []).push(p));

  return media.filter((m) => m.active).map((m) => {
    const faceCount = Math.max(1, m.faces || 1);
    const slots = Array.from({ length: faceCount }, (_, i) => {
      const face = i + 1;
      const list = by[m.id + '#' + face] || [];
      const s = computeSlot(list, ref);
      const faceLabel = list.find((p) => p.faceLabel)?.faceLabel || face + '면';
      return {
        ...s, face, faceLabel, mediaId: m.id,
        id: faceCount > 1 ? `${m.id}::${face}` : m.id,
        name: m.name, type: m.type, zone: m.zone, x: m.x, y: m.y,
      };
    });

    const overdueSlot = slots.filter((s) => s.overdue).sort((a, b) => b.overdueDays - a.overdueDays)[0] || null;
    const liveSlot = slots.filter((s) => s.live).sort((a, b) => a.dToRemove - b.dToRemove)[0] || null;
    const openSlot = slots.find((s) => s.open) || null;
    const nextSlot = slots.find((s) => s.next) || null;
    const allEmpty = slots.every((s) => s.isEmpty);

    return {
      id: m.id, type: m.type, name: m.name, zone: m.zone, x: m.x, y: m.y, faces: faceCount,
      slots,
      current: (liveSlot || openSlot)?.current || null,
      live: liveSlot, open: openSlot, overdue: overdueSlot, next: nextSlot,
      isEmpty: allEmpty && !overdueSlot,
      emptyDays: allEmpty ? Math.min(...slots.map((s) => s.emptyDays)) : 0,
      openDays: openSlot?.openDays ?? null,
      dToRemove: liveSlot?.dToRemove ?? null,
      overdueDays: overdueSlot?.overdueDays ?? null,
    };
  });
}

// 매체 현황 표·타임라인·알람처럼 "면" 단위로 한 줄씩 다뤄야 하는 화면이 쓰는 평탄화 버전.
// 단일 면 매체는 이름에 아무것도 안 붙는다(지금까지와 동일하게 매체명만 보임) — 여러 면
// 매체만 "웨더워리어 정문 · 2면"처럼 면 라벨을 붙여 구분한다.
export function flattenSlots(state) {
  return state.flatMap((o) => o.slots.map((s) => ({
    ...s,
    name: o.faces > 1 ? `${o.name} · ${s.faceLabel}` : o.name,
  })));
}
