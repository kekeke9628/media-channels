// 배너 시스템 재사용분 + 프로토타입 확장분 (사양서 1장 / 2.1)
export const DAY = 86400000;

export const getToday = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());

export const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const days = (s, e) => (e ? Math.round((Date.parse(e) - Date.parse(s)) / DAY) + 1 : null);
export const diffDays = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const md = (ms) => {
  const d = new Date(ms);
  return d.getUTCMonth() + 1 + '/' + d.getUTCDate();
};

export const ALERT_DAYS = 3;
export const LONG_OPEN = 365;

// 상태는 게시중 / 게시예정 / 만료 / 철거완료 4가지로만 보인다(+ 매체 단위의 비어있음).
// open(종료일 미정)은 별도 상태가 아니라 "게시중인데 종료일만 안 정해진 것"이므로 live와
// 같은 라벨·색을 쓴다 — 종료일 자체는 표의 종료일 칸에 "미정"으로 이미 드러난다.
// 색은 옅은 배경(soft) 위에 11px 글자로 얹히므로 대비가 WCAG AA 기준(4.5:1)을 넘어야 한다.
// 예전 값은 "철거완료" 2.57:1, "만료" 4.01:1이라 작은 글자가 흐려 잘 안 읽혔다 — 배경은
// 그대로 두고 글자색만 같은 색 계열에서 어둡게 내려 톤은 유지했다.
export const ST = {
  live: { label: '게시중', color: '#3C6E9E', soft: '#E4EDF4' },
  open: { label: '게시중', color: '#3C6E9E', soft: '#E4EDF4' },
  upcoming: { label: '게시예정', color: '#7A5AA6', soft: '#EEE8F4' },
  overdue: { label: '만료', color: '#A74D46', soft: '#F4E5E3' },
  removed: { label: '철거완료', color: '#6F6B63', soft: '#EFEDE9' },
};

// 매체 유형 칩은 "유형 색 10% 틴트 배경 + 같은 색 글자"인데, 금색(#BE8A2E)·주황(#C2703D)처럼
// 밝은 유형 색은 그대로 쓰면 2.8~3.3:1까지 떨어져 11px 글자가 흐려진다. 저장된 유형 색은
// 지도 핀 배경(흰 글자)에도 쓰이므로 건드리지 않고, 칩 글자만 4.5:1이 될 때까지 어둡게 쓴다.
const srgb = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const relLum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
export function typeChipStyle(color) {
  const hex = (color || '#7A7263').replace('#', '');
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0);
  const bgL = relLum(rgb.map((v) => v * 0.1 + 255 * 0.9)); // 10% 틴트를 흰 배경에 합성한 결과
  let out = rgb;
  for (let f = 1; f >= 0.2; f -= 0.02) {
    out = rgb.map((v) => Math.round(v * f));
    const fgL = relLum(out);
    if ((Math.max(fgL, bgL) + 0.05) / (Math.min(fgL, bgL) + 0.05) >= 4.5) break;
  }
  return { background: (color || '#7A7263') + '1A', color: '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('') };
}

export const contentOf = (p) => p.title || p.brand;
// 화면에 업체명과 나란히 찍을 때 쓰는 "내용". contentOf는 비었을 때 업체명으로 대신하는데,
// 그대로 옆에 두면 "스타벅스 / 스타벅스"처럼 같은 말이 두 번 나온다 — 다를 때만 돌려준다.
export const subOf = (p) => (p.title && p.title !== p.brand ? p.title : '');

// 검색 비교용 정규화 — 소문자화 + 공백 제거. "웨더 워리어"로 쳐도 "웨더워리어"가 걸리게 한다.
// 한글은 띄어쓰기가 사람마다 달라서(웨더워리어/웨더 워리어), 공백을 그대로 두면 0건이 나온다.
export const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, '');
export const matches = (haystack, query) => norm(haystack).includes(norm(query));
