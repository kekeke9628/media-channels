// 파생 상태 규칙 (사양서 4장) — 상태는 저장하지 않고 날짜에서 계산한다.
// 여기서 다루는 p는 배치(placement, 홍보물 정보가 얹혀 평탄화된 것)다 — 배치는 항상
// media_id·start_date를 갖고 생성되므로(DB 제약) "미배치" 여부는 여기서 판단할 대상이 아니다.
// 미배치는 홍보물(postings)에 배치가 0개인 상태를 뜻하며, PromosPanel이 별도로 판단한다.
import { diffDays } from '../constants.js';

export const statusOf = (p, ref) => {
  if (p.removedAt) return 'removed';
  if (p.start > ref) return 'upcoming';
  if (!p.end) return 'open';
  if (p.end < ref) return 'overdue';
  return 'live';
};

// 후속 배치가 시작됐다면 이전 것은 물리적으로 반드시 철거됐다 (4.2). 기록 누락이면 자동으로 채운다.
export function autoClose(placements, ref) {
  const by = {};
  placements.forEach((p) => (by[p.mediaId] = by[p.mediaId] || []).push(p));
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

export function buildState(media, placements, ref) {
  const by = {};
  placements.forEach((p) => (by[p.mediaId] = by[p.mediaId] || []).push(p));
  return media.filter((m) => m.active).map((m) => {
    const list = (by[m.id] || []).slice().sort((a, b) => a.start.localeCompare(b.start));
    const live = list.find((p) => statusOf(p, ref) === 'live');
    const open = list.find((p) => statusOf(p, ref) === 'open');
    const overdue = list.find((p) => statusOf(p, ref) === 'overdue');
    const next = list.find((p) => statusOf(p, ref) === 'upcoming');
    const current = live || open || null;
    const removed = list.filter((p) => p.removedAt);
    let emptyDays = 0;
    if (!current && !overdue) {
      const last = removed.length ? removed[removed.length - 1].removedAt : null;
      emptyDays = last ? diffDays(last, ref) : 365;
    }
    return {
      ...m, current, live: live || null, open: open || null, overdue: overdue || null, next: next || null,
      history: list, emptyDays, isEmpty: !current && !overdue,
      openDays: open ? diffDays(open.start, ref) : null,
      dToRemove: live ? diffDays(ref, live.end) : null,
      overdueDays: overdue ? diffDays(overdue.end, ref) : null,
    };
  });
}
