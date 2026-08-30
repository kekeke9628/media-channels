import React, { useState, useMemo } from 'react';
import { contentOf, subOf, days, ST, typeChipStyle, matches, byName, swapTarget } from '../constants.js';
import { useCodeFilter } from '../lib/useCodeFilter.js';
import { sideOf } from '../constants.js';
import { statusOf } from '../lib/status.js';
import { ZONES } from '../data/seed.js';
import StatusChip from './StatusChip.jsx';
import SortTh, { sortRows } from './SortTh.jsx';
import MapBtn from './MapBtn.jsx';

const zoneLabel = (z) => ZONES[z]?.label || z;
const statusRank = (o) => (o.overdue ? 0 : o.open ? 1 : o.live ? 2 : o.next ? 3 : 4);
// "지금 상태"는 게시중(종료일 있든/없든)·게시예정·비어있음 3가지뿐이다. 만료는 상태가
// 아니라 "게시중인데 방치된" 경고 플래그라 별도 ON/OFF로 뺀다(홍보물 화면과 통일).
const statusCat = (o) => (o.overdue ? 'overdue' : (o.live || o.open) ? 'live' : o.next ? 'upcoming' : 'vacant');
const STATUS_OPTS = [['live', '게시중', ST.live.color], ['upcoming', ST.upcoming.label, ST.upcoming.color], ['vacant', '비어있음', '#B5AFA4']];
const STATUS_LABEL = { ...Object.fromEntries(STATUS_OPTS.map(([k, v]) => [k, v])), overdue: '만료' };

// 상태 배지 — 표와 모바일 카드가 같은 것을 쓰도록 한 곳에서 만든다.
const statusTag = (o) => (
  o.overdue ? <span className="tag over">만료 +{o.overdueDays}일</span>
    : (o.live || o.open) ? <span className="tag live">게시중</span>
    : o.next ? <span className="tag upcoming">게시예정</span>
    : <span className="tag vacant">비어있음</span>
);

// 매체 현황 (기본 화면) — 매체별 현재 배치 상태. 만료 건이 맨 앞에 오도록 정렬, 기간
// 조회는 이력 검색으로 전환. postings prop은 배치(placement)가 홍보물 정보와 함께
// 평탄화된 목록이다(App이 fetchPlacements 결과를 넘긴다).
// 모바일(narrow)에서는 표가 화면 폭의 2/3를 넘겨 상태·조치 버튼이 아예 안 보였기 때문에
// 같은 데이터를 카드 목록으로 바꿔 그린다.
// 매체 하나 = 카드 하나. 면은 카드 안에 한 줄씩 적는다 — 면마다 카드를 내면 같은 매체가
// 여러 번 나오는데 어느 걸 눌러도 결국 같은 매체 상세로 간다.
//
// 면이 많은 매체(듀라트란스 10면 등)는 두 줄만 보이고 나머지는 접어 둔다. 다 펼쳐 두면
// 카드 하나가 화면을 다 먹어서 정작 다른 매체를 훑을 수가 없다.
const FACES_SHOWN = 2;
function MediaCard({ g, T, isEditor, onPick, onShowOnMap, onRemove, onSwap, zoneLabel }) {
  const [open, setOpen] = useState(false);
  const t = T[g.type];
  const shown = open ? g.slots : g.slots.slice(0, FACES_SHOWN);
  const hidden = g.slots.length - shown.length;
  return (
    <div className="mcard" onClick={() => onPick(g.mediaId)}>
      <div className="mcard-top"><b>{g.name}</b>{statusTag(g.lead)}</div>
      <div className="mcard-meta">
        {t && <span className="chip" style={typeChipStyle(t.color)}>{t.label}</span>}
        <span className="sub">{zoneLabel(g.zone)}</span>
        <span className="sub">{g.faces}면</span>
        <MapBtn mediaId={g.mediaId} onShowOnMap={onShowOnMap} className="pushright" />
      </div>
      <div className="facelines">
        {shown.map(({ o, p }) => (
          <div className="faceline" key={o.face}
            onClick={(e) => { e.stopPropagation(); onPick(g.mediaId, o.face); }}>
            <em>{o.faceLabel}</em>
            {p ? (
              <>
                <b>{p.brand}</b>
                <span className="sub mono">{p.end ? '~ ' + p.end.slice(2) : '~ 미정'}</span>
                {o.overdue && <span className="tag over">+{o.overdueDays}일</span>}
                {o.next && !o.current && <span className="tag upcoming">예정</span>}
                {o.overdue && isEditor && (
                  <button className="mini ok" onClick={(e) => { e.stopPropagation(); onRemove(o.overdue.id); }}>철거</button>
                )}
                {/* 철거는 "내리고 끝", 교체는 "내리고 새로 건다" — 현장에서 훨씬 잦은 건
                    교체 쪽인데 여기엔 철거만 있어서 한 번 나갔다 와서 다시 배치해야 했다.
                    걸려 있는 자리면(만료·게시중·종료일 미정) 다 걸 수 있게 둔다. */}
                {swapTarget(o) && isEditor && (
                  <button className="mini" onClick={(e) => { e.stopPropagation(); onSwap(swapTarget(o), o.name); }}>교체</button>
                )}
              </>
            ) : <span className="sub">비어있음</span>}
          </div>
        ))}
      </div>
      {hidden > 0 && (
        <button className="mini wide" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>+{hidden}면 더 보기</button>
      )}
      {open && g.slots.length > FACES_SHOWN && (
        <button className="mini wide" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>접기</button>
      )}
    </div>
  );
}

export default function PostsPanel({ T, types, state, postings, media, refDate, isEditor, narrow, onRemove, onSwap, onUndo, onPick, onShowOnMap }) {
  const [statusSel, setStatusSel] = useState(new Set(STATUS_OPTS.map(([k]) => k)));
  // 홍보물 화면과 달리 기본 ON — 이 화면의 핵심 목적이 만료 건을 놓치지 않고 조치하는
  // 것이라(맨 위 정렬 + 철거 완료 버튼), 기본으로 숨기면 화면 목적과 어긋난다.
  const [showOverdue, setShowOverdue] = useState(true);
  const [typeSel, setTypeSel] = useCodeFilter(types.map((t) => t.code));
  // 드롭다운은 한 번에 하나만 — 매체 유형/상태 필터가 동시에 열려 겹쳐 보이던 문제.
  const [openDD, setOpenDD] = useState(null); // 'type' | 'status' | null
  // EAST/WEST는 매체명 두 번째 글자로 갈린다(DEH01 → E) — 현장에서 쓰는 구분이라
  // 목록에서도 바로 걸러 볼 수 있게 한다.
  const [side, setSide] = useState('ALL');
  const [sortKey, setSortKey] = useState('status');
  const [sortDir, setSortDir] = useState('asc');
  const [q, setQ] = useState('');
  const [rangeOn, setRangeOn] = useState(false);
  const [from, setFrom] = useState('2025-01-01');
  const [to, setTo] = useState(refDate);
  const [sortCur, setSortCur] = useState({ key: null, dir: null });
  const [sortHist, setSortHist] = useState({ key: null, dir: null });
  const mName = (id) => media.find((m) => m.id === id)?.name || '-';
  // 이력 표는 원본 placements를 그대로 쓰므로(면 단위로 이미 갈려 있지 않다), 매체가 여러
  // 면을 가지면 어느 면인지 이름 옆에 붙여 구분한다. 단일 면 매체는 지금까지와 동일하다.
  const pLabel = (p) => {
    const m = media.find((x) => x.id === p.mediaId);
    return mName(p.mediaId) + ((m?.faces || 1) > 1 ? ` · ${p.faceLabel || (p.face || 1) + '면'}` : '');
  };

  const toggleType = (c) => setTypeSel((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const toggleStatus = (c) => setStatusSel((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const historyRows = useMemo(() => {
    if (!rangeOn) return [];
    return postings
      .filter((p) => typeSel.has(media.find((m) => m.id === p.mediaId)?.type))
      .filter((p) => side === 'ALL' || sideOf(media.find((m) => m.id === p.mediaId)) === side)
      .filter((p) => (p.end || '9999-12-31') >= from && p.start <= to)
      .filter((p) => {
        if (!q) return true;
        const haystack = [pLabel(p), p.brand, contentOf(p), p.start, p.end, p.removedAt, ST[statusOf(p, refDate)]?.label].join(' ');
        return matches(haystack, q);
      })
      .sort((a, b) => b.start.localeCompare(a.start));
  }, [rangeOn, postings, typeSel, side, from, to, q, media]);

  // 면(face)은 진짜 재고 단위지만, 목록에서 면마다 카드를 하나씩 내면 같은 매체가 여러 번
  // 나오고 어느 걸 눌러도 결국 같은 매체 상세로 간다 — 매체 하나에 카드 하나로 묶고,
  // 면은 그 안에 한 줄씩 적는다. 조치(철거·교체)는 여전히 면 단위라 줄마다 따로 둔다.
  const groups = useMemo(() => {
    const by = new Map();
    for (const o of state) {
      if (!by.has(o.mediaId)) by.set(o.mediaId, []);
      by.get(o.mediaId).push(o);
    }
    return [...by.entries()].map(([mediaId, slots]) => {
      slots.sort((a, b) => (a.face || 1) - (b.face || 1));
      const m = media.find((x) => x.id === mediaId);
      // 카드 머리(상태 배지·정렬 기준)에 쓸 대표 면 — 가장 급한 것.
      const rank = (o) => (o.overdue ? 0 : (o.live || o.open) ? 1 : o.next ? 2 : 3);
      const lead = [...slots].sort((a, b) => rank(a) - rank(b) || (a.face || 1) - (b.face || 1))[0];
      return {
        mediaId,
        name: m?.name || lead.name.replace(/\s·\s.*$/, ''),
        type: lead.type,
        zone: lead.zone,
        faces: slots.length,
        slots: slots.map((o) => ({ o, p: o.overdue || o.current || o.next })),
        lead,
        leadP: lead.overdue || lead.current || lead.next,
      };
    });
  }, [state, media]);

  const order = { overdue: 0, live: 1, open: 2, upcoming: 3 };
  // 정렬 기준 — 무엇을 기준으로 보고 싶은지가 상황마다 다르다(철거할 것부터, 매체 순서대로,
  // 업체별로 모아서 등). 매체 하나에 여러 면이 있으면 대표 면(가장 급한 면)의 값을 쓴다.
  const SORTS = [
    ['status', '상태순'],
    ['media', '매체명'],
    ['start', '설치일'],
    ['end', '종료일'],
    ['brand', '업체명'],
    ['type', '매체유형'],
  ];
  // 면이 여럿이면 그 매체가 그 기준에서 갖는 "가장 앞선 값"을 쓴다 — 업체명으로 정렬했는데
  // 카드에 보이는 업체 중 앞선 것이 아니라 엉뚱한 면의 값으로 줄이 서면 이유를 알 수 없다.
  // 상태만은 가장 급한 면(대표)을 쓴다 — 만료가 하나라도 있으면 그 매체가 먼저 와야 한다.
  const firstOf = (g, pick, fallback) => {
    const vals = g.slots.map(({ p }) => (p ? pick(p) : null)).filter(Boolean);
    return vals.length ? vals.sort((a, b) => String(a).localeCompare(String(b), 'ko'))[0] : fallback;
  };
  const sortValue = (g, key) => {
    if (key === 'media') return g.name;
    if (key === 'start') return firstOf(g, (p) => p.start, '9999-12-31');
    if (key === 'end') return firstOf(g, (p) => p.end, '9999-12-31');
    if (key === 'brand') return firstOf(g, (p) => p.brand, '\uffff');
    if (key === 'type') return T[g.type]?.label || g.type;
    const st = g.leadP ? statusOf(g.leadP, refDate) : 'none';
    return String(order[st] ?? 9);
  };

  const currentRows = useMemo(() => {
    const rows = groups
      .filter((g) => typeSel.has(g.type))
      .filter((g) => side === 'ALL' || sideOf(g) === side)
      // 면 중 하나라도 조건에 맞으면 그 매체를 보여준다 — 카드 안에 면이 다 들어 있으므로
      // 매체 단위로 걸러야 "게시중만 보기"에서 그 매체가 통째로 사라지지 않는다.
      .filter((g) => g.slots.some(({ o }) => { const c = statusCat(o); return c === 'overdue' ? showOverdue : statusSel.has(c); }))
      .filter((g) => {
        if (!q) return true;
        const hay = [g.name, T[g.type]?.label, zoneLabel(g.zone),
          ...g.slots.flatMap(({ o, p }) => [p?.brand, p ? contentOf(p) : '', p?.end, STATUS_LABEL[statusCat(o)], o.faceLabel])].join(' ');
        return matches(hay, q);
      });
    const dir = sortDir === 'desc' ? -1 : 1;
    return rows.sort((a, b) => {
      const va = sortValue(a, sortKey), vb = sortValue(b, sortKey);
      if (va !== vb) return (sortKey === 'media' ? byName(va, vb) : String(va).localeCompare(String(vb), 'ko')) * dir;
      // 기준이 같으면 항상 매체명 오름차순 — 그러지 않으면 순서가 매번 달라진다.
      return byName(a.name, b.name);
    });
  }, [groups, typeSel, statusSel, showOverdue, side, q, refDate, T, sortKey, sortDir]);

  // 모바일 카드는 매체 단위 그룹을 그대로 쓰지만, 데스크톱 표는 예전처럼 면 한 줄씩 보여준다.
  // 48442a5에서 카드를 매체 단위로 묶으며 currentRows를 그룹으로 바꿨는데, 이 표만 예전
  // 모양({o,p})을 그대로 읽고 있어서 o가 undefined였다 — 980px보다 넓은 화면에서 매체 현황
  // 탭이 통째로 흰 화면이 됐다(모바일만 쓰다 보니 한동안 아무도 못 봤다).
  const currentSlotRows = useMemo(() => currentRows.flatMap((g) => g.slots), [currentRows]);

  return (
    <div>
      <div className="toolrow">
        <input className="inp" placeholder="매체 · 업체 · 내용 검색" value={q} onChange={(e) => setQ(e.target.value)} />
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
        <div className="seg">
          {[['ALL', '전체'], ['EAST', 'EAST'], ['WEST', 'WEST']].map(([k, label]) => (
            <button key={k} className={side === k ? 'on' : ''} onClick={() => setSide(k)}>{label}</button>
          ))}
        </div>
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

      {/* 무엇을 기준으로 볼지는 상황마다 다르다 — 철거할 것부터, 매체 순서대로, 업체별로.
          표(데스크톱)는 머리글을 눌러 정렬하므로 카드 화면에서만 보여준다. */}
      {!rangeOn && narrow && (
        <div className="toolrow sortrow">
          <span className="sub">정렬</span>
          <select className="sel" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <button className="mini" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
            {sortDir === 'asc' ? '오름차순 ↑' : '내림차순 ↓'}
          </button>
        </div>
      )}

      {/* 아무것도 없을 때 빈 화면만 나와서 처음 쓰는 사람이 다음에 뭘 할지 알 수 없었다. */}
      {!rangeOn && currentRows.length === 0 ? (
        <p className="empty">
          {state.length === 0
            ? '아직 등록된 매체가 없습니다. "+매체 추가"를 누른 뒤 배치도에서 위치를 찍어 등록하세요.'
            : '조건에 맞는 매체가 없습니다. 위의 검색어나 필터를 확인해 보세요.'}
        </p>
      ) : !rangeOn && narrow ? (
        <div className="mlist">
          {currentRows.map((g) => (
            <MediaCard key={g.mediaId} g={g} T={T} isEditor={isEditor} onPick={onPick} onShowOnMap={onShowOnMap} onRemove={onRemove} onSwap={onSwap} zoneLabel={zoneLabel} />
          ))}
        </div>
      ) : !rangeOn ? (
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
              <th className="r" />
            </tr></thead>
            <tbody>
              {sortRows(currentSlotRows, sortCur, (row, key) => {
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
                  <tr key={o.id} onClick={() => onPick(o.mediaId)}>
                    <td><b>{o.name}</b>{o.facesNote && <span className="sub"> · {o.facesNote}</span>}</td>
                    <td><span className="chip" style={typeChipStyle(t.color)}>{t.label}</span></td>
                    <td>{zoneLabel(o.zone)}</td>
                    <td>{p ? p.brand : <span className="sub">—</span>}</td>
                    <td className="sub">{(p && subOf(p)) || '—'}</td>
                    <td className="mono">{p ? p.start : '—'}</td>
                    <td className="mono">{p ? (p.end || '미정') : '—'}</td>
                    <td onClick={(e) => swapTarget(o) && e.stopPropagation()}>
                      {statusTag(o)}
                      {o.overdue && isEditor && <button className="mini ok" onClick={() => onRemove(o.overdue.id)}>홍보물 철거</button>}
                      {swapTarget(o) && isEditor && <button className="mini" onClick={() => onSwap(swapTarget(o), o.name)}>교체</button>}
                    </td>
                    <td className="r"><MapBtn mediaId={o.mediaId} onShowOnMap={onShowOnMap} /></td>
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
              <SortTh label="실제 철거일" sortKey="removed" sort={sortHist} setSort={setSortHist} />
              <SortTh label="기간" sortKey="duration" sort={sortHist} setSort={setSortHist} className="r" />
              <SortTh label="상태" sortKey="status" sort={sortHist} setSort={setSortHist} />
              <th className="r" />
            </tr></thead>
            <tbody>
              {sortRows(historyRows, sortHist, (p, key) => {
                if (key === 'media') return pLabel(p);
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
                    <td>{pLabel(p)}</td>
                    <td><b>{p.brand}</b></td>
                    <td className="sub">{subOf(p) || '—'}</td>
                    <td className="mono">{p.start}</td>
                    <td className="mono">{p.end || '미정'}</td>
                    <td className="mono">{p.removedAt || <span className="sub">—</span>}{p.removalSource === 'auto' && <span className="autotag">자동</span>}</td>
                    <td className="r mono">{p.end ? days(p.start, p.end) + '일' : '—'}</td>
                    <td><StatusChip status={s} /></td>
                    {/* 지도 버튼은 조회자에게도 필요해서, 예전에 편집자에게만 그리던 이 칸을
                        항상 그린다 — 되돌리기만 편집자 조건을 그대로 유지한다. */}
                    <td className="r" onClick={(e) => e.stopPropagation()}>
                      {isEditor && p.removedAt && p.removalSource === 'manual' && <button className="mini" onClick={() => onUndo(p.id)}>되돌리기</button>}
                      <MapBtn mediaId={p.mediaId} onShowOnMap={onShowOnMap} />
                    </td>
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
