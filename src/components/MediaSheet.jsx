import React, { useState, useEffect } from 'react';
import { LONG_OPEN, contentOf } from '../constants.js';
import { ZONES } from '../data/seed.js';
import { getPostingImageUrls } from '../lib/queries.js';

export default function MediaSheet({ T, o, isEditor, onClose, onRemove, onDelete, onQuickAdd }) {
  const t = T[o.type];
  const cur = o.overdue || o.current;
  const past = o.history.filter((p) => p.id !== cur?.id).slice().reverse();
  const zoneLabel = ZONES[o.zone]?.label || o.zone;

  // 실제 업로드된 게시물 사진이 있으면 그라데이션 대신 그걸 보여준다 — 큰 카드는 view(1600px),
  // 이력의 작은 점은 thumb(400px)를 쓴다.
  const [imgUrls, setImgUrls] = useState(new Map());
  useEffect(() => {
    let cancelled = false;
    const paths = [
      cur?.viewPath, cur?.thumbPath,
      ...(cur?.faces || []).flatMap((f) => [f.viewPath, f.thumbPath]),
      ...past.map((p) => p.thumbPath),
    ];
    getPostingImageUrls(paths).then((m) => { if (!cancelled) setImgUrls(m); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.id]);
  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="shead"><div><b>{o.name}</b><i>{zoneLabel} · {t.label} · {o.spec || t.spec} · {o.faces}면</i></div><button onClick={onClose}>✕</button></div>
        <div className="sbody">
        {isEditor && (
          <button className="btn primary wide" onClick={() => onQuickAdd(o.id)}>📷 이 매체에 사진으로 바로 등록</button>
        )}
        <h4>현재 배치</h4>
        {o.overdue && <p className="warnbox">종료일보다 <b>+{o.overdueDays}일</b> 지났습니다.</p>}
        {o.open && <p className="okbox"><b>{o.openDays}일째</b> 게시 중입니다.{o.openDays >= LONG_OPEN && ' 1년이 넘었으니 한 번 확인해 보세요.'}</p>}
        {cur ? (
          <>
            {cur.faces ? (
              <div className="facegrid">
                {cur.faces.map((f, i) => {
                  const url = imgUrls.get(f.viewPath) || imgUrls.get(f.thumbPath);
                  return (
                    <div className="bigthumb face" key={i} style={url ? undefined : { background: `linear-gradient(150deg, hsl(${(cur.hue + i * 40) % 360} 42% 52%), hsl(${(cur.hue + i * 40 + 40) % 360} 38% 38%))` }}>
                      {url && <img className="bigthumb-img" src={url} alt="" />}
                      <span>{cur.brand}</span>
                      <i className="facedir">{i === 0 ? '1면' : '2면'}{f.direction ? ` · ${f.direction}` : ''}</i>
                    </div>
                  );
                })}
              </div>
            ) : (
              (() => {
                const url = imgUrls.get(cur.viewPath) || imgUrls.get(cur.thumbPath);
                return (
                  <div className="bigthumb" style={url ? undefined : { background: `linear-gradient(150deg, hsl(${cur.hue} 42% 52%), hsl(${(cur.hue + 40) % 360} 38% 38%))` }}>
                    {url && <img className="bigthumb-img" src={url} alt="" />}
                    <span>{cur.brand}</span>
                  </div>
                );
              })()
            )}
            <div className="statgrid">
              <div><em>업체명</em><b>{cur.brand}</b></div>
              <div><em>내용</em><b>{contentOf(cur)}</b></div>
              <div><em>시작일</em><b className="mono">{cur.start}</b></div>
              <div><em>종료일</em><b className="mono">{cur.end || '미정'}</b></div>
            </div>
            {isEditor && (
              <button className={'btn wide' + (o.overdue ? ' danger' : ' ok')} onClick={() => onRemove(cur.id)}>철거 완료</button>
            )}
          </>
        ) : <p className="empty">비어있습니다 · {o.emptyDays >= 365 ? '365+' : o.emptyDays}일째</p>}

        <h4>게시 이력 <span className="sub">{past.length}건</span></h4>
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

        {isEditor && (
          <>
            <h4>매체 관리</h4>
            <button className="btn wide danger" onClick={() => onDelete(o.id)}>{o.history.length ? '이 매체 지도에서 숨기기' : '이 매체 삭제'}</button>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
