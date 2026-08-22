import React, { useState, useEffect, useMemo } from 'react';
import { contentOf, subOf } from '../constants.js';
import { statusOf } from '../lib/status.js';
import { getPostingImageUrls } from '../lib/queries.js';
import StatusChip from './StatusChip.jsx';

// 홍보물 — 매체·일정과 무관하게 홍보물(브랜드·내용·이미지) 자체를 관리하는 화면.
// 매체 배치는 홍보물에 딸린 부가 정보로 아래 미니 표에서 보여주고, "+ 배치 추가"로 몇 곳이든
// 추가할 수 있다(동시에 여러 매체에 걸거나, 시간차를 두고 다시 거는 것 모두 여기서 시작).

export default function PromosPanel({ T, types, postings, placements, media, refDate, isEditor, onPick, onAssign, onRemove, onUndo, onDeletePosting }) {
  const [typeSel, setTypeSel] = useState(new Set(types.map((t) => t.code)));
  const [openDD, setOpenDD] = useState(false);
  const [draftOnly, setDraftOnly] = useState(false);
  const [q, setQ] = useState('');
  const [thumbUrls, setThumbUrls] = useState(new Map());
  const mName = (id) => media.find((m) => m.id === id)?.name || '-';

  useEffect(() => {
    let cancelled = false;
    getPostingImageUrls(postings.map((p) => p.thumbPath)).then((m) => { if (!cancelled) setThumbUrls(m); });
    return () => { cancelled = true; };
  }, [postings]);

  const toggleType = (c) => setTypeSel((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const placementsOf = useMemo(() => {
    const by = {};
    placements.forEach((pl) => (by[pl.postingId] = by[pl.postingId] || []).push(pl));
    Object.values(by).forEach((arr) => arr.sort((a, b) => b.start.localeCompare(a.start)));
    return by;
  }, [placements]);

  const rows = postings
    .filter((p) => typeSel.has(p.type))
    .filter((p) => !draftOnly || !(placementsOf[p.id]?.length))
    .filter((p) => {
      if (!q) return true;
      const names = (placementsOf[p.id] || []).map((pl) => mName(pl.mediaId)).join(' ');
      return (p.brand + contentOf(p) + names).toLowerCase().includes(q.toLowerCase());
    })
    // 미배치가 맨 앞 — 아직 어디에도 안 걸린 것이 조치가 필요한 항목이고, 방금 등록한
    // 홍보물도 미배치라 목록 맨 아래까지 스크롤해야 찾을 수 있던 문제를 함께 없앤다.
    .sort((a, b) => {
      const da = placementsOf[a.id]?.length ? 1 : 0, db = placementsOf[b.id]?.length ? 1 : 0;
      if (da !== db) return da - db;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

  return (
    <div>
      {/* 홍보물과 매체가 분리돼 있다는 게 이 화면의 전제인데 처음 보는 사람은 알 수 없어,
          한 줄로 관계를 설명한다. */}
      <p className="hint" style={{ marginBottom: 10 }}>홍보물은 매체와 따로 관리됩니다 — 먼저 등록해 두고, 필요한 매체에 원하는 만큼 <b>배치</b>하세요.</p>
      <div className="toolrow">
        <input className="inp" placeholder="업체명 · 내용 · 매체명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="dd right">
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
        <label className="chk"><input type="checkbox" checked={draftOnly} onChange={(e) => setDraftOnly(e.target.checked)} />미배치만 보기</label>
        <span className="count mono">{rows.length}건</span>
      </div>
      {rows.length === 0 && (
        <p className="empty">
          {postings.length === 0
            ? '아직 등록된 홍보물이 없습니다. 왼쪽 위 "+홍보물 등록"으로 시안을 먼저 등록하세요.'
            : '조건에 맞는 홍보물이 없습니다. 검색어나 필터를 확인해 보세요.'}
        </p>
      )}
      <div className="cgrid">
        {rows.slice(0, 60).map((p) => {
          const pls = placementsOf[p.id] || [];
          return (
            <div className="ccard" key={p.id}>
              <div className="cthumb" style={thumbUrls.has(p.thumbPath) ? undefined : { background: `linear-gradient(150deg, hsl(${p.hue} 42% 52%), hsl(${(p.hue + 40) % 360} 38% 38%))` }}>
                {thumbUrls.has(p.thumbPath) && <img className="cthumb-img" src={thumbUrls.get(p.thumbPath)} alt="" />}
              </div>
              <div className="cbody">
                <b>{p.brand}</b><i className="sub">{[subOf(p), T[p.type]?.label].filter(Boolean).join(' · ')}</i>
                <div className="crow">
                  {pls.length === 0 ? <span className="tag vacant">미배치</span> : <span className="sub mono">{pls.length}곳에 배치</span>}
                  {p.bytesLight > 0 && <span className="sub mono">{(p.bytesLight / 1024).toFixed(0)}KB</span>}
                </div>
                {pls.length > 0 && (
                  <table className="mini-t">
                    <tbody>{pls.map((pl) => {
                      const s = statusOf(pl, refDate);
                      return (
                        <tr key={pl.id} onClick={() => onPick(pl.mediaId)}>
                          <td>{mName(pl.mediaId)}{pl.installPhoto && <span title="설치 확인 사진 있음"> 📷</span>}</td>
                          <td><StatusChip status={s} /></td>
                          {isEditor && (
                            <td className="r" onClick={(e) => e.stopPropagation()}>
                              {s !== 'upcoming' && s !== 'removed' && <button className="mini ok" onClick={() => onRemove(pl.id)}>철거 처리</button>}
                              {s === 'removed' && pl.removalSource === 'manual' && <button className="mini" onClick={() => onUndo(pl.id)}>되돌리기</button>}
                            </td>
                          )}
                        </tr>
                      );
                    })}</tbody>
                  </table>
                )}
                {isEditor && <button className="btn primary wide" style={{ marginTop: 6 }} onClick={() => onAssign(p.id)}>+ 배치 추가</button>}
                {isEditor && pls.length === 0 && (
                  <div className="crow"><button className="mini no" onClick={() => onDeletePosting(p.id)}>홍보물 삭제</button></div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
