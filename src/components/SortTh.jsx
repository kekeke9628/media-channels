import React from 'react';

// 클릭할 때마다 오름차순 → 내림차순 → 정렬 해제 순으로 토글되는 정렬 가능한 테이블 헤더.
export default function SortTh({ label, sortKey, sort, setSort, className }) {
  const active = sort.key === sortKey;
  const dir = active ? sort.dir : null;
  const toggle = () => setSort((prev) => {
    if (prev.key !== sortKey) return { key: sortKey, dir: 'asc' };
    if (prev.dir === 'asc') return { key: sortKey, dir: 'desc' };
    return { key: null, dir: null };
  });
  return (
    <th className={'sortable' + (className ? ' ' + className : '')} onClick={toggle}>
      {label}
      <span className={'sort-arrow' + (active ? ' on' : '')}>{dir === 'desc' ? '▼' : dir === 'asc' ? '▲' : '↕'}</span>
    </th>
  );
}

// rows를 sort({key, dir})에 따라 정렬한다. sort.key가 없으면(정렬 해제) 원래 순서 그대로 둔다 —
// "홍보물 관리"는 만료 우선 정렬이 사양(11장)이라 기본 정렬은 각 패널이 이미 계산해 둔 순서를 따라야 한다.
export function sortRows(rows, sort, getValue) {
  if (!sort.key) return rows;
  const dir = sort.dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = getValue(a, sort.key);
    const bv = getValue(b, sort.key);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}
