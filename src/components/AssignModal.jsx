import React, { useState, useMemo, useEffect } from 'react';
import { iso, DAY, placementDefaults, endMismatch, findOverlap } from '../constants.js';
import { ZONES } from '../data/seed.js';
import PhotoField from './PhotoField.jsx';
import { useInstallPhoto } from '../lib/useInstallPhoto.js';
import EndDateField from './EndDateField.jsx';
import { installPhotoRequired } from '../constants.js';
import { faceOccupied } from '../lib/status.js';
import { useModalKeys } from '../lib/useModalKeys.js';

// 매체 배치 — 이미 등록된 홍보물(posting)을 매체에 건다. 처음 배치든, 이미 다른 매체(들)에
// 걸려 있는 홍보물에 추가로 배치하는 것이든 동일하게 다룬다. 대상 매체는 홍보물과 같은
// 유형의 매체로만 한정한다. 매체가 여러 면을 가지면(웨더워리어 등) 단일 배치에서는 어느
// 면에 걸지 고르고, 여러 매체를 한 번에 배치할 때는 각 매체의 1면에 건다(매체마다 다른
// 면을 따로 고르는 건 복잡도만 커지고 실제로도 드문 경우라, 필요하면 단일 배치를 쓴다).
export default function AssignModal({ posting, T, media, placements, refDate, onClose, onAssign, onAdjustEnd, onDone }) {
  const [mode, setMode] = useState('single'); // 'single' | 'bulk'
  // 어느 홍보물이든 어느 매체에나 걸 수 있다 — 규격을 따지지 않는다(024).
  const targets = useMemo(() => media.filter((m) => m.active), [media]);

  const [mediaId, setMediaId] = useState(targets[0]?.id || '');
  // 배치 기간의 기본값은 이 홍보물의 게시 기간에서 가져온다(상시면 오늘 ~ 오늘+30일).
  const dflt = placementDefaults(posting, refDate, iso(Date.parse(refDate) + 30 * DAY));
  const [start, setStart] = useState(dflt.start);
  // 종료일 미정이 예외가 아니라 기본이다(EndDateField 주석) — 홍보물 자체에 이미
  // 종료일이 정해져 있을 때만 그 값을 기본으로 채워 준다.
  const [noEnd, setNoEnd] = useState(!dflt.forceEnd);
  const [end, setEnd] = useState(dflt.end);
  const [conflict, setConflict] = useState(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null);
  // 설치 확인 사진(선택) — 단일 배치에만 해당. 여러 매체를 한 번에 배치할 땐 물리적으로
  // 서로 다른 설치라 사진 한 장을 공유시킬 수 없다.
  const { installPhoto, installBusy, pickInstallPhoto, clearInstallPhoto } = useInstallPhoto();
  // 이미지 없이 등록된 홍보물이면 이 현장 사진이 홍보물 이미지도 겸한다 — 실제 반영은
  // 배치 저장 쪽(App.addPlacement)에서 하고, 여기서는 그렇게 된다는 안내만 미리 보여준다.

  // 단일 배치에서 고를 면 — 매체를 바꾸면 그 매체의 면수·현재 비어있는 면에 맞춰 다시 정한다.
  const selectedMedia = targets.find((x) => x.id === mediaId);
  const mediaFaces = selectedMedia?.faces || 1;
  const [face, setFace] = useState(1);
  const [faceLabel, setFaceLabel] = useState('');
  const [labelTouched, setLabelTouched] = useState(false);

  const [selected, setSelected] = useState(() => new Set(targets.map((x) => x.id)));
  const [bulkConfirm, setBulkConfirm] = useState(false);
  useEffect(() => { if (mode === 'bulk') setSelected(new Set(targets.map((x) => x.id))); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  // 조건이 하나라도 바뀌면 확인을 다시 받는다(확인 후 날짜만 고치고 진행하는 걸 막는다).
  useEffect(() => { setBulkConfirm(false); }, [start, end, noEnd, selected, mode]);
  const overlapAt = (id, f = 1) => findOverlap(placements, { mediaId: id, face: f, start, end: noEnd ? null : end });

  // 매체를 바꾸면(단일 모드) 비어 있는 면을 자동으로 고른다 — 이미 걸려 있는 면을 실수로
  // 또 고르는 일을 줄인다.
  useEffect(() => {
    if (mode !== 'single' || !mediaId) return;
    const faces = Array.from({ length: mediaFaces }, (_, i) => i + 1);
    const vacant = faces.find((f) => !faceOccupied(placements, mediaId, f, refDate));
    setFace(vacant || 1);
    setLabelTouched(false);
    setConflict(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId, mode]);
  useEffect(() => {
    if (!labelTouched) setFaceLabel(face + '면');
    setConflict(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face]);

  const toggleOne = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((prev) => (prev.size === targets.length ? new Set() : new Set(targets.map((x) => x.id))));
  const bulkConflictCount = [...selected].filter((id) => overlapAt(id)).length;

  const submitSingle = async () => {
    const ov = overlapAt(mediaId, face);
    if (ov && !conflict) { setConflict(ov); return; }
    setSaving(true);
    if (ov && conflict) {
      const adjusted = await onAdjustEnd(ov.id, iso(Date.parse(start) - DAY));
      if (!adjusted) { setSaving(false); return; }
    }
    const ok = await onAssign(posting, { mediaId, start, end: noEnd ? null : end, installPhoto, face, faceLabel: faceLabel || face + '면' });
    setSaving(false);
    if (ok) onClose();
  };

  const submitBulk = async () => {
    setSaving(true);
    const ids = [...selected];
    setProgress({ done: 0, total: ids.length });
    let ok = 0, failed = 0;
    for (const id of ids) {
      const ov = overlapAt(id);
      if (ov) {
        const adjusted = await onAdjustEnd(ov.id, iso(Date.parse(start) - DAY));
        if (!adjusted) { failed++; setProgress((pr) => ({ ...pr, done: pr.done + 1 })); continue; }
      }
      const added = await onAssign(posting, { mediaId: id, start, end: noEnd ? null : end }, { silent: true });
      added ? ok++ : failed++;
      setProgress((pr) => ({ ...pr, done: pr.done + 1 }));
    }
    setSaving(false);
    onDone?.(ok, failed);
    if (ok > 0) onClose();
  };

  // 단일 배치는 겹칠 때 conflictbox로 한 번 더 확인받는데 벌크는 경고문만 띄우고 바로
  // 진행해서, 기존 홍보물 여러 건의 종료일이 사용자도 모르게 앞당겨졌다 — 같은 확인 단계를 둔다.
  const submit = () => {
    if (saving) return;
    if (mode === 'single') { if (mediaId) submitSingle(); }
    else if (selected.size > 0) {
      if (bulkConflictCount > 0 && !bulkConfirm) { setBulkConfirm(true); return; }
      submitBulk();
    }
  };

  // 오늘부터 걸리는 배치는 설치 확인 사진 없이 등록하지 못하게 한다 — 관리 목적에서
  // "실제로 걸렸다"를 증명하는 건 이 사진뿐이다. 게시예정(미래 시작)은 아직 못 찍으니
  // 예외고, 여러 매체 한 번에는 한 장으로 여러 자리를 증명할 수 없어 예외다.
  const needInstall = mode === 'single' && installPhotoRequired(start, refDate);
  const missingInstall = needInstall && !installPhoto;
  const canSubmit = (mode === 'single' ? !!mediaId : selected.size > 0) && !missingInstall;
  useModalKeys({ onClose, onSubmit: submit, canSubmit: canSubmit && !conflict && !bulkConfirm, busy: saving });

  return (
    <div className="modal" onClick={onClose}>
      <div className="mbox" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><b>매체 배치</b><button onClick={onClose}>✕</button></div>
        <div className="mbody">
          <p className="hint"><b>{posting.brand}</b>{posting.title ? ' · ' + posting.title : ''}</p>

          <div className="seg">
            <button className={mode === 'single' ? 'on' : ''} disabled={saving} onClick={() => setMode('single')}>단일 매체</button>
            <button className={mode === 'bulk' ? 'on' : ''} disabled={saving} onClick={() => setMode('bulk')}>여러 매체 한 번에</button>
          </div>

          {targets.length === 0 ? (
            <p className="sub" style={{ padding: '8px 0' }}>등록된 매체가 없습니다. 지도에서 매체를 먼저 등록하세요.</p>
          ) : mode === 'single' ? (
            <>
              <label className="fld"><span>매체</span><select value={mediaId} onChange={(e) => { setMediaId(e.target.value); setConflict(null); }}>{targets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
              {/* 이 매체가 면을 여러 개 가지면(웨더워리어 등) 어느 면에 걸지 고른다 — 면마다
                  완전히 다른 업체가 걸릴 수 있어서, 매체를 고르는 것만으론 부족하다. */}
              {mediaFaces > 1 && (
                <>
                  <label className="fld"><span>면 선택</span></label>
                  <div className="seg">
                    {Array.from({ length: mediaFaces }, (_, i) => i + 1).map((f) => {
                      const occupied = faceOccupied(placements, mediaId, f, refDate);
                      return <button key={f} type="button" className={face === f ? 'on' : ''} onClick={() => setFace(f)}>{f}면{occupied ? ' · 사용중' : ''}</button>;
                    })}
                  </div>
                  <label className="fld"><span>방향 (선택)</span><input value={faceLabel} onChange={(e) => { setFaceLabel(e.target.value); setLabelTouched(true); }} placeholder={`비워두면 "${face}면"으로 저장됩니다`} /></label>
                </>
              )}
            </>
          ) : (
            targets.some((x) => (x.faces || 1) > 1)
              ? <p className="hint">면이 여러 개인 매체는 1면에 걸립니다.</p>
              : null
          )}

          <div className="fld2 datepair">
            <label className="fld"><span>시작일</span><input type="date" value={start} onChange={(e) => { setStart(e.target.value); setConflict(null); }} /></label>
            <EndDateField end={end} noEnd={noEnd}
              onChangeEnd={(v) => { setEnd(v); setConflict(null); }}
              onToggleNoEnd={(v) => { setNoEnd(v); setConflict(null); }} />
          </div>
          {endMismatch(posting.end, noEnd ? null : end) && (
            <p className="warnbox">홍보물 게시 기간과 매체 배치 기간이 상이합니다 — 홍보물 종료일 <b>{posting.end}</b>, 배치 종료일 <b>{noEnd ? '미정' : end}</b>.</p>
          )}

          {mode === 'single' && (
            <>
              <PhotoField
                label={needInstall ? '설치 확인 사진 (필수)' : '설치 확인 사진 (선택)'} capture
                caption="설치 확인 사진" result={installPhoto} busy={installBusy}
                onPick={pickInstallPhoto} onClear={clearInstallPhoto}
              />
              {missingInstall && <p className="warnbox">오늘부터 걸리는 배치라 사진이 필요합니다.</p>}
            </>
          )}

          {mode === 'single' && conflict && (
            <div className="conflictbox">
              겹치는 배치가 있습니다 — <b>{conflict.brand}</b> ({conflict.start} ~ {conflict.end || '미정'}).<br />
              그대로 진행하면 이 배치의 종료일이 <b>{iso(Date.parse(start) - DAY)}</b>로 조정됩니다.
              <div className="conflictbtns"><button className="mini" disabled={saving} onClick={() => setConflict(null)}>취소</button><button className="mini ok" disabled={saving} onClick={submitSingle}>{saving ? '저장 중…' : '그대로 진행'}</button></div>
            </div>
          )}
          {mode === 'bulk' && bulkConflictCount > 0 && !bulkConfirm && (
            <p className="warnbox">⚠ 선택된 매체 중 {bulkConflictCount}곳은 이미 걸린 홍보물이 있습니다 — 그대로 진행하면 그 홍보물의 종료일이 앞당겨집니다.</p>
          )}
          {mode === 'bulk' && bulkConfirm && (
            <div className="conflictbox">
              선택한 {selected.size}곳 중 <b>{bulkConflictCount}곳</b>에 이미 걸린 홍보물이 있습니다.<br />
              그대로 진행하면 그 홍보물들의 종료일이 <b>{iso(Date.parse(start) - DAY)}</b>로 앞당겨집니다.
              <div className="conflictbtns">
                <button className="mini" disabled={saving} onClick={() => setBulkConfirm(false)}>취소</button>
                <button className="mini ok" disabled={saving} onClick={submitBulk}>{saving ? '배치 중…' : '그대로 진행'}</button>
              </div>
            </div>
          )}

          {mode === 'bulk' && targets.length > 0 && (
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
                    {overlapAt(x.id) && <i className="conflicttag">겹침</i>}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="mfoot">
          {mode === 'bulk' && <span className="sub" style={{ marginRight: 'auto' }}>{saving && progress ? `배치 중… ${progress.done}/${progress.total}` : ''}</span>}
          <button className="btn" disabled={saving} onClick={onClose}>취소</button>
          <button className="btn primary" onClick={submit} disabled={!canSubmit || saving}>
            {saving ? '저장 중…' : mode === 'bulk' ? `${selected.size}건 배치` : '배치'}
          </button>
        </div>
      </div>
    </div>
  );
}
