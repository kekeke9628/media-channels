import { useState, useRef, useEffect } from 'react';

// 화면 상태(보고 있던 탭, 열어둔 매체 상세 등)를 기기에 잠깐 기억해 둔다.
//
// 왜 필요한가: 휴대폰에서 다른 앱을 잠깐 보고 돌아오면 브라우저가 메모리를 아끼려고 탭을
// 버렸다가 다시 여는 일이 잦다(특히 iOS). 그러면 페이지가 처음부터 다시 뜨면서 보고 있던
// 탭·열어둔 매체·스크롤 위치가 전부 초기화된다 — 사용자 눈에는 "창이 닫힌" 것으로 보인다.
// 로그인은 그대로 살아 있으므로(Supabase가 세션을 저장한다) 화면 위치만 되살리면 된다.
//
// 오래된 값까지 되살리면 곤란하다. 어제 보던 매체가 오늘 아침에 열려 있으면 그게 더
// 이상하므로, 정해둔 시간이 지난 값은 버린다.
const MAX_AGE = 3 * 60 * 60 * 1000; // 3시간

const read = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const { v, t } = JSON.parse(raw);
    if (!t || Date.now() - t > MAX_AGE) { localStorage.removeItem(key); return undefined; }
    return v;
  } catch { return undefined; }
};

export function useSticky(key, initial) {
  const [value, setValue] = useState(() => {
    const saved = read(key);
    return saved === undefined ? initial : saved;
  });
  useEffect(() => {
    try {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({ v: value, t: Date.now() }));
    } catch { /* 저장 못 해도 이번 세션 동작에는 지장 없다 */ }
  }, [key, value]);
  return [value, setValue];
}

// 세로 스크롤 위치 되살리기. 목록을 한참 내려보다가 돌아왔을 때 맨 위로 튕기지 않게 한다.
// 데이터가 다 그려진 뒤에 옮겨야 해서 ready가 true가 된 다음에 한 번만 실행한다.
export function useStickyScroll(key, ready) {
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const y = read(key);
    if (typeof y === 'number' && y > 0) {
      // 레이아웃이 자리를 잡은 다음 프레임에 옮긴다 — 바로 하면 아직 짧은 문서에서 잘린다.
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
    }
  }, [key, ready]);
  useEffect(() => {
    let timer = null;
    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try { localStorage.setItem(key, JSON.stringify({ v: window.scrollY, t: Date.now() })); } catch { /* noop */ }
      }, 200);
    };
    window.addEventListener('scroll', save, { passive: true });
    // 탭이 버려지기 직전에 마지막 위치를 확실히 남긴다 — iOS는 unload가 안 올 때가 많고
    // visibilitychange(hidden)가 그나마 믿을 수 있는 마지막 신호다.
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { clearTimeout(timer); window.removeEventListener('scroll', save); document.removeEventListener('visibilitychange', onHide); };
  }, [key]);
}
