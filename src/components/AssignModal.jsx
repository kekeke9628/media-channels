import React, { useState } from 'react';
import { iso, DAY } from '../constants.js';

// 미배치 시안(draft)을 실제 매체·기간에 배치한다. 이미지·업체명은 시안 등록 때 이미
// 저장돼 있으므로 여기서는 매체와 일정만 정한다.
export default function AssignModal({ posting, media, refDate, onClose, onAssign }) {
  const live = media.filter((m) => m.active);
  const [mediaId, setMediaId] = useState(live[0]?.id || '');
  const [start, setStart] = useState(refDate);
  const [noEnd, setNoEnd] = useState(false);
  const [end, setEnd] = useState(iso(Date.parse(refDate) + 30 * DAY));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!mediaId || saving) return;
    setSaving(true);
    const ok = await onAssign(posting.id, { mediaId, start, end: noEnd ? null : end });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="mbox" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><b>매체 배치</b><button onClick={onClose}>✕</button></div>
        <div className="mbody">
          <p className="hint"><b>{posting.brand}</b>{posting.title ? ' · ' + posting.title : ''} 시안을 어느 매체에, 언제부터 걸지 정합니다.</p>
          <label className="fld"><span>매체</span><select value={mediaId} onChange={(e) => setMediaId(e.target.value)}>{live.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <div className="fld2">
            <label className="fld"><span>시작일</span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="fld"><span>종료일</span><input type="date" value={end} disabled={noEnd} onChange={(e) => setEnd(e.target.value)} /></label>
          </div>
          <label className="chk"><input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} />종료일 미정 (미정 상태) — 철거 알람 대상에서 제외됩니다</label>
        </div>
        <div className="mfoot">
          <button className="btn" disabled={saving} onClick={onClose}>취소</button>
          <button className="btn primary" onClick={submit} disabled={!mediaId || saving}>{saving ? '저장 중…' : '배치'}</button>
        </div>
      </div>
    </div>
  );
}
