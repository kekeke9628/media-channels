import React, { useState, useMemo, useEffect } from 'react';
import { iso, DAY } from '../constants.js';
import { ZONES } from '../data/seed.js';
import { convertImage } from '../lib/convertImage.js';

// 4.2MB처럼 큰 사진이 보통이지만 작은 파일은 "0.0MB"로 표시돼 어색했다.
const fileSize = (bytes) => (bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(bytes / 1024)) + 'KB');

// 홍보물 등록 — 매체·일정과 무관하게 브랜드·내용·이미지만 먼저 등록한다. 어느 매체에
// 언제 걸지는 별도(매체 배치)로 정한다. 다만 흔한 경우인 "등록하면서 바로 한 매체에
// 걸기"는 "지금 매체에 배치하기"를 켜면 한 화면에서 같이 처리할 수 있다.
// 이미지는 브라우저 canvas에서 WebP 2단(view 1600px / thumb 400px)으로 변환한다 (사양서 6장).
export default function AddModal({ T, types, media, placements, refDate, isEditor, initialMediaId, onClose, onAdd, onAssign, onAdjustEnd, onDone }) {
  const activeTypes = useMemo(() => types.filter((t) => t.active), [types]);
  const initialMedia = initialMediaId ? media.find((x) => x.id === initialMediaId && x.active) : null;

  const [typeCode, setTypeCode] = useState(initialMedia?.type || activeTypes[0]?.code || '');
  const t = T[typeCode];
  const faceCount = t?.faces || 1;

  // "이 매체에 바로 등록"(MediaSheet 빠른 등록)으로 열었으면 배치까지 기본으로 켜 둔다.
  const [placeNow, setPlaceNow] = useState(!!initialMedia);
  const targets = useMemo(() => media.filter((m) => m.active && m.type === typeCode), [media, typeCode]);
  const [mediaId, setMediaId] = useState(initialMedia?.id || targets[0]?.id || '');
  const [start, setStart] = useState(refDate);
  const [noEnd, setNoEnd] = useState(!!t?.openEnded);
  const [end, setEnd] = useState(iso(Date.parse(refDate) + 30 * DAY));
  const [conflict, setConflict] = useState(null);

  const [brand, setBrand] = useState('');
  const [title, setTitle] = useState('');
  // 웨더워리어(2면)는 앞/뒤 이미지를 각각 올리고, 각 면이 어느 방향인지 수기로 입력한다.
  const [results, setResults] = useState([null, null]);
  const [busyFace, setBusyFace] = useState([false, false]);
  const [directions, setDirections] = useState(['', '']);
  const [saving, setSaving] = useState(false);
  // 설치 확인 사진(선택) — 실제 현장에 부착됐다는 증빙용 한 장. 홍보물 이미지가 없으면
  // 이 사진이 홍보물 이미지도 겸한다(아래 processInstallPhoto).
  const [installPhoto, setInstallPhoto] = useState(null);
  const [installBusy, setInstallBusy] = useState(false);
  const result = results[0];
  const busy = busyFace.some(Boolean);

  // 유형이 바뀌면 배치 대상 매체 목록도 바뀌므로 초기화한다.
  useEffect(() => {
    setNoEnd(!!t?.openEnded);
    setMediaId(targets[0]?.id || '');
    setConflict(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeCode]);

  const mediaPlacements = (id) => placements.filter((pl) => pl.mediaId === id).sort((a, b) => b.start.localeCompare(a.start));
  useEffect(() => {
    if (!placeNow || !mediaId) return;
    const last = mediaPlacements(mediaId)[0];
    setStart(last ? (last.end ? iso(Date.parse(last.end) + DAY) : refDate) : refDate);
    setConflict(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId, placeNow]);

  const process = async (f, faceIdx = 0) => {
    setBusyFace((prev) => prev.map((v, i) => (i === faceIdx ? true : v)));
    const r = await convertImage(f);
    setResults((prev) => prev.map((v, i) => (i === faceIdx ? r : v)));
    setBusyFace((prev) => prev.map((v, i) => (i === faceIdx ? false : v)));
  };

  // 설치 확인 사진 — 홍보물 이미지가 아직 비어 있으면 이 사진을 홍보물 이미지로도 채운다.
  // 인쇄 시안 파일이 없어 이미지 없이 등록되는 홍보물이 흔했고, 그러면 목록이 계속 빈
  // 칸으로 남아 무엇이 걸려 있는지 알 수 없었다. 같은 객체를 넣어 두므로, 나중에 시안을
  // 직접 올리면 그걸로 덮이고 아래 안내도 저절로 사라진다.
  const processInstallPhoto = async (f) => {
    setInstallBusy(true);
    const r = await convertImage(f);
    setInstallPhoto(r);
    setInstallBusy(false);
    if (r) setResults((prev) => (prev[0] ? prev : prev.map((v, i) => (i === 0 ? r : v))));
  };
  const syncedFromInstall = !!installPhoto && results[0] === installPhoto;

  const specRatio = useMemo(() => { const spec = t?.spec || ''; const n = spec.match(/(\d+)\D+(\d+)/); return n ? +n[1] / +n[2] : null; }, [t]);
  // 규격 비율 경고는 인쇄 시안에 대한 것이라, 현장 사진을 끌어다 채운 경우엔 띄우지 않는다.
  const mismatch = result && !syncedFromInstall && specRatio && Math.abs(+result.ratio - specRatio) / specRatio > 0.08;

  const findOverlap = (id) => {
    const newEndEff = noEnd ? '9999-12-31' : end;
    return mediaPlacements(id).find((pl) => {
      const plEndEff = pl.end || '9999-12-31';
      return start <= plEndEff && pl.start <= newEndEff;
    });
  };

  const buildPayload = () => {
    const faceResults = faceCount === 2 ? [0, 1].map((i) => ({ direction: directions[i], result: results[i] })) : null;
    return {
      type: typeCode, brand, title,
      singleResult: faceCount === 1 ? result : null, faceResults,
    };
  };

  const submitSingle = async () => {
    const ov = placeNow ? findOverlap(mediaId) : null;
    if (ov && !conflict) { setConflict(ov); return; }
    setSaving(true);
    if (ov && conflict) {
      const adjusted = await onAdjustEnd(ov.id, iso(Date.parse(start) - DAY));
      if (!adjusted) { setSaving(false); return; }
    }
    // 등록·배치 각각의 토스트 대신 결과를 합쳐 호출 쪽(App)에서 한 번만 알린다.
    const created = await onAdd(buildPayload(), { silent: true });
    if (!created) { setSaving(false); return; }
    if (placeNow) {
      const placed = await onAssign(created, { mediaId, start, end: noEnd ? null : end, installPhoto }, { silent: true });
      setSaving(false);
      onDone?.({ placed });
      if (placed) onClose();
      return;
    }
    setSaving(false);
    onDone?.({ registeredOnly: true });
    onClose();
  };

  const submit = () => {
    if (!brand || saving || (placeNow && !mediaId)) return;
    submitSingle();
  };

  const canSubmit = !!brand && (!placeNow || !!mediaId);

  return (
    <div className="modal" onClick={onClose}>
      <div className="mbox" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><b>홍보물 등록</b><button onClick={onClose}>✕</button></div>
        <div className="mbody">
          <label className="fld"><span>매체 유형</span>
            <select value={typeCode} onChange={(e) => setTypeCode(e.target.value)}>
              {activeTypes.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
            </select>
          </label>
          {t && <p className="hint">규격 <b>{t.spec}</b> · {t.faces}면{t.movable ? ' · 이동형' : ''}</p>}

          <label className="fld"><span>업체명</span><input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="예: 나이키" /></label>
          <label className="fld"><span>내용 (선택)</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="비워두면 업체명이 그대로 들어갑니다" /></label>
          <label className="fld"><span>홍보물 이미지 (선택)</span></label>
          {faceCount === 2 ? (
            <>
              <p className="hint">이 유형은 2면이라 앞/뒤 이미지를 각각 올리고, 면마다 방향을 적어 두면 설치 때 헷갈리지 않습니다.</p>
              {[0, 1].map((i) => (
                <div key={i} className="faceblock">
                  <b className="facelabel">{i === 0 ? '1면 (앞)' : '2면 (뒤)'}</b>
                  <label className="fld"><span>방향</span><input value={directions[i]} onChange={(e) => setDirections((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))} placeholder="예: 정문 방향 / 주차장 방향" /></label>
                  <label className="drop">
                    <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && process(e.target.files[0], i)} />
                    <span className="dropbtn">사진 선택</span>
                    <p>사진은 올릴 때 자동으로 용량을 줄여 저장합니다.</p>
                  </label>
                  {busyFace[i] && <p className="hint">변환 중…</p>}
                  {results[i] && (
                    <div className="rbox">
                      <div className="rline total"><span>용량</span><b className="mono">{fileSize(results[i].orig)} → {fileSize(results[i].view.bytes)}</b></div>
                      <div className="rprev"><img src={results[i].thumb.url} alt="" /><i className="sub">등록될 이미지</i></div>
                    </div>
                  )}
                </div>
              ))}
            </>
          ) : (
            <>
              <label className="drop">
                <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && process(e.target.files[0])} />
                <span className="dropbtn">사진 선택</span>
                <p>사진은 올릴 때 자동으로 용량을 줄여 저장합니다.</p>
              </label>
              {busy && <p className="hint">변환 중…</p>}
              {result && (
                <div className="rbox">
                  <div className="rline total"><span>용량</span><b className="mono">{fileSize(result.orig)} → {fileSize(result.view.bytes)}</b></div>
                  {mismatch && <p className="warnbox">⚠ 사진 가로세로 비율이 이 매체 규격({t.spec})과 달라, 실제 인쇄물에서는 잘려 보일 수 있습니다.</p>}
                  <div className="rprev"><img src={result.thumb.url} alt="" /><i className="sub">등록될 이미지</i></div>
                </div>
              )}
            </>
          )}

          <label className="chk"><input type="checkbox" checked={placeNow} onChange={(e) => { setPlaceNow(e.target.checked); setConflict(null); }} />지금 매체에 배치하기 (한 곳)</label>
          {/* 여기서는 매체를 하나만 고를 수 있는데, 처음 쓰는 사람은 "여러 곳에 거는 법"을
              못 찾고 이 화면에서 막힌다 — 경로를 미리 알려 준다. */}
          <p className="hint">여러 매체에 한 번에 걸려면 그냥 등록만 하세요. 등록 후 홍보물 화면의 <b>+ 배치 추가</b>에서 여러 곳을 한꺼번에 고를 수 있습니다.</p>
          {placeNow && (
            <>
              {targets.length === 0 ? (
                <p className="sub" style={{ padding: '8px 0' }}>이 유형의 매체가 없습니다. 등록만 먼저 하고, 나중에 홍보물 화면에서 배치할 수 있습니다.</p>
              ) : (
                <label className="fld"><span>매체</span><select value={mediaId} onChange={(e) => { setMediaId(e.target.value); setConflict(null); }}>{targets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
              )}
              <div className="fld2">
                <label className="fld"><span>시작일</span><input type="date" value={start} onChange={(e) => { setStart(e.target.value); setConflict(null); }} /></label>
                <label className="fld"><span>종료일</span><input type="date" value={end} disabled={noEnd} onChange={(e) => { setEnd(e.target.value); setConflict(null); }} /></label>
              </div>
              <label className="chk"><input type="checkbox" checked={noEnd} onChange={(e) => { setNoEnd(e.target.checked); setConflict(null); }} />종료일을 아직 정하지 않음 — 철거 알람을 보내지 않습니다</label>

              <label className="fld"><span>설치 확인 사진 (선택)</span></label>
              <label className="drop">
                <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && processInstallPhoto(e.target.files[0])} />
                <span className="dropbtn">사진 선택</span>
                <p>현장에 실제로 부착된 모습을 한 장 남겨두면 이 배치에 "설치사진 ✓"로 표시됩니다.</p>
              </label>
              {installBusy && <p className="hint">변환 중…</p>}
              {installPhoto && <div className="rprev"><img src={installPhoto.thumb.url} alt="" /><i className="sub">설치 확인 사진</i></div>}
              {syncedFromInstall && <p className="hint">홍보물 이미지가 비어 있어, 이 사진을 홍보물 이미지{faceCount === 2 ? '(1면)' : ''}로도 함께 등록합니다. 인쇄 시안이 따로 있으면 위에서 올려 주세요.</p>}

              {conflict && (
                <div className="conflictbox">
                  겹치는 배치가 있습니다 — <b>{conflict.brand}</b> ({conflict.start} ~ {conflict.end || '미정'}).<br />
                  그대로 진행하면 이 배치의 종료일이 <b>{iso(Date.parse(start) - DAY)}</b>로 조정됩니다.
                  <div className="conflictbtns"><button className="mini" disabled={saving} onClick={() => setConflict(null)}>취소</button><button className="mini ok" disabled={saving} onClick={submitSingle}>{saving ? '저장 중…' : '그대로 진행'}</button></div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="mfoot">
          <button className="btn" disabled={saving} onClick={onClose}>취소</button>
          <button className="btn primary" onClick={submit} disabled={!canSubmit || saving}>{saving ? '저장 중…' : '등록'}</button>
        </div>
      </div>
    </div>
  );
}
