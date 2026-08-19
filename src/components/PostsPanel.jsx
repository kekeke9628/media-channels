import React, { useState, useMemo } from 'react';
import { contentOf, days, ST } from '../constants.js';
import { statusOf } from '../lib/status.js';
import { ZONES } from '../data/seed.js';
import StatusChip from './StatusChip.jsx';
import SortTh, { sortRows } from './SortTh.jsx';

const zoneLabel = (z) => ZONES[z]?.label || z;
const statusRank = (o) => (o.overdue ? 0 : o.open ? 1 : o.live ? 2 : o.next ? 3 : 4);
// "지금 상태"는 게시중(종료일 있든/없든)·게시예정·비어있음 3가지뿐이다. 만료는 상태가
// 아니라 "게시중인데 방치된" 경고 플래그라 별도 ON/OFF로 뺀다(홍보물 화면과 통일).
const statusCat = (o) => (o.overdue ? 'overdue' : (o.live || o.open) ? 'live' : o.next ? 'upcoming' : 'vacant');
const STATUS_OPTS = [['live', '게시중', ST.live.color], ['upcoming', ST.upcoming.label, ST.upcoming.color], ['vacant', '비어있음', '#B5AFA4']];
const STATUS_LABEL = { ...Object.fromEntries(STATUS_OPTS.map(([k, v]) => [k, v])), overdue: '만료' };

// 매체 현황 (기본 화면) — 매체별 현재 배치 상태 표. 만료 건이 맨 앞에 오도록 정렬, 기간
// 조회는 이력 검색으로 전환. postings prop은 배치(placement)가 홍보물 정보와 함께
// 평탄화된 목록이다(App이 fetchPlacements 결과를 넘긴다).
export default function PostsPanel({ T, types, state, postings, media, refDate, isEditor, onRemove, onUndo, onPick }) {
  const [statusSel, setStatusSel] = useState(new Set(STATUS_OPTS.map(([k]) => k)));
  // 홍보물 화면과 달리 기본 ON — 이 화면의 핵심 목적이 만료 건을 놓치지 않고 조치하는
  // 것이라(맨 위 정렬 + 철거 완료 버튼), 기본으로 숨기면 화면 목적과 어긋난다.
  const [showOverdue, setShowOverdue] = useState(true);
  const [typeSel, setTypeSel] = useState(new Set(types.map((t) => t.code)));
  // 드롭다운은 한 번에 하나만 — 매체 유형/상태 필터가 동시에 열려 겹쳐 보이던 문제.
  const [openDD, setOpenDD] = useState(null); // 'type' | 'status' | null
  const [q, setQ] = useState('');
  const [rangeOn, setRangeOn] = useState(false);
  const [from, setFrom] = useState('2025-01-01');
  const [to, setTo] = useState(refDate);
  const [sortCur, setSortCur] = useState({ key: null, dir: null });
  const [sortHist, setSortHist] = useState({ key: null, dir: null });
  const mName = (id) => media.find((m) => m.id === id)?.name || '-';

  const toggleType = (c) => setTypeSel((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const toggleStatus = (c) => setStatusSel((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const historyRows = useMemo(() => {
    if (!rangeOn) return [];
    return postings
      .filter((p) => typeSel.has(media.find((m) => m.id === p.mediaId)?.type))
      .filter((p) => (p.end || '9999-12-31') >= from && p.start <= to)
      .filter((p) => {
        if (!q) return true;
        const haystack = [mName(p.mediaId), p.brand, contentOf(p), p.start, p.end, p.removedAt, ST[statusOf(p, refDate)]?.label].join(' ').toLowerCase();
        return haystack.includes(q.toLowerCase());
      })
      .sort((a, b) => b.start.localeCompare(a.start));
  }, [rangeOn, postings, typeSel, from, to, q, media]);

  const order = { overdue: 0, live: 1, open: 2, upcoming: 3 };
  const currentRows = useMemo(() => {
    return state
      .filter((o) => typeSel.has(o.type))
      .filter((o) => { const cat = statusCat(o); return cat === 'overdue' ? showOverdue : statusSel.has(cat); })
      .filter((o) => {
        if (!q) return true;
        const p = o.overdue || o.current || o.next;
        const haystack = [o.name, T[o.type]?.label, zoneLabel(o.zone), p?.brand, p ? contentOf(p) : '', p?.end, STATUS_LABEL[statusCat(o)]].join(' ').toLowerCase();
        return haystack.includes(q.toLowerCase());
      })
      // next(게시예정)도 p로 포함시켜 시작일·종료일·업체명 컬럼이 "—"로 비지 않고
      // 실제 예정 정보를 보여주게 한다 — 별도로 D-day 문구를 상태 배지에 반복할 필요가 없어진다.
      .map((o) => ({ o, p: o.overdue || o.current || o.next }))
      .sort((a, b) => {
        const sa = a.p ? statusOf(a.p, refDate) : 'none', sb = b.p ? statusOf(b.p, refDate) : 'none';
        const oa = order[sa] ?? 9, ob = order[sb] ?? 9;
        if (oa !== ob) return oa - ob;
        const ea = a.p?.end || '9999-12-31', eb = b.p?.end || '9999-12-31';
        return ea.localeCompare(eb);
      });
  }, [state, typeSel, statusSel, showOverdue, q, refDate, T]);

  return (
    <div>
      <div className="toolrow">
        <input className="inp" placeholder="매체명 · 유형 · 구역 · 업체명 · 내용 · 상태 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="chk"><input type="checkbox" checked={rangeOn} onChange={(e) => setRangeOn(e.target.checked)} />기간으로 조회</label>
        {rangeOn && (
          <div className="daterange">
            <input className="inp date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="sub">~</span>
            <input className="inp date" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}
      </div>
      <div className="toolrow">
        <div className="dd">
          <button className="btn" onClick={() => setOpenDD((v) => (v === 'type' ? null : 'type'))}>매체 유형 {typeSel.size === types.length ? '전체' : typeSel.size} ▾</button>
          {openDD === 'type' && (
            <div className="ddmenu" onMouseLeave={() => setOpenDD(null)}>
              <div className="ddtop"><button onClick={() => setTypeSel(new Set(types.map((t) => t.code)))}>전체</button><button onClick={() => setTypeSel(new Set())}>해제</button></div>
              {types.map((t) => (
                <label key={t.code}><input type="checkbox" checked={typeSel.has(t.code)} onChange={() => toggleType(t.code)} /><i style={{ background: t.color }} />{t.label}</label>
              ))}
            </div>
          )}
        </div>
        {!rangeOn && (
          <>
            <div className="dd">
              <button className="btn" onClick={() => setOpenDD((v) => (v === 'status' ? null : 'status'))}>상태 {statusSel.size === STATUS_OPTS.length ? '전체' : statusSel.size} ▾</button>
              {openDD === 'status' && (
                <div className="ddmenu" onMouseLeave={() => setOpenDD(null)}>
                  <div className="ddtop"><button onClick={() => setStatusSel(new Set(STATUS_OPTS.map(([k]) => k)))}>전체</button><button onClick={() => setStatusSel(new Set())}>해제</button></div>
                  {STATUS_OPTS.map(([k, v, color]) => (
                    <label key={k}><input type="checkbox" checked={statusSel.has(k)} onChange={() => toggleStatus(k)} /><i style={{ background: color }} />{v}</label>
                  ))}
                </div>
              )}
            </div>
            <label className="chk"><input type="checkbox" checked={showOverdue} onChange={(e) => setShowOverdue(e.target.checked)} />만료 포함</label>
          </>
        )}
        <span className="count mono">{(rangeOn ? historyRows.length : currentRows.length)}건</span>
      </div>

      {!rangeOn ? (
        <div className="scroll tall">
          <table>
            <thead><tr>
              <SortTh label="매체명" sortKey="media" sort={sortCur} setSort={setSortCur} />
              <SortTh label="유형" sortKey="type" sort={sortCur} setSort={setSortCur} />
              <SortTh label="구역" sortKey="zone" sort={sortCur} setSort={setSortCur} />
              <SortTh label="업체명" sortKey="brand" sort={sortCur} setSort={setSortCur} />
              <SortTh label="내용" sortKey="content" sort={sortCur} setSort={setSortCur} />
              <SortTh label="시작일" sortKey="start" sort={sortCur} setSort={setSortCur} />
              <SortTh label="종료일" sortKey="end" sort={sortCur} setSort={setSortCur} />
              <SortTh label="상태" sortKey="status" sort={sortCur} setSort={setSortCur} />
            </tr></thead>
            <tbody>
              {sortRows(currentRows, sortCur, (row, key) => {
                const { o, p } = row;
                if (key === 'media') return o.name;
                if (key === 'type') return T[o.type]?.label || o.type;
                if (key === 'zone') return zoneLabel(o.zone);
                if (key === 'brand') return p ? p.brand : '';
                if (key === 'content') return p ? contentOf(p) : '';
                if (key === 'start') return p ? p.start : '';
                if (key === 'end') return p ? (p.end || '9999-12-31') : '9999-12-31';
                if (key === 'status') return statusRank(o);
                return '';
              }).map(({ o, p }) => {
                const t = T[o.type];
                return (
                  <tr key={o.id} onClick={() => onPick(o.id)}>
                    <td><b>{o.name}</b></td>
                    <td><span className="chip" style={{ background: t.color + '1A', color: t.color }}>{t.label}</span></td>
                    <td>{zoneLabel(o.zone)}</td>
                    <td>{p ? p.brand : <span className="sub">—</span>}</td>
                    <td className="sub">{p ? contentOf(p) : '—'}</td>
                    <td className="mono">{p ? p.start : '—'}</td>
                    <td className="mono">{p ? (p.end || '미정') : '—'}</td>
                    <td onClick={(e) => o.overdue && e.stopPropagation()}>
                      {o.overdue ? (
                        <>
                          <span className="tag over">만료 +{o.overdueDays}일</span>
                          {isEditor && <button className="mini ok" onClick={() => onRemove(o.overdue.id)}>철거 완료</button>}
                        </>
                      ) : (o.live || o.open) ? <span className="tag live">게시중</span>
                        : o.next ? <span className="tag upcoming">게시예정</span>
                        : <span className="tag vacant">비어있음</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scroll tall">
          <table>
            <thead><tr>
              <SortTh label="매체명" sortKey="media" sort={sortHist} setSort={setSortHist} />
              <SortTh label="업체명" sortKey="brand" sort={sortHist} setSort={setSortHist} />
              <SortTh label="내용" sortKey="content" sort={sortHist} setSort={setSortHist} />
              <SortTh label="시작일" sortKey="start" sort={sortHist} setSort={setSortHist} />
              <SortTh label="종료일" sortKey="end" sort={sortHist} setSort={setSortHist} />
              <SortTh label="실제철거" sortKey="removed" sort={sortHist} setSort={setSortHist} />
              <SortTh label="기간" sortKey="duration" sort={sortHist} setSort={setSortHist} className="r" />
              <SortTh label="상태" sortKey="status" sort={sortHist} setSort={setSortHist} />
              {isEditor && <th className="r">조치</th>}
            </tr></thead>
            <tbody>
              {sortRows(historyRows, sortHist, (p, key) => {
                if (key === 'media') return mName(p.mediaId);
                if (key === 'brand') return p.brand;
                if (key === 'content') return contentOf(p);
                if (key === 'start') return p.start;
                if (key === 'end') return p.end || '9999-12-31';
                if (key === 'removed') return p.removedAt || '';
                if (key === 'duration') return p.end ? days(p.start, p.end) : -1;
                if (key === 'status') return statusOf(p, refDate);
                return '';
              }).map((p) => {
                const s = statusOf(p, refDate);
                return (
                  <tr key={p.id} onClick={() => onPick(p.mediaId)}>
                    <td>{mName(p.mediaId)}</td>
                    <td><b>{p.brand}</b></td>
                    <td className="sub">{contentOf(p)}</td>
                    <td className="mono">{p.start}</td>
                    <td className="mono">{p.end || '미정'}</td>
                    <td className="mono">{p.removedAt || <span className="sub">—</span>}{p.removalSource === 'auto' && <span className="autotag">자동</span>}</td>
                    <td className="r mono">{p.end ? days(p.start, p.end) + '일' : '—'}</td>
                    <td><StatusChip status={s} /></td>
                    {isEditor && (
                      <td className="r" onClick={(e) => e.stopPropagation()}>
                        {p.removedAt && p.removalSource === 'manual' && <button className="mini" onClick={() => onUndo(p.id)}>되돌리기</button>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
