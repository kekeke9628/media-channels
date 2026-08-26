import React, { useState, useMemo, useEffect } from 'react';
import { iso, DAY } from '../constants.js';
import { ZONES } from '../data/seed.js';
import { convertImage } from '../lib/convertImage.js';
import PhotoField from './PhotoField.jsx';
import { installPhotoRequired } from '../constants.js';
import { statusOf } from '../lib/status.js';
import { useModalKeys } from '../lib/useModalKeys.js';

// 4.2MB처럼 큰 사진이 보통이지만 작은 파일은 "0.0MB"로 표시돼 어색했다.
const fileSize = (bytes) => (bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(bytes / 1024)) + 'KB');

// 홍보물 등록 — 두 가지 진입 경로가 있다.
// (1) 사이드바 "+홍보물 등록"(initialMediaId 없음): 매체·일정과 무관하게 브랜드·내용·
//     이미지 한 장만 등록한다. 특정 한 곳에 거는 건 이제 매체 상세의 "이 매체에 홍보물
//     배치"(PlaceOnMediaModal, 이미 등록된 것 중에서 고름)가 맡으므로 여기서는 하지
//     않는다 — 대신 흔한 다른 경우인 "여러 매체에 한 번에 새로 걸기"를 한 화면에서
//     처리할 수 있다.
// (2) 매체 상세의 "+ 새 홍보물 등록해서 바로 배치"(initialMediaId 있음): 그 화면에서
//     찾는 홍보물이 아직 없을 때 쓰는 경로라, 등록과 동시에 그 매체(그 면)에 바로 건다.
// 이미지는 브라우저 canvas에서 WebP 2단(view 1600px / thumb 400px)으로 변환한다 (사양서 6장).
export default function AddModal({ T, types, media, placements, refDate, isEditor, initialMediaId, initialFace, onClose, onAdd, onAssign, onAdjustEnd, onDone }) {
  const activeTypes = useMemo(() => types.filter((t) => t.active), [types]);
  const initialMedia = initialMediaId ? media.find((x) => x.id === initialMediaId && x.active) : null;

  const [typeCode, setTypeCode] = useState(initialMedia?.type || activeTypes[0]?.code || '');
  const t = T[typeCode];

  const [brand, setBrand] = useState('');
  const [title, setTitle] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  // 홍보물 자체의 게시 기간 — 안 넣으면 상시. 매번 쓰는 값이 아니라 접어 둔다.
  const [pOpen, setPOpen] = useState(false);
  const [pStart, setPStart] = useState('');
  const [pEnd, setPEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [installPhoto, setInstallPhoto] = useState(null);
  const [installBusy, setInstallBusy] = useState(false);

  const targets = useMemo(() => media.filter((m) => m.active && m.type === typeCode), [media, typeCode]);

  // ── (2) 특정 매체에 바로 배치 — initialMediaId로 열렸을 때만 씀 ─────────────
  const [mediaId] = useState(initialMedia?.id || '');
  const [start, setStart] = useState(refDate);
  const [noEnd, setNoEnd] = useState(!!t?.openEnded);
  const [end, setEnd] = useState(iso(Date.parse(refDate) + 30 * DAY));
  const [conflict, setConflict] = useState(null);
  const mediaFaces = initialMedia?.faces || 1;
  const [face, setFace] = useState(initialFace || 1);
  const [faceLabel, setFaceLabel] = useState('');
  const [labelTouched, setLabelTouched] = useState(false);
  const mediaPlacements = (id, f) => placements.filter((pl) => pl.mediaId === id && (pl.face || 1) === f).sort((a, b) => b.start.localeCompare(a.start));
  // 그 면이 비는 날 — 마지막 배치의 다음 날, 없으면 오늘.
  const vacantStart = (f) => {
    const last = initialMedia ? mediaPlacements(initialMedia.id, f)[0] : null;
    return last ? (last.end ? iso(Date.parse(last.end) + DAY) : refDate) : refDate;
  };
  // 배치 기간을 손으로 고쳤으면 그 뒤로는 게시 기간을 따라가지 않는다.
  const [dateTouched, setDateTouched] = useState(false);
  useEffect(() => {
    if (!initialMedia) return;
    const faces = Array.from({ length: mediaFaces }, (_, i) => i + 1);
    const vacant = faces.find((f) => !mediaPlacements(initialMedia.id, f).some((pl) => statusOf(pl, refDate) === 'live' || statusOf(pl, refDate) === 'open'));
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
    if (pEnd) { setEnd(pEnd); setNoEnd(false); }
    setConflict(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pStart, pEnd]);
  const findOverlap = (id, f) => {
    const newEndEff = noEnd ? '9999-12-31' : end;
    return mediaPlacements(id, f).find((pl) => {
      const plEndEff = pl.end || '9999-12-31';
      return start <= plEndEff && pl.start <= newEndEff;
    });
  };

  // ── (1) 여러 매체에 한 번에 배치 — 사이드바 진입일 때만 씀 ───────────────────
  const [bulkOn, setBulkOn] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [progress, setProgress] = useState(null);
  useEffect(() => { if (bulkOn) setSelected(new Set(targets.map((x) => x.id))); }, [bulkOn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setBulkConfirm(false); }, [start, end, noEnd, selected]);
  const toggleOne = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((prev) => (prev.size === targets.length ? new Set() : new Set(targets.map((x) => x.id))));
  const bulkConflictCount = [...selected].filter((id) => findOverlap(id, 1)).length;

  // 유형이 바뀌면 배치 대상 매체 목록도 바뀌므로 초기화한다.
  useEffect(() => {
    setNoEnd(!!t?.openEnded);
    setSelected(new Set());
    setConflict(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeCode]);

  const process = async (f) => {
    setBusy(true);
    const r = await convertImage(f);
    setResult(r);
    setBusy(false);
  };

  // 설치 확인 사진은 설치 확인 사진일 뿐이다 — 한때 디자인 시안 칸이 비어 있으면 이 사진을
  // 그 자리에도 넣어 줬는데, 현장에서 사진을 붙일 때마다 시안 칸에 같은 사진이 튀어나와
  // 지우는 일이 반복됐다. 목록이 빈 칸으로 남는 문제는 홍보물 목록이 배치의 설치 사진을
  // 대신 보여주는 쪽으로 푼다(PromosPanel).
  const processInstallPhoto = async (f) => {
    setInstallBusy(true);
    const r = await convertImage(f);
    setInstallPhoto(r);
    setInstallBusy(false);
  };

  const specRatio = useMemo(() => { const spec = t?.spec || ''; const n = spec.match(/(\d+)\D+(\d+)/); return n ? +n[1] / +n[2] : null; }, [t]);
  // 비율 경고는 디자인 시안에 대한 것이라, 현장 사진을 끌어다 채운 경우엔 띄우지 않는다.
  const mismatch = result && specRatio && Math.abs(+result.ratio - specRatio) / specRatio > 0.08;

  const buildPayload = () => ({ type: typeCode, brand, title, start: pStart || null, end: pEnd || null, singleResult: result });

  const submitSingle = async () => {
    const ov = findOverlap(mediaId, face);
    if (ov && !conflict) { setConflict(ov); return; }
    setSaving(true);
    if (ov && conflict) {
      const adjusted = await onAdjustEnd(ov.id, iso(Date.parse(start) - DAY));
      if (!adjusted) { setSaving(false); return; }
    }
    // 등록·배치 각각의 토스트 대신 결과를 합쳐 호출 쪽(App)에서 한 번만 알린다.
    const created = await onAdd(buildPayload(), { silent: true });
    if (!created) { setSaving(false); return; }
    const placed = await onAssign(created, { mediaId, start, end: noEnd ? null : end, installPhoto, face, faceLabel: faceLabel || face + '면' }, { silent: true });
    setSaving(false);
    onDone?.({ placed });
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
      const ov = findOverlap(id, 1);
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
  const needInstall = !!initialMedia && !bulkOn && installPhotoRequired(start, refDate);
  const missingInstall = needInstall && !installPhoto;
  const periodBad = !!pStart && !!pEnd && pEnd < pStart;
  const canSubmit = !!brand && (!bulkOn || selected.size > 0) && !missingInstall && !periodBad;
  // 겹침 확인(conflict/bulkConfirm)이 떠 있을 때는 Enter로 건너뛰지 못하게 막는다.
  useModalKeys({ onClose, onSubmit: submit, canSubmit: canSubmit && !conflict && !bulkConfirm, busy: saving });

  return (
    <div className="modal" onClick={onClose}>
      <div className="mbox" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><b>{initialMedia ? `${initialMedia.name}에 새로 등록` : '홍보물 등록'}</b><button onClick={onClose}>✕</button></div>
        <div className="mbody">

          {initialMedia ? (
            mediaFaces > 1 && (
              <>
                <label className="fld"><span>면 선택</span></label>
                <div className="seg">
                  {Array.from({ length: mediaFaces }, (_, i) => i + 1).map((f) => {
                    const occupied = mediaPlacements(initialMedia.id, f).some((pl) => statusOf(pl, refDate) === 'live' || statusOf(pl, refDate) === 'open');
                    return <button key={f} type="button" className={face === f ? 'on' : ''} onClick={() => setFace(f)}>{f}면{occupied ? ' · 사용중' : ''}</button>;
                  })}
                </div>
                <label className="fld"><span>방향 (선택)</span><input value={faceLabel} onChange={(e) => { setFaceLabel(e.target.value); setLabelTouched(true); }} placeholder={`비워두면 "${face}면"으로 저장됩니다`} /></label>
              </>
            )
          ) : (
            <>
              <label className="chk"><input type="checkbox" checked={bulkOn} onChange={(e) => { setBulkOn(e.target.checked); setConflict(null); }} />여러 매체에 한 번에 배치하기</label>
              <p className="hint">한 곳에만 걸려면 그냥 등록만 하세요. 등록 후 매체 상세에서 "이 매체에 홍보물 배치"로 걸 수 있습니다.</p>
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
            <button type="button" className="facerow" onClick={() => setPOpen(true)}>
              <b>+</b> 게시 기간 (선택) <em>비워두면 상시</em>
            </button>
          ) : (
            <>
              <label className="fld"><span>게시 기간 (선택)
                <button type="button" className="mini" style={{ marginLeft: 8, fontWeight: 600 }}
                  onClick={() => { setPStart(''); setPEnd(''); setPOpen(false); }}>접기</button>
              </span></label>
              <div className="fld2">
                <label className="fld"><span>시작일</span><input type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} /></label>
                <label className="fld"><span>종료일</span><input type="date" value={pEnd} onChange={(e) => setPEnd(e.target.value)} /></label>
              </div>
              {pStart && pEnd && pEnd < pStart && <p className="warnbox">종료일이 시작일보다 앞섭니다.</p>}
              <p className="hint">이 홍보물을 쓰는 기간입니다 — 자리에 언제 걸었는지(배치 기간)와는 다릅니다. 비워두면 상시.</p>
            </>
          )}
          {/* 디자인 시안은 있으면 좋지만 매번 있는 게 아니다(현장에서 등록할 때는 대개 없다).
              접어 두고, 설치 확인 사진만 넣어도 그게 홍보물 이미지로 함께 저장된다. */}
          <PhotoField
            collapsible collapsedLabel="디자인 시안 첨부 (선택)"
            label="디자인 시안 (선택)" hint="사진은 올릴 때 자동으로 용량을 줄여 저장합니다."
            caption="등록될 이미지" result={result} busy={busy}
            onPick={process}
            onClear={() => setResult(null)}
          >
            {/* JSX children은 PhotoField가 그리든 말든 여기서 먼저 평가된다 — result가 없을 때
                result.orig을 읽어 팝업이 통째로 죽었다. 값을 읽기 전에 여기서 막는다. */}
            {result && (
              <div className="rbox">
                <div className="rline total"><span>용량</span><b className="mono">{fileSize(result.orig)} → {fileSize(result.view.bytes)}</b></div>
                {mismatch && <p className="warnbox">⚠ 사진 가로세로 비율이 이 매체 규격({t.spec})과 많이 다릅니다 — 실제로 걸린 모습과 달라 보일 수 있습니다.</p>}
              </div>
            )}
          </PhotoField>

          {initialMedia && (
            <>
              <PhotoField
                label={needInstall ? '설치 확인 사진 (필수)' : '설치 확인 사진 (선택)'} capture
                hint={'현장에 실제로 부착된 모습을 한 장 남겨두면 이 배치에 "설치사진 ✓"로 표시됩니다.'}
                caption="설치 확인 사진" result={installPhoto} busy={installBusy}
                onPick={processInstallPhoto}
                onClear={() => setInstallPhoto(null)}
              />
              {missingInstall && <p className="warnbox">오늘부터 걸리는 배치입니다 — 실제로 부착된 모습을 한 장 남겨 주세요. (나중에 걸 예정이면 시작일을 미래로 잡으면 됩니다.)</p>}

              <div className="fld2">
                <label className="fld"><span>시작일</span><input type="date" value={start} onChange={(e) => { setStart(e.target.value); setDateTouched(true); setConflict(null); }} /></label>
                <label className="fld"><span>종료일</span><input type="date" value={end} disabled={noEnd} onChange={(e) => { setEnd(e.target.value); setDateTouched(true); setConflict(null); }} /></label>
              </div>
              <label className="chk"><input type="checkbox" checked={noEnd} onChange={(e) => { setNoEnd(e.target.checked); setDateTouched(true); setConflict(null); }} />종료일을 아직 정하지 않음 — 철거 알람을 보내지 않습니다</label>
              {!dateTouched && (pStart || pEnd) && <p className="hint">위에 넣은 게시 기간을 그대로 가져왔습니다 — 실제로 걸어 두는 기간이 다르면 고치세요.</p>}

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
                <label className="fld"><span>종료일</span><input type="date" value={end} disabled={noEnd} onChange={(e) => { setEnd(e.target.value); setDateTouched(true); setConflict(null); }} /></label>
              </div>
              <label className="chk"><input type="checkbox" checked={noEnd} onChange={(e) => { setNoEnd(e.target.checked); setDateTouched(true); }} />종료일을 아직 정하지 않음 — 철거 알람을 보내지 않습니다</label>

              {bulkConflictCount > 0 && !bulkConfirm && (
                <p className="warnbox">⚠ 선택된 매체 중 {bulkConflictCount}곳은 이미 걸린 홍보물이 있습니다 — 그대로 진행하면 그 홍보물의 종료일이 앞당겨집니다.</p>
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
                      {findOverlap(x.id, 1) && <i className="conflicttag">겹침</i>}
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
            {saving ? '저장 중…' : bulkOn && !initialMedia ? `등록 · ${selected.size}건 배치` : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}
