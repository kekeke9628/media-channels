import React from 'react';
import { ALERT_DAYS } from '../constants.js';

// 알람 예정 — Slack 알람 3종의 문구를 그대로 미리 보여준다 (사양서 7장)
//
// 이 화면을 보는 목적은 "확인"이 아니라 "조치"다. 예전에는 만료·철거예고가 나열만 되고
// 버튼이 없어서, 한 건 처리하려면 매체 현황 탭으로 옮겨 표에서 그 행을 눈으로 찾아야 했다
// (최소 3클릭 + 탐색). 여기서 바로 철거 처리하고, 매체명을 누르면 그 매체 상세로 간다.
export default function AlertPanel({ alerts, kpi, isEditor, onRemove, onPick }) {
  const row = (o, badge, pl) => (
    <div className="slack" key={o.id}>
      <b>{badge}</b>
      <span>
        <button className="linklike" onClick={() => onPick(o.mediaId)}>[{o.name}]</button> {pl.brand} (~{pl.end || '미정'})
      </span>
      {isEditor && <button className="mini ok alert-act" onClick={() => onRemove(pl.id)}>철거 처리</button>}
    </div>
  );

  return (
    <div className="alertwrap">
      <p className="hint">아래 내용이 <b>슬랙</b>으로 자동 발송됩니다 · 매일 오전 9시 · 종료일 {ALERT_DAYS}일 전부터 알림</p>

      <section className="block">
        <h3>① 철거 예고 <span>{alerts.soon.length}건</span></h3>
        {alerts.soon.length === 0 && <p className="empty">해당 없음</p>}
        {alerts.soon.map((o) => row(o, `⏳ ${o.dToRemove === 0 ? '오늘' : o.dToRemove + '일 후'} 철거`, o.live))}
      </section>

      <section className="block">
        <h3>② 만료 <span>{alerts.stale.length}건</span></h3>
        {alerts.stale.length === 0 && <p className="empty">해당 없음</p>}
        {alerts.stale.length > 0 && (
          <>
            {/* 슬랙으로 나가는 문구는 이렇게 한 덩어리다 — 실제 발송 모양을 그대로 보여준다. */}
            <div className="slack danger">
              <b>🚨 만료된 배치 {alerts.stale.length}건</b>
              <span>{alerts.stale.slice(0, 4).map((o) => `[${o.name}] ${o.overdue.brand} +${o.overdueDays}일`).join(' / ')}{alerts.stale.length > 4 ? ` 외 ${alerts.stale.length - 4}건` : ''}</span>
            </div>
            {/* 조치는 건별로 해야 하므로 아래에 따로 편다. */}
            {alerts.stale.map((o) => row(o, `+${o.overdueDays}일 지남`, o.overdue))}
          </>
        )}
      </section>

      {/* 관리 목적에서 "실제로 걸렸다"를 증명하는 건 설치 확인 사진뿐이다 — 등록만 해두고
          현장 확인이 빠진 건을 여기서 쫓아간다. 매체명을 눌러 상세로 가면 바로 찍을 수 있다. */}
      <section className="block">
        <h3>③ 설치 확인 사진 없음 <span>{alerts.noPhoto.length}건</span></h3>
        {alerts.noPhoto.length === 0 && <p className="empty">해당 없음</p>}
        {alerts.noPhoto.map((o) => {
          const pl = o.overdue || o.current;
          return (
            <div className="slack" key={'np' + o.id}>
              <b>📷 사진 없음</b>
              <span>
                <button className="linklike" onClick={() => onPick(o.mediaId)}>[{o.name}]</button> {pl.brand} ({pl.start}부터)
              </span>
            </div>
          );
        })}
      </section>

      <section className="block">
        <h3>④ 주간 요약 <span>매주 월 09:00</span></h3>
        <div className="slack"><b>📋 이번 주 점내 홍보매체</b><span>게시중 {kpi.live + kpi.open}/{kpi.total} · 만료 {kpi.stale} · 종료일 미정 {kpi.open}건(1년 초과 {kpi.longOpen})</span></div>
      </section>
    </div>
  );
}
