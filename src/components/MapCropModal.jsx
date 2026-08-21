import React, { useEffect, useRef, useState } from 'react';
import { clamp } from '../constants.js';

// PDF/이미지 배치도 업로드 크롭 — 배너 시스템과 동일하게, PDF의 특정 페이지 일부를
// 지도 프레임 비율(2:1)로 크롭해 배경으로 쓴다. 자동 중앙 크롭이 아니라 팬/줌으로
// 정확히 원하는 영역을 고른다(지도 패널의 pan/zoom과 동일한 조작 방식).
const FRAME_W = 640;
const FRAME_H = 320; // 2:1
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

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
  useEffect(applyTransform, [srcImg]);

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

  const confirm = () => {
    setBusy(true);
    const { x, y, zoom, baseScale } = stateRef.current;
    const scale = baseScale * zoom;
    const cv = document.createElement('canvas');
    cv.width = 1600; cv.height = 800;
    const ctx = cv.getContext('2d');
    // 지도 배경을 흑백으로 눌러서 매체 핀(빨강/초록)이 도드라지게 한다.
    ctx.filter = 'grayscale(1)';
    ctx.drawImage(
      srcImg,
      -x / scale, -y / scale, FRAME_W / scale, FRAME_H / scale,
      0, 0, 1600, 800
    );
    cv.toBlob((blob) => { setBusy(false); onConfirm(blob); }, 'image/png');
  };

  return (
    <div className="modal" onClick={onCancel}>
      <div className="mbox cropbox" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <b>배치도 영역 선택</b>
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
              <div className="cropframe" ref={frameRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
                {srcImg && <img ref={imgElRef} src={srcImg.src} alt="" draggable={false} style={{ filter: 'grayscale(1)' }} />}
              </div>
              <p className="hint">휠(PC)로 확대/축소, 두 손가락(모바일)으로 확대·축소, 드래그로 이동해 영역을 프레임 안에 맞추세요.</p>
            </>
          )}
        </div>
        <div className="mfoot">
          <button className="btn" onClick={onCancel}>취소</button>
          <button className="btn primary" disabled={loading || busy} onClick={confirm}>{busy ? '처리 중…' : '이 영역으로 적용'}</button>
        </div>
      </div>
    </div>
  );
}
