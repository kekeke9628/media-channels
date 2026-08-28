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

// 매체명 두 번째 글자가 EAST/WEST 구분자다 — DEH01이면 D(듀라트란스) E(EAST) H(HIGH) 01.
// 지도 핀 좌표로 계산하는 zone과 달리 이름은 현장에서 쓰는 실제 표기라, 이름이 있으면
// 이름을 따른다. 규칙에 안 맞는 이름(예전에 자유롭게 붙인 것)은 좌표로 계산한 zone에서
// 가져온다 — 어느 쪽으로도 못 정하면 null이고, 조회에서는 "구분 없음"으로 묶인다.
// 매체명이 곧 자리다 — DEL01이면 D(듀라트란스) E(EAST) L(LOW) 01.
//
// 구역은 원래 핀 좌표로 계산했는데(zoneAt), 그 기준 사각형은 배치도를 올리기 전 회색
// 도면에 맞춰 잡아둔 값이라 실제 배치도와 아무 관계가 없다 — 26개 중 19개의 층(HIGH/
// MIDDLE/LOW)이 이름과 어긋나 있었다. 게다가 HIGH·LOW는 층이 아니라 거리 이름이라
// (East High Street / East Low Street) 좌표를 사각형으로 잘라서는 애초에 못 나눈다.
// 그 자리를 아는 사람이 붙인 이름을 따르고, 규칙에 안 맞는 이름만 좌표 계산으로 넘긴다.
const SIDES = { E: 'EAST', W: 'WEST' };
const LEVELS = { H: 'HIGH', M: 'MIDDLE', L: 'LOW' };
// data/seed.js가 이 파일을 불러오므로 여기서 seed를 불러오면 순환이 된다 — 목록을 직접 둔다.
const VALID_ZONES = new Set(['WEST_HIGH', 'WEST_MIDDLE', 'WEST_LOW', 'EAST_HIGH', 'EAST_LOW']);
export function zoneOf(m) {
  const n = (m?.name || '').trim().toUpperCase();
  const z = `${SIDES[n[1]] || ''}_${LEVELS[n[2]] || ''}`;
  return VALID_ZONES.has(z) ? z : (m?.zone || null);
}

export function sideOf(m) {
  const c = (m?.name || '').trim().toUpperCase()[1];
  if (c === 'E') return 'EAST';
  if (c === 'W') return 'WEST';
  if (typeof m?.zone === 'string') {
    if (m.zone.startsWith('EAST')) return 'EAST';
    if (m.zone.startsWith('WEST')) return 'WEST';
  }
  return null;
}
export const SIDE_LABEL = { EAST: 'EAST', WEST: 'WEST', null: '구분 없음' };

// 설치 확인 사진은 "실제로 이 자리에 걸렸다"는 증빙이라, 관리 목적에서는 이게 본체다.
// 다만 게시예정(시작일이 미래) 배치는 아직 안 걸렸으니 찍을 수가 없다 — 오늘부터 걸리는
// 배치에서만 필수로 본다. 미래 예약은 그냥 두고, 시작일이 지나면 알람이 대신 쫓아간다.
export const installPhotoRequired = (start, refDate) => !!start && start <= refDate;

// 매체명은 현장에서 그 자리를 부르는 이름이라 겹치면 안 된다 — 목록·검색·알람이 전부
// 이름으로 사람에게 보이는데, 같은 이름이 둘이면 어느 쪽 이야기인지 알 수가 없다.
// 대소문자와 앞뒤 공백은 같은 이름으로 본다(WEL01과 wel01 을 따로 두면 더 헷갈린다).
// 보관된 매체까지 포함해서 본다 — 복구하면 그때 겹치기 때문.
export const sameName = (a, b) => (a || '').trim().toUpperCase() === (b || '').trim().toUpperCase();
export const nameTaken = (media, name, exceptId) =>
  media.some((m) => m.id !== exceptId && sameName(m.name, name));

// 매체명 정렬. 숫자를 숫자로 비교한다(numeric) — 문자열로만 비교하면 WEL10이 WEL2보다
// 앞에 온다. 지금은 두 자리로 맞춰 쓰고 있어 티가 안 나지만, 10을 넘기는 순간 어긋난다.
export const byName = (a, b) => (a || '').localeCompare(b || '', 'ko', { numeric: true, sensitivity: 'base' });

// 홍보물 자체의 게시 기간.
// 배치의 기간과는 다른 것이다: 여기는 "이 홍보물을 언제까지 쓰는가", 배치는 "이 자리에
// 언제부터 언제까지 걸려 있었나".
//
// 한때는 "둘 다 비면 상시"로 봤는데, 기간 칸이 생기기 전에 등록된 홍보물이 전부 빈 값이라
// 화면에 죄다 "상시"로 떴다 — 인쇄물에 7/10~9/30이 찍힌 크록스까지 "상시"였다. 빈 값 하나로
// "정말 상시"와 "아직 안 넣음" 두 가지를 나타낼 수 없어서, 사람이 상시라고 고른 것만
// alwaysOn으로 따로 저장한다(026). 안 고른 빈 값은 미입력이고, 미입력이라고 말해 줘야
// 누군가 채워 넣는다.
export const periodUnset = (p) => !p?.start && !p?.end && !p?.alwaysOn;
export const periodLabel = (p) => {
  if (p?.start || p?.end) return `${p.start || '시작일 미정'} ~ ${p.end || '미정'}`;
  return p?.alwaysOn ? '상시' : '기간 미입력';
};
// 종료일이 지난 홍보물 — 새로 걸 후보에서 뺀다. 시작일만 미래인 것은 뺄 이유가 없다
// (미리 잡아 두는 경우가 있다).
export const postingExpired = (p, refDate) => !!p?.end && p.end < refDate;

// 배치 기간의 기본값을 홍보물의 게시 기간에서 가져온다. 둘은 별개의 개념이지만(위 주석)
// 실제로는 "캠페인 도는 동안 걸어 둔다"가 대부분이라, 같은 날짜를 두 번 입력하게 하는
// 것보다 채워 주고 필요할 때 고치게 하는 쪽이 현장에서 훨씬 덜 틀린다.
// 기간을 안 넣은 홍보물(상시)이면 원래 기본값(비어 있는 면의 다음 날 / 오늘+30일)을 쓴다.
export const placementDefaults = (posting, fallbackStart, fallbackEnd) => ({
  start: posting?.start || fallbackStart,
  end: posting?.end || fallbackEnd,
  // 홍보물이 종료일을 갖고 있으면 "종료일 미정" 체크는 풀어 준다 — 기간이 있는데
  // 철거 알람이 안 가면 그게 더 문제다.
  forceEnd: !!posting?.end,
  from: !!(posting?.start || posting?.end),
});

// 홍보물 게시 기간과 배치 기간이 어긋났는지 — 종료일만 본다. 시작일은 캠페인이 시작된
// 뒤에 뒤늦게 거는 일이 흔해 달라도 이상할 게 없지만, 종료일이 다르면 캠페인이 끝난
// 뒤에도 걸려 있거나 반대로 일찍 내려가는 뜻이라 짚어 줘야 한다.
// placementEnd는 "종료일 미정"이면 null.
export const endMismatch = (postingEnd, placementEnd) => !!postingEnd && (placementEnd || null) !== postingEnd;
