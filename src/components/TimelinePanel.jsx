import React, { useState } from 'react';
import { iso, DAY, diffDays, md, clamp, contentOf, subOf, days, matches } from '../constants.js';
import { useCodeFilter } from '../lib/useCodeFilter.js';
import { statusOf } from '../lib/status.js';
import { ZONES } from '../data/seed.js';
import StatusChip from './StatusChip.jsx';
import SortTh, { sortRows } from './SortTh.jsx';

const zoneLabel = (z) => ZONES[z]?.label || z;

// 타임라인 — 과거의 '이력 조회'를 흡수. 검색·표/그래프 전환·업체명 클릭 상세이동을 한 화면에서 처리
export default function TimelinePanel({ state, types, refDate, onPick }) {
  const [span, setSpan] = useState(120);
  // 그래프 시작점을 "오늘 기준 며칠 전"으로 잡는다. 예전에는 -30일 고정이라 기간 버튼을
  // 아무리 키워도 왼쪽 끝(과거)은 그대로고 미래만 늘어나서, 지난 이력을 그래프로 볼 수가
  // 없었다("기간으로 조회"를 따로 켜야만 했다). 앞/뒤 버튼으로 창을 통째로 옮긴다.
  const [offset, setOffset] = useState(0); // 일 단위, +면 미래로 이동
  const [limit, setLimit] = useState(60);
  const [q, setQ] = useState('');
  const [asTable, setAsTable] = useState(false);
  const [rangeOn, setRangeOn] = useState(false);
  const [from, setFrom] = useState(iso(Date.parse(refDate) - 90 * DAY));
  const [to, setTo] = useState(refDate);
  const [sort, setSort] = useState({ key: null, dir: null });
  const [openDD, setOpenDD] = useState(false);
  // PostsPanel의 매체 유형 필터와 같은 방식 — 94건씩 늘어선 행 중에서 특정 유형(듀라
  // 트란스만, 웨더워리어만 등)만 훑고 싶을 때 쓴다.
  const [typeSel, setTypeSel] = useCodeFilter(types.map((t) => t.code));
  const toggleType = (c) => setTypeSel((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const T0 = Date.parse(refDate);
  const start = rangeOn ? Date.parse(from) : T0 - 30 * DAY + offset * DAY;
  const effSpan = rangeOn ? Math.max(1, diffDays(from, to)) : span;
  const ticks = []; for (let d = 0; d <= effSpan; d += Math.max(15, Math.round(effSpan / 8))) ticks.push(d);

  const matched = state
    .filter((o) => typeSel.has(o.type))
    .filter((o) => !q || matches(o.name + o.history.map((p) => p.brand + contentOf(p)).join(' '), q))
    .filter((o) => !rangeOn || o.history.some((p) => (p.end || '9999-12-31') >= from && p.start <= to));
  const rows = matched.slice(0, limit);
  const flatRows = rows.flatMap((o) => o.history.map((p) => ({ o, p })))
    .filter(({ p }) => !rangeOn || ((p.end || '9999-12-31') >= from && p.start <= to))
    .sort((a, b) => b.p.start.localeCompare(a.p.start));

  return (
    <div>
      <div className="toolrow">
        <input className="inp" placeholder="업체명 · 내용 · 매체명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="dd">
          <button className="btn" onClick={() => setOpenDD((v) => !v)}>매체 유형 {typeSel.size === types.length ? '전체' : typeSel.size} ▾</button>
          {openDD && (
            <div className="ddmenu" onMouseLeave={() => setOpenDD(false)}>
              <div className="ddtop"><button onClick={() => setTypeSel(new Set(types.map((t) => t.code)))}>전체</button><button onClick={() => setTypeSel(new Set())}>해제</button></div>
              {types.map((t) => (
                <label key={t.code}><input type="checkbox" checked={typeSel.has(t.code)} onChange={() => toggleType(t.code)} /><i style={{ background: t.color }} />{t.label}</label>
              ))}
            </div>
          )}
        </div>
        <label className="chk"><input type="checkbox" checked={rangeOn} onChange={(e) => setRangeOn(e.target.checked)} />기간으로 조회</label>
        {rangeOn ? (
          <div className="daterange"><input className="inp date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><span className="sub">~</span><input className="inp date" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        ) : (
          !asTable && <div className="seg">{[60, 120, 240].map((s) => <button key={s} className={span === s ? 'on' : ''} onClick={() => setSpan(s)}>{s}일</button>)}</div>
        )}
        {!asTable && !rangeOn && (
          <div className="quickbtns">
            <button className="btn" onClick={() => setOffset((o) => o - Math.round(span / 2))} title="과거로 이동">◀ 이전</button>
            <button className="btn" disabled={offset === 0} onClick={() => setOffset(0)}>오늘</button>
            <button className="btn" onClick={() => setOffset((o) => o + Math.round(span / 2))} title="미래로 이동">다음 ▶</button>
          </div>
        )}
        <button className={'btn' + (asTable ? ' on' : '')} onClick={() => setAsTable((v) => !v)}>{asTable ? '그래프로 보기' : '표로 보기'}</button>
        <span className="count mono">{matched.length}건</span>
      </div>

      {rows.length === 0 && (
        <p className="empty">보여줄 배치 기록이 없습니다. 홍보물을 매체에 배치하면 여기에 기간이 그려집니다.</p>
      )}
      {rows.length === 0 ? null : !asTable ? (
        <div className="scroll tall">
          <div className="tl">
            <div className="tlhead"><span /><div className="tlticks">{ticks.map((d) => <i key={d} style={{ left: (d / effSpan) * 100 + '%' }}>{md(start + d * DAY)}</i>)}{(() => { const d = diffDays(iso(start), refDate); return d >= 0 && d <= effSpan ? <b className="tlnow" style={{ left: (d / effSpan) * 100 + '%' }} /> : null; })()}</div></div>
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
          {matched.length > limit && (
            <button className="btn wide" onClick={() => setLimit((n) => n + 60)}>더 보기 · {matched.length - limit}건 남음</button>
          )}
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
