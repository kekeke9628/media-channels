import React, { useState, useMemo, useEffect } from 'react';
import { iso, DAY } from '../constants.js';
import { ZONES } from '../data/seed.js';

// 게시물 등록 — 단일 매체 등록과 여러 매체 일괄 등록을 한 화면에서 전환한다.
// 기본 시작일 자동 채움, 겹침 감지 시 확인 후 기존 게시물 종료일 자동 조정,
// 이미지 업로드 시 브라우저 canvas에서 WebP 2단(view 1600px / thumb 400px) 변환 (사양서 6장)
export default function AddModal({ T, types, media, postings, refDate, initialMediaId, onClose, onAdd, onAdjustEnd, onDone }) {
  const [mode, setMode] = useState('single'); // 'single' | 'bulk'
  // 시안(디자인)은 만들어놨지만 어느 매체·언제 걸지 아직 안 정했을 때 — 매체/일정 없이
  // 업체명·이미지만 먼저 저장해두고, 나중에 게시물 화면에서 "매체 배치"로 확정한다.
  const [draftMode, setDraftMode] = useState(false);
  const live = media.filter((m) => m.active);
  const activeTypes = useMemo(() => types.filter((t) => t.active), [types]);

  // 단일 매체 모드 — 매체 상세(MediaSheet)에서 "이 매체에 바로 등록"으로 열었으면 그 매체를
  // 미리 선택해 둔다. 없으면(사이드바 "+ 게시물 등록") 첫 번째 매체가 기본값.
  const [mediaId, setMediaId] = useState((initialMediaId && live.some((x) => x.id === initialMediaId)) ? initialMediaId : (live[0]?.id || ''));
  const m = live.find((x) => x.id === mediaId);

  // 일괄 모드 — 유형을 고르면 같은 유형의 매체 중 원하는 것을 체크한다.
  const [typeCode, setTypeCode] = useState(activeTypes[0]?.code || '');
  const bulkTargets = useMemo(() => (mode === 'bulk' ? media.filter((x) => x.active && x.type === typeCode) : []), [mode, media, typeCode]);
  const [selected, setSelected] = useState(() => new Set());
  useEffect(() => { if (mode === 'bulk') setSelected(new Set(bulkTargets.map((x) => x.id))); }, [mode, typeCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = mode === 'bulk' ? T[typeCode] : (draftMode ? null : (m ? T[m.type] : null));
  // 미배치 시안은 아직 매체(=면수)가 안 정해졌으니 일단 1면으로 취급 — 2면 매체에
  // 배치하게 되면 그때 2면째 이미지를 추가로 올리면 된다.
  const faceCount = draftMode ? 1 : (t?.faces || 1);

  const [brand, setBrand] = useState('');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(refDate);
  const [noEnd, setNoEnd] = useState(false);
  const [end, setEnd] = useState(iso(Date.parse(refDate) + 30 * DAY));
  const [drive, setDrive] = useState('');
  // 웨더워리어(2면)는 앞/뒤 이미지를 각각 올리고, 각 면이 어느 방향인지 수기로 입력한다.
  const [results, setResults] = useState([null, null]);
  const [busyFace, setBusyFace] = useState([false, false]);
  const [directions, setDirections] = useState(['', '']);
  const [conflict, setConflict] = useState(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total } — 일괄 등록 진행 상황
  // 설치 확인 사진(선택) — 홍보물 이미지와 별개로, 실제 현장에 부착됐다는 증빙용 한 장.
  const [installPhoto, setInstallPhoto] = useState(null);
  const [installBusy, setInstallBusy] = useState(false);
  const result = results[0];
  const busy = busyFace.some(Boolean);

  const mediaPostings = (id) => postings.filter((p) => p.mediaId === id).sort((a, b) => b.start.localeCompare(a.start));

  useEffect(() => {
    if (mode !== 'single' || !t) return;
    setNoEnd(!!t.openEnded);
    setConflict(null);
    setResults([null, null]);
    setDirections(['', '']);
    setInstallPhoto(null);
    const last = mediaPostings(mediaId)[0];
    if (last) setStart(last.end ? iso(Date.parse(last.end) + DAY) : refDate);
    else setStart(refDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId, mode]);

  const process = (f, faceIdx = 0) => {
    setBusyFace((prev) => prev.map((v, i) => (i === faceIdx ? true : v)));
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const make = (max, q) => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        return { url: cv.toDataURL('image/webp', q), w: cv.width, h: cv.height };
      };
      const view = make(1600, 0.75), thumb = make(400, 0.7);
      const b = (d) => Math.round((d.length - d.indexOf(',') - 1) * 0.75);
      const r = { w: img.width, h: img.height, ratio: (img.width / img.height).toFixed(2), orig: f.size, view: { ...view, bytes: b(view.url) }, thumb: { ...thumb, bytes: b(thumb.url) } };
      setResults((prev) => prev.map((v, i) => (i === faceIdx ? r : v)));
      setBusyFace((prev) => prev.map((v, i) => (i === faceIdx ? false : v)));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { setBusyFace((prev) => prev.map((v, i) => (i === faceIdx ? false : v))); setResults((prev) => prev.map((v, i) => (i === faceIdx ? null : v))); };
    img.src = url;
  };

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

  const specRatio = useMemo(() => { const spec = m?.spec || t?.spec || ''; const n = spec.match(/(\d+)\D+(\d+)/); return n ? +n[1] / +n[2] : null; }, [m, t]);
  const mismatch = result && specRatio && Math.abs(+result.ratio - specRatio) / specRatio > 0.08;

  const findOverlap = (id) => {
    const newEndEff = noEnd ? '9999-12-31' : end;
    return mediaPostings(id).find((p) => {
      const pEndEff = p.end || '9999-12-31';
      return start <= pEndEff && p.start <= newEndEff;
    });
  };

  const buildPayload = (targetMediaId) => {
    if (draftMode) {
      return { mediaId: null, brand, title, start: null, end: null, driveUrl: drive || '#', singleResult: result, faceResults: null, installPhoto };
    }
    const faceResults = faceCount === 2 ? [0, 1].map((i) => ({ direction: directions[i], result: results[i] })) : null;
    return {
      mediaId: targetMediaId, brand, title, start, end: noEnd ? null : end,
      driveUrl: drive || '#', singleResult: faceCount === 1 ? result : null, faceResults,
      installPhoto,
    };
  };

  const toggleOne = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((prev) => (prev.size === bulkTargets.length ? new Set() : new Set(bulkTargets.map((x) => x.id))));
  const bulkConflictCount = [...selected].filter((id) => findOverlap(id)).length;

  const submitSingle = async () => {
    if (draftMode) {
      setSaving(true);
      const added = await onAdd(buildPayload(null));
      setSaving(false);
      if (added) onClose();
      return;
    }
    const ov = findOverlap(mediaId);
    if (ov && !conflict) { setConflict(ov); return; }
    setSaving(true);
    if (ov && conflict) {
      const adjusted = await onAdjustEnd(ov.id, iso(Date.parse(start) - DAY));
      if (!adjusted) { setSaving(false); return; }
    }
    const added = await onAdd(buildPayload(mediaId));
    setSaving(false);
    if (added) onClose();
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
      const added = await onAdd(buildPayload(id), { silent: true });
      added ? ok++ : failed++;
      setProgress((pr) => ({ ...pr, done: pr.done + 1 }));
    }
    setSaving(false);
    onDone?.(ok, failed);
    if (ok > 0) onClose();
  };

  const submit = () => {
    if (!brand || saving) return;
    if (mode === 'single') { if (draftMode || mediaId) submitSingle(); }
    else if (selected.size > 0) submitBulk();
  };

  const canSubmit = mode === 'single' ? (draftMode ? !!brand : (!!mediaId && !!brand && !conflict)) : (!!brand && selected.size > 0);

  return (
    <div className="modal" onClick={onClose}>
      <div className="mbox" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><b>{mode === 'single' && draftMode ? '시안 등록 (미배치)' : '게시물 등록'}</b><button onClick={onClose}>✕</button></div>
        <div className="mbody">
          <div className="seg">
            <button className={mode === 'single' ? 'on' : ''} disabled={saving} onClick={() => setMode('single')}>단일 매체</button>
            <button className={mode === 'bulk' ? 'on' : ''} disabled={saving} onClick={() => setMode('bulk')}>여러 매체 한 번에</button>
          </div>

          {mode === 'single' ? (
            <>
              <label className="chk"><input type="checkbox" checked={draftMode} onChange={(e) => setDraftMode(e.target.checked)} />매체·일정 나중에 정하기 (시안만 먼저 등록)</label>
              {!draftMode && (
                <>
                  <label className="fld"><span>매체</span><select value={mediaId} onChange={(e) => setMediaId(e.target.value)}>{live.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                  {t && <p className="hint">{t.label} · 규격 <b>{m.spec || t.spec}</b> · {m.faces}면{t.movable ? ' · 이동형' : ''}</p>}
                </>
              )}
            </>
          ) : (
            <>
              <p className="hint">업체명·기간·이미지를 한 번만 입력하고, 같은 유형의 매체 중 원하는 곳을 체크하면 그 개수만큼 게시물이 한 번에 등록됩니다.</p>
              <label className="fld"><span>매체 유형</span>
                <select value={typeCode} onChange={(e) => setTypeCode(e.target.value)}>
                  {activeTypes.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
                </select>
              </label>
              {t && <p className="hint">{t.label} · 규격 <b>{t.spec}</b> · {t.faces}면 · 대상 {bulkTargets.length}개</p>}
            </>
          )}

          <label className="fld"><span>업체명</span><input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="예: 나이키" /></label>
          <label className="fld"><span>내용 (선택)</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="비워두면 업체명이 그대로 들어갑니다" /></label>
          {!(mode === 'single' && draftMode) && (
            <>
              <div className="fld2">
                <label className="fld"><span>시작일</span><input type="date" value={start} onChange={(e) => { setStart(e.target.value); setConflict(null); }} /></label>
                <label className="fld"><span>종료일</span><input type="date" value={end} disabled={noEnd} onChange={(e) => { setEnd(e.target.value); setConflict(null); }} /></label>
              </div>
              <label className="chk"><input type="checkbox" checked={noEnd} onChange={(e) => { setNoEnd(e.target.checked); setConflict(null); }} />종료일 미정 (미정 상태) — 철거 알람 대상에서 제외됩니다</label>
            </>
          )}
          <label className="fld"><span>원본 위치</span><input value={drive} onChange={(e) => setDrive(e.target.value)} placeholder="구글드라이브 링크" /></label>

          <label className="fld"><span>설치 확인 사진 (선택)</span></label>
          <div className="drop">
            <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files[0] && processInstallPhoto(e.target.files[0])} />
            <p>현장에 실제로 부착된 모습을 한 장 남겨두면 게시물 목록에 "설치사진 ✓"로 표시됩니다.</p>
          </div>
          {installBusy && <p className="hint">변환 중…</p>}
          {installPhoto && <div className="rprev"><img src={installPhoto.url} alt="" /><i className="sub">설치 확인 사진</i></div>}

          {mode === 'single' && conflict && (
            <div className="conflictbox">
              겹치는 게시물이 있습니다 — <b>{conflict.brand}</b> ({conflict.start} ~ {conflict.end || '미정'}).<br />
              그대로 진행하면 이 게시물의 종료일이 <b>{iso(Date.parse(start) - DAY)}</b>로 조정됩니다.
              <div className="conflictbtns"><button className="mini" disabled={saving} onClick={() => setConflict(null)}>취소</button><button className="mini ok" disabled={saving} onClick={submitSingle}>{saving ? '저장 중…' : '그대로 진행'}</button></div>
            </div>
          )}
          {mode === 'bulk' && bulkConflictCount > 0 && (
            <p className="warnbox">⚠ 선택된 매체 중 {bulkConflictCount}곳은 이미 겹치는 게시물이 있습니다 — 그대로 진행하면 기존 게시물의 종료일이 자동으로 단축됩니다.</p>
          )}

          <label className="fld"><span>게시물 이미지 (선택)</span></label>
          {faceCount === 2 ? (
            <>
              <p className="hint">이 매체는 2면이라 앞/뒤 이미지를 각각 올리고, 면마다 방향을 적어 두면 설치 때 헷갈리지 않습니다.</p>
              {[0, 1].map((i) => (
                <div key={i} className="faceblock">
                  <b className="facelabel">{i === 0 ? '1면 (앞)' : '2면 (뒤)'}</b>
                  <label className="fld"><span>방향</span><input value={directions[i]} onChange={(e) => setDirections((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))} placeholder="예: 정문 방향 / 주차장 방향" /></label>
                  <div className="drop">
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files[0] && process(e.target.files[0], i)} />
                    <p>이미지를 올리면 브라우저에서 <b>WebP 2단</b>(1600px / 400px)으로 변환합니다. 원본은 업로드되지 않습니다.</p>
                  </div>
                  {busyFace[i] && <p className="hint">변환 중…</p>}
                  {results[i] && (
                    <div className="rbox">
                      <div className="rline"><span>원본</span><b className="mono">{results[i].w}×{results[i].h} · {(results[i].orig / 1048576).toFixed(2)}MB</b></div>
                      <div className="rline"><span>view (1600px)</span><b className="mono">{results[i].view.w}×{results[i].view.h} · {(results[i].view.bytes / 1024).toFixed(0)}KB</b></div>
                      <div className="rline"><span>thumb (400px)</span><b className="mono">{results[i].thumb.w}×{results[i].thumb.h} · {(results[i].thumb.bytes / 1024).toFixed(0)}KB</b></div>
                      <div className="rline total"><span>절감</span><b className="mono">{Math.round((1 - results[i].view.bytes / results[i].orig) * 100)}%</b></div>
                      <div className="rprev"><img src={results[i].thumb.url} alt="" /><i className="sub">썸네일 미리보기</i></div>
                    </div>
                  )}
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="drop">
                <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files[0] && process(e.target.files[0])} />
                <p>이미지를 올리면 브라우저에서 <b>WebP 2단</b>(1600px / 400px)으로 변환합니다. 원본은 업로드되지 않습니다.{mode === 'bulk' ? ' (선택 사항, 모든 대상에 동일 적용)' : ''}</p>
              </div>
              {busy && <p className="hint">변환 중…</p>}
              {result && (
                <div className="rbox">
                  <div className="rline"><span>원본</span><b className="mono">{result.w}×{result.h} · {(result.orig / 1048576).toFixed(2)}MB</b></div>
                  <div className="rline"><span>view (1600px)</span><b className="mono">{result.view.w}×{result.view.h} · {(result.view.bytes / 1024).toFixed(0)}KB</b></div>
                  <div className="rline"><span>thumb (400px)</span><b className="mono">{result.thumb.w}×{result.thumb.h} · {(result.thumb.bytes / 1024).toFixed(0)}KB</b></div>
                  <div className="rline total"><span>절감</span><b className="mono">{Math.round((1 - result.view.bytes / result.orig) * 100)}%</b></div>
                  {mismatch && <p className="warnbox">⚠ 매체 규격 비율({specRatio.toFixed(2)})과 이미지 비율({result.ratio})이 다릅니다.</p>}
                  <div className="rprev"><img src={result.thumb.url} alt="" /><i className="sub">썸네일 미리보기</i></div>
                </div>
              )}
            </>
          )}

          {mode === 'bulk' && (
            <div className="fld" style={{ marginTop: 8 }}>
              <span>대상 매체 ({selected.size}/{bulkTargets.length} 선택)</span>
              <div className="medialist">
                <label className="medialist-item medialist-all">
                  <input type="checkbox" checked={bulkTargets.length > 0 && selected.size === bulkTargets.length} onChange={toggleAll} />
                  <b>전체 선택/해제</b>
                </label>
                {bulkTargets.map((x) => (
                  <label key={x.id} className="medialist-item">
                    <input type="checkbox" checked={selected.has(x.id)} onChange={() => toggleOne(x.id)} />
                    <span>{x.name}</span>
                    <i className="sub">{ZONES[x.zone]?.label || x.zone}</i>
                    {findOverlap(x.id) && <i className="conflicttag">겹침</i>}
                  </label>
                ))}
                {bulkTargets.length === 0 && <p className="sub" style={{ padding: '8px 0' }}>이 유형의 매체가 없습니다.</p>}
              </div>
            </div>
          )}
        </div>
        <div className="mfoot">
          {mode === 'bulk' && <span className="sub" style={{ marginRight: 'auto' }}>{saving && progress ? `등록 중… ${progress.done}/${progress.total}` : ''}</span>}
          <button className="btn" disabled={saving} onClick={onClose}>취소</button>
          <button className="btn primary" onClick={submit} disabled={!canSubmit || saving}>
            {saving ? '저장 중…' : mode === 'bulk' ? `${selected.size}건 등록` : draftMode ? '시안 등록' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}
