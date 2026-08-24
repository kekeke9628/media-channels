import React, { useState, useMemo } from 'react';
import { convertImage } from '../lib/convertImage.js';
import { useModalKeys } from '../lib/useModalKeys.js';

// 이미 만든 캠페인에 다른 규격(매체 유형)의 인쇄 파일을 더한다.
//
// 같은 "나이키 여름 기획전"이라도 웨더워리어용 900×1800과 듀라트란스용 1030×1456은
// 물리적으로 다른 인쇄물이라 파일이 따로다. 예전에는 홍보물 하나에 유형이 하나뿐이라
// 같은 캠페인을 유형 수만큼 별개로 등록해야 했고, 서로 묶이지도 않았다.
export default function AddVariantModal({ posting, T, types, onClose, onSubmit }) {
  const have = new Set(posting.types || []);
  const options = useMemo(() => types.filter((t) => t.active && !have.has(t.code)), [types, posting]);
  const [type, setType] = useState(options[0]?.code || '');
  const t = T[type];
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const process = async (f) => { setBusy(true); setResult(await convertImage(f)); setBusy(false); };

  // 규격 비율이 크게 어긋나면 실제 인쇄물에서 잘린다 — 올리는 자리에서 미리 알려 준다.
  const specRatio = useMemo(() => { const n = (t?.spec || '').match(/(\d+)\D+(\d+)/); return n ? +n[1] / +n[2] : null; }, [t]);
  const mismatch = result && specRatio && Math.abs(+result.ratio - specRatio) / specRatio > 0.08;

  const submit = async () => {
    if (!type || saving) return;
    setSaving(true);
    const ok = await onSubmit(posting.id, type, result);
    setSaving(false);
    if (ok) onClose();
  };
  useModalKeys({ onClose, onSubmit: submit, canSubmit: !!type, busy: saving });

  return (
    <div className="modal" onClick={onClose}>
      <div className="mbox" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><b>규격 추가 · {posting.brand}</b><button onClick={onClose}>✕</button></div>
        <div className="mbody">
          <p className="hint">
            같은 홍보물이라도 매체 규격마다 인쇄 파일이 따로입니다. 여기서 규격을 더하면
            그 규격의 매체에도 이 홍보물을 걸 수 있습니다.
          </p>
          {(posting.types || []).length > 0 && (
            <p className="hint">이미 가진 규격 — {(posting.types || []).map((c) => T[c]?.label || c).join(' · ')}</p>
          )}

          {options.length === 0 ? (
            <p className="sub" style={{ padding: '8px 0' }}>이 홍보물은 이미 모든 매체 유형의 규격을 갖고 있습니다.</p>
          ) : (
            <>
              <label className="fld"><span>추가할 규격 (매체 유형)</span>
                <select value={type} onChange={(e) => { setType(e.target.value); setResult(null); }}>
                  {options.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
                </select>
              </label>
              {t && <p className="hint">이 규격으로 인쇄 파일을 준비하세요 — <b>{t.spec}</b></p>}

              <label className="fld"><span>인쇄 파일 (선택)</span></label>
              <label className="drop">
                <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && process(e.target.files[0])} />
                <span className="dropbtn">사진 선택</span>
                <p>지금 없으면 비워두고 나중에 올려도 됩니다. 규격만 먼저 등록해 두면 배치는 가능합니다.</p>
              </label>
              {busy && <p className="hint">변환 중…</p>}
              {mismatch && <p className="warnbox">⚠ 사진 가로세로 비율이 이 규격({t.spec})과 달라, 실제 인쇄물에서는 잘려 보일 수 있습니다.</p>}
              {result && <div className="rprev"><img src={result.thumb.url} alt="" /><i className="sub">등록될 이미지</i></div>}
            </>
          )}
        </div>
        <div className="mfoot">
          <button className="btn" disabled={saving} onClick={onClose}>취소</button>
          <button className="btn primary" onClick={submit} disabled={!type || saving}>{saving ? '저장 중…' : '규격 추가'}</button>
        </div>
      </div>
    </div>
  );
}
