import React, { useState, useEffect, useMemo } from 'react';
import { contentOf, subOf, matches } from '../constants.js';
import { statusOf } from '../lib/status.js';
import { getPostingImageUrls } from '../lib/queries.js';
import StatusChip from './StatusChip.jsx';

// 홍보물 — 매체·일정과 무관하게 홍보물(브랜드·내용·이미지) 자체를 관리하는 화면.
// 매체 배치는 홍보물에 딸린 부가 정보로 아래 미니 표에서 보여주고, "+ 배치 추가"로 몇 곳이든
// 추가할 수 있다(동시에 여러 매체에 걸거나, 시간차를 두고 다시 거는 것 모두 여기서 시작).

export default function PromosPanel({ T, types, postings, placements, media, refDate, isEditor, onPick, onAssign, onRepeat, onRemove, onUndo, onCancel, onDeletePosting }) {
  const [openDD, setOpenDD] = useState(false);
  const [draftOnly, setDraftOnly] = useState(false);
  const [q, setQ] = useState('');
  const [thumbUrls, setThumbUrls] = useState(new Map());
  // 카드는 이미지가 붙어 무거워서 한 번에 다 그리지 않는다. 다만 예전에는 그냥 60개에서
  // 잘라 버리고 아무 표시도 없어서, 위 "N건"과 실제로 보이는 개수가 달라도 알 수 없었다.
  const [limit, setLimit] = useState(60);
  const mName = (id) => media.find((m) => m.id === id)?.name || '-';
  // 매체가 여러 면을 가지면(웨더워리어 등) 어느 면에 걸렸는지 이름 옆에 붙인다.
  const pLabel = (pl) => mName(pl.mediaId) + ((media.find((m) => m.id === pl.mediaId)?.faces || 1) > 1 ? ` · ${pl.faceLabel || (pl.face || 1) + '면'}` : '');
  // 보관된(지도에서 내린) 매체에 걸린 배치 — 이제 보관 시 함께 철거 처리되지만, 그 전에
  // 만들어진 기록은 남아 있다. 이런 행은 매체 상세가 열리지 않으므로(활성 매체만 계산됨)
  // 클릭을 막고 이유를 표시한다 — 예전엔 눌러도 아무 일도 안 일어나는 먹통이었다.
  const isArchived = (pl) => media.find((m) => m.id === pl.mediaId)?.active === false;

  useEffect(() => {
    let cancelled = false;
    // 디자인 시안이 없는 홍보물도 있다(현장에서 사진만 찍고 등록하는 경우). 그럴 때는
    // 그 홍보물이 실제로 걸린 자리의 설치 확인 사진을 대신 보여준다 — 카드가 빈 칸으로
    // 남으면 목록에서 무엇이 무엇인지 알아볼 수가 없다.
    getPostingImageUrls([...postings.map((p) => p.thumbPath), ...placements.map((pl) => pl.installPhotoPath)])
      .then((m) => { if (!cancelled) setThumbUrls(m); });
    return () => { cancelled = true; };
  }, [postings]);

  useEffect(() => { setLimit(60); }, [q, draftOnly]); // 조건이 바뀌면 처음부터 다시

  const placementsOf = useMemo(() => {
    const by = {};
    placements.forEach((pl) => (by[pl.postingId] = by[pl.postingId] || []).push(pl));
    Object.values(by).forEach((arr) => arr.sort((a, b) => b.start.localeCompare(a.start)));
    return by;
  }, [placements]);

  const rows = postings
    .filter((p) => !draftOnly || !(placementsOf[p.id]?.length))
    .filter((p) => {
      if (!q) return true;
      const names = (placementsOf[p.id] || []).map((pl) => pLabel(pl)).join(' ');
      return matches(p.brand + contentOf(p) + names, q);
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
        {rows.slice(0, limit).map((p) => {
          const pls = placementsOf[p.id] || [];
          return (
            <div className="ccard" key={p.id}>
              {(() => {
                const design = thumbUrls.get(p.thumbPath);
                // 시안이 없으면 가장 최근에 실제로 걸린 자리의 설치 사진으로 대신한다.
                const shot = design || thumbUrls.get(pls.find((x) => x.installPhotoPath)?.installPhotoPath);
                return (
                  <div className="cthumb" style={shot ? undefined : { background: `linear-gradient(150deg, hsl(${p.hue} 42% 52%), hsl(${(p.hue + 40) % 360} 38% 38%))` }}>
                    {shot && <img className="cthumb-img" src={shot} alt="" />}
                    {!design && shot && <em className="cthumb-tag">설치 사진</em>}
                  </div>
                );
              })()}
              <div className="cbody">
                <b>{p.brand}</b>{subOf(p) && <i className="sub">{subOf(p)}</i>}
                <div className="crow">
                  {pls.length === 0 ? <span className="tag vacant">미배치</span> : <span className="sub mono">{pls.length}곳에 배치</span>}
                </div>
                {pls.length > 0 && (
                  <table className="mini-t">
                    <tbody>{pls.map((pl) => {
                      const s = statusOf(pl, refDate);
                      const archived = isArchived(pl);
                      return (
                        <tr key={pl.id} onClick={archived ? undefined : () => onPick(pl.mediaId)} style={archived ? { cursor: 'default' } : undefined}>
                          <td>{pLabel(pl)}{archived && <i className="sub"> · 보관된 매체</i>}{pl.installPhoto && <span title="설치 확인 사진 있음"> 📷</span>}</td>
                          <td><StatusChip status={s} /></td>
                          {isEditor && (
                            <td className="r" onClick={(e) => e.stopPropagation()}>
                              {s !== 'upcoming' && s !== 'removed' && <button className="mini ok" onClick={() => onRemove(pl.id)}>홍보물 철거</button>}
                              {/* 아직 시작 안 한 배치는 실제로 걸린 적이 없다 — 철거가 아니라 취소(기록 삭제)가 맞다.
                                  철거로 처리하면 걸린 적도 없는 업체가 그 매체 이력에 남는다. */}
                              {s === 'upcoming' && <button className="mini no" onClick={() => onCancel(pl.id)}>배치 취소</button>}
                              {s === 'removed' && pl.removalSource === 'manual' && <button className="mini" onClick={() => onUndo(pl.id)}>되돌리기</button>}
                              {/* 매달 같은 업체를 같은 자리에 다시 거는 일이 잦다 — 끝난 배치는
                                  그 매체·면을 미리 채운 채로 배치 화면을 열어 준다. */}
                              {(s === 'removed' || s === 'overdue') && !archived && <button className="mini" onClick={() => onRepeat(pl)}>다시 걸기</button>}
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
      {rows.length > limit && (
        <button className="btn wide" onClick={() => setLimit((n) => n + 60)}>
          더 보기 · {rows.length - limit}건 남음
        </button>
      )}
    </div>
  );
}
