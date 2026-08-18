// 시드 데이터 — 사양서 12장의 미확정 항목(실제 규격·자산 목록·기존 게시물 종료일)은
// 전부 이 파일 안에서만 값을 가지므로, 실사 후에는 이 파일만 교체하면 된다.
import { DAY, iso, diffDays } from '../constants.js';

export const DEFAULT_REF = '2026-07-29';

// ── 매체 유형 (사양서 3.1 초기 5종 — default_spec은 임시값) ──────────
export const INIT_TYPES = [
  { code: 'directory', label: '디렉토리', spec: '1200×2400mm', faces: 1, color: '#3C6E9E', glyph: 'E', movable: false, openEnded: true, active: true },
  { code: 'ww_fixed', label: '고정형 웨더워리어', spec: '900×1800mm', faces: 2, color: '#4B7B58', glyph: 'FW', movable: false, openEnded: false, active: true },
  { code: 'ww_mobile', label: '이동형 웨더워리어', spec: '700×1600mm', faces: 2, color: '#C2703D', glyph: 'MW', movable: true, openEnded: false, active: true },
  { code: 'duratrans', label: '듀라트란스', spec: '1030×1456mm', faces: 1, color: '#7A5AA6', glyph: 'D', movable: false, openEnded: false, active: true },
  { code: 'fabric', label: '패브릭홀더', spec: '1500×2000mm', faces: 1, color: '#BE8A2E', glyph: 'F', movable: false, openEnded: false, active: true },
];
const COUNTS = { directory: 8, ww_fixed: 22, ww_mobile: 12, duratrans: 18, fabric: 14 };

// ── 구역 (사양서 3.2 — 5개 고정) ─────────────────────────────────
export const ZONES = {
  WEST_HIGH: { label: 'WEST HIGH', box: [4, 8, 44, 27] },
  WEST_MIDDLE: { label: 'WEST MIDDLE', box: [4, 37, 44, 27] },
  WEST_LOW: { label: 'WEST LOW', box: [4, 66, 44, 27] },
  EAST_HIGH: { label: 'EAST HIGH', box: [52, 8, 44, 41] },
  EAST_LOW: { label: 'EAST LOW', box: [52, 51, 44, 42] },
};
export const ZONE_KEYS = Object.keys(ZONES);

// 좌표(%)가 속한 구역을 찾는다. 지도 위 클릭/드래그로 매체를 배치할 때 구역을 자동으로 매긴다.
export function zoneAt(x, y) {
  for (const [key, z] of Object.entries(ZONES)) {
    const [bx, by, bw, bh] = z.box;
    if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) return key;
  }
  let best = ZONE_KEYS[0], bestDist = Infinity;
  for (const [key, z] of Object.entries(ZONES)) {
    const [bx, by, bw, bh] = z.box;
    const cx = bx + bw / 2, cy = by + bh / 2;
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d < bestDist) { bestDist = d; best = key; }
  }
  return best;
}

export const BRANDS = ['나이키', '아디다스', '룰루레몬', '폴로', '코치', 'MLB', '정관장', '무신사 스탠다드', '빈폴', '타미힐피거', '크록스', '노스페이스', '게스'];
export const CAMPAIGNS = ['여름 기획전', '신상 입고', '시즌오프', '단독 특가', '리뉴얼 오픈', '주말 한정', '브랜드 데이'];

function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 매체 (임시 자산 목록 — 사양서 12.2) — 낱개 매체가 직접 좌표/구역을 갖는다 ────
export const INIT_MEDIA = (() => {
  const R = rng(305);
  const media = [];
  let mid = 0;
  INIT_TYPES.forEach((t) => {
    for (let i = 1; i <= COUNTS[t.code]; i++) {
      const zone = ZONE_KEYS[Math.floor(R() * ZONE_KEYS.length)];
      const [bx, by, bw, bh] = ZONES[zone].box;
      mid++;
      media.push({
        id: 'M' + String(mid).padStart(3, '0'), type: t.code,
        name: t.label + ' ' + String(i).padStart(2, '0'),
        faces: t.faces, spec: '', active: true,
        zone,
        x: +(bx + 0.14 * bw + R() * bw * 0.72).toFixed(2),
        y: +(by + 0.12 * bh + R() * bh * 0.76).toFixed(2),
      });
    }
  });
  return media;
})();

// ── 게시물 (임시 이력 — 실 운영 데이터로 대체 예정) ────────────────
export function buildPostings(ref) {
  const R = rng(13);
  const T0 = Date.parse(ref);
  const out = [];
  let pid = 0;
  const typeOf = (c) => INIT_TYPES.find((t) => t.code === c);

  INIT_MEDIA.forEach((m) => {
    const t = typeOf(m.type);
    if (t.openEnded) {
      pid++;
      out.push({
        id: 'P' + String(pid).padStart(4, '0'), mediaId: m.id,
        brand: '센터', title: '',
        start: iso(T0 - (120 + Math.floor(R() * 700)) * DAY), end: null,
        removedAt: null, removalSource: null,
        hue: 210, bytesOrig: Math.round((3 + R() * 8) * 1048576), bytesLight: Math.round((140 + R() * 180) * 1024),
        driveUrl: 'https://drive.google.com/file/d/' + Math.random().toString(36).slice(2, 12),
        installPhoto: R() > 0.4,
      });
      return;
    }
    const willStale = R() < 0.22;
    let cursor = T0 - (120 + Math.floor(R() * 300)) * DAY;
    for (let k = 0; k < 24; k++) {
      const dur = 21 + Math.floor(R() * 60);
      const start = cursor, end = start + dur * DAY;
      const ended = end < T0;
      pid++;
      const brand = BRANDS[Math.floor(R() * BRANDS.length)];
      out.push({
        id: 'P' + String(pid).padStart(4, '0'), mediaId: m.id, brand,
        title: R() > 0.5 ? CAMPAIGNS[Math.floor(R() * CAMPAIGNS.length)] : '',
        start: iso(start), end: iso(end),
        removedAt: ended ? iso(end + DAY) : null,
        removalSource: ended ? 'manual' : null,
        hue: Math.floor(R() * 360),
        bytesOrig: Math.round((2.4 + R() * 9) * 1048576), bytesLight: Math.round((120 + R() * 190) * 1024),
        driveUrl: 'https://drive.google.com/file/d/' + Math.random().toString(36).slice(2, 12),
        installPhoto: R() > 0.35,
      });
      if (!ended) break;
      if (willStale && diffDays(iso(end), ref) <= 30) {
        out[out.length - 1].removedAt = null; out[out.length - 1].removalSource = null;
        break;
      }
      cursor = end + DAY;
    }
  });
  return out;
}
