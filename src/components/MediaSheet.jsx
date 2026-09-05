import React, { useState, useEffect } from 'react';
import { useModalKeys } from '../lib/useModalKeys.js';
import { LONG_OPEN, subOf, swapLateDays, canTakePhoto, PHOTO_ONLY_MOBILE } from '../constants.js';
import { ZONES } from '../data/seed.js';
import { getPostingImageUrls } from '../lib/queries.js';
import PhotoViewer from './PhotoViewer.jsx';
import { convertImage } from '../lib/convertImage.js';

// 면(face) 하나의 "현재 배치 + 지난 배치" — 단일 면 매체는 이 컴포넌트가 정확히 하나만
// 그려지고 라벨도 안 붙어서, 지금까지와 완전히 같은 화면으로 보인다. 2면 이상이면 면마다
// 따로 그려서, 앞/뒤가 서로 다른 업체·기간으로 걸린 것도 각자 정확히 보여줄 수 있다.
function StatsEditor({ pl, isEditor, onEditText, onEditDates, onRelink }) {
  const [title, setTitle] = useState(pl.title || '');
  const [start, setStart] = useState(pl.start);
  const [end, setEnd] = useState(pl.end || '');
  const [noEnd, setNoEnd] = useState(!pl.end);
  // 다른 면으로 옮겨 가거나 값이 서버에서 바뀌면 편집칸도 따라간다.
  useEffect(() => {
    setTitle(pl.title || '');
    setStart(pl.start); setEnd(pl.end || ''); setNoEnd(!pl.end);
  }, [pl.id, pl.title, pl.start, pl.end]);

  const canText = isEditor && !!onEditText;
  const canDate = isEditor && !!onEditDates;
  const saveDates = (s2, e2) => onEditDates(pl.id, { start: s2, end: e2 });

  return (
    <div className="statgrid">
      {/* 업체명을 직접 고치면 이 홍보물이 걸린 다른 자리까지 전부 따라 바뀐다 — 배치할 때
          목록에서 엉뚱한 걸 고른 것뿐인데 이름을 고치면 그 홍보물 자체가 바뀐다. 그래서
          이 칸은 값을 고치는 자리가 아니라 "다른 홍보물을 고르는" 자리로 삼는다. */}
      {canText && onRelink ? (
        <button type="button" className="statcell" onClick={() => onRelink(pl)} title="눌러서 다른 홍보물로 바꾸기">
          <em>업체명</em>
          <b>{pl.brand}</b>
          <i className="statcell-pen">⇄</i>
        </button>
      ) : (
        <div><em>업체명</em><b>{pl.brand}</b></div>
      )}

      <StatCell label="내용" value={subOf(pl) || '—'} editable={canText}
        onSave={() => onEditText(pl.postingId, { title: title.trim() })}>
        {({ close, commit, saving }) => (
          <>
            <input className="inp" value={title} autoFocus placeholder="비워두면 업체명만 표시됩니다"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit(null); }} />
            <div className="statcell-btns">
              <button className="mini ok" disabled={saving} onClick={() => commit(null)}>저장</button>
              <button className="mini" disabled={saving} onClick={() => { setTitle(pl.title || ''); close(); }}>취소</button>
            </div>
          </>
        )}
      </StatCell>

      <StatCell label="시작일" value={pl.start} mono editable={canDate}
        onSave={() => saveDates(start, noEnd ? null : end)}>
        {({ close, commit, saving }) => (
          <>
            <input className="inp" type="date" value={start} autoFocus onChange={(e) => setStart(e.target.value)} />
            <div className="statcell-btns">
              <button className="mini ok" disabled={saving}
                onClick={() => commit(!start ? '시작일을 넣어 주세요.' : (!noEnd && end && end < start) ? '종료일이 시작일보다 앞섭니다.' : null)}>저장</button>
              <button className="mini" disabled={saving} onClick={() => { setStart(pl.start); close(); }}>취소</button>
            </div>
          </>
        )}
      </StatCell>

      <StatCell label="종료일" value={pl.end || '미정'} mono editable={canDate}
        onSave={() => saveDates(start, noEnd ? null : end)}>
        {({ close, commit, saving }) => (
          <>
            <input className="inp" type="date" value={end} disabled={noEnd} autoFocus onChange={(e) => setEnd(e.target.value)} />
            <label className="chk"><input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} />미정</label>
            <div className="statcell-btns">
              <button className="mini ok" disabled={saving}
                onClick={() => commit(!noEnd && !end ? '종료일을 넣거나 "미정"을 선택하세요.' : (!noEnd && end < start) ? '종료일이 시작일보다 앞섭니다.' : null)}>저장</button>
              <button className="mini" disabled={saving} onClick={() => { setEnd(pl.end || ''); setNoEnd(!pl.end); close(); }}>취소</button>
            </div>
          </>
        )}
      </StatCell>
    </div>
  );
}

// 값이 적힌 칸을 그대로 누르면 그 자리에서 고친다.
//
// 예전에는 "기간 수정" 버튼을 따로 눌러야 했다 — 고칠 값 바로 옆이 아니라 아래에 버튼이
// 있으니 무엇을 고치는 버튼인지 한 번 더 생각하게 되고, 업체명은 아예 고칠 방법이 없었다.
// 보이는 값을 눌러서 고치는 게 가장 짧다.
function StatCell({ label, value, mono, onSave, children, editable }) {
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  if (!editable) return <div><em>{label}</em><b className={mono ? 'mono' : undefined}>{value}</b></div>;
  if (!editing) {
    return (
      <button type="button" className="statcell" onClick={() => { setErr(''); setEditing(true); }} title="눌러서 수정">
        <em>{label}</em>
        <b className={mono ? 'mono' : undefined}>{value}</b>
        <i className="statcell-pen">✎</i>
      </button>
    );
  }
  const commit = async (next) => {
    const msg = typeof next === 'string' ? next : null;
    if (msg) { setErr(msg); return; }
    setSaving(true);
    const ok = await onSave();
    setSaving(false);
    if (ok) { setEditing(false); setErr(''); }
    else setErr('저장하지 못했습니다.');
  };
  return (
    <div className="statcell editing">
      <em>{label}</em>
      {children({ close: () => { setEditing(false); setErr(''); }, commit, saving, setErr })}
      {err && <span className="statcell-err">{err}</span>}
    </div>
  );
}

function FaceSection({ slot, faceCount, imgUrls, isEditor, refDate, onZoom, onRemove, onSwap, onQuickAdd, onAttachPhoto, onEditDates, onEditText, onRelink, collapsible }) {
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
    // 면이 여럿이면 구획마다 옅은 바탕을 깔아 서로 떼어 놓는다 — 실선 한 줄로만 나눠 놨더니
    // 사진·버튼이 들어간 면들이 죽 이어져 보여서, 스크롤하며 훑을 때 어디서 1면이 끝나고
    // 2면이 시작하는지 알 수 없었다. 접힌 면은 .facerow가 이미 상자라 그대로 둔다.
    <div className={'facesheet' + (faceCount > 1 ? ' multi' : '')} id={`face-${slot.mediaId}-${slot.face}`}>
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
      {/* 밀린 날수는 종료일이 아니라 철거일(종료일 다음 날)부터 센다 — 교체 탭이 같은
          배치를 "오늘 내림"이라 부르는데 여기서 "+1일 지났습니다"라고 하면 두 화면이
          서로 반대로 말한다(constants.swapLateDays, 같은 셈). */}
      {slot.overdue && (() => {
        const late = swapLateDays(slot.overdue, refDate);
        return <p className="warnbox">{late > 0 ? <>철거가 <b>{late}일</b> 밀렸습니다.</> : '오늘 내리는 자리입니다.'}</p>;
      })()}
      {slot.open && <p className="okbox"><b>{slot.openDays}일째</b> 게시 중입니다.{slot.openDays >= LONG_OPEN && ' 1년이 넘었으니 한 번 확인해 보세요.'}</p>}
      {cur ? (
        <>
          {/* 이 화면에서 확인해야 하는 건 "실제로 걸려 있는 모습" 하나다 — 인쇄 시안은
              걸리기 전의 그림이라, 비율이 안 맞게 걸렸거나 엉뚱한 게 걸린 것을 못 잡는다. */}
          {(() => {
            const install = imgUrls.get(cur.installPhotoPath);
            return (
              <>
                {/* 사진이 있으면 눌러서 크게 본다 — 목록 크기로는 인쇄물 글자나 비뚤어짐이
                    안 보인다. 누를 수 있다는 걸 알려야 하므로 모서리에 표시를 얹는다. */}
                <div className={'bigthumb' + (install ? ' zoomable' : '')}
                  onClick={install ? () => onZoom(install, `${slot.faceLabel} · ${cur.brand}`) : undefined}
                  style={install ? undefined : { background: `linear-gradient(150deg, hsl(${cur.hue} 42% 52%), hsl(${(cur.hue + 40) % 360} 38% 38%))` }}>
                  {install ? <><img className="bigthumb-img" src={install} alt="" /><em className="bigthumb-zoom">⤢ 크게</em></> : <span>사진 없음</span>}
                </div>
                <p className="sub" style={{ textAlign: 'center', marginTop: 5 }}>
                  {install ? '설치 확인 사진' : '설치 확인 사진 없음 — 아래에서 찍어 주세요'}
                </p>
              </>
            );
          })()}
          {/* 값이 적힌 칸을 그대로 눌러 고친다 — 업체명은 눌러도 여기서 안 고치고 다른
              홍보물을 고르는 팝업으로 보낸다(위 StatsEditor 주석). 내용은 홍보물의 값이라
              그 홍보물이 걸린 모든 자리에 함께 반영되고, 시작일·종료일은 이 면의 값이라
              여기만 바뀐다. */}
          <StatsEditor pl={cur} isEditor={isEditor} onEditText={onEditText} onEditDates={onEditDates} onRelink={onRelink} />
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
                  {canTakePhoto() ? (
                    <label className="dropbtn">
                      <input type="file" accept="image/*" capture="environment" disabled={photoBusy} onChange={take} />
                      {photoBusy ? '올리는 중…' : (done ? '다시 찍기' : '설치 확인 사진 찍기')}
                    </label>
                  ) : (
                    /* PC에서는 카메라가 안 열린다 — 버튼을 숨기지 않고 이유를 알려 준다.
                       그대로 두면 옆의 "보관함에서 선택"과 똑같이 파일 선택창만 열려서,
                       누른 사람은 카메라가 왜 안 켜지는지 알 수가 없다. */
                    <button type="button" className="dropbtn" onClick={() => window.alert(PHOTO_ONLY_MOBILE)}>
                      {done ? '다시 찍기' : '설치 확인 사진 찍기'}
                    </button>
                  )}
                  <label className="dropbtn ghost">
                    <input type="file" accept="image/*" disabled={photoBusy} onChange={take} />
                    보관함에서 선택
                  </label>
                </div>
              </div>
            );
          })()}
          {/* "철거"가 두 군데에 있어 헷갈렸다 — 여기는 걸린 홍보물만 내리는 것이고,
              매체(틀) 자체를 내리는 건 시트 맨 아래 버튼이다. 무엇을 내리는지 이름에 넣는다.
              교체를 나란히 둔다 — 이 화면에만 교체가 없어서, 업체명을 눌러 연 "홍보물 변경"
              팝업이 "실제로 바꿔 단 것이면 교체를 쓰세요"라고 안내하면서 정작 그 문으로 갈
              길이 없었다. 두 선택지를 형제로 놓으면 깊이 들어가기 전에 고르게 된다
              (매체 현황·홍보물 탭이 이미 [철거][교체]를 나란히 둔다). */}
          {isEditor && (
            <div className="btn2">
              <button className={'btn' + (slot.overdue ? ' danger' : ' ok')} onClick={() => onRemove(cur.id)}>
                홍보물 철거
              </button>
              {onSwap && <button className="btn" onClick={() => onSwap(cur)}>교체</button>}
            </div>
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
          {/* 아직 걸리지도 않은 예약이야말로 잘못 고른 걸 바로잡기 가장 좋은 때다 —
              여기서 못 고치면 걸린 뒤에야 알게 된다. */}
          {isEditor && onRelink && (
            <button className="mini" onClick={() => onRelink(upcoming)}>홍보물 다시 고르기</button>
          )}
        </div>
      )}

      {/* 이력이 없으면 썸네일 줄·표가 빈 채로 자리만 차지해서, 섹션 자체를 접는다. */}
      {past.length > 0 && (
        <>
          <h4>지난 배치 <span className="sub">{past.length}건</span></h4>
          <div className="thumbrow">{past.map((p) => {
            // 그 배치의 설치 확인 사진 — 지난 배치도 "그때 실제로 걸렸던 모습"으로 남는다.
            const url = imgUrls.get(p.installPhotoPath);
            return (
              <div className={'tsmall' + (url ? ' zoomable' : '')} key={p.id}
                title={p.brand + ' ' + p.start + '~' + (p.end || '미정')}
                onClick={url ? () => onZoom(url, `${p.brand} · ${p.start} ~ ${p.end || '미정'}`) : undefined}>
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

export default function MediaSheet({ T, o, isEditor, refDate, onClose, onRemove, onSwap, onDelete, onQuickAdd, onEditMediaFaces, onRenameMedia, onChangeMediaType, onAttachPhoto, onEditDates, onEditText, onRelink, focusFace }) {
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

  // 사진은 전부 설치 확인 사진이다(홍보물 시안은 안 쓴다) — 지금 걸린 것 한 장과
  // 이력에 남은 것들. 전부 view 크기라 큰 자리에 써도 뭉개지지 않는다.
  const [imgUrls, setImgUrls] = useState(new Map());
  // 크게 볼 사진 하나 — 면마다 따로 들고 있으면 어느 것이 열렸는지 시트가 모른다.
  const [zoom, setZoom] = useState(null); // { src, caption }
  const openZoom = (src, caption) => setZoom({ src, caption });
  const paths = o.slots.flatMap((s) => s.history.map((p) => p.installPhotoPath));
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
      {/* 면 구획을 몇 칸으로 흘릴지에 따라 시트 폭이 정해진다 — 1면짜리 매체까지 넓게
          열면 좁은 칸 하나에 내용이 몰려 빈 공간만 남는다. 세 칸이 상한이다(듀라트란스
          20면을 스무 칸으로 늘어놔 봐야 한 칸이 읽을 수 없이 좁아진다). */}
      <div className="sheet" style={{ '--face-cols': Math.min(3, Math.max(1, o.slots.length)) }}
        onClick={(e) => e.stopPropagation()}>
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
                <span>{t.label} · {o.spec || t.spec} · {o.faces}면</span>
                {isEditor && <button className="mini" onClick={startEditFaces}>수정</button>}
              </i>
            )}
            {editingFaces && facesErr && <p className="warnbox" style={{ marginTop: 6 }}>{facesErr}</p>}
          </div>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="sbody">
        {/* 면이 4개 이상일 때만 접기를 켠다 — 1~2면(웨더워리어 등)은 지금까지처럼 전부 펼친 채. */}
        <div className="facegrid">
          {o.slots.map((slot) => (
            <FaceSection key={slot.id} slot={slot} faceCount={o.faces} imgUrls={imgUrls} isEditor={isEditor} refDate={refDate} onZoom={openZoom} onRemove={onRemove} onSwap={onSwap} onQuickAdd={onQuickAdd} onAttachPhoto={onAttachPhoto} onEditDates={onEditDates} onEditText={onEditText} onRelink={onRelink} collapsible={o.faces >= 4} />
          ))}
        </div>

        {/* 위쪽 "홍보물 철거"와 헷갈리지 않게, 여기가 매체(틀) 자체를 다루는 자리임을 밝힌다. */}
        {isEditor && (
          <>
            <h4 style={{ marginTop: 22 }}>매체 자체를 정리할 때</h4>
            {/* 되돌릴 수 있는지 없는지는 남긴다 — 버튼을 누르기 전에 알아야 하는 유일한 정보다. */}
            <p className="hint" style={{ marginTop: 0 }}>
              {hasHistory ? '기록은 남고 나중에 복구할 수 있습니다.' : '배치 기록이 없어 되돌릴 수 없습니다.'}
            </p>
            <button className="btn wide danger" onClick={() => onDelete(o.id)}>{hasHistory ? '이 매체 철거 (지도에서 내리기)' : '이 매체 삭제'}</button>
          </>
        )}
        </div>
      </div>
      {zoom && <PhotoViewer src={zoom.src} caption={zoom.caption} onClose={() => setZoom(null)} />}
    </div>
  );
}
