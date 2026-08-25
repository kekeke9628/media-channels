import React, { useState, useMemo, useEffect, useRef } from 'react';
import { iso, DAY } from '../constants.js';
import { ZONES } from '../data/seed.js';
import { convertImage } from '../lib/convertImage.js';
import PhotoField from './PhotoField.jsx';
import { installPhotoRequired } from '../constants.js';
import { statusOf } from '../lib/status.js';
import { canPlaceOn } from '../lib/queries.js';
import { useModalKeys } from '../lib/useModalKeys.js';

// 매체 배치 — 이미 등록된 홍보물(posting)을 매체에 건다. 처음 배치든, 이미 다른 매체(들)에
// 걸려 있는 홍보물에 추가로 배치하는 것이든 동일하게 다룬다. 대상 매체는 홍보물과 같은
// 유형의 매체로만 한정한다. 매체가 여러 면을 가지면(웨더워리어 등) 단일 배치에서는 어느
// 면에 걸지 고르고, 여러 매체를 한 번에 배치할 때는 각 매체의 1면에 건다(매체마다 다른
// 면을 따로 고르는 건 복잡도만 커지고 실제로도 드문 경우라, 필요하면 단일 배치를 쓴다).
export default function AssignModal({ posting, T, media, placements, refDate, preset, onClose, onAssign, onAdjustEnd, onDone }) {
  const t = T[posting.types?.[0]];
  const [mode, setMode] = useState('single'); // 'single' | 'bulk'
  // 이 캠페인의 인쇄 파일이 있는 규격의 매체만 후보로 둔다 — 웨더워리어용 파일이 없으면
  // 웨더워리어에 걸 수 없다(물리적으로 다른 규격이라).
  const targets = useMemo(() => media.filter((m) => m.active && canPlaceOn(posting, m.type)), [media, posting]);

  // preset이 있으면("다시 걸기") 그 매체를 미리 골라 둔다.
  const [mediaId, setMediaId] = useState(preset?.mediaId || targets[0]?.id || '');
  const [start, setStart] = useState(refDate);
  const [noEnd, setNoEnd] = useState(!!t?.openEnded);
  const [end, setEnd] = useState(iso(Date.parse(refDate) + 30 * DAY));
  const [conflict, setConflict] = useState(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null);
  // 설치 확인 사진(선택) — 단일 배치에만 해당. 여러 매체를 한 번에 배치할 땐 물리적으로
  // 서로 다른 설치라 사진 한 장을 공유시킬 수 없다.
  const [installPhoto, setInstallPhoto] = useState(null);
  const [installBusy, setInstallBusy] = useState(false);
  const processInstallPhoto = async (f) => {
    setInstallBusy(true);
    const r = await convertImage(f);
    setInstallPhoto(r);
    setInstallBusy(false);
  };
  // 이미지 없이 등록된 홍보물이면 이 현장 사진이 홍보물 이미지도 겸한다 — 실제 반영은
  // 배치 저장 쪽(App.addPlacement)에서 하고, 여기서는 그렇게 된다는 안내만 미리 보여준다.
  const willFillPostingImage = !!installPhoto && !posting.thumbPath;

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

  const mediaPlacements = (id, f) => placements.filter((pl) => pl.mediaId === id && (pl.face || 1) === f).sort((a, b) => b.start.localeCompare(a.start));
  const findOverlap = (id, f = 1) => {
    const newEndEff = noEnd ? '9999-12-31' : end;
    return mediaPlacements(id, f).find((pl) => {
      const plEndEff = pl.end || '9999-12-31';
      return start <= plEndEff && pl.start <= newEndEff;
    });
  };

  // 매체를 바꾸면(단일 모드) 비어 있는 면을 자동으로 고른다 — 이미 걸려 있는 면을 실수로
  // 또 고르는 일을 줄인다.
  const presetFaceRef = useRef(preset?.face || null);
  useEffect(() => {
    if (mode !== 'single' || !mediaId) return;
    const faces = Array.from({ length: mediaFaces }, (_, i) => i + 1);
    const vacant = faces.find((f) => !mediaPlacements(mediaId, f).some((pl) => statusOf(pl, refDate) === 'live' || statusOf(pl, refDate) === 'open'));
    // "다시 걸기"로 열렸으면 첫 진입에 한해 예전에 걸었던 그 면을 그대로 고른다.
    const pf = presetFaceRef.current;
    presetFaceRef.current = null;
    setFace(pf && faces.includes(pf) ? pf : (vacant || 1));
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
  const bulkConflictCount = [...selected].filter((id) => findOverlap(id)).length;

  const submitSingle = async () => {
    const ov = findOverlap(mediaId, face);
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
      const ov = findOverlap(id);
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
          <p className="hint"><b>{posting.brand}</b>{posting.title ? ' · ' + posting.title : ''} · 보유 규격 {(posting.types || []).map((c) => T[c]?.label || c).join(' · ') || '없음'}</p>

          <div className="seg">
            <button className={mode === 'single' ? 'on' : ''} disabled={saving} onClick={() => setMode('single')}>단일 매체</button>
            <button className={mode === 'bulk' ? 'on' : ''} disabled={saving} onClick={() => setMode('bulk')}>여러 매체 한 번에</button>
          </div>

          {targets.length === 0 ? (
            <p className="sub" style={{ padding: '8px 0' }}>이 홍보물이 가진 규격에 맞는 매체가 없습니다. 홍보물 화면에서 필요한 규격을 추가하거나, 매체를 먼저 등록하세요.</p>
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
                      const occupied = mediaPlacements(mediaId, f).some((pl) => statusOf(pl, refDate) === 'live' || statusOf(pl, refDate) === 'open');
                      return <button key={f} type="button" className={face === f ? 'on' : ''} onClick={() => setFace(f)}>{f}면{occupied ? ' · 사용중' : ''}</button>;
                    })}
                  </div>
                  <label className="fld"><span>방향 (선택)</span><input value={faceLabel} onChange={(e) => { setFaceLabel(e.target.value); setLabelTouched(true); }} placeholder={`비워두면 "${face}면"으로 저장됩니다`} /></label>
                </>
              )}
            </>
          ) : (
            <p className="hint">
              기간을 한 번만 입력하고, 이 유형의 매체 중 원하는 곳을 체크하면 그 개수만큼 배치가 한 번에 등록됩니다.
              {targets.some((x) => (x.faces || 1) > 1) && ' 면이 여러 개인 매체는 항상 1면에 걸립니다 — 다른 면에 걸려면 단일 매체로 따로 배치하세요.'}
            </p>
          )}

          <div className="fld2">
            <label className="fld"><span>시작일</span><input type="date" value={start} onChange={(e) => { setStart(e.target.value); setConflict(null); }} /></label>
            <label className="fld"><span>종료일</span><input type="date" value={end} disabled={noEnd} onChange={(e) => { setEnd(e.target.value); setConflict(null); }} /></label>
          </div>
          <label className="chk"><input type="checkbox" checked={noEnd} onChange={(e) => { setNoEnd(e.target.checked); setConflict(null); }} />종료일을 아직 정하지 않음 — 철거 알람을 보내지 않습니다</label>

          {mode === 'single' && (
            <>
              <PhotoField
                label={needInstall ? '설치 확인 사진 (필수)' : '설치 확인 사진 (선택)'} capture
                hint={'현장에 실제로 부착된 모습을 한 장 남겨두면 이 배치에 "설치사진 ✓"로 표시됩니다.'}
                caption="설치 확인 사진" result={installPhoto} busy={installBusy}
                onPick={processInstallPhoto} onClear={() => setInstallPhoto(null)}
              />
              {missingInstall && <p className="warnbox">오늘부터 걸리는 배치입니다 — 실제로 부착된 모습을 한 장 남겨 주세요. (나중에 걸 예정이면 시작일을 미래로 잡으면 됩니다.)</p>}
              {willFillPostingImage && <p className="hint">이 홍보물에는 아직 이미지가 없어, 이 사진을 홍보물 이미지로도 함께 등록합니다.</p>}
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
                    {findOverlap(x.id) && <i className="conflicttag">겹침</i>}
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
