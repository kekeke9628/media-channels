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

export const ST = {
  live: { label: '게시중', color: '#3C6E9E', soft: '#E4EDF4' },
  open: { label: '미정', color: '#4B7B58', soft: '#E7F0EA' },
  upcoming: { label: '게시예정', color: '#7A5AA6', soft: '#EEE8F4' },
  overdue: { label: '만료', color: '#B4534B', soft: '#F4E5E3' },
  removed: { label: '철거완료', color: '#9A948A', soft: '#EFEDE9' },
};

export const contentOf = (p) => p.title || p.brand;
