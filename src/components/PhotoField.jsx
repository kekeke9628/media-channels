import React, { useState } from 'react';

// 사진 한 장을 붙이는 칸. 사진을 고르기 전에는 큰 점선 영역, 고른 뒤에는 그 영역이 사라지고
// 미리보기 옆에 교체·삭제가 붙는다.
//
// 예전에는 사진을 붙여도 "사진 선택" 영역이 그대로 남아 있어서, 이미 붙였는지 아닌지가
// 한눈에 안 들어오고(둘 다 화면에 있으니) 팝업만 한 화면 더 길어졌다. 무엇보다 한 번
// 고르고 나면 무르거나 바꿀 방법이 아예 없었다 — 팝업을 닫고 처음부터 다시 해야 했다.
export default function PhotoField({ label, hint, caption, result, busy, onPick, onClear, capture, collapsible, collapsedLabel, children }) {
  // 부차적인 칸(인쇄 시안 등)은 접어 둔다 — 매번 쓰는 칸이 아닌데 큰 점선 영역이 자리를
  // 차지하면, 정작 매번 채워야 하는 칸이 한 화면 아래로 밀린다.
  const [open, setOpen] = useState(false);
  if (collapsible && !result && !open) {
    return (
      <button type="button" className="facerow" onClick={() => setOpen(true)}>
        <b>+</b> {collapsedLabel || label}
      </button>
    );
  }
  return (
    <>
      {label && <label className="fld"><span>{label}</span></label>}
      {!result ? (
        <label className="drop">
          <input type="file" accept="image/*" {...(capture ? { capture: 'environment' } : {})}
            onChange={(e) => { if (e.target.files[0]) onPick(e.target.files[0]); e.target.value = ''; }} />
          <span className="dropbtn">사진 선택</span>
          {hint && <p>{hint}</p>}
        </label>
      ) : (
        <div className="photoedit">
          <img src={result.thumb.url} alt="" />
          <div className="photoedit-side">
            {caption && <i className="sub">{caption}</i>}
            <div className="photoedit-btns">
              {/* 교체는 파일 선택을 다시 여는 것이라 label, 삭제는 그냥 버튼이다. */}
              <label className="mini">
                <input type="file" accept="image/*" {...(capture ? { capture: 'environment' } : {})}
                  onChange={(e) => { if (e.target.files[0]) onPick(e.target.files[0]); e.target.value = ''; }} />
                사진 교체
              </label>
              <button type="button" className="mini danger" onClick={onClear}>삭제</button>
            </div>
          </div>
        </div>
      )}
      {busy && <p className="hint">변환 중…</p>}
      {result && children}
    </>
  );
}
