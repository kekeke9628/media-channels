import React, { useState } from 'react';
import { iso, DAY, diffDays, md, clamp, contentOf, subOf, days } from '../constants.js';
import { statusOf } from '../lib/status.js';
import { ZONES } from '../data/seed.js';
import StatusChip from './StatusChip.jsx';
import SortTh, { sortRows } from './SortTh.jsx';

const zoneLabel = (z) => ZONES[z]?.label || z;

// 타임라인 — 과거의 '이력 조회'를 흡수. 검색·표/그래프 전환·업체명 클릭 상세이동을 한 화면에서 처리
export default function TimelinePanel({ state, refDate, onPick }) {
  const [span, setSpan] = useState(120);
  const [q, setQ] = useState('');
  const [asTable, setAsTable] = useState(false);
  const [rangeOn, setRangeOn] = useState(false);
  const [from, setFrom] = useState(iso(Date.parse(refDate) - 90 * DAY));
  const [to, setTo] = useState(refDate);
  const [sort, setSort] = useState({ key: null, dir: null });
  const T0 = Date.parse(refDate);
  const start = rangeOn ? Date.parse(from) : T0 - 30 * DAY;
  const effSpan = rangeOn ? Math.max(1, diffDays(from, to)) : span;
  const ticks = []; for (let d = 0; d <= effSpan; d += Math.max(15, Math.round(effSpan / 8))) ticks.push(d);

  const rows = state
    .filter((o) => !q || (o.name + o.history.map((p) => p.brand + contentOf(p)).join(' ')).toLowerCase().includes(q.toLowerCase()))
    .filter((o) => !rangeOn || o.history.some((p) => (p.end || '9999-12-31') >= from && p.start <= to))
    .slice(0, 60);
  const flatRows = rows.flatMap((o) => o.history.map((p) => ({ o, p })))
    .filter(({ p }) => !rangeOn || ((p.end || '9999-12-31') >= from && p.start <= to))
    .sort((a, b) => b.p.start.localeCompare(a.p.start));

  return (
    <div>
      <div className="toolrow">
        <input className="inp" placeholder="업체명 · 내용 · 매체명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="chk"><input type="checkbox" checked={rangeOn} onChange={(e) => setRangeOn(e.target.checked)} />기간으로 조회</label>
        {rangeOn ? (
          <div className="daterange"><input className="inp date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><span className="sub">~</span><input className="inp date" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        ) : (
          !asTable && <div className="seg">{[60, 120, 240].map((s) => <button key={s} className={span === s ? 'on' : ''} onClick={() => setSpan(s)}>{s}일</button>)}</div>
        )}
        <button className={'btn' + (asTable ? ' on' : '')} onClick={() => setAsTable((v) => !v)}>{asTable ? '그래프로 보기' : '표로 보기'}</button>
      </div>

      {rows.length === 0 && (
        <p className="empty">보여줄 배치 기록이 없습니다. 홍보물을 매체에 배치하면 여기에 기간이 그려집니다.</p>
      )}
      {rows.length === 0 ? null : !asTable ? (
        <div className="scroll tall">
          <div className="tl">
            <div className="tlhead"><span /><div className="tlticks">{ticks.map((d) => <i key={d} style={{ left: (d / effSpan) * 100 + '%' }}>{md(start + d * DAY)}</i>)}{!rangeOn && <b className="tlnow" style={{ left: (30 / effSpan) * 100 + '%' }} />}</div></div>
            {rows.map((o) => (
              <div className="tlrow" key={o.id}>
                <span className="tlname" title={o.name}>{o.name}</span>
                <div className="tlbar">
                  {o.history.map((p) => {
                    const s = clamp(diffDays(iso(start), p.start), 0, effSpan);
                    const e = clamp(p.end ? diffDays(iso(start), p.end) + 1 : effSpan, 0, effSpan);
                    if (e <= 0 || s >= effSpan) return null;
                    return (
                      <i key={p.id} className={'seg-' + statusOf(p, refDate)} style={{ left: (s / effSpan) * 100 + '%', width: ((e - s) / effSpan) * 100 + '%' }} title={p.brand + ' ' + p.start + '~' + (p.end || '미정')}>
                        <b onClick={(e2) => { e2.stopPropagation(); onPick(o.mediaId); }}>{p.brand}</b>
                      </i>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="tllegend">
            <span><i style={{ background: '#3C6E9E' }} />게시중</span>
            <span><i style={{ background: '#7A5AA6' }} />게시예정</span>
            <span><i style={{ background: '#B4534B' }} />만료</span>
            <span><i style={{ background: '#B5AFA4' }} />철거완료</span>
          </div>
        </div>
      ) : (
        <div className="scroll tall">
          <table>
            <thead><tr>
              <SortTh label="매체명" sortKey="media" sort={sort} setSort={setSort} />
              <SortTh label="업체명" sortKey="brand" sort={sort} setSort={setSort} />
              <SortTh label="내용" sortKey="content" sort={sort} setSort={setSort} />
              <SortTh label="시작일" sortKey="start" sort={sort} setSort={setSort} />
              <SortTh label="종료일" sortKey="end" sort={sort} setSort={setSort} />
              <SortTh label="실제철거" sortKey="removed" sort={sort} setSort={setSort} />
              <SortTh label="기간" sortKey="duration" sort={sort} setSort={setSort} className="r" />
              <SortTh label="상태" sortKey="status" sort={sort} setSort={setSort} />
            </tr></thead>
            <tbody>
              {sortRows(flatRows, sort, ({ o, p }, key) => {
                if (key === 'media') return o.name;
                if (key === 'brand') return p.brand;
                if (key === 'content') return contentOf(p);
                if (key === 'start') return p.start;
                if (key === 'end') return p.end || '9999-12-31';
                if (key === 'removed') return p.removedAt || '';
                if (key === 'duration') return p.end ? days(p.start, p.end) : -1;
                if (key === 'status') return statusOf(p, refDate);
                return '';
              }).map(({ o, p }) => (
                <tr key={p.id} onClick={() => onPick(o.mediaId)}>
                  <td>{o.name}<i className="sub">{zoneLabel(o.zone)}</i></td>
                  <td><b>{p.brand}</b></td>
                  <td className="sub">{subOf(p) || '—'}</td>
                  <td className="mono">{p.start}</td>
                  <td className="mono">{p.end || '미정'}</td>
                  <td className="mono">{p.removedAt || <span className="sub">—</span>}{p.removalSource === 'auto' && <span className="autotag">자동</span>}</td>
                  <td className="r mono">{p.end ? days(p.start, p.end) + '일' : '—'}</td>
                  <td><StatusChip status={statusOf(p, refDate)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
