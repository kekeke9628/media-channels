import React, { useEffect, useRef } from 'react';
import { clamp } from '../constants.js';
import { useModalKeys } from '../lib/useModalKeys.js';

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

// 사진 크게 보기.
//
// 설치 확인 사진은 "그 자리에 무엇이 어떻게 걸렸나"를 확인하는 증빙이라, 목록 크기로는
// 인쇄물 글자나 비뚤어짐이 안 보인다. 눌러서 화면을 꽉 채우고 휠·핀치로 확대한다.
//
// 목록 안에서 바로 휠로 확대하는 방식은 안 쓴다 — 그건 페이지 스크롤을 가로채는 것이라
// PC에서는 사진 위를 지날 때마다 화면이 안 내려가고, 모바일에서는 손가락 스크롤과 정면으로
// 부딪힌다(표 위에서 겪은 러버밴드 사고와 같은 종류다). 이 화면 안에서는 휠·핀치가 확대
// 말고 할 일이 없으니 마음껏 가로채도 된다.
export default function PhotoViewer({ src, caption, onClose }) {
  const frameRef = useRef(null);
  const imgRef = useRef(null);
  const st = useRef({ x: 0, y: 0, z: 1 });
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const drag = useRef(null);
  // 끌어서 옮긴 직후의 손 뗌은 "배경 클릭"이 아니다 — 확대해 놓고 끌 때마다 닫히면 못 쓴다.
  const moved = useRef(false);
  // 누르기 시작한 곳이 사진 위였는지. click 이벤트의 target으로는 못 가른다 —
  // setPointerCapture를 걸어 두면 그 뒤의 이벤트가 전부 틀(frame)로 옮겨져서,
  // 사진을 두 번 눌러 확대하려 해도 첫 클릭이 "빈 곳 클릭"으로 잡혀 닫혀 버렸다.
  const onImg = useRef(false);

  const apply = () => {
    const el = imgRef.current;
    if (!el) return;
    const { x, y, z } = st.current;
    el.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
  };
  useEffect(apply, []);

  // 화면 위의 한 점(px,py)을 붙잡은 채 배율만 바꾼다 — 그 점이 제자리에 남도록 이동량을
  // 다시 계산한다. 안 그러면 확대할 때마다 보던 곳이 화면 밖으로 밀려난다.
  const zoomAt = (px, py, want) => {
    const r = frameRef.current?.getBoundingClientRect();
    if (!r) return;
    const s = st.current;
    const nz = clamp(want, MIN_ZOOM, MAX_ZOOM);
    // 원래 크기로 돌아오면 위치도 같이 되돌린다 — 확대했다 줄였는데 사진이 구석에
    // 치우쳐 있으면 "원래대로"가 아니다.
    if (nz === MIN_ZOOM) st.current = { x: 0, y: 0, z: 1 };
    else {
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      st.current = {
        z: nz,
        x: px - cx - ((px - cx - s.x) / s.z) * nz,
        y: py - cy - ((py - cy - s.y) / s.z) * nz,
      };
    }
    apply();
  };

  useEffect(() => {
    const f = frameRef.current;
    if (!f) return;
    // passive:false여야 preventDefault가 먹는다 — 안 그러면 뒤 페이지가 같이 스크롤된다.
    const onWheel = (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, st.current.z * Math.exp(-e.deltaY * 0.0018)); };
    f.addEventListener('wheel', onWheel, { passive: false });
    return () => f.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e) => {
    // 캡처가 안 되는 경우(합성 이벤트 등)에도 나머지 동작은 살려 둔다.
    try { frameRef.current.setPointerCapture(e.pointerId); } catch { /* 캡처 없이도 프레임 안에서는 따라온다 */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    onImg.current = e.target === imgRef.current;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), z: st.current.z };
      drag.current = null;
    } else if (pointers.current.size === 1) {
      drag.current = { sx: e.clientX, sy: e.clientY, x: st.current.x, y: st.current.y };
    }
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      moved.current = true;
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2,
        pinch.current.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist));
      return;
    }
    // 원래 크기일 때는 옮길 곳이 없다 — 끌어도 가만히 두고, 손을 떼면 배경 클릭으로 닫힌다.
    if (!drag.current || st.current.z === MIN_ZOOM) return;
    const d = drag.current;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) moved.current = true;
    st.current = { ...st.current, x: d.x + (e.clientX - d.sx), y: d.y + (e.clientY - d.sy) };
    apply();
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    drag.current = null;
  };

  useModalKeys({ onClose });

  return (
    /* 이 화면은 매체 상세(.modal) 안에 얹힌다 — .modal의 배경 클릭이 시트를 닫으므로,
       여기서 일어난 클릭은 여기서 끊는다. 안 그러면 사진을 닫을 때 시트까지 닫힌다. */
    <div className="pview" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <div className="pview-head">
        {caption && <span>{caption}</span>}
        <button type="button" onClick={onClose}>✕</button>
      </div>
      <div
        className="pview-frame"
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // 사진 바깥의 빈 곳을 누르면 닫는다. 사진 자체는 제외한다 — 두 번 눌러 확대하려면
        // 첫 클릭에서 닫혀 버리기 때문이다. 끌어서 옮긴 뒤의 손 뗌도 클릭이 아니다.
        onClick={() => { if (!moved.current && !onImg.current) onClose(); }}
        // 두 번 눌러 확대/원래대로 — 손가락으로도 마우스로도 가장 빠른 길이다.
        onDoubleClick={(e) => zoomAt(e.clientX, e.clientY, st.current.z > 1 ? 1 : 2.5)}
      >
        <img ref={imgRef} className="pview-img" src={src} alt="" draggable={false} />
      </div>
      <p className="pview-hint">
        {'두 번 누르면 확대 · 휠(PC)이나 두 손가락(모바일)으로 크기 조절 · 끌어서 이동'}
      </p>
    </div>
  );
}
