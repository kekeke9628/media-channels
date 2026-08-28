import React, { useMemo, useState, useEffect } from 'react';
import { swapDue, swapTarget, nextDay, byName, contentOf, subOf } from '../constants.js';
import { ZONES } from '../data/seed.js';
import { getPostingImageUrls } from '../lib/queries.js';
import MapBtn from './MapBtn.jsx';

// 교체 — 관리 업체 담당자가 현장에 나가기 전에 여는 화면.
//
// 다른 화면들은 "지금 무엇이 어디에 걸려 있나"를 보여주지만, 담당자가 실제로 알고 싶은
// 건 하나다: 오늘(또는 내일) 어느 자리를 손봐야 하는가. 그래서 목록을 그 하나로 좁히고,
// 각 줄에서 바로 교체까지 끝낼 수 있게 한다 — 철거하고 다시 배치하는 두 단계로 돌지
// 않는다(그 사이에 그만두면 자리가 빈 채로 남는다).
export default function SwapPanel({ state, refDate, isEditor, onSwap, onPick, onShowOnMap }) {
  const [day, setDay] = useState('today');
  const date = day === 'tomorrow' ? nextDay(refDate) : refDate;

  const rowsOf = (d) => state
    .filter((s) => swapDue(s, refDate, d))
    // 오래 넘긴 것부터. 만료가 아닌 것끼리는 매체명 순으로 — 목록이 매번 같은 순서여야
    // 담당자가 "아까 그 줄"을 다시 찾을 수 있다.
    .sort((a, b) => (b.overdueDays || 0) - (a.overdueDays || 0) || byName(a.name, b.name));

  const today = useMemo(() => rowsOf('today'), [state, refDate]);
  const tomorrow = useMemo(() => rowsOf('tomorrow'), [state, refDate]);
  const rows = day === 'tomorrow' ? tomorrow : today;

  // 설치 확인 사진 — 담당자가 현장에서 그 자리를 알아보는 데 이만한 게 없다.
  const [shots, setShots] = useState(new Map());
  useEffect(() => {
    let cancelled = false;
    const paths = [...today, ...tomorrow].map((s) => swapTarget(s)?.installPhotoPath);
    getPostingImageUrls(paths).then((m) => { if (!cancelled) setShots(m); });
    return () => { cancelled = true; };
  }, [state]);

  return (
    <div>
      <p className="hint" style={{ marginBottom: 10 }}>
        오늘·내일 손봐야 할 자리만 모았습니다. 줄에서 <b>교체</b>를 누르면 내리고 새로 거는 것이 한 번에 끝납니다.
      </p>
      <div className="seg swapseg">
        <button className={day === 'today' ? 'on' : ''} onClick={() => setDay('today')}>
          오늘 교체{today.length > 0 && <em>{today.length}</em>}
        </button>
        <button className={day === 'tomorrow' ? 'on' : ''} onClick={() => setDay('tomorrow')}>
          내일 교체{tomorrow.length > 0 && <em>{tomorrow.length}</em>}
        </button>
      </div>
      <p className="sub mono" style={{ margin: '10px 0 6px' }}>{date} 기준 · {rows.length}곳</p>

      {rows.length === 0 ? (
        <p className="empty">
          {day === 'tomorrow'
            ? '내일 교체할 자리가 없습니다.'
            : '오늘 교체할 자리가 없습니다. 종료일이 지난 자리도 없습니다.'}
        </p>
      ) : (
        <div className="swaplist">
          {rows.map((s) => {
            const pl = swapTarget(s);
            const shot = shots.get(pl?.installPhotoPath);
            const over = s.overdue ? s.overdueDays : 0;
            return (
              <div className="swaprow" key={s.id}>
                <div className="swapshot" onClick={() => onPick(s.mediaId, s.face)}>
                  {shot
                    ? <img src={shot} alt="" loading="lazy" decoding="async" />
                    : <span className="sub">사진 없음</span>}
                </div>
                <div className="swapmain">
                  <div className="swaptop">
                    {/* flattenSlots가 name에 면 라벨까지 붙여 준다("WWM03 · 2면").
                        여기서 faceLabel을 또 붙이면 "WWM03 · 2면 · 2면"이 된다. */}
                    <b>{s.name}</b>
                    {over > 0
                      ? <span className="tag over">만료 +{over}일</span>
                      : <span className="tag live">{day === 'tomorrow' ? '내일까지' : '오늘까지'}</span>}
                  </div>
                  <div className="swapwho">
                    <b>{pl?.brand}</b>
                    {subOf(pl) && <i className="sub">{subOf(pl)}</i>}
                  </div>
                  <div className="sub mono swapmeta">{ZONES[s.zone]?.label || s.zone} · ~ {pl?.end}</div>
                  <div className="swapacts">
                    <MapBtn mediaId={s.mediaId} onShowOnMap={onShowOnMap} />
                    {isEditor && (
                      <button className="btn primary swapbtn" onClick={() => onSwap(s, date)}>교체</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
