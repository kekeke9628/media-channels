import React, { useState, useEffect } from 'react';
import { contentOf, ST } from '../constants.js';
import { statusOf } from '../lib/status.js';
import { getPostingImageUrls } from '../lib/queries.js';
import StatusChip from './StatusChip.jsx';

// "지금 상태"는 사실 게시중(종료일 있든 없든) · 게시예정 · (해당없음) 3가지뿐이다.
// 만료·철거완료는 상태가 아니라 각각 "게시중인데 방치된 경고 플래그"와 "지난 기록"이라
// 다중선택 드롭다운에 같이 두면 애매해서 별도 ON/OFF로 뺀다. 종료일 유무(open/live)도
// 필터에서는 "게시중" 하나로 묶고, 행별 상세 표시(StatusChip)에서만 구분해서 보여준다.
const STATUS_OPTS = [['live', '게시중', ST.live.color], ['upcoming', ST.upcoming.label, ST.upcoming.color]];
const statusBucket = (raw) => (raw === 'open' ? 'live' : raw);

// 게시물 (이미지 카드) — 원본 대비 경량화 비율을 보여준다
export default function GalleryPanel({ media, postings, refDate, isEditor, onPick }) {
  const order = { overdue: 0, live: 1, open: 2, upcoming: 3, removed: 4 };
  const [statusSel, setStatusSel] = useState(new Set(STATUS_OPTS.map(([k]) => k)));
  const [showOverdue, setShowOverdue] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [q, setQ] = useState('');
  const [rangeOn, setRangeOn] = useState(false);
  const [from, setFrom] = useState('2025-01-01');
  const [to, setTo] = useState(refDate);
  const [thumbUrls, setThumbUrls] = useState(new Map());
  const mName = (id) => media.find((m) => m.id === id)?.name || '-';

  // 실제 업로드된 게시물 사진이 있으면 그라데이션 대신 그걸 보여준다.
  useEffect(() => {
    let cancelled = false;
    getPostingImageUrls(postings.map((p) => p.thumbPath)).then((m) => { if (!cancelled) setThumbUrls(m); });
    return () => { cancelled = true; };
  }, [postings]);
  const toggleStatus = (c) => setStatusSel((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const rows = postings.filter((p) => {
    if (rangeOn) { if ((p.end || '9999-12-31') < from || p.start > to) return false; }
    else {
      const s = statusOf(p, refDate);
      if (s === 'overdue' ? !showOverdue : s === 'removed' ? !showRemoved : !statusSel.has(statusBucket(s))) return false;
    }
    if (!q) return true;
    return (contentOf(p) + p.brand + mName(p.mediaId)).toLowerCase().includes(q.toLowerCase());
  }).sort((a, b) => rangeOn ? b.start.localeCompare(a.start) : (order[statusOf(a, refDate)] ?? 9) - (order[statusOf(b, refDate)] ?? 9) || b.start.localeCompare(a.start));

  return (
    <div>
      <div className="toolrow">
        <input className="inp" placeholder="업체명 · 내용 · 매체 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="chk"><input type="checkbox" checked={rangeOn} onChange={(e) => setRangeOn(e.target.checked)} />기간으로 조회</label>
        {rangeOn ? (
          <div className="daterange"><input className="inp date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><span className="sub">~</span><input className="inp date" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        ) : (
          <>
            <div className="dd right">
              <button className="btn" onClick={() => setStatusOpen((v) => !v)}>상태 {statusSel.size === STATUS_OPTS.length ? '전체' : statusSel.size} ▾</button>
              {statusOpen && (
                <div className="ddmenu" onMouseLeave={() => setStatusOpen(false)}>
                  <div className="ddtop"><button onClick={() => setStatusSel(new Set(STATUS_OPTS.map(([k]) => k)))}>전체</button><button onClick={() => setStatusSel(new Set())}>해제</button></div>
                  {STATUS_OPTS.map(([k, v, color]) => (
                    <label key={k}><input type="checkbox" checked={statusSel.has(k)} onChange={() => toggleStatus(k)} /><i style={{ background: color }} />{v}</label>
                  ))}
                </div>
              )}
            </div>
            <label className="chk"><input type="checkbox" checked={showOverdue} onChange={(e) => setShowOverdue(e.target.checked)} />만료 포함</label>
            <label className="chk"><input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />철거완료 포함</label>
          </>
        )}
        <span className="count mono">{rows.length}건</span>
      </div>
      <div className="cgrid">
        {rows.slice(0, 60).map((p) => {
          const s = statusOf(p, refDate);
          return (
            <div className="ccard" key={p.id} onClick={() => onPick(p.mediaId)}>
              <div className="cthumb" style={thumbUrls.has(p.thumbPath) ? undefined : { background: `linear-gradient(150deg, hsl(${p.hue} 42% 52%), hsl(${(p.hue + 40) % 360} 38% 38%))` }}>
                {thumbUrls.has(p.thumbPath) && <img className="cthumb-img" src={thumbUrls.get(p.thumbPath)} alt="" />}
                <span className="cver mono">{p.start.slice(5)} ~ {p.end ? p.end.slice(5) : '미정'}</span>
                {p.installPhoto && <span className="cshot">설치사진 ✓</span>}
              </div>
              <div className="cbody">
                <b>{p.brand}</b><i className="sub">{contentOf(p)} · {mName(p.mediaId)}</i>
                <div className="crow">
                  <StatusChip status={s} />
                  {p.bytesLight > 0 && <span className="sub mono">{(p.bytesLight / 1024).toFixed(0)}KB</span>}
                </div>
                {p.bytesLight > 0 ? (
                  <div className="csize mono">원본 {(p.bytesOrig / 1048576).toFixed(1)}MB → 경량 {(p.bytesLight / 1024).toFixed(0)}KB<b> {Math.round((1 - p.bytesLight / p.bytesOrig) * 100)}% ↓</b></div>
                ) : (
                  <p className="sub" style={{ margin: '5px 0 7px' }}>이미지 미등록</p>
                )}
                {isEditor && p.driveUrl && <a className="lnk" href={p.driveUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>원본(드라이브)</a>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
