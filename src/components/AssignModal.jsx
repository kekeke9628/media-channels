import React, { useState, useMemo, useEffect } from 'react';
import { iso, DAY } from '../constants.js';
import { ZONES } from '../data/seed.js';

// 매체 배치 — 이미 등록된 홍보물(posting)을 매체에 건다. 처음 배치든, 이미 다른 매체(들)에
// 걸려 있는 홍보물에 추가로 배치하는 것이든 동일하게 다룬다. 홍보물의 이미지가 이미
// 유형(면수)에 맞춰 등록돼 있으므로, 대상 매체는 그 유형의 매체로만 한정한다.
export default function AssignModal({ posting, T, media, placements, refDate, onClose, onAssign, onAdjustEnd, onDone }) {
  const t = T[posting.type];
  const [mode, setMode] = useState('single'); // 'single' | 'bulk'
  const targets = useMemo(() => media.filter((m) => m.active && m.type === posting.type), [media, posting.type]);

  const [mediaId, setMediaId] = useState(targets[0]?.id || '');
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
  const processInstallPhoto = (f) => {
    setInstallBusy(true);
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const s = Math.min(1, 1200 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      setInstallPhoto({ url: cv.toDataURL('image/webp', 0.75), w: cv.width, h: cv.height });
      setInstallBusy(false);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { setInstallBusy(false); setInstallPhoto(null); };
    img.src = url;
  };

  const [selected, setSelected] = useState(() => new Set(targets.map((x) => x.id)));
  useEffect(() => { if (mode === 'bulk') setSelected(new Set(targets.map((x) => x.id))); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const mediaPlacements = (id) => placements.filter((pl) => pl.mediaId === id).sort((a, b) => b.start.localeCompare(a.start));
  const findOverlap = (id) => {
    const newEndEff = noEnd ? '9999-12-31' : end;
    return mediaPlacements(id).find((pl) => {
      const plEndEff = pl.end || '9999-12-31';
      return start <= plEndEff && pl.start <= newEndEff;
    });
  };

  const toggleOne = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((prev) => (prev.size === targets.length ? new Set() : new Set(targets.map((x) => x.id))));
  const bulkConflictCount = [...selected].filter((id) => findOverlap(id)).length;

  const submitSingle = async () => {
    const ov = findOverlap(mediaId);
    if (ov && !conflict) { setConflict(ov); return; }
    setSaving(true);
    if (ov && conflict) {
      const adjusted = await onAdjustEnd(ov.id, iso(Date.parse(start) - DAY));
      if (!adjusted) { setSaving(false); return; }
    }
    const ok = await onAssign(posting, { mediaId, start, end: noEnd ? null : end, installPhoto });
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

  const submit = () => {
    if (saving) return;
    if (mode === 'single') { if (mediaId) submitSingle(); }
    else if (selected.size > 0) submitBulk();
  };

  const canSubmit = mode === 'single' ? !!mediaId : selected.size > 0;

  return (
    <div className="modal" onClick={onClose}>
      <div className="mbox" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><b>매체 배치</b><button onClick={onClose}>✕</button></div>
        <div className="mbody">
          <p className="hint"><b>{posting.brand}</b>{posting.title ? ' · ' + posting.title : ''} · {t?.label}{t?.spec ? ' · 규격 ' + t.spec : ''}</p>

          <div className="seg">
            <button className={mode === 'single' ? 'on' : ''} disabled={saving} onClick={() => setMode('single')}>단일 매체</button>
            <button className={mode === 'bulk' ? 'on' : ''} disabled={saving} onClick={() => setMode('bulk')}>여러 매체 한 번에</button>
          </div>

          {targets.length === 0 ? (
            <p className="sub" style={{ padding: '8px 0' }}>이 유형({t?.label})의 매체가 없습니다. 먼저 매체 관리에서 매체를 추가하세요.</p>
          ) : mode === 'single' ? (
            <label className="fld"><span>매체</span><select value={mediaId} onChange={(e) => { setMediaId(e.target.value); setConflict(null); }}>{targets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          ) : (
            <p className="hint">기간을 한 번만 입력하고, 이 유형의 매체 중 원하는 곳을 체크하면 그 개수만큼 배치가 한 번에 등록됩니다.</p>
          )}

          <div className="fld2">
            <label className="fld"><span>시작일</span><input type="date" value={start} onChange={(e) => { setStart(e.target.value); setConflict(null); }} /></label>
            <label className="fld"><span>종료일</span><input type="date" value={end} disabled={noEnd} onChange={(e) => { setEnd(e.target.value); setConflict(null); }} /></label>
          </div>
          <label className="chk"><input type="checkbox" checked={noEnd} onChange={(e) => { setNoEnd(e.target.checked); setConflict(null); }} />종료일 미정 (미정 상태) — 철거 알람 대상에서 제외됩니다</label>

          {mode === 'single' && (
            <>
              <label className="fld"><span>설치 확인 사진 (선택)</span></label>
              <div className="drop">
                <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files[0] && processInstallPhoto(e.target.files[0])} />
                <p>현장에 실제로 부착된 모습을 한 장 남겨두면 이 배치에 "설치사진 ✓"로 표시됩니다.</p>
              </div>
              {installBusy && <p className="hint">변환 중…</p>}
              {installPhoto && <div className="rprev"><img src={installPhoto.url} alt="" /><i className="sub">설치 확인 사진</i></div>}
            </>
          )}

          {mode === 'single' && conflict && (
            <div className="conflictbox">
              겹치는 배치가 있습니다 — <b>{conflict.brand}</b> ({conflict.start} ~ {conflict.end || '미정'}).<br />
              그대로 진행하면 이 배치의 종료일이 <b>{iso(Date.parse(start) - DAY)}</b>로 조정됩니다.
              <div className="conflictbtns"><button className="mini" disabled={saving} onClick={() => setConflict(null)}>취소</button><button className="mini ok" disabled={saving} onClick={submitSingle}>{saving ? '저장 중…' : '그대로 진행'}</button></div>
            </div>
          )}
          {mode === 'bulk' && bulkConflictCount > 0 && (
            <p className="warnbox">⚠ 선택된 매체 중 {bulkConflictCount}곳은 이미 겹치는 배치가 있습니다 — 그대로 진행하면 기존 배치의 종료일이 자동으로 단축됩니다.</p>
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
