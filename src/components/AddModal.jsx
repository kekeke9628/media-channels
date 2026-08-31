import React, { useState, useMemo, useEffect } from 'react';
import { iso, DAY, periodLabel, endMismatch, findOverlap, vacantFrom } from '../constants.js';
import { ZONES } from '../data/seed.js';
import PhotoField from './PhotoField.jsx';
import { useInstallPhoto } from '../lib/useInstallPhoto.js';
import EndDateField from './EndDateField.jsx';
import { installPhotoRequired } from '../constants.js';
import { faceOccupied } from '../lib/status.js';
import { useModalKeys } from '../lib/useModalKeys.js';

// 홍보물 등록 — 두 가지 진입 경로가 있다.
// (1) 사이드바 "+홍보물 등록"(initialMediaId 없음): 매체·일정과 무관하게 브랜드·내용·
//     이미지 한 장만 등록한다. 특정 한 곳에 거는 건 이제 매체 상세의 "이 매체에 홍보물
//     배치"(PlaceOnMediaModal, 이미 등록된 것 중에서 고름)가 맡으므로 여기서는 하지
//     않는다 — 대신 흔한 다른 경우인 "여러 매체에 한 번에 새로 걸기"를 한 화면에서
//     처리할 수 있다.
// (2) 매체 상세의 "+ 새 홍보물 등록해서 바로 배치"(initialMediaId 있음): 그 화면에서
//     찾는 홍보물이 아직 없을 때 쓰는 경로라, 등록과 동시에 그 매체(그 면)에 바로 건다.
// 이미지는 브라우저 canvas에서 WebP 2단(view 1600px / thumb 400px)으로 변환한다 (사양서 6장).
// (3) 교체 탭의 "새 홍보물 등록해서 바로 교체"(swapPl 있음): (2)와 화면은 같지만 마지막에
// 배치가 아니라 교체를 한다 — 걸려 있던 것을 내리는 일까지 서버에서 한 덩어리로 처리한다.
// 자리(매체·면)와 교체일은 앞 화면에서 정해져 왔으므로 여기서는 못 바꾼다.
export default function AddModal({ T, types, media, placements, refDate, isEditor, initialMediaId, initialFace, swapPl, swapDate, onSwapNew, onClose, onAdd, onAssign, onAdjustEnd, onDone }) {
  const swapping = !!swapPl;
  const activeTypes = useMemo(() => types.filter((t) => t.active), [types]);
  const initialMedia = initialMediaId ? media.find((x) => x.id === initialMediaId && x.active) : null;

  const [typeCode, setTypeCode] = useState(initialMedia?.type || activeTypes[0]?.code || '');
  const t = T[typeCode];

  const [brand, setBrand] = useState('');
  const [title, setTitle] = useState('');
  // 홍보물 자체의 게시 기간 — 매번 쓰는 값이 아니라 접어 둔다. 안 넣고 등록하면 상시가
  // 아니라 "기간 미입력"으로 남아 목록에서 채우라고 표시된다(constants.js periodLabel).
  const [pOpen, setPOpen] = useState(false);
  const [pStart, setPStart] = useState('');
  const [pEnd, setPEnd] = useState('');
  const [pAlways, setPAlways] = useState(false);
  const [saving, setSaving] = useState(false);
  const { installPhoto, installBusy, pickInstallPhoto, clearInstallPhoto } = useInstallPhoto();

  const targets = useMemo(() => media.filter((m) => m.active && m.type === typeCode), [media, typeCode]);

  // ── (2) 특정 매체에 바로 배치 — initialMediaId로 열렸을 때만 씀 ─────────────
  const [mediaId] = useState(initialMedia?.id || '');
  const [start, setStart] = useState(refDate);
  // 종료일 미정이 예외가 아니라 기본이다(EndDateField 주석) — 매체 유형별 openEnded
  // 힌트보다 이쪽이 실제 사용 패턴에 더 맞는다.
  const [noEnd, setNoEnd] = useState(true);
  const [end, setEnd] = useState(iso(Date.parse(refDate) + 30 * DAY));
  const [conflict, setConflict] = useState(null);
  const mediaFaces = initialMedia?.faces || 1;
  const [face, setFace] = useState(initialFace || 1);
  const [faceLabel, setFaceLabel] = useState('');
  const [labelTouched, setLabelTouched] = useState(false);
  const vacantStart = (f) => (initialMedia ? vacantFrom(placements, initialMedia.id, f, refDate) : refDate);
  // 배치 기간을 손으로 고쳤으면 그 뒤로는 게시 기간을 따라가지 않는다.
  const [dateTouched, setDateTouched] = useState(false);
  useEffect(() => {
    if (!initialMedia) return;
    const faces = Array.from({ length: mediaFaces }, (_, i) => i + 1);
    const vacant = faces.find((f) => !faceOccupied(placements, initialMedia.id, f, refDate));
    const nextFace = initialFace && faces.includes(initialFace) ? initialFace : (vacant || 1);
    setFace(nextFace);
    setStart(vacantStart(nextFace));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!initialMedia) return;
    setStart(pStart || vacantStart(face));
    setConflict(null);
    if (!labelTouched) setFaceLabel(face + '면');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face]);
  // 위쪽에서 홍보물 게시 기간을 넣으면 아래 배치 기간도 그대로 따라 채운다 — 같은 날짜를
  // 두 번 입력하게 하면 한쪽만 고쳐 두고 넘어가기 쉽다.
  useEffect(() => {
    if (dateTouched) return;
    setStart(pStart || vacantStart(face));
    setEnd(pEnd || iso(Date.parse(refDate) + 30 * DAY));
    if (pEnd) setNoEnd(false);
    setConflict(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pStart, pEnd]);
  // 교체일은 앞 화면에서 정해져 왔다. start를 직접 세팅하는 effect가 셋이라(위) 상태를
  // 잠그려 들면 어느 하나를 놓치기 쉬워서, 쓰는 자리에서 파생값으로 덮는다.
  const startEff = swapping ? swapDate : start;
  const overlapAt = (id, f = 1) => findOverlap(placements, { mediaId: id, face: f, start, end: noEnd ? null : end });

  // ── (1) 여러 매체에 한 번에 배치 — 사이드바 진입일 때만 씀 ───────────────────
  const [bulkOn, setBulkOn] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [progress, setProgress] = useState(null);
  useEffect(() => { if (bulkOn) setSelected(new Set(targets.map((x) => x.id))); }, [bulkOn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setBulkConfirm(false); }, [start, end, noEnd, selected]);
  const toggleOne = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((prev) => (prev.size === targets.length ? new Set() : new Set(targets.map((x) => x.id))));
  const bulkConflictCount = [...selected].filter((id) => overlapAt(id, 1)).length;

  // 유형이 바뀌면 배치 대상 매체 목록도 바뀌므로 초기화한다.
  useEffect(() => {
    setNoEnd(true);
    setSelected(new Set());
    setConflict(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeCode]);


  const buildPayload = () => ({ type: typeCode, brand, title, start: pStart || null, end: pEnd || null, alwaysOn: pAlways });

  const submitSingle = async () => {
    // 교체 모드에서는 겹침을 여기서 조정하지 않는다 — 걸려 있던 배치를 닫는 일까지
    // 서버가 한 트랜잭션으로 처리한다(replace_placement). 여기서 미리 종료일을 손대면
    // 교체가 실패했을 때 그 자리가 빈 채로 남는다.
    if (!swapping) {
      const ov = overlapAt(mediaId, face);
      if (ov && !conflict) { setConflict(ov); return; }
      setSaving(true);
      if (ov && conflict) {
        const adjusted = await onAdjustEnd(ov.id, iso(Date.parse(startEff) - DAY));
        if (!adjusted) { setSaving(false); return; }
      }
    } else setSaving(true);
    // 등록·배치 각각의 토스트 대신 결과를 합쳐 호출 쪽(App)에서 한 번만 알린다.
    const created = await onAdd(buildPayload(), { silent: true });
    if (!created) { setSaving(false); return; }
    const placed = swapping
      ? await onSwapNew(created, { date: swapDate, end: noEnd ? null : end, installPhoto })
      : await onAssign(created, { mediaId, start: startEff, end: noEnd ? null : end, installPhoto, face, faceLabel: faceLabel || face + '면' }, { silent: true });
    setSaving(false);
    onDone?.({ placed, swapped: swapping });
    if (placed) onClose();
  };

  const submitBulk = async () => {
    setSaving(true);
    const created = await onAdd(buildPayload(), { silent: true });
    if (!created) { setSaving(false); return; }
    const ids = [...selected];
    setProgress({ done: 0, total: ids.length });
    let ok = 0, failed = 0;
    for (const id of ids) {
      const ov = overlapAt(id, 1);
      if (ov) {
        const adjusted = await onAdjustEnd(ov.id, iso(Date.parse(start) - DAY));
        if (!adjusted) { failed++; setProgress((pr) => ({ ...pr, done: pr.done + 1 })); continue; }
      }
      const added = await onAssign(created, { mediaId: id, start, end: noEnd ? null : end, face: 1 }, { silent: true });
      added ? ok++ : failed++;
      setProgress((pr) => ({ ...pr, done: pr.done + 1 }));
    }
    setSaving(false);
    onDone?.({ placed: ok > 0, bulk: { ok, failed } });
    if (ok > 0) onClose();
  };

  const submit = () => {
    if (!brand || saving) return;
    if (initialMedia) { submitSingle(); return; }
    if (bulkOn) {
      if (selected.size === 0) return;
      if (bulkConflictCount > 0 && !bulkConfirm) { setBulkConfirm(true); return; }
      submitBulk();
      return;
    }
    // 배치 없이 등록만.
    (async () => {
      setSaving(true);
      const created = await onAdd(buildPayload(), { silent: true });
      setSaving(false);
      if (!created) return;
      onDone?.({ registeredOnly: true });
      onClose();
    })();
  };

  // 관리 목적에서 "실제로 걸렸다"를 증명하는 건 설치 확인 사진뿐이라, 오늘부터 걸리는
  // 배치는 사진 없이 등록하지 못하게 한다. 게시예정(미래 시작)은 아직 못 찍으니 예외.
  // 여러 매체에 한 번에 거는 경우도 예외다 — 한 장으로 여러 자리를 증명할 수 없으니
  // 각 자리에서 따로 찍는 게 맞고, 빠진 건 알람이 쫓아간다.
  const needInstall = !!initialMedia && !bulkOn && installPhotoRequired(startEff, refDate);
  const missingInstall = needInstall && !installPhoto;
  const periodBad = !!pStart && !!pEnd && pEnd < pStart;
  const canSubmit = !!brand && (!bulkOn || selected.size > 0) && !missingInstall && !periodBad;
  // 겹침 확인(conflict/bulkConfirm)이 떠 있을 때는 Enter로 건너뛰지 못하게 막는다.
  useModalKeys({ onClose, onSubmit: submit, canSubmit: canSubmit && !conflict && !bulkConfirm, busy: saving });

  return (
    <div className="modal" onClick={onClose}>
      <div className="mbox" onClick={(e) => e.stopPropagation()}>
        {/* 면이 여럿인 매체는 어느 면을 교체하는 중인지 제목에 넣는다 — 1면짜리에 "· 1면"은
            군더더기라 붙이지 않는다. */}
        <div className="mhead"><b>{swapping
          ? `${initialMedia?.name}${mediaFaces > 1 ? ` · ${swapPl.faceLabel || swapPl.face + '면'}` : ''} 교체 — 새 홍보물`
          : initialMedia ? `${initialMedia.name}에 새로 등록` : '홍보물 등록'}</b><button onClick={onClose}>✕</button></div>
        <div className="mbody">

          {swapping ? (
            /* 무엇을 내리는지 못 박는다 — 교체 탭에서 고른 자리 그대로다. 면과 교체일은
               여기서 바꾸지 못한다(바꿀 수 있으면 엉뚱한 면에 걸릴 여지만 생긴다). */
            <div className="swapfrom">
              <span className="sub">지금 걸려 있는 것 — {swapDate}에 내려갑니다</span>
              <b>{swapPl.brand}</b>
              <i className="sub mono">{swapPl.start} ~ {swapPl.end || '미정'}</i>
            </div>
          ) : initialMedia ? (
            mediaFaces > 1 && (
              <>
                <label className="fld"><span>면 선택</span></label>
                <div className="seg">
                  {Array.from({ length: mediaFaces }, (_, i) => i + 1).map((f) => {
                    const occupied = faceOccupied(placements, initialMedia.id, f, refDate);
                    return <button key={f} type="button" className={face === f ? 'on' : ''} onClick={() => setFace(f)}>{f}면{occupied ? ' · 사용중' : ''}</button>;
                  })}
                </div>
                <label className="fld"><span>방향 (선택)</span><input value={faceLabel} onChange={(e) => { setFaceLabel(e.target.value); setLabelTouched(true); }} placeholder={`비워두면 "${face}면"으로 저장됩니다`} /></label>
              </>
            )
          ) : (
            <>
              <label className="chk"><input type="checkbox" checked={bulkOn} onChange={(e) => { setBulkOn(e.target.checked); setConflict(null); }} />여러 매체에 한 번에 배치하기</label>
              {bulkOn && (
                targets.length === 0 ? (
                  <p className="sub" style={{ padding: '8px 0' }}>이 유형의 매체가 없습니다. 등록만 먼저 하세요.</p>
                ) : (
                  <p className="hint">
                    기간을 한 번만 입력하고, 이 유형의 매체 중 원하는 곳을 체크하면 그 개수만큼 배치가 한 번에 등록됩니다.
                    {targets.some((x) => (x.faces || 1) > 1) && ' 면이 여러 개인 매체는 항상 1면에 걸립니다.'}
                  </p>
                )
              )}
            </>
          )}

          <label className="fld"><span>업체명</span><input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="예: 나이키" /></label>
          <label className="fld"><span>내용 (선택)</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="비워두면 업체명이 그대로 들어갑니다" /></label>
          {/* 홍보물 자체의 게시 기간 — "8월 프로모션"처럼 쓰는 기간이 정해진 것만 넣는다.
              비워 두면 상시로 보고, 지난 홍보물은 배치 팝업 후보에서 빠진다.
              매번 쓰는 값이 아니라 접어 둔다(기본값: 닫힘). */}
          {!pOpen ? (
            // 접는 건 화면을 접는 것뿐이다 — 넣어 둔 기간은 그대로 두고, 접힌 줄에 그 값을
            // 같이 보여준다(안 보이는 값이 저장되는 일이 없게).
            <button type="button" className="facerow" onClick={() => setPOpen(true)}>
              <b>+</b> 게시 기간 (선택) <em>{periodLabel({ start: pStart, end: pEnd, alwaysOn: pAlways })}</em>
            </button>
          ) : (
            <>
              {/* label이 아니라 div다 — label 안의 버튼을 누르면 브라우저가 그 label의 첫
                  폼 요소로 클릭을 한 번 더 보낸다. "상시로"를 누르면 그 버튼이 사라지면서
                  전달된 클릭이 옆의 "접기"에 떨어져 같이 접혀 버렸다. */}
              <div className="fld"><span className="fldhead">게시 기간 (선택)
                <span className="fldhead-btns">
                  <button type="button" className={pAlways ? 'mini ok' : 'mini'}
                    onClick={() => { setPAlways(true); setPStart(''); setPEnd(''); }}>
                    {pAlways ? '상시 ✓' : '상시로'}
                  </button>
                  <button type="button" className="mini" onClick={() => setPOpen(false)}>접기</button>
                </span>
              </span></div>
              <div className="fld2">
                <label className="fld"><span>시작일</span>
                  <span className="datefld" data-empty={pStart ? '0' : '1'}><input type="date" value={pStart} onChange={(e) => { setPStart(e.target.value); if (e.target.value) setPAlways(false); }} /></span>
                </label>
                <label className="fld"><span>종료일</span>
                  <span className="datefld" data-empty={pEnd ? '0' : '1'}><input type="date" value={pEnd} onChange={(e) => { setPEnd(e.target.value); if (e.target.value) setPAlways(false); }} /></span>
                </label>
              </div>
              {pStart && pEnd && pEnd < pStart && <p className="warnbox">종료일이 시작일보다 앞섭니다.</p>}
            </>
          )}

          {initialMedia && (
            <>
              <PhotoField
                label={needInstall ? '설치 확인 사진 (필수)' : '설치 확인 사진 (선택)'} capture
                caption="설치 확인 사진" result={installPhoto} busy={installBusy}
                onPick={pickInstallPhoto}
                onClear={clearInstallPhoto}
              />
              {missingInstall && <p className="warnbox">{swapping ? '오늘 바꿔 다는 자리라 사진이 필요합니다.' : '오늘부터 걸리는 배치라 사진이 필요합니다.'}</p>}

              <div className="fld2">
                <label className="fld"><span>{swapping ? '시작일 (교체일)' : '시작일'}</span><input type="date" value={startEff} disabled={swapping} onChange={(e) => { setStart(e.target.value); setDateTouched(true); setConflict(null); }} /></label>
                <EndDateField end={end} noEnd={noEnd}
                  onChangeEnd={(v) => { setEnd(v); setDateTouched(true); setConflict(null); }}
                  onToggleNoEnd={(v) => { setNoEnd(v); setDateTouched(true); setConflict(null); }} />
              </div>
              {endMismatch(pEnd, noEnd ? null : end) && (
                <p className="warnbox">홍보물 종료일 <b>{pEnd}</b>, 배치 종료일 <b>{noEnd ? '미정' : end}</b> — 서로 다릅니다.</p>
              )}

              {conflict && (
                <div className="conflictbox">
                  겹치는 배치가 있습니다 — <b>{conflict.brand}</b> ({conflict.start} ~ {conflict.end || '미정'}).<br />
                  그대로 진행하면 이 배치의 종료일이 <b>{iso(Date.parse(start) - DAY)}</b>로 조정됩니다.
                  <div className="conflictbtns"><button className="mini" disabled={saving} onClick={() => setConflict(null)}>취소</button><button className="mini ok" disabled={saving} onClick={submitSingle}>{saving ? '저장 중…' : '그대로 진행'}</button></div>
                </div>
              )}
            </>
          )}

          {!initialMedia && bulkOn && targets.length > 0 && (
            <>
              <div className="fld2">
                <label className="fld"><span>시작일</span><input type="date" value={start} onChange={(e) => { setStart(e.target.value); setDateTouched(true); setConflict(null); }} /></label>
                <EndDateField end={end} noEnd={noEnd}
                  onChangeEnd={(v) => { setEnd(v); setDateTouched(true); setConflict(null); }}
                  onToggleNoEnd={(v) => { setNoEnd(v); setDateTouched(true); }} />
              </div>

              {bulkConflictCount > 0 && !bulkConfirm && (
                <p className="warnbox">{bulkConflictCount}곳은 이미 걸린 홍보물이 있습니다 — 진행하면 그 종료일이 앞당겨집니다.</p>
              )}
              {bulkConfirm && (
                <div className="conflictbox">
                  선택한 {selected.size}곳 중 <b>{bulkConflictCount}곳</b>에 이미 걸린 홍보물이 있습니다.<br />
                  그대로 진행하면 그 홍보물들의 종료일이 <b>{iso(Date.parse(start) - DAY)}</b>로 앞당겨집니다.
                  <div className="conflictbtns">
                    <button className="mini" disabled={saving} onClick={() => setBulkConfirm(false)}>취소</button>
                    <button className="mini ok" disabled={saving} onClick={submitBulk}>{saving ? '배치 중…' : '그대로 진행'}</button>
                  </div>
                </div>
              )}

              <div className="fld" style={{ marginTop: 8 }}>
                <span>대상 매체 ({selected.size}/{targets.length} 선택)</span>
                <div className="medialist">
                  <label className="medialist-item medialist-all">
                    <input type="checkbox" checked={targets.length > 0 && selected.size === targets.length} onChange={toggleAll} />
                    <b>전체 선택/해제</b>
                  </label>
                  {targets.map((x) => (
                    <label key={x.id} className="medialist-item">
                      <input type="checkbox" checked={selected.has(x.id)} onChange={() => toggleOne(x.id)} />
                      <span>{x.name}</span>
                      <i className="sub">{ZONES[x.zone]?.label || x.zone}</i>
                      {overlapAt(x.id, 1) && <i className="conflicttag">겹침</i>}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="mfoot">
          {bulkOn && !initialMedia && <span className="sub" style={{ marginRight: 'auto' }}>{saving && progress ? `배치 중… ${progress.done}/${progress.total}` : ''}</span>}
          <button className="btn" disabled={saving} onClick={onClose}>취소</button>
          <button className="btn primary" onClick={submit} disabled={!canSubmit || saving}>
            {saving ? (swapping ? '교체 중…' : '저장 중…') : swapping ? '등록하고 교체' : bulkOn && !initialMedia ? `등록 · ${selected.size}건 배치` : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}
