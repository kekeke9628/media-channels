// Slack 알람 3종 (사양서 7장 / AlertPanel.jsx와 동일한 문구) — GitHub Actions에서 매일 실행.
// 화면에 보여주는 것과 같은 파생 상태 로직(src/lib/status.js)을 그대로 재사용해
// 알람 문구가 화면과 어긋나지 않게 한다. service role key로 RLS를 우회해 전체를 조회한다.
import { createClient } from '@supabase/supabase-js';
import { autoClose, buildState } from '../src/lib/status.js';
import { ALERT_DAYS, LONG_OPEN, getToday, removeIn, lateLabel } from '../src/constants.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const SEND_WEEKLY = process.env.SEND_WEEKLY === 'true';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SLACK_WEBHOOK_URL) {
  throw new Error('필수 환경변수 누락: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SLACK_WEBHOOK_URL');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function postSlack(text) {
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Slack webhook 실패: ${res.status} ${await res.text()}`);
}

async function main() {
  const ref = getToday();

  const [{ data: media, error: mErr }, { data: postingsRaw, error: pErr }] = await Promise.all([
    supabase.from('media').select('id,name,type,faces,spec,active,zone,x,y'),
    supabase.from('postings').select('id,media_id,brand,title,start_date,end_date,removed_at,removal_source'),
  ]);
  if (mErr) throw mErr;
  if (pErr) throw pErr;

  const postings = postingsRaw.map((p) => ({
    id: p.id, mediaId: p.media_id, brand: p.brand, title: p.title || '',
    start: p.start_date, end: p.end_date, removedAt: p.removed_at, removalSource: p.removal_source,
  }));

  const state = buildState(media, autoClose(postings, ref), ref);

  const soon = state.filter((o) => o.live && o.dToRemove >= 0 && o.dToRemove <= ALERT_DAYS).sort((a, b) => a.dToRemove - b.dToRemove);
  const stale = state.filter((o) => o.overdue).sort((a, b) => b.overdueDays - a.overdueDays);

  const messages = [];

  // ① 철거 예고
  soon.forEach((o) => {
    // 철거일은 종료일 다음 날 — 앱의 알람 예정 탭과 같은 문구를 쓴다(removeIn).
    messages.push(`⏳ ${removeIn(o.dToRemove)} 철거: [${o.name}] ${o.live.brand} (게시 ~${o.live.end})`);
  });

  // ② 만료
  if (stale.length) {
    // 앱의 알람 예정 탭과 같은 문구(lateLabel) — 어제 끝난 자리는 "오늘 철거"지 "+1일"이 아니다.
    const detail = stale.slice(0, 4).map((o) => `[${o.name}] ${o.overdue.brand} ${lateLabel(o.overdue, ref)}`).join(' / ');
    const rest = stale.length > 4 ? ` 외 ${stale.length - 4}건` : '';
    messages.push(`🚨 만료된 게시물 ${stale.length}건\n${detail}${rest}`);
  }

  if (messages.length) {
    await postSlack(messages.join('\n\n'));
    console.log(`${ref} 기준 일일 알람 ${messages.length}건 전송 완료`);
  } else {
    console.log(`${ref} 기준 알람 대상 없음`);
  }

  // ③ 주간 요약 — 매주 월요일 실행 시에만(워크플로에서 SEND_WEEKLY=true로 전달)
  if (SEND_WEEKLY) {
    const live = state.filter((o) => o.live).length;
    const open = state.filter((o) => o.open).length;
    const total = state.length;
    const staleCount = state.filter((o) => o.overdue).length;
    const longOpen = state.filter((o) => o.open && o.openDays >= LONG_OPEN).length;
    await postSlack(`📋 이번 주 점내 홍보매체\n게시중 ${live + open}/${total} · 만료 ${staleCount} · 미정 ${open}(장기 ${longOpen})`);
    console.log(`${ref} 주간 요약 전송 완료`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
