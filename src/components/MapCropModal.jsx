import React, { useEffect, useRef, useState } from 'react';
import { clamp } from '../constants.js';
import { useModalKeys } from '../lib/useModalKeys.js';

// 배치도 업로드 — 두 가지 방식이 있다.
//
// ① 전체 그대로: 원본을 자르지 않고 비율 그대로 저장한다. 2:1로 잘라 저장하면 지도
//    프레임 높이를 키워도 아래에 빈 공간만 생기고 지도가 더 보이지 않는다(잘려 나간
//    부분은 애초에 저장돼 있지 않으므로). 기본값.
// ② 영역 선택: PDF 센터맵처럼 범례·미니맵 같은 장식이 붙어 있을 때 필요한 부분만
//    2:1로 잘라낸다. 팬/줌으로 고른다(지도 패널과 같은 조작).
const FRAME_W = 640;
const FRAME_H = 320; // 2:1
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
// 실제 저장 해상도(2:1) — 지도 패널이 모바일에서 기본 1.5배, 손가락으로 최대 4배까지
// 확대해서 보여주는데(MapPanel.jsx MAX_ZOOM), 예전 1600×800으로는 그만큼 확대했을 때
// 원본 픽셀보다 화면 픽셀이 훨씬 많아져 매장 이름 글자가 뭉개져 보였다 — 두 배로 저장한다.
const OUT_W = 3200;
const OUT_H = 1600;

// 센터맵 PDF 2페이지 기본 크롭 규칙 — 좌상단 Full View 미니맵/범례와 우측 Village 영역은
// 매장 배치와 무관한 장식 요소라 제외하고, WEST 구역 왼쪽 끝은 잘리지 않게 보존한다.
// 다음에 같은 형식의 센터맵을 다시 올려도 동일하게 적용되도록 비율(0~1)로 고정해 둔다.
const DEFAULT_CROP = { x0: 0, x1: 0.70, topBias: 0.02 };
// Full View 미니맵 박스 + 색상 범례 목록 — 실제 매장 정보가 아니므로 흰색으로 지워 숨긴다.
const ERASE_RECTS = [
  { x: 0, y: 0, w: 0.20, h: 0.31 },
  { x: 0.20, y: 0, w: 0.18, h: 0.185 },
];

export default function MapCropModal({ file, onCancel, onConfirm }) {
  const [pages, setPages] = useState(null); // pdf.js document, null이면 일반 이미지
  const [pageNum, setPageNum] = useState(2);
  const [pageCount, setPageCount] = useState(1);
  const [srcImg, setSrcImg] = useState(null); // HTMLImageElement (렌더링된 페이지 또는 원본 이미지)
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // 기본은 자르지 않고 전체를 그대로 저장한다. 다만 센터맵 PDF 2페이지처럼 미리 잡아 둔
  // 크롭 비율(DEFAULT_CROP)이 있는 파일이면 그쪽으로 열어 준다 — 그 규칙을 비율로 박아 둔
  // 이유가 "같은 센터맵을 다시 올리면 알아서 같게"인데, 탭을 직접 찾아 눌러야만 적용되면
  // 걸어 둔 값이 없는 것과 같다. 두 탭이 바로 위에 있으니 전체로 되돌리는 건 한 번 누르면 된다.
  const [whole, setWhole] = useState(true);
  // 사용자가 탭을 직접 고른 뒤에는 자동 선택이 그 위를 덮지 않게 한다(페이지를 넘길 때마다
  // 골라 둔 방식이 되돌아가면 고르는 의미가 없다).
  const modeTouched = useRef(false);
  const pickMode = (v) => { modeTouched.current = true; setWhole(v); };

  const frameRef = useRef(null);
  const imgElRef = useRef(null);
  const stateRef = useRef({ x: 0, y: 0, zoom: 1, baseScale: 1 });
  const dragRef = useRef(null);
  const pointersRef = useRef(new Map()); // 모바일 핀치줌 — 활성 포인터(터치) 추적
  const pinchRef = useRef(null);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const isPdf = file && (file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf'));

  // PDF 문서 로드 (isPdf일 때만)
  useEffect(() => {
    if (!isPdf) { setPageCount(1); return; }
    let cancelled = false;
    (async () => {
      // legacy 빌드를 쓰는 이유: 기본(modern) 빌드는 Map.prototype.getOrInsertComputed(아주 최신
      // TC39 제안)를 쓰는데 현재 브라우저에 없어서 page.render()가 터진다. legacy 빌드에만 폴리필이 들어있다.
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      const buf = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      if (cancelled) return;
      setPages(doc);
      setPageCount(doc.numPages);
      setPageNum(Math.min(2, doc.numPages));
    })();
    return () => { cancelled = true; };
  }, [file, isPdf]);

  // 페이지(또는 원본 이미지)를 캔버스/이미지로 렌더링
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      let img;
      if (isPdf) {
        if (!pages) return;
        const page = await pages.getPage(pageNum);
        const viewport = page.getViewport({ scale: 3 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width; canvas.height = viewport.height;
        const ctx2d = canvas.getContext('2d');
        await page.render({ canvasContext: ctx2d, viewport }).promise;
        if (pageNum === 2) {
          ctx2d.fillStyle = '#FFFFFF';
          ERASE_RECTS.forEach((r) => {
            ctx2d.fillRect(r.x * canvas.width, r.y * canvas.height, r.w * canvas.width, r.h * canvas.height);
          });
        }
        img = new Image();
        img.src = canvas.toDataURL('image/png');
      } else {
        img = new Image();
        img.src = URL.createObjectURL(file);
      }
      img.onload = () => {
        if (cancelled) return;
        const fw = FRAME_W, fh = FRAME_H;
        const baseScale = Math.max(fw / img.width, fh / img.height);
        if (isPdf && pageNum === 2) {
          const { x0, x1, topBias } = DEFAULT_CROP;
          const widthPx = (x1 - x0) * img.width;
          const scale = clamp(fw / widthPx, baseScale * MIN_ZOOM, baseScale * MAX_ZOOM);
          const heightFrac = (fh / scale) / img.height;
          const y0 = Math.min(topBias, Math.max(0, 1 - heightFrac));
          stateRef.current = {
            zoom: scale / baseScale, baseScale,
            x: -x0 * img.width * scale,
            y: -y0 * img.height * scale,
          };
          if (!modeTouched.current) setWhole(false);
        } else {
          stateRef.current = {
            zoom: 1, baseScale,
            x: (fw - img.width * baseScale) / 2,
            y: (fh - img.height * baseScale) / 2,
          };
        }
        setSrcImg(img);
        setLoading(false);
        rerender();
      };
    })();
    return () => { cancelled = true; };
  }, [pages, pageNum, isPdf, file]);

  const applyTransform = () => {
    const el = imgElRef.current;
    if (!el) return;
    const { x, y, zoom, baseScale } = stateRef.current;
    el.style.transform = `translate(${x}px, ${y}px) scale(${baseScale * zoom})`;
  };
  // whole도 의존성이다 — "전체 그대로"에서 "영역 선택"으로 바꾸면 크롭용 <img>가 그때
  // 새로 붙는데, srcImg만 보고 있으면 이 effect가 다시 돌지 않아 transform이 비어 있다.
  // 그러면 원본이 프레임 왼쪽 위에 실제 크기로 얹혀서, 센터맵 PDF에 걸어 둔 기본 크롭
  // 비율(DEFAULT_CROP)도 화면에는 전혀 반영되지 않는다 — 손으로 한 번 끌어야 제자리를
  // 찾아갔다("예전에 비율 설정해 놓은 게 작동을 안 한다").
  useEffect(applyTransform, [srcImg, whole]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (e) => {
      e.preventDefault();
      const r = frame.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      const s = stateRef.current;
      const nz = clamp(s.zoom * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
      const scaleBefore = s.baseScale * s.zoom, scaleAfter = s.baseScale * nz;
      const contentX = (cx - s.x) / scaleBefore, contentY = (cy - s.y) / scaleBefore;
      stateRef.current = { ...s, zoom: nz, x: cx - contentX * scaleAfter, y: cy - contentY * scaleAfter };
      applyTransform();
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [loading]);

  // 데스크톱(휠+드래그)과 모바일(핀치+드래그) 모두 지원 — Pointer Events로 손가락 2개를 추적한다.
  const onPointerDown = (e) => {
    frameRef.current.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      const r = frameRef.current.getBoundingClientRect();
      pinchRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: stateRef.current.zoom,
        midX: (a.x + b.x) / 2 - r.left,
        midY: (a.y + b.y) / 2 - r.top,
        panX: stateRef.current.x,
        panY: stateRef.current.y,
      };
      dragRef.current = null;
    } else if (pointersRef.current.size === 1) {
      dragRef.current = { sx: e.clientX, sy: e.clientY, x: stateRef.current.x, y: stateRef.current.y };
    }
  };
  const onPointerMove = (e) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const p = pinchRef.current;
      const s = stateRef.current;
      const nz = clamp(p.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / p.dist), MIN_ZOOM, MAX_ZOOM);
      const scaleBefore = s.baseScale * p.zoom, scaleAfter = s.baseScale * nz;
      const contentX = (p.midX - p.panX) / scaleBefore, contentY = (p.midY - p.panY) / scaleBefore;
      stateRef.current = { ...s, zoom: nz, x: p.midX - contentX * scaleAfter, y: p.midY - contentY * scaleAfter };
      applyTransform();
      return;
    }
    if (!dragRef.current) return;
    const { sx, sy, x, y } = dragRef.current;
    stateRef.current = { ...stateRef.current, x: x + (e.clientX - sx), y: y + (e.clientY - sy) };
    applyTransform();
  };
  const onPointerUp = (e) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    dragRef.current = null;
  };

  useModalKeys({ onClose: onCancel, busy });

  // 자르지 않을 때의 저장 크기 — 긴 변 3200px(지도에서 최대 4배까지 확대하므로 글자가
  // 뭉개지지 않을 정도), 짧은 변은 2000px을 넘기지 않는다(세로로 긴 원본 대비).
  const OUT_LONG = 3200;
  const OUT_SHORT = 2000;
  const wholeSize = () => {
    const iw = srcImg?.naturalWidth || 1, ih = srcImg?.naturalHeight || 1;
    let s2 = Math.min(OUT_LONG / Math.max(iw, ih), OUT_SHORT / Math.min(iw, ih), 1);
    return { w: Math.max(1, Math.round(iw * s2)), h: Math.max(1, Math.round(ih * s2)) };
  };

  const confirm = () => {
    setBusy(true);
    if (whole) {
      const { w, h } = wholeSize();
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.filter = 'grayscale(1)';
      ctx.drawImage(srcImg, 0, 0, srcImg.naturalWidth, srcImg.naturalHeight, 0, 0, w, h);
      cv.toBlob((blob) => { setBusy(false); onConfirm(blob); }, 'image/png');
      return;
    }
    const { x, y, zoom, baseScale } = stateRef.current;
    const scale = baseScale * zoom;
    const cv = document.createElement('canvas');
    cv.width = OUT_W; cv.height = OUT_H;
    const ctx = cv.getContext('2d');
    // 지도 배경을 흑백으로 눌러서 매체 핀(빨강/초록)이 도드라지게 한다.
    ctx.filter = 'grayscale(1)';
    ctx.drawImage(
      srcImg,
      -x / scale, -y / scale, FRAME_W / scale, FRAME_H / scale,
      0, 0, OUT_W, OUT_H
    );
    cv.toBlob((blob) => { setBusy(false); onConfirm(blob); }, 'image/png');
  };

  return (
    <div className="modal" onClick={onCancel}>
      <div className="mbox cropbox" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <b>배치도 업로드</b>
          {isPdf && pageCount > 1 && (
            <div className="pagepick">
              <button className="mini" disabled={pageNum <= 1} onClick={() => setPageNum((p) => p - 1)}>‹</button>
              <span className="mono">페이지 {pageNum} / {pageCount}</span>
              <button className="mini" disabled={pageNum >= pageCount} onClick={() => setPageNum((p) => p + 1)}>›</button>
            </div>
          )}
          <button onClick={onCancel}>✕</button>
        </div>
        <div className="mbody">
          {loading ? (
            <p className="hint">불러오는 중…</p>
          ) : (
            <>
              <div className="seg">
                <button className={whole ? 'on' : ''} onClick={() => pickMode(true)}>전체 그대로</button>
                <button className={!whole ? 'on' : ''} onClick={() => pickMode(false)}>영역 선택 (2:1)</button>
              </div>
              {whole ? (
                <>
                  {/* 잘리는 곳 없이 저장되는 그대로를 보여준다 — 미리보기 틀도 원본 비율을 따른다. */}
                  <div className="cropframe whole">
                    {srcImg && <img src={srcImg.src} alt="" draggable={false} style={{ filter: 'grayscale(1)' }} />}
                  </div>
                  <p className="hint">
                    자르지 않고 원본 비율 그대로 저장합니다{srcImg && ` — ${wholeSize().w}×${wholeSize().h}px`}.
                    지도 높이를 키우면 그만큼 더 보입니다. 범례·미니맵처럼 지도가 아닌 부분이
                    섞여 있으면 "영역 선택"으로 잘라내세요.
                  </p>
                </>
              ) : (
                <>
                  <div className="cropframe" ref={frameRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
                    {srcImg && <img ref={imgElRef} src={srcImg.src} alt="" draggable={false} style={{ filter: 'grayscale(1)' }} />}
                  </div>
                  <p className="hint">휠(PC)로 확대/축소, 두 손가락(모바일)으로 확대·축소, 드래그로 이동해 영역을 프레임 안에 맞추세요.</p>
                </>
              )}
            </>
          )}
        </div>
        <div className="mfoot">
          <button className="btn" onClick={onCancel}>취소</button>
          <button className="btn primary" disabled={loading || busy} onClick={confirm}>{busy ? '처리 중…' : (whole ? '이대로 적용' : '이 영역으로 적용')}</button>
        </div>
      </div>
    </div>
  );
}
