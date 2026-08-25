import React, { useState, useMemo, useEffect } from 'react';
import { iso, DAY, contentOf, subOf, matches } from '../constants.js';
import { convertImage } from '../lib/convertImage.js';
import PhotoField from './PhotoField.jsx';
import { installPhotoRequired } from '../constants.js';
import { getPostingImageUrls, canPlaceOn, variantFor } from '../lib/queries.js';
import { statusOf } from '../lib/status.js';
import { useModalKeys } from '../lib/useModalKeys.js';

// 매체 상세에서 "이 매체에 홍보물 배치"로 연다 — 매체는 이미 정해져 있으니(여기),
// 이미 등록해 둔 홍보물 중에서 골라 거는 게 자연스럽다. 새로 만드는 건 AssignModal이
// 하는 일(홍보물이 정해진 채 매체를 고름)의 반대 방향이라 별도 화면으로 뒀다 — 매체를
// 하나로 고정하고 면·기간·설치사진만 다루면 되므로 그쪽의 "단일 매체" 모드와 몸통은
// 같지만, 첫 단계로 "어느 홍보물을 걸지" 고르는 목록이 붙는다. 목록에 원하는 게 없으면
// onCreateNew로 등록 화면(AddModal)에 이 매체를 넘겨 새로 만들면서 바로 걸 수 있다.
export default function PlaceOnMediaModal({ media, T, postings, placements, refDate, initialFace, onClose, onAssign, onAdjustEnd, onDone, onCreateNew }) {
  const t = T[media.type];
  // 이 매체 규격의 인쇄 파일을 가진 캠페인만 고를 수 있다.
  const options = useMemo(() => postings.filter((p) => canPlaceOn(p, media.type)), [postings, media.type]);

  const placementsOf = useMemo(() => {
    const by = {};
    placements.forEach((pl) => { (by[pl.postingId] = by[pl.postingId] || []).push(pl); });
    return by;
  }, [placements]);

  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    return options
      .filter((p) => !q || matches(p.brand + contentOf(p), q))
      .sort((a, b) => {
        const da = placementsOf[a.id]?.length ? 1 : 0, db = placementsOf[b.id]?.length ? 1 : 0;
        if (da !== db) return da - db;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
  }, [options, q, placementsOf]);

  const [thumbUrls, setThumbUrls] = useState(new Map());
  useEffect(() => {
    let cancelled = false;
    getPostingImageUrls(options.map((p) => variantFor(p, media.type)?.thumbPath)).then((m) => { if (!cancelled) setThumbUrls(m); });
    return () => { cancelled = true; };
  }, [options]);

  const [posting, setPosting] = useState(null);

  const mediaFaces = media.faces || 1;
  const [face, setFace] = useState(1);
  const [faceLabel, setFaceLabel] = useState('');
  const [labelTouched, setLabelTouched] = useState(false);
  const [start, setStart] = useState(refDate);
  const [noEnd, setNoEnd] = useState(false);
  const [end, setEnd] = useState(iso(Date.parse(refDate) + 30 * DAY));
  const [conflict, setConflict] = useState(null);
  const [saving, setSaving] = useState(false);
  const [installPhoto, setInstallPhoto] = useState(null);
  const [installBusy, setInstallBusy] = useState(false);
  const processInstallPhoto = async (f) => {
    setInstallBusy(true);
    const r = await convertImage(f);
    setInstallPhoto(r);
    setInstallBusy(false);
  };
  const willFillPostingImage = !!installPhoto && posting && !variantFor(posting, media.type)?.thumbPath;

  const mediaPlacements = (f) => placements.filter((pl) => pl.mediaId === media.id && (pl.face || 1) === f).sort((a, b) => b.start.localeCompare(a.start));
  const findOverlap = (f) => {
    const newEndEff = noEnd ? '9999-12-31' : end;
    return mediaPlacements(f).find((pl) => {
      const plEndEff = pl.end || '9999-12-31';
      return start <= plEndEff && pl.start <= newEndEff;
    });
  };

  // 홍보물을 고르는 순간(또는 처음 진입 시) 비어 있는 면을 자동으로 고르고, 그 면의
  // 마지막 배치 다음 날로 시작일을 맞춘다.
  const pick = (p) => {
    setPosting(p);
    setNoEnd(!!t?.openEnded);
    // 매체 상세의 "N면에 홍보물 배치" 버튼으로 들어왔으면 그 면을 그대로 쓰고, 아니면
    // 비어 있는 면을 자동으로 고른다.
    const faces = Array.from({ length: mediaFaces }, (_, i) => i + 1);
    const vacant = faces.find((f) => !mediaPlacements(f).some((pl) => statusOf(pl, refDate) === 'live' || statusOf(pl, refDate) === 'open'));
    const nextFace = (initialFace && initialFace <= mediaFaces) ? initialFace : (vacant || 1);
    setFace(nextFace);
    setLabelTouched(false);
    setFaceLabel(nextFace + '면');
    const last = mediaPlacements(nextFace)[0];
    setStart(last ? (last.end ? iso(Date.parse(last.end) + DAY) : refDate) : refDate);
    setConflict(null);
  };
  useEffect(() => {
    if (!labelTouched) setFaceLabel(face + '면');
    setConflict(null);
    const last = mediaPlacements(face)[0];
    setStart(last ? (last.end ? iso(Date.parse(last.end) + DAY) : refDate) : refDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face]);

  const submit = async () => {
    const ov = findOverlap(face);
    if (ov && !conflict) { setConflict(ov); return; }
    setSaving(true);
    if (ov && conflict) {
      const adjusted = await onAdjustEnd(ov.id, iso(Date.parse(start) - DAY));
      if (!adjusted) { setSaving(false); return; }
    }
    const ok = await onAssign(posting, { mediaId: media.id, start, end: noEnd ? null : end, installPhoto, face, faceLabel: faceLabel || face + '면' });
    setSaving(false);
    onDone?.(ok);
    if (ok) onClose();
  };

  // 오늘부터 걸리는 배치는 설치 확인 사진이 있어야 등록된다(게시예정은 예외) — 관리
  // 목적에서 "실제로 걸렸다"를 증명하는 건 이 사진뿐이다.
  const needInstall = installPhotoRequired(start, refDate);
  const missingInstall = needInstall && !installPhoto;
  useModalKeys({ onClose, onSubmit: submit, canSubmit: !!posting && !conflict && !missingInstall, busy: saving });

  return (
    <div className="modal" onClick={onClose}>
      <div className="mbox" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><b>{media.name}에 배치</b><button onClick={onClose}>✕</button></div>
        <div className="mbody">
          {!posting ? (
            <>
              <p className="hint">{t?.label}{t?.spec ? ' · 규격 ' + t.spec : ''} — 등록된 홍보물 중에서 골라 거세요.</p>
              <label className="fld"><span>홍보물 검색</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="업체명 · 내용" /></label>
              {rows.length === 0 ? (
                <p className="sub" style={{ padding: '8px 0' }}>
                  {options.length === 0 ? `${t?.label} 규격 파일을 가진 홍보물이 없습니다. 홍보물 화면에서 이 규격을 추가해 주세요.` : '검색 결과가 없습니다.'}
                </p>
              ) : (
                <div className="medialist wide">
                  {rows.map((p) => {
                    const url = thumbUrls.get(variantFor(p, media.type)?.thumbPath);
                    const placedCount = placementsOf[p.id]?.length || 0;
                    return (
                      <div className="mrow" key={p.id} onClick={() => pick(p)}>
                        <div className="mglyph" style={url ? { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: `linear-gradient(150deg, hsl(${p.hue} 42% 52%), hsl(${(p.hue + 40) % 360} 38% 38%))` }} />
                        <div className="mtxt">
                          <b>{p.brand}</b>
                          <i>{[subOf(p), placedCount ? `${placedCount}곳에 배치` : '미배치'].filter(Boolean).join(' · ')}</i>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <button className="btn wide" onClick={onCreateNew}>+ 새 홍보물 등록해서 바로 배치</button>
            </>
          ) : (
            <>
              <div className="fld" style={{ background: '#FAF8F4', borderRadius: 9, padding: '9px 11px' }}>
                <span>선택한 홍보물</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <b>{posting.brand}</b>{subOf(posting) && <i className="sub">{subOf(posting)}</i>}
                  <button className="mini" style={{ marginLeft: 'auto' }} onClick={() => setPosting(null)}>바꾸기</button>
                </div>
              </div>

              {mediaFaces > 1 && (
                <>
                  <label className="fld"><span>면 선택</span></label>
                  <div className="seg">
                    {Array.from({ length: mediaFaces }, (_, i) => i + 1).map((f) => {
                      const occupied = mediaPlacements(f).some((pl) => statusOf(pl, refDate) === 'live' || statusOf(pl, refDate) === 'open');
                      return <button key={f} type="button" className={face === f ? 'on' : ''} onClick={() => setFace(f)}>{f}면{occupied ? ' · 사용중' : ''}</button>;
                    })}
                  </div>
                  <label className="fld"><span>방향 (선택)</span><input value={faceLabel} onChange={(e) => { setFaceLabel(e.target.value); setLabelTouched(true); }} placeholder={`비워두면 "${face}면"으로 저장됩니다`} /></label>
                </>
              )}

              <div className="fld2">
                <label className="fld"><span>시작일</span><input type="date" value={start} onChange={(e) => { setStart(e.target.value); setConflict(null); }} /></label>
                <label className="fld"><span>종료일</span><input type="date" value={end} disabled={noEnd} onChange={(e) => { setEnd(e.target.value); setConflict(null); }} /></label>
              </div>
              <label className="chk"><input type="checkbox" checked={noEnd} onChange={(e) => { setNoEnd(e.target.checked); setConflict(null); }} />종료일을 아직 정하지 않음 — 철거 알람을 보내지 않습니다</label>

              <PhotoField
                label={needInstall ? '설치 확인 사진 (필수)' : '설치 확인 사진 (선택)'} capture
                hint={'현장에 실제로 부착된 모습을 한 장 남겨두면 이 배치에 "설치사진 ✓"로 표시됩니다.'}
                caption="설치 확인 사진" result={installPhoto} busy={installBusy}
                onPick={processInstallPhoto} onClear={() => setInstallPhoto(null)}
              />
              {missingInstall && <p className="warnbox">오늘부터 걸리는 배치입니다 — 실제로 부착된 모습을 한 장 남겨 주세요. (나중에 걸 예정이면 시작일을 미래로 잡으면 됩니다.)</p>}
              {willFillPostingImage && <p className="hint">이 홍보물에는 아직 이미지가 없어, 이 사진을 홍보물 이미지로도 함께 등록합니다.</p>}

              {conflict && (
                <div className="conflictbox">
                  겹치는 배치가 있습니다 — <b>{conflict.brand}</b> ({conflict.start} ~ {conflict.end || '미정'}).<br />
                  그대로 진행하면 이 배치의 종료일이 <b>{iso(Date.parse(start) - DAY)}</b>로 조정됩니다.
                  <div className="conflictbtns"><button className="mini" disabled={saving} onClick={() => setConflict(null)}>취소</button><button className="mini ok" disabled={saving} onClick={submit}>{saving ? '저장 중…' : '그대로 진행'}</button></div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="mfoot">
          <button className="btn" disabled={saving} onClick={onClose}>취소</button>
          {posting && <button className="btn primary" onClick={submit} disabled={saving || missingInstall}>{saving ? '저장 중…' : '배치'}</button>}
        </div>
      </div>
    </div>
  );
}
