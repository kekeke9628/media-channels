import React from 'react';
import { ALERT_DAYS } from '../constants.js';

// 알람 예정 — Slack 알람 3종의 문구를 그대로 미리 보여준다 (사양서 7장)
export default function AlertPanel({ alerts, kpi }) {
  return (
    <div className="alertwrap">
      <p className="hint">매일 09:00 KST · 기준일 D-{ALERT_DAYS} 조건으로 발송</p>

      <section className="block">
        <h3>① 철거 예고 <span>{alerts.soon.length}건</span></h3>
        {alerts.soon.length === 0 && <p className="empty">해당 없음</p>}
        {alerts.soon.map((o) => (
          <div className="slack" key={o.id}><b>⏳ {o.dToRemove === 0 ? '오늘' : o.dToRemove + '일 후'} 철거</b><span>[{o.name}] {o.live.brand} (~{o.live.end})</span></div>
        ))}
      </section>

      <section className="block">
        <h3>② 만료 <span>{alerts.stale.length}건</span></h3>
        {alerts.stale.length === 0 && <p className="empty">해당 없음</p>}
        {alerts.stale.length > 0 && (
          <div className="slack danger">
            <b>🚨 만료된 배치 {alerts.stale.length}건</b>
            <span>{alerts.stale.slice(0, 4).map((o) => `[${o.name}] ${o.overdue.brand} +${o.overdueDays}일`).join(' / ')}{alerts.stale.length > 4 ? ` 외 ${alerts.stale.length - 4}건` : ''}</span>
          </div>
        )}
      </section>

      <section className="block">
        <h3>③ 주간 요약 <span>매주 월 09:00</span></h3>
        <div className="slack"><b>📋 이번 주 점내 홍보매체</b><span>게시중 {kpi.live + kpi.open}/{kpi.total} · 만료 {kpi.stale} · 미정 {kpi.open}(장기 {kpi.longOpen})</span></div>
      </section>
    </div>
  );
}
