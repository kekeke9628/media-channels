import { useState, useRef, useEffect } from 'react';

// 체크박스 필터(매체 유형 등)의 선택 집합을 목록과 계속 맞춰 준다.
//
// 지금까지는 화면이 처음 뜰 때 한 번만 채우고 그대로 뒀다. 그래서 유형을 지우면 사라진
// 코드가 집합에 남아 개수가 부풀고("매체 유형 5"인데 유형은 4개), 유형을 새로 만들면
// 집합에 없어서 그 유형의 매체가 지도에서 통째로 안 보였다 — 필터를 건드린 적도 없는데
// 안 보이니 원인을 찾기 어려운 종류의 버그다.
//
// 규칙: 없어진 코드는 빼고, 새로 생긴 코드는 켠 채로 넣는다(새 유형은 보이는 게 기본).
// 사용자가 직접 끈 코드는 목록에 남아 있는 한 그대로 꺼진 상태를 유지한다.
export function useCodeFilter(codes) {
  const key = codes.join('|');
  const [sel, setSel] = useState(() => new Set(codes));
  const seen = useRef(codes);
  useEffect(() => {
    const now = new Set(codes);
    const before = seen.current;
    seen.current = codes;
    setSel((prev) => {
      const next = new Set([...prev].filter((c) => now.has(c)));
      for (const c of codes) if (!before.includes(c)) next.add(c);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [sel, setSel];
}
