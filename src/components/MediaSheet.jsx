import React, { useState, useEffect } from 'react';
import { useModalKeys } from '../lib/useModalKeys.js';
import { LONG_OPEN, subOf } from '../constants.js';
import { ZONES } from '../data/seed.js';
import { getPostingImageUrls } from '../lib/queries.js';
import { convertImage } from '../lib/convertImage.js';

// 면(face) 하나의 "현재 배치 + 지난 배치" — 단일 면 매체는 이 컴포넌트가 정확히 하나만
// 그려지고 라벨도 안 붙어서, 지금까지와 완전히 같은 화면으로 보인다. 2면 이상이면 면마다
// 따로 그려서, 앞/뒤가 서로 다른 업체·기간으로 걸린 것도 각자 정확히 보여줄 수 있다.
// 면마다 기간 고치기 — 종료일을 잘못 넣는 일이 잦은데(현장에서 급히 넣으니), 고치려면
// 배치를 지우고 다시 만드는 수밖에 없었고 그러면 이력이 사라진다.
function DateEdit({ pl, onSave }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(pl.start);
  const [end, setEnd] = useState(pl.end || '');
  const [noEnd, setNoEnd] = useState(!pl.end);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const begin = () => { setStart(pl.start); setEnd(pl.end || ''); setNoEnd(!pl.end); setErr(''); setOpen(true); };
  const save = async () => {
    if (!start) { setErr('시작일을 넣어 주세요.'); return; }
    if (!noEnd && !end) { setErr('종료일을 넣거나 "미정"을 선택하세요.'); return; }
    if (!noEnd && end < start) { setErr('종료일이 시작일보다 앞설 수 없습니다.'); return; }
    setSaving(true);
    const ok = await onSave(pl.id, { start, end: noEnd ? null : end });
    setSaving(false);
    if (ok) setOpen(false); else setErr('저장하지 못했습니다. 같은 면에 기간이 겹치는 배치가 있는지 확인해 주세요.');
  };
  if (!open) return <button className="mini wide" style={{ marginTop: 8 }} onClick={begin}>기간 수정</button>;
  return (
    <div className="dateedit">
      <div className="fld2">
        <label className="fld"><span>시작일</span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="fld"><span>종료일</span><input type="date" value={end} disabled={noEnd} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <label className="chk"><input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} />종료일 미정 — 철거 알람을 보내지 않습니다</label>
      {err && <p className="warnbox">{err}</p>}
      <div className="conflictbtns">
        <button className="btn primary" disabled={saving} onClick={save}>{saving ? '저장 중…' : '저장'}</button>
        <button className="btn" disabled={saving} onClick={() => setOpen(false)}>취소</button>
      </div>
    </div>
  );
}

// 디자인 시안 — 평소에는 접어 둔다. 현장 확인이 목적인 화면에서 매번 필요한 건 설치
// 사진이고, 시안은 "어떤 시안이었지"를 되짚을 때만 본다.
function DesignShot({ url }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="facerow" style={{ marginTop: 10 }} onClick={() => setOpen(true)}>
        <b>+</b> 디자인 시안 보기
      </button>
    );
  }
  return (
    <div style={{ marginTop: 10 }}>
      <div className="facerow" style={{ cursor: 'default' }}>
        <b>디자인 시안</b>
        <button type="button" className="mini" style={{ marginLeft: 'auto' }} onClick={() => setOpen(false)}>접기</button>
      </div>
      <div className="rprev"><img src={url} alt="" /></div>
    </div>
  );
}

function FaceSection({ slot, faceCount, imgUrls, isEditor, onRemove, onQuickAdd, onAttachPhoto, onEditDates, collapsible }) {
  const cur = slot.overdue || slot.current;
  // 아직 시작하지 않은(게시예정) 배치는 "지난 배치"가 아니다 — 예전에는 cur만 빼고 나머지를
  // 전부 지난 배치로 묶어서, 다음 달에 걸릴 예약이 이력 표에 "지난 배치"로 들어가 있었다.
  // 게다가 그 면은 "비어있습니다"로 보여서, 비었다고 알고 겹쳐 예약하게 되는 문제가 있었다.
  const upcoming = slot.next;
  const past = slot.history.filter((p) => p.id !== cur?.id && p.id !== upcoming?.id).slice().reverse();

  // 면이 많은 매체(듀라트란스 10연동 등)는 모든 면을 다 펼치면 모바일에서 5화면을 스크롤해야
  // 7면에 닿는다. 비어 있는 면은 볼 것이 "비어있음" 한 줄뿐이라 접어 두고, 눌러서 펼치게 한다.
  // 걸린 것·예정된 것이 있는 면은 처음부터 펼쳐 둔다 — 확인할 내용이 있는 쪽이라.
  const [open, setOpen] = useState(!collapsible || !!cur || !!upcoming);
  const [photoBusy, setPhotoBusy] = useState(false);
  if (collapsible && !open) {
    return (
      <div className="facesheet" id={`face-${slot.mediaId}-${slot.face}`}>
        <button className="facerow" onClick={() => setOpen(true)}>
          <b>{slot.faceLabel}</b>
          <span className="tag vacant">비어있음</span>
          <i className="sub">{slot.emptyDays >= 365 ? '365+' : slot.emptyDays}일째</i>
          <em>펼치기</em>
        </button>
      </div>
    );
  }

  return (
    <div className="facesheet" id={`face-${slot.mediaId}-${slot.face}`}>
      {faceCount > 1 && (
        <h4 className="facesheet-h">
          {slot.faceLabel}
          {collapsible && <button className="mini" style={{ marginLeft: 8 }} onClick={() => setOpen(false)}>접기</button>}
        </h4>
      )}
      {isEditor && (
        <button className="btn primary wide" onClick={() => onQuickAdd(slot.mediaId, slot.face)}>
          {faceCount > 1 ? `${slot.faceLabel}에 홍보물 배치` : '이 매체에 홍보물 배치'}
        </button>
      )}
      {slot.overdue && <p className="warnbox">종료일보다 <b>+{slot.overdueDays}일</b> 지났습니다.</p>}
      {slot.open && <p className="okbox"><b>{slot.openDays}일째</b> 게시 중입니다.{slot.openDays >= LONG_OPEN && ' 1년이 넘었으니 한 번 확인해 보세요.'}</p>}
      {cur ? (
        <>
          {/* 관리 화면에서 확인해야 하는 건 "실제로 걸려 있는 모습"이다 — 설치 확인 사진을
              크게 두고, 디자인 시안은 접어 둔다. 설치 사진이 아직 없으면 시안이라도 보여야
              무엇이 걸렸는지 알 수 있으므로 그때만 시안을 큰 자리에 올린다. */}
          {(() => {
            const install = imgUrls.get(cur.installPhotoPath);
            const design = imgUrls.get(cur.viewPath) || imgUrls.get(cur.thumbPath);
            const big = install || design;
            return (
              <>
                <div className="bigthumb" style={big ? undefined : { background: `linear-gradient(150deg, hsl(${cur.hue} 42% 52%), hsl(${(cur.hue + 40) % 360} 38% 38%))` }}>
                  {big ? <img className="bigthumb-img" src={big} alt="" /> : <span>사진 없음</span>}
                </div>
                <p className="sub" style={{ textAlign: 'center', marginTop: 5 }}>
                  {install ? '설치 확인 사진' : design ? '디자인 시안 · 설치 확인 사진 없음' : '설치 확인 사진 없음'}
                </p>
                {install && design && <DesignShot url={design} />}
              </>
            );
          })()}
          <div className="statgrid">
            <div><em>업체명</em><b>{cur.brand}</b></div>
            {subOf(cur) && <div><em>내용</em><b>{subOf(cur)}</b></div>}
            <div><em>시작일</em><b className="mono">{cur.start}</b></div>
            <div><em>종료일</em><b className="mono">{cur.end || '미정'}</b></div>
          </div>
          {/* 날짜는 등록할 때 한 번 넣으면 끝이라 잘못 넣으면 고칠 방법이 없었다 — 배치를
              지우고 다시 만들면 이력이 사라진다. 면마다 그 자리에서 고친다. */}
          {isEditor && onEditDates && <DateEdit pl={cur} onSave={onEditDates} />}
          {/* 실제 업무는 "사무실에서 배치 등록 → 현장에서 부착 → 그 자리에서 촬영" 순서라,
              사진을 나중에 붙일 수 있어야 한다. 예전에는 배치를 만드는 순간에만 첨부할 수
              있어서, 현장 사진을 넣으려면 배치를 지우고 다시 만들어야 했다. */}
          {isEditor && onAttachPhoto && (() => {
            const take = async (e) => {
              const f = e.target.files[0];
              if (!f) return;
              setPhotoBusy(true);
              const r = await convertImage(f);
              await onAttachPhoto(cur.id, r);
              setPhotoBusy(false);
              e.target.value = '';
            };
            const done = !!cur.installPhotoPath;
            return (
              // 현장에서 바로 찍는 경우와, 아까 찍어 둔 걸 나중에 올리는 경우가 반반이다.
              <div className="drop compact">
                <div className="dropbtns">
                  <label className="dropbtn">
                    <input type="file" accept="image/*" capture="environment" disabled={photoBusy} onChange={take} />
                    {photoBusy ? '올리는 중…' : (done ? '다시 찍기' : '설치 확인 사진 찍기')}
                  </label>
                  <label className="dropbtn ghost">
                    <input type="file" accept="image/*" disabled={photoBusy} onChange={take} />
                    보관함에서 선택
                  </label>
                </div>
              </div>
            );
          })()}
          {/* "철거"가 두 군데에 있어 헷갈렸다 — 여기는 걸린 홍보물만 내리는 것이고,
              매체(틀) 자체를 내리는 건 시트 맨 아래 버튼이다. 무엇을 내리는지 이름에 넣는다. */}
          {isEditor && (
            <button className={'btn wide' + (slot.overdue ? ' danger' : ' ok')} onClick={() => onRemove(cur.id)}>
              홍보물 철거 — {cur.brand}
            </button>
          )}
        </>
      ) : !upcoming && <p className="empty">비어있습니다 · {slot.emptyDays >= 365 ? '365+' : slot.emptyDays}일째</p>}

      {/* 게시예정 — 지금은 비어 있어도 이미 잡힌 예약이 있으면 반드시 보여야 한다. 현재
          게시 중인 면에도 다음 예약이 있으면 함께 알려 준다(언제 교체되는지). */}
      {upcoming && (
        <div className="nextbox">
          <span className="tag upcoming">게시예정</span>
          <b>{upcoming.brand}</b>
          {subOf(upcoming) && <i className="sub">{subOf(upcoming)}</i>}
          <em className="mono">{upcoming.start} ~ {upcoming.end || '미정'}</em>
        </div>
      )}

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

export default function MediaSheet({ T, o, isEditor, onClose, onRemove, onDelete, onQuickAdd, onEditMediaFaces, onRenameMedia, onChangeMediaType, onAttachPhoto, onEditDates, focusFace }) {
  const t = T[o.type];
  const zoneLabel = ZONES[o.zone]?.label || o.zone;
  const hasHistory = o.slots.some((s) => s.history.length > 0);

  // 면수 수정 — 듀라트란스처럼 자리마다 판 개수가 다른 매체를 잘못된 면수로 등록했을 때
  // 매체 관리 화면까지 안 가고 여기서 바로 고칠 수 있게 한다. 줄이는 쪽은, 줄어들 면에
  // 아직 철거하지 않은 배치가 하나라도 있으면 그 배치가 화면에서 통째로 사라져 버리므로
  // (슬롯은 media.faces 개수만큼만 계산됨, lib/status.js) 막고 이유를 보여준다.
  // 판정은 반드시 "철거 기록이 없는 모든 배치"로 해야 한다 — 현재/만료만 보면 아직 시작
  // 안 한 게시예정 예약이 걸린 면을 그냥 숨겨 버린다(매체 관리 쪽과 같은 기준).
  // 매체명도 여기서 같이 고친다 — 핀을 눌러 이 매체를 보고 있는 참이라, 오타를 발견하는
  // 자리가 대개 여기다. 이름은 표시용이라 배치 이력에는 영향이 없다(배치는 id로 묶인다).
  const [editingFaces, setEditingFaces] = useState(false);
  const [nameInput, setNameInput] = useState(o.name);
  const [facesInput, setFacesInput] = useState(o.faces);
  const [facesErr, setFacesErr] = useState('');
  const [typeInput, setTypeInput] = useState(o.type);
  const startEditFaces = () => { setEditingFaces(true); setNameInput(o.name); setFacesInput(o.faces); setTypeInput(o.type); setFacesErr(''); };
  const saveFaces = () => {
    const n = +facesInput;
    const name = (nameInput || '').trim();
    if (!n || n < 1) return;
    if (!name) { setFacesErr('매체명을 비워 둘 수 없습니다.'); return; }
    // 여기서는 매체 목록을 들고 있지 않아 App이 최종 판정한다 — 겹치면 토스트로 알린다.

    const blocked = o.slots.filter((s) => s.face > n && s.history.some((p) => !p.removedAt));
    if (blocked.length > 0) {
      setFacesErr(`${Math.max(...blocked.map((s) => s.face))}면에 아직 철거하지 않은 배치가 있어 줄일 수 없습니다.`);
      return;
    }
    if (name !== o.name) onRenameMedia(o.id, name);
    if (n !== o.faces) onEditMediaFaces(o.id, n);
    if (typeInput && typeInput !== o.type) onChangeMediaType(o.id, typeInput);
    setEditingFaces(false);
  };

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

  useModalKeys({ onClose });

  // 목록에서 "3면"을 눌러 들어왔으면 그 면이 보이게 옮겨 준다 — 20면짜리 매체에서 맨 위만
  // 보여주면 누른 면을 찾으러 한참 내려야 한다.
  useEffect(() => {
    if (!focusFace) return;
    const id = `face-${o.id}-${focusFace}`;
    // 면 구획이 다 그려진 다음 프레임에 옮긴다.
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 120);
    return () => clearTimeout(t);
  }, [focusFace, o.id]);

  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="shead">
          <div>
            {editingFaces
              ? <input className="inp" value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="매체명" />
              : <b>{o.name}</b>}
            {editingFaces ? (
              <i className="headline">
                <span>{zoneLabel} ·</span>
                <select className="sel" value={typeInput} onChange={(e) => setTypeInput(e.target.value)}>
                  {Object.values(T).filter((x) => x.active || x.code === o.type).map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
                </select>
                <span>· {o.spec || t.spec} ·</span>
                <input className="inp num" type="number" min="1" value={facesInput} onChange={(e) => setFacesInput(e.target.value)} />면
                <button className="mini ok" onClick={saveFaces}>저장</button>
                <button className="mini" onClick={() => setEditingFaces(false)}>취소</button>
              </i>
            ) : (
              <i className="headline">
                <span>{zoneLabel} · {t.label} · {o.spec || t.spec} · {o.faces}면</span>
                {isEditor && <button className="mini" onClick={startEditFaces}>수정</button>}
              </i>
            )}
            {editingFaces && facesErr && <p className="warnbox" style={{ marginTop: 6 }}>{facesErr}</p>}
          </div>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="sbody">
        {/* 면이 4개 이상일 때만 접기를 켠다 — 1~2면(웨더워리어 등)은 지금까지처럼 전부 펼친 채. */}
        {o.slots.map((slot) => (
          <FaceSection key={slot.id} slot={slot} faceCount={o.faces} imgUrls={imgUrls} isEditor={isEditor} onRemove={onRemove} onQuickAdd={onQuickAdd} onAttachPhoto={onAttachPhoto} onEditDates={onEditDates} collapsible={o.faces >= 4} />
        ))}

        {/* 위쪽 "홍보물 철거"와 헷갈리지 않게, 여기가 매체(틀) 자체를 다루는 자리임을 밝힌다. */}
        {isEditor && (
          <>
            <h4 style={{ marginTop: 22 }}>매체 자체를 정리할 때</h4>
            <p className="hint" style={{ marginTop: 0 }}>
              위쪽 "홍보물 철거"는 걸린 홍보물만 내립니다. 아래는 <b>{o.name} 틀 자체</b>를
              {hasHistory ? ' 지도에서 내립니다 — 지난 배치 기록은 남고, 나중에 복구할 수 있습니다.' : ' 완전히 지웁니다 — 배치 기록이 없어 되돌릴 수 없습니다.'}
            </p>
            <button className="btn wide danger" onClick={() => onDelete(o.id)}>{hasHistory ? '이 매체 철거 (지도에서 내리기)' : '이 매체 삭제'}</button>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
