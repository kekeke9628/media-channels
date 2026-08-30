import React, { useState, useMemo, useEffect } from 'react';
import { iso, DAY, contentOf, subOf, matches, byName, postingExpired, periodLabel, placementDefaults, endMismatch, installPhotoRequired } from '../constants.js';
import { convertImage } from '../lib/convertImage.js';
import { getPostingImageUrls } from '../lib/queries.js';
import { useModalKeys } from '../lib/useModalKeys.js';
import PhotoField from './PhotoField.jsx';

// 교체 — 걸려 있던 홍보물을 내리고 그 자리에 새것을 건다.
//
// PlaceOnMediaModal(빈 자리에 새로 걸기)과 몸통은 닮았지만 고르는 것이 하나뿐이다.
// 매체·면·방향·시작일이 전부 정해져 있는 상태로 들어오기 때문이다 — 어느 자리를 언제
// 교체할지는 앞 화면(교체 탭)에서 이미 골랐고, 여기서 다시 묻는 건 되묻는 것일 뿐
// 엉뚱한 면에 걸릴 여지만 만든다. 그래서 "무엇으로 바꿀지"와 종료일·설치사진만 받는다.
// pl은 지금 그 자리에 걸려 있는 배치, title은 화면에 보일 자리 이름("WWH02 · 2면").
// 슬롯이 아니라 배치를 직접 받는다 — 교체 탭(슬롯 목록)과 홍보물 카드(배치 목록) 양쪽에서
// 같은 팝업을 쓰기 위해서다.
export default function SwapModal({ pl: oldPl, title, date, postings, placements, refDate, onClose, onSwap, onCreateNew, onDone }) {

  // 게시 기간이 끝난 홍보물은 후보에서 뺀다 — 교체하면서 이미 끝난 캠페인을 거는 건
  // 실수뿐이다. 상시와 아직 시작 안 한 것은 그대로 둔다.
  const options = useMemo(() => postings.filter((p) => !postingExpired(p, date)), [postings, date]);
  const hiddenExpired = postings.length - options.length;

  const placedCountOf = useMemo(() => {
    const by = {};
    placements.forEach((pl) => { by[pl.postingId] = (by[pl.postingId] || 0) + 1; });
    return by;
  }, [placements]);

  const [q, setQ] = useState('');
  const rows = useMemo(() => options
    .filter((p) => !q || matches(p.brand + contentOf(p), q))
    .sort((a, b) => byName(a.brand, b.brand)), [options, q]);

  const [thumbUrls, setThumbUrls] = useState(new Map());
  useEffect(() => {
    let cancelled = false;
    getPostingImageUrls(options.map((p) => p.thumbPath)).then((m) => { if (!cancelled) setThumbUrls(m); });
    return () => { cancelled = true; };
  }, [options]);

  const [posting, setPosting] = useState(null);
  const [noEnd, setNoEnd] = useState(false);
  const [end, setEnd] = useState(iso(Date.parse(date) + 30 * DAY));
  const [saving, setSaving] = useState(false);
  const [installPhoto, setInstallPhoto] = useState(null);
  const [installBusy, setInstallBusy] = useState(false);

  const pick = (p) => {
    setPosting(p);
    // 새 배치 기간의 기본값은 고른 홍보물의 게시 기간에서 가져온다. 시작일은 교체일로
    // 고정이므로 종료일만 쓴다(상시면 예전대로 교체일 + 30일).
    const d = placementDefaults(p, date, iso(Date.parse(date) + 30 * DAY));
    setEnd(d.end);
    setNoEnd(!d.forceEnd && !d.end);
  };

  const submit = async () => {
    if (!posting) return;
    setSaving(true);
    const ok = await onSwap(oldPl, posting, { date, end: noEnd ? null : end, installPhoto });
    setSaving(false);
    onDone?.(ok);
    if (ok) onClose();
  };

  // 오늘(또는 그 전)부터 걸리는 배치는 설치 확인 사진이 있어야 한다 — 다른 배치 경로와
  // 같은 규칙이다. 내일 교체로 미리 잡아 두는 경우에는 아직 못 찍으므로 뺀다.
  const needInstall = installPhotoRequired(date, refDate);
  const missingInstall = needInstall && !installPhoto;
  const badEnd = !noEnd && !!end && end < date;
  const canSubmit = !!posting && !missingInstall && !badEnd;
  useModalKeys({ onClose, onSubmit: submit, canSubmit, busy: saving });

  return (
    <div className="modal" onClick={onClose}>
      <div className="mbox" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><b>{title} 교체</b><button onClick={onClose}>✕</button></div>
        <div className="mbody">
          {/* 무엇을 내리는지 먼저 못 박는다 — 목록에서 눌러 들어왔더라도, 자리가 여럿이면
              어느 것을 바꾸는 중인지 화면에서 다시 확인할 수 있어야 한다. */}
          {/* 게시 종료일과 내리는 날이 하루 차이라(종료일 다음 날에 내린다) 둘을 나란히
              보여 준다 — "8/30까지인데 왜 8/31이지?"를 여기서 끝내야 한다. */}
          <div className="swapfrom">
            <span className="sub">지금 걸려 있는 것 — <b>{date}</b>에 내려갑니다{date > refDate && ' (내일)'}</span>
            <b>{oldPl?.brand}</b>
            <i className="sub mono">{oldPl?.start} ~ {oldPl?.end || '미정'}</i>
          </div>

          {!posting ? (
            <>
              {/* 현장에서 교체할 때는 아직 등록 안 한 홍보물인 경우가 대부분이다 — 목록을
                  훑고 맨 아래까지 내려가서야 이 버튼을 만나면 늦다(PlaceOnMediaModal과 같은
                  이유로 맨 위에 둔다). */}
              {onCreateNew && <button className="btn primary wide" onClick={onCreateNew}>+ 새 홍보물 등록해서 바로 교체</button>}
              <p className="hint">또는 이미 등록된 홍보물 중에서 고르세요.{hiddenExpired > 0 && ` 게시 기간이 끝난 ${hiddenExpired}건은 목록에서 뺐습니다.`}</p>
              <label className="fld"><span>홍보물 검색</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="업체명 · 내용" /></label>
              {rows.length === 0 ? (
                <p className="sub" style={{ padding: '8px 0' }}>
                  {options.length === 0 ? '걸 수 있는 홍보물이 없습니다. 홍보물 탭에서 먼저 등록해 주세요.' : '검색 결과가 없습니다.'}
                </p>
              ) : (
                <div className="medialist wide">
                  {rows.map((p) => {
                    const url = thumbUrls.get(p.thumbPath);
                    const n = placedCountOf[p.id] || 0;
                    return (
                      <div className="mrow" key={p.id} onClick={() => pick(p)}>
                        <div className="mglyph" style={url ? { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: `linear-gradient(150deg, hsl(${p.hue} 42% 52%), hsl(${(p.hue + 40) % 360} 38% 38%))` }} />
                        <div className="mtxt">
                          <b>{p.brand}</b>
                          <i>{[subOf(p), periodLabel(p), n ? `${n}곳에 배치` : '미배치'].filter(Boolean).join(' · ')}</i>
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
                <span>새로 걸 홍보물</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <b>{posting.brand}</b>{subOf(posting) && <i className="sub">{subOf(posting)}</i>}
                  <button className="mini" style={{ marginLeft: 'auto' }} onClick={() => setPosting(null)}>바꾸기</button>
                </div>
              </div>

              <div className="fld2">
                {/* 시작일은 앞 화면에서 고른 교체일이라 고정이다 — 여기서 바꿀 수 있게 하면
                    "오늘 교체" 목록에서 들어와 놓고 다른 날짜로 저장되는 일이 생긴다.
                    옛 배치의 종료일 다음 날이라, 내리는 날과 새로 거는 날이 같다. */}
                <label className="fld"><span>시작일 (교체일)</span><input type="date" value={date} disabled /></label>
                <label className="fld"><span>종료일</span><input type="date" value={end} disabled={noEnd} onChange={(e) => setEnd(e.target.value)} /></label>
              </div>
              <label className="chk"><input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} />종료일을 아직 정하지 않음 — 철거 알람을 보내지 않습니다</label>
              {badEnd && <p className="warnbox">종료일이 교체일보다 앞섭니다.</p>}
              {endMismatch(posting.end, noEnd ? null : end) && (
                <p className="warnbox">홍보물 게시 기간과 배치 기간이 상이합니다 — 홍보물 종료일 <b>{posting.end}</b>, 배치 종료일 <b>{noEnd ? '미정' : end}</b>.</p>
              )}

              <PhotoField
                label={needInstall ? '설치 확인 사진 (필수)' : '설치 확인 사진 (선택)'} capture
                hint="새로 건 모습을 한 장 남겨 주세요."
                caption="설치 확인 사진" result={installPhoto} busy={installBusy}
                onPick={async (f) => { setInstallBusy(true); setInstallPhoto(await convertImage(f)); setInstallBusy(false); }}
                onClear={() => setInstallPhoto(null)}
              />
              {missingInstall && <p className="warnbox">오늘 교체하는 자리입니다 — 실제로 바꿔 단 모습을 한 장 남겨 주세요.</p>}
            </>
          )}
        </div>
        <div className="mfoot">
          <button className="btn" disabled={saving} onClick={onClose}>취소</button>
          {posting && <button className="btn primary" onClick={submit} disabled={saving || !canSubmit}>{saving ? '교체 중…' : '교체'}</button>}
        </div>
      </div>
    </div>
  );
}
