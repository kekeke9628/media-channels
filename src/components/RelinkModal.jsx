import React, { useState, useMemo, useEffect } from 'react';
import { contentOf, subOf, matches, byName, periodLabel, postingShots } from '../constants.js';
import { getPostingImageUrls } from '../lib/queries.js';
import { useModalKeys } from '../lib/useModalKeys.js';

// 홍보물 다시 고르기 — 이 자리에 "무엇이 걸려 있는가"만 고친다.
//
// 교체(SwapModal)와 하는 일이 완전히 다르다. 교체는 실제로 일어난 사건이라 걸려 있던 것을
// 내리고(종료일·철거일을 찍고) 새것을 건다. 여기는 사건이 아니라 오기입 정정이다 —
// 배치할 때 목록에서 엉뚱한 홍보물을 골랐을 뿐, 벽에 걸린 물건은 처음부터 같은 것이다.
// 그래서 매체·면·기간·설치 확인 사진은 손대지 않고 어느 홍보물인지만 바꾼다.
//
// 이걸 교체로 처리하면 걸린 적도 없는 업체가 그 면의 이력에 "철거됨"으로 남고, 실제로는
// 하루도 안 걸린 배치가 기간을 차지한다. 반대로 진짜 교체를 여기서 하면 옛 홍보물의
// 게시 기록이 통째로 사라진다 — 그래서 화면에서도 둘을 확실히 갈라 놓는다.
export default function RelinkModal({ pl, title, postings, placements, onClose, onRelink, onDone }) {
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // 교체와 달리 게시 기간이 끝난 홍보물도 후보에 남긴다 — 지난 배치를 뒤늦게 바로잡는
  // 경우가 있고, 그때 필요한 건 대개 이미 끝난 캠페인이다.
  const options = useMemo(() => postings.filter((p) => p.id !== pl?.postingId), [postings, pl?.postingId]);

  const placedCountOf = useMemo(() => {
    const by = {};
    placements.forEach((x) => { by[x.postingId] = (by[x.postingId] || 0) + 1; });
    return by;
  }, [placements]);

  const rows = useMemo(() => options
    .filter((p) => !q || matches(p.brand + contentOf(p), q))
    .sort((a, b) => byName(a.brand, b.brand)), [options, q]);

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

  const [picked, setPicked] = useState(null);

  const submit = async () => {
    if (!picked) return;
    setSaving(true);
    const ok = await onRelink(pl.id, picked.id);
    setSaving(false);
    if (ok) { onDone?.(picked); onClose(); }
    else setErr('바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.');
  };

  useModalKeys({ onClose, onSubmit: submit, canSubmit: !!picked, busy: saving });

  return (
    <div className="modal" onClick={onClose}>
      <div className="mbox" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><b>{title} 홍보물 변경</b><button onClick={onClose}>✕</button></div>
        <div className="mbody">
          {/* 무엇을 고치는 중인지 못 박는다 — 이 화면에 들어온 이유가 "잘못 골랐다"이므로,
              지금 뭐라고 적혀 있는지를 먼저 보여 줘야 맞게 고를 수 있다. */}
          <div className="swapfrom">
            <span className="sub">지금 이 자리</span>
            <b>{pl?.brand}</b>
            <i className="sub mono">{pl?.start} ~ {pl?.end || '미정'}</i>
          </div>

          {/* "교체를 쓰세요"는 뺐다 — 이 팝업을 여는 매체 상세에 이제 교체 버튼이 나란히
              있어서, 글로 다른 문을 가리키는 대신 그 문 앞에서 고르게 된다.
              기간·사진이 그대로라는 건 화면에 안 드러나는 유일한 정보라 남긴다. */}
          <p className="hint">기간·사진은 그대로 둡니다.</p>

          <label className="fld"><span>홍보물 검색</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="업체명 · 내용" />
          </label>

          {rows.length === 0 ? (
            <p className="sub" style={{ padding: '8px 0' }}>
              {options.length === 0 ? '고를 수 있는 다른 홍보물이 없습니다.' : '검색 결과가 없습니다.'}
            </p>
          ) : (
            <div className="medialist wide">
              {rows.map((p) => {
                const url = thumbUrls.get(shots.get(p.id)?.installPhotoPath);
                const n = placedCountOf[p.id] || 0;
                return (
                  <div className={'mrow' + (picked?.id === p.id ? ' on' : '')} key={p.id}
                    onClick={() => { setErr(''); setPicked(p); }}>
                    <div className="mglyph" style={url
                      ? { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                      : { background: `linear-gradient(150deg, hsl(${p.hue} 42% 52%), hsl(${(p.hue + 40) % 360} 38% 38%))` }} />
                    <div className="mtxt">
                      <b>{p.brand}</b>
                      <i>{[subOf(p), periodLabel(p), n ? `${n}곳에 배치` : '미배치'].filter(Boolean).join(' · ')}</i>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {err && <p className="warnbox">{err}</p>}
        </div>
        <div className="mfoot">
          <button className="btn" disabled={saving} onClick={onClose}>취소</button>
          <button className="btn primary" disabled={saving || !picked} onClick={submit}>
            {saving ? '바꾸는 중…' : picked ? `${picked.brand}(으)로 바꾸기` : '홍보물을 고르세요'}
          </button>
        </div>
      </div>
    </div>
  );
}
