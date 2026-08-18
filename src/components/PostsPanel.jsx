import React, { useState, useMemo } from 'react';
import { contentOf, days } from '../constants.js';
import { statusOf } from '../lib/status.js';
import { ZONES } from '../data/seed.js';
import StatusChip from './StatusChip.jsx';
import SortTh, { sortRows } from './SortTh.jsx';

const zoneLabel = (z) => ZONES[z]?.label || z;
const statusRank = (o) => (o.overdue ? 0 : o.open ? 1 : o.live ? 2 : 3);

// 홍보물 관리 (기본 화면) — 만료 건이 맨 앞에 오도록 정렬, 기간 조회는 이력 검색으로 전환
export default function PostsPanel({ T, types, state, postings, media, refDate, isEditor, onRemove, onUndo, onPick }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeSel, setTypeSel] = useState(new Set(types.map((t) => t.code)));
  const [q, setQ] = useState('');
  const [rangeOn, setRangeOn] = useState(false);
  const [from, setFrom] = useState('2025-01-01');
  const [to, setTo] = useState(refDate);
  const [sortCur, setSortCur] = useState({ key: null, dir: null });
  const [sortHist, setSortHist] = useState({ key: null, dir: null });
  const mName = (id) => media.find((m) => m.id === id)?.name || '-';

  const toggleType = (c) => setTypeSel((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const historyRows = useMemo(() => {
    if (!rangeOn) return [];
    return postings
      .filter((p) => typeSel.has(media.find((m) => m.id === p.mediaId)?.type))
      .filter((p) => (p.end || '9999-12-31') >= from && p.start <= to)
      .filter((p) => !q || (contentOf(p) + p.brand + mName(p.mediaId)).toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.start.localeCompare(a.start));
  }, [rangeOn, postings, typeSel, from, to, q, media]);

  const order = { overdue: 0, live: 1, open: 2, upcoming: 3 };
  const currentRows = useMemo(() => {
    return state
      .filter((o) => typeSel.has(o.type))
      .filter((o) => statusFilter === 'all' || (statusFilter === 'overdue' ? o.overdue : statusFilter === 'live' ? o.live : statusFilter === 'open' ? o.open : true))
      .filter((o) => !q || (o.name + (o.current?.brand || '') + (o.current ? contentOf(o.current) : '')).toLowerCase().includes(q.toLowerCase()))
      .map((o) => ({ o, p: o.overdue || o.current }))
      .sort((a, b) => {
        const sa = a.p ? statusOf(a.p, refDate) : 'none', sb = b.p ? statusOf(b.p, refDate) : 'none';
        const oa = order[sa] ?? 9, ob = order[sb] ?? 9;
        if (oa !== ob) return oa - ob;
        const ea = a.p?.end || '9999-12-31', eb = b.p?.end || '9999-12-31';
        return ea.localeCompare(eb);
      });
  }, [state, typeSel, statusFilter, q, refDate]);

  return (
    <div>
      <div className="toolrow">
        <input className="inp" placeholder="업체명 · 내용 · 매체명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="chk"><input type="checkbox" checked={rangeOn} onChange={(e) => setRangeOn(e.target.checked)} />기간으로 조회</label>
        {rangeOn && (
          <>
            <input className="inp date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="sub">~</span>
            <input className="inp date" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
      </div>
      <div className="toolrow">
        <div className="seg wrap">
          {types.map((t) => (
            <button key={t.code} className={typeSel.has(t.code) ? 'on' : ''} onClick={() => toggleType(t.code)}>
              <span className="lblfull">{t.label}</span>
              <span className="lblshort">{t.short}</span>
            </button>
          ))}
        </div>
        {!rangeOn && (
          <div className="seg">
            {[['overdue', '만료'], ['live', '게시중'], ['open', '미정'], ['all', '전체']].map(([k, v]) => (
              <button key={k} className={statusFilter === k ? 'on' : ''} onClick={() => setStatusFilter(k)}>{v}</button>
            ))}
          </div>
        )}
        <span className="count mono">{(rangeOn ? historyRows.length : currentRows.length)}건</span>
      </div>

      {!rangeOn ? (
        <div className="scroll tall">
          <table>
            <thead><tr>
              <SortTh label="매체" sortKey="media" sort={sortCur} setSort={setSortCur} />
              <SortTh label="유형" sortKey="type" sort={sortCur} setSort={setSortCur} />
              <SortTh label="구역" sortKey="zone" sort={sortCur} setSort={setSortCur} />
              <SortTh label="업체명" sortKey="brand" sort={sortCur} setSort={setSortCur} />
              <SortTh label="내용" sortKey="content" sort={sortCur} setSort={setSortCur} />
              <SortTh label="철거예정" sortKey="end" sort={sortCur} setSort={setSortCur} />
              <SortTh label="상태" sortKey="status" sort={sortCur} setSort={setSortCur} />
              <th className="r">조치</th>
            </tr></thead>
            <tbody>
              {sortRows(currentRows, sortCur, (row, key) => {
                const { o, p } = row;
                if (key === 'media') return o.name;
                if (key === 'type') return T[o.type]?.label || o.type;
                if (key === 'zone') return zoneLabel(o.zone);
                if (key === 'brand') return p ? p.brand : '';
                if (key === 'content') return p ? contentOf(p) : '';
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
                    <td className="mono">{p ? (p.end || '미정') : '—'}</td>
                    <td>
                      {o.overdue ? <span className="tag over">만료 +{o.overdueDays}일</span>
                        : o.open ? <span className="tag open">미정 {o.openDays}일째</span>
                        : o.live ? <span className="tag live">D-{o.dToRemove}</span>
                        : <span className="tag vacant">비어있음</span>}
                    </td>
                    <td className="r" onClick={(e) => e.stopPropagation()}>
                      {o.overdue && isEditor && <button className="mini ok" onClick={() => onRemove(o.overdue.id)}>철거 완료</button>}
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
              <SortTh label="매체" sortKey="media" sort={sortHist} setSort={setSortHist} />
              <SortTh label="업체명" sortKey="brand" sort={sortHist} setSort={setSortHist} />
              <SortTh label="내용" sortKey="content" sort={sortHist} setSort={setSortHist} />
              <SortTh label="게시" sortKey="start" sort={sortHist} setSort={setSortHist} />
              <SortTh label="철거예정" sortKey="end" sort={sortHist} setSort={setSortHist} />
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
