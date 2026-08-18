import React, { useState, useEffect } from 'react';
import { contentOf } from '../constants.js';
import { statusOf } from '../lib/status.js';
import { getPostingImageUrls } from '../lib/queries.js';
import StatusChip from './StatusChip.jsx';

// 게시물 (이미지 카드) — 원본 대비 경량화 비율을 보여준다
export default function GalleryPanel({ media, postings, refDate, onPick }) {
  const order = { overdue: 0, live: 1, open: 2, upcoming: 3, removed: 4 };
  const [filter, setFilter] = useState('overdue');
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
  const rows = postings.filter((p) => {
    if (rangeOn) { if ((p.end || '9999-12-31') < from || p.start > to) return false; }
    else if (filter !== 'all' && statusOf(p, refDate) !== filter) return false;
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
          <div className="seg">
            {[['overdue', '만료'], ['live', '게시중'], ['open', '미정'], ['upcoming', '예정'], ['removed', '철거완료'], ['all', '전체']].map(([k, v]) => (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{v}</button>
            ))}
          </div>
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
                {p.driveUrl && <a className="lnk" href={p.driveUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>원본(드라이브)</a>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
