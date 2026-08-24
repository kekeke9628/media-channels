import React, { useState, useEffect } from 'react';
import { LONG_OPEN, subOf } from '../constants.js';
import { ZONES } from '../data/seed.js';
import { getPostingImageUrls } from '../lib/queries.js';

// 면(face) 하나의 "현재 배치 + 지난 배치" — 단일 면 매체는 이 컴포넌트가 정확히 하나만
// 그려지고 라벨도 안 붙어서, 지금까지와 완전히 같은 화면으로 보인다. 2면 이상이면 면마다
// 따로 그려서, 앞/뒤가 서로 다른 업체·기간으로 걸린 것도 각자 정확히 보여줄 수 있다.
function FaceSection({ slot, faceCount, imgUrls, isEditor, onRemove, onQuickAdd }) {
  const cur = slot.overdue || slot.current;
  const past = slot.history.filter((p) => p.id !== cur?.id).slice().reverse();

  return (
    <div className="facesheet">
      {faceCount > 1 && <h4 className="facesheet-h">{slot.faceLabel}</h4>}
      {isEditor && (
        <button className="btn primary wide" onClick={() => onQuickAdd(slot.mediaId, slot.face)}>
          {faceCount > 1 ? `${slot.faceLabel}에 홍보물 배치` : '이 매체에 홍보물 배치'}
        </button>
      )}
      {slot.overdue && <p className="warnbox">종료일보다 <b>+{slot.overdueDays}일</b> 지났습니다.</p>}
      {slot.open && <p className="okbox"><b>{slot.openDays}일째</b> 게시 중입니다.{slot.openDays >= LONG_OPEN && ' 1년이 넘었으니 한 번 확인해 보세요.'}</p>}
      {cur ? (
        <>
          {(() => {
            const url = imgUrls.get(cur.viewPath) || imgUrls.get(cur.thumbPath);
            return (
              <div className="bigthumb" style={url ? undefined : { background: `linear-gradient(150deg, hsl(${cur.hue} 42% 52%), hsl(${(cur.hue + 40) % 360} 38% 38%))` }}>
                {url ? <img className="bigthumb-img" src={url} alt="" /> : <span>등록된 이미지 없음</span>}
              </div>
            );
          })()}
          <div className="statgrid">
            <div><em>업체명</em><b>{cur.brand}</b></div>
            {subOf(cur) && <div><em>내용</em><b>{subOf(cur)}</b></div>}
            <div><em>시작일</em><b className="mono">{cur.start}</b></div>
            <div><em>종료일</em><b className="mono">{cur.end || '미정'}</b></div>
          </div>
          {/* 설치 확인 사진은 이 배치에 붙어 있는데, 지금까지 홍보물 목록의 작은 아이콘
              말고는 실제로 볼 방법이 없었다 — 매체 상세에서 바로 확인하게 한다. */}
          {imgUrls.get(cur.installPhotoPath) && (
            <div className="rprev"><img src={imgUrls.get(cur.installPhotoPath)} alt="" /><i className="sub">설치 확인 사진</i></div>
          )}
          {isEditor && (
            <button className={'btn wide' + (slot.overdue ? ' danger' : ' ok')} onClick={() => onRemove(cur.id)}>철거 처리</button>
          )}
        </>
      ) : <p className="empty">비어있습니다 · {slot.emptyDays >= 365 ? '365+' : slot.emptyDays}일째</p>}

      {/* 이력이 없으면 썸네일 줄·표가 빈 채로 자리만 차지해서, 섹션 자체를 접는다. */}
      {past.length > 0 && (
        <>
          <h4>지난 배치 <span className="sub">{past.length}건</span></h4>
          <div className="thumbrow">{past.map((p) => {
            const url = imgUrls.get(p.thumbPath);
            return (
              <div className="tsmall" key={p.id} title={p.brand + ' ' + p.start + '~' + (p.end || '미정')}>
                {url ? <img src={url} alt="" /> : <i style={{ background: `linear-gradient(150deg, hsl(${p.hue} 40% 55%), hsl(${(p.hue + 40) % 360} 36% 40%))` }} />}
                <em className="mono">{p.start.slice(2, 7)}</em>
              </div>
            );
          })}</div>
          <table className="mini-t">
            <tbody>{past.map((p) => (<tr key={p.id}><td>{p.brand}</td><td className="mono sub">{p.start} ~ {p.end || '미정'}</td><td className="r sub mono">{p.removedAt ? '철거 ' + p.removedAt.slice(5) : '—'}</td></tr>))}</tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default function MediaSheet({ T, o, isEditor, onClose, onRemove, onDelete, onQuickAdd }) {
  const t = T[o.type];
  const zoneLabel = ZONES[o.zone]?.label || o.zone;
  const hasHistory = o.slots.some((s) => s.history.length > 0);

  // 실제 업로드된 게시물 사진이 있으면 그라데이션 대신 그걸 보여준다 — 큰 카드는 view(1600px),
  // 이력의 작은 점은 thumb(400px)를 쓴다.
  const [imgUrls, setImgUrls] = useState(new Map());
  const paths = o.slots.flatMap((s) => {
    const cur = s.overdue || s.current;
    return [cur?.viewPath, cur?.thumbPath, cur?.installPhotoPath, ...s.history.map((p) => p.thumbPath)];
  });
  // o.id(매체 id)만 의존하면, 시트를 닫지 않은 채로(예: "이 매체에 홍보물 배치") 같은
  // 매체에 새로 배치해도 매체 id는 그대로라 다시 안 불러왔다 — 방금 건 이미지가 안 보이던
  // 원인. 실제로 걸린 경로들이 바뀌었는지로 다시 판단한다.
  const pathsKey = paths.filter(Boolean).join('|');
  useEffect(() => {
    let cancelled = false;
    getPostingImageUrls(paths).then((m) => { if (!cancelled) setImgUrls(m); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsKey]);

  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="shead"><div><b>{o.name}</b><i>{zoneLabel} · {t.label} · {o.spec || t.spec} · {o.faces}면</i></div><button onClick={onClose}>✕</button></div>
        <div className="sbody">
        {o.slots.map((slot) => (
          <FaceSection key={slot.id} slot={slot} faceCount={o.faces} imgUrls={imgUrls} isEditor={isEditor} onRemove={onRemove} onQuickAdd={onQuickAdd} />
        ))}

        {isEditor && (
          <button className="btn wide danger" onClick={() => onDelete(o.id)}>{hasHistory ? '이 매체 보관 (지도에서 내리기)' : '이 매체 삭제'}</button>
        )}
        </div>
      </div>
    </div>
  );
}
