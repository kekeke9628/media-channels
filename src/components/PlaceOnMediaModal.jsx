import React, { useState, useMemo, useEffect } from 'react';
import { iso, DAY, contentOf, subOf, matches, byName, postingExpired, periodLabel, placementDefaults, endMismatch, postingShots, findOverlap, vacantFrom } from '../constants.js';
import PhotoField from './PhotoField.jsx';
import { useInstallPhoto } from '../lib/useInstallPhoto.js';
import EndDateField from './EndDateField.jsx';
import { installPhotoRequired } from '../constants.js';
import { getPostingImageUrls } from '../lib/queries.js';
import { faceOccupied } from '../lib/status.js';
import { useModalKeys } from '../lib/useModalKeys.js';

// 매체 상세에서 "이 매체에 홍보물 배치"로 연다 — 매체는 이미 정해져 있으니(여기),
// 이미 등록해 둔 홍보물 중에서 골라 거는 게 자연스럽다. 새로 만드는 건 AssignModal이
// 하는 일(홍보물이 정해진 채 매체를 고름)의 반대 방향이라 별도 화면으로 뒀다 — 매체를
// 하나로 고정하고 면·기간·설치사진만 다루면 되므로 그쪽의 "단일 매체" 모드와 몸통은
// 같지만, 첫 단계로 "어느 홍보물을 걸지" 고르는 목록이 붙는다. 목록에 원하는 게 없으면
// onCreateNew로 등록 화면(AddModal)에 이 매체를 넘겨 새로 만들면서 바로 걸 수 있다.
export default function PlaceOnMediaModal({ media, T, postings, placements, refDate, initialFace, onClose, onAssign, onAdjustEnd, onDone, onCreateNew }) {
  const t = T[media.type];
  // 어느 홍보물이든 어느 매체에나 걸 수 있다 — 규격을 따지지 않는다(024).
  // 다만 게시 기간이 끝난 홍보물은 후보에서 뺀다 — 이제 와서 새로 걸 일이 없고, 목록에
  // 남아 있으면 지난 것을 잘못 고르기 쉽다. 기간을 안 넣은 홍보물(상시)은 계속 나온다.
  const options = useMemo(() => postings.filter((p) => !postingExpired(p, refDate)), [postings, refDate]);
  const hiddenExpired = postings.length - options.length;

  const placementsOf = useMemo(() => {
    const by = {};
    placements.forEach((pl) => { (by[pl.postingId] = by[pl.postingId] || []).push(pl); });
    return by;
  }, [placements]);

  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    return options
      .filter((p) => !q || matches(p.brand + contentOf(p), q))
      // 업체명 오름차순. 예전에는 "미배치 먼저, 그다음 최신순"이라 목록 순서가 등록한
      // 순서에 따라 매번 달라졌다 — 찾으려는 이름이 어디쯤 있을지 짐작할 수가 없다.
      .sort((a, b) => byName(a.brand, b.brand));
  }, [options, q]);

  // 목록의 작은 그림은 그 홍보물이 실제로 걸린 모습이다(시안은 안 쓴다) — 고를 때
  // 이름만으로는 비슷한 것끼리 구별이 안 돼서, 사진이 있어야 잘못 고르지 않는다.
  const shots = useMemo(() => postingShots(placements), [placements]);
  const [thumbUrls, setThumbUrls] = useState(new Map());
  useEffect(() => {
    let cancelled = false;
    getPostingImageUrls([...shots.values()].map((x) => x.installPhotoPath))
      .then((m) => { if (!cancelled) setThumbUrls(m); });
    return () => { cancelled = true; };
  }, [shots]);

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
  const { installPhoto, installBusy, pickInstallPhoto, clearInstallPhoto } = useInstallPhoto();
  const vacantStart = (f) => vacantFrom(placements, media.id, f, refDate);
  const overlapAt = (f) => findOverlap(placements, { mediaId: media.id, face: f, start, end: noEnd ? null : end });

  // 홍보물을 고르는 순간(또는 처음 진입 시) 비어 있는 면을 자동으로 고르고, 그 면의
  // 마지막 배치 다음 날로 시작일을 맞춘다.
  const pick = (p) => {
    setPosting(p);
    // 매체 상세의 "N면에 홍보물 배치" 버튼으로 들어왔으면 그 면을 그대로 쓰고, 아니면
    // 비어 있는 면을 자동으로 고른다.
    const faces = Array.from({ length: mediaFaces }, (_, i) => i + 1);
    const vacant = faces.find((f) => !faceOccupied(placements, media.id, f, refDate));
    const nextFace = (initialFace && initialFace <= mediaFaces) ? initialFace : (vacant || 1);
    setFace(nextFace);
    setLabelTouched(false);
    setFaceLabel(nextFace + '면');
    // 기간은 고른 홍보물의 게시 기간을 기본값으로 채운다(상시면 예전대로 빈 면 다음 날).
    const d = placementDefaults(p, vacantStart(nextFace), iso(Date.parse(refDate) + 30 * DAY));
    setStart(d.start);
    setEnd(d.end);
    // 종료일 미정이 예외가 아니라 기본이다(EndDateField 주석) — 홍보물 자체에 이미
    // 종료일이 정해져 있을 때만 그 값을 기본으로 채워 준다.
    setNoEnd(!d.forceEnd);
    setConflict(null);
  };
  useEffect(() => {
    if (!labelTouched) setFaceLabel(face + '면');
    setConflict(null);
    // 홍보물 게시 기간에서 가져온 시작일은 면을 바꿔도 그대로 둔다 — 어느 면에 걸든
    // 캠페인이 도는 기간은 같다.
    if (posting?.start) return;
    setStart(vacantStart(face));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face]);

  const submit = async () => {
    const ov = overlapAt(face);
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
              <p className="hint">{t?.label}{t?.spec ? ' · ' + t.spec : ''}</p>
              {/* 현장에서 새로 걸 때는 대개 아직 등록 안 한 홍보물이다 — 목록을 훑고 맨 아래까지
                  내려가서야 이 버튼을 만나면 늦다. 가장 먼저 보이게 둔다. */}
              <button className="btn primary wide" onClick={onCreateNew}>+ 새 홍보물 등록해서 바로 배치</button>
              {hiddenExpired > 0 && <p className="hint">기간이 끝난 {hiddenExpired}건은 뺐습니다.</p>}
              <label className="fld"><span>홍보물 검색</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="업체명 · 내용" /></label>
              {rows.length === 0 ? (
                <p className="sub" style={{ padding: '8px 0' }}>
                  {options.length === 0 ? '아직 등록된 홍보물이 없습니다. 위 버튼으로 새로 만들어 거세요.' : '검색 결과가 없습니다.'}
                </p>
              ) : (
                <div className="medialist wide">
                  {rows.map((p) => {
                    const url = thumbUrls.get(shots.get(p.id)?.installPhotoPath);
                    const placedCount = placementsOf[p.id]?.length || 0;
                    return (
                      <div className="mrow" key={p.id} onClick={() => pick(p)}>
                        <div className="mglyph" style={url ? { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: `linear-gradient(150deg, hsl(${p.hue} 42% 52%), hsl(${(p.hue + 40) % 360} 38% 38%))` }} />
                        <div className="mtxt">
                          <b>{p.brand}</b>
                          <i>{[subOf(p), periodLabel(p), placedCount ? `${placedCount}곳에 배치` : '미배치'].filter(Boolean).join(' · ')}</i>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
                      const occupied = faceOccupied(placements, media.id, f, refDate);
                      return <button key={f} type="button" className={face === f ? 'on' : ''} onClick={() => setFace(f)}>{f}면{occupied ? ' · 사용중' : ''}</button>;
                    })}
                  </div>
                  <label className="fld"><span>방향 (선택)</span><input value={faceLabel} onChange={(e) => { setFaceLabel(e.target.value); setLabelTouched(true); }} placeholder={`비워두면 "${face}면"으로 저장됩니다`} /></label>
                </>
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

              <PhotoField
                label={needInstall ? '설치 확인 사진 (필수)' : '설치 확인 사진 (선택)'} capture
                caption="설치 확인 사진" result={installPhoto} busy={installBusy}
                onPick={pickInstallPhoto} onClear={clearInstallPhoto}
              />
              {missingInstall && <p className="warnbox">오늘부터 걸리는 배치라 사진이 필요합니다.</p>}

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
