import React, { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { clamp, nameTaken } from '../constants.js';
import { getPostingImageUrls } from '../lib/queries.js';
import { ZONES } from '../data/seed.js';
import MapCropModal from './MapCropModal.jsx';

// 배너 시스템 MapCard 성능 구조 재사용 (사양서 2.1):
// - pan은 React state 대신 useRef + 직접 DOM 조작 (pointermove마다 재렌더 없음)
// - 휠 줌 핸들러는 useEffect + ref로 등록해 stale closure를 피한다
// - panToPin: 핀 선택 시 지도를 부드럽게 이동
//
// 핀은 지점(spot) 단위 집계가 아니라 매체 낱개 단위다 — 유형 아이콘 + 상태색으로 표시하고,
// 편집 모드에서 드래그로 옮기면 드롭 즉시 저장되며, 빈 자리를 클릭하면 새 매체를 그 자리에 추가한다.
//
// 핀은 지도(.mapstage)와 같은 컨테이너에서 scale()로 함께 확대된 뒤 반대 배율로 counter-scale해
// 크기만 되돌리면, 중첩된 transform 때문에 브라우저가 확대된 상태로 래스터화했다가 다시 축소해
// 그리면서 해상도가 깨진다(가로등 배너 시스템에서 실제로 겪은 버그). 그래서 핀은 지도와 분리된
// .pin-layer에 두고 JS가 계산한 translate(px,px)로만 위치를 잡는다 — scale을 아예 안 쓰므로
// 배율과 무관하게 항상 원본 해상도로 그려진다. positionPins는 itemsRef로 최신 목록을 읽어서
// 마운트 시 한 번만 등록되는 휠 리스너의 오래된 클로저에서 호출돼도 최신 위치를 계산한다.
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const CLICK_SLOP = 6; // 이 픽셀 이내 움직임은 팬이 아니라 클릭으로 본다

// onOpenMedia: 핀을 누르면 선택 + 상세 시트까지 연다. 목록의 "지도보기"는 시트를 열지 않고
// 선택만 잡으므로(시트가 지도를 덮는다) App이 둘을 다른 함수로 내려 준다.
// cardRef: 목록에서 "지도보기"를 눌렀을 때 이 카드로 스크롤하기 위해 App이 잡는 손잡이.
// focusTick: 이미 선택된 매체를 다시 눌렀을 때도 지도를 다시 중앙으로 옮기기 위한 신호 —
// selMedia만 보면 값이 그대로라 effect가 안 돌고, 사용자는 버튼이 먹통이라고 느낀다.
export default function MapPanel({ T, types, items, allMedia, zoneFilter, setZoneFilter, typeFilter, setTypeFilter, selMedia, onOpenMedia, onClearSelection, cardRef, focusTick, editMode, setEditMode, addMode, setAddMode, onMoveLocal, onMoveCommit, onCreate, onRestoreAt, mapImage, onMapImage, isEditor }) {
  const wrapRef = useRef(null);
  const stageRef = useRef(null);
  const pinRefs = useRef({});   // item.id -> 핀 DOM 노드 (지도와 분리된 레이어라 위치를 직접 계산해서 넣어줘야 함)
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const panRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragPinRef = useRef(null);
  const panDragRef = useRef(null);
  const pointersRef = useRef(new Map()); // 모바일 핀치줌 — 활성 포인터(터치) 추적
  const pinchRef = useRef(null);

  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState(null);
  const [addAt, setAddAt] = useState(null); // { x, y }
  // 매체 추가 중에 기존 핀 위를 누르면 아무 일도 안 일어났다 — 핀에서 시작한 포인터는
  // 지도 핸들러가 무시하기 때문인데(핀 드래그용), 화면에는 아무 표시가 없어 "안 눌린다"로만
  // 보였다. 겹쳐 놓지 못한다는 사실을 그 자리에서 알려 준다.
  // 지도 프레임 높이. 가로는 화면 폭에 맞춰야 하니 어쩔 수 없지만, 세로는 배치도마다·
  // 보는 사람마다 원하는 게 달라서 직접 잡을 수 있게 한다(아래 손잡이를 끌면 된다).
  // 0이면 기본값(가로:세로 = 16:8)을 그대로 쓴다. 이 기기에서만 기억한다.
  const [mapH, setMapH] = useState(() => {
    try { return +localStorage.getItem('mapHeight') || 0; } catch { return 0; }
  });
  const saveMapH = (h) => {
    setMapH(h);
    try { h ? localStorage.setItem('mapHeight', String(h)) : localStorage.removeItem('mapHeight'); } catch { /* 저장 못 해도 이번 세션엔 적용된다 */ }
  };
  const grabRef = useRef(null);
  const onGrabDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    grabRef.current = true;
  };
  const onGrabMove = (e) => {
    if (!grabRef.current) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    // 시작점 대비 이동량이 아니라 "지도 위 끝에서 손가락까지의 거리"로 잰다 — 프레임이
    // 줄면 아래 내용이 따라 올라오면서 페이지 스크롤이 같이 움직이는데, 이동량 방식은
    // 그때 기준점이 어긋나 드래그가 제자리걸음을 한다.
    let next = e.clientY - rect.top;
    // 지도 아래 빈 띠가 딱 없어지는 높이에 살짝 붙여 준다 — 대부분 여기서 멈추고 싶어 한다.
    const fit = stageSize().h;
    if (fit && Math.abs(next - fit) < 24) next = fit;
    // 최소값을 고정 220px로 뒀더니 모바일 기본 높이(182px)보다 커서, 위로 끌면 오히려
    // 늘어나고 거기서 멈췄다 — 손가락을 따라갈 수 있게 충분히 낮춘다.
    saveMapH(Math.round(clamp(next, 120, window.innerHeight * 0.9)));
  };
  const onGrabUp = (e) => { grabRef.current = null; e.currentTarget.releasePointerCapture?.(e.pointerId); };

  // 지도는 "프레임 폭"에만 맞춰 그린다. 예전에는 이미지를 프레임에 꽉 채웠기(object-fit:cover)
  // 때문에, 프레임 높이를 키우면 이미지가 같이 확대되며 좌우가 잘렸다 — 높이만 만졌는데
  // 배율이 바뀌던 이유다. 이제 배율은 폭이 정하고, 높이는 얼마나 보여줄지만 정한다.
  const [mapAR, setMapAR] = useState(2); // 가로/세로. 배치도를 올리기 전 회색 도면은 2:1.
  // 핀 좌표(%)와 클릭 지점 환산이 모두 이 상자를 기준으로 한다 — 프레임이 아니라 지도 자신.
  const stageSize = useCallback(() => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return { w: 0, h: 0 };
    return { w: r.width, h: r.width / (mapAR || 2) };
  }, [mapAR]);

  const [pinBump, setPinBump] = useState(false);
  const bumpRef = useRef(null);
  const showBump = () => {
    setPinBump(true);
    clearTimeout(bumpRef.current);
    bumpRef.current = setTimeout(() => setPinBump(false), 2600);
  };
  useEffect(() => () => clearTimeout(bumpRef.current), []);
  const [open, setOpen] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const active = types.filter((t) => t.active);

  // 유형을 고르면 그게 몇 개짜리 몇 면인지 바로 알고 싶다 — 듀라트란스처럼 한 자리에
  // 여러 면이 모인 유형은 "개수"와 "면수"가 크게 달라서 개수만으로는 물량이 안 잡힌다.
  // 지도에 지금 보이는 것(유형·구역 필터가 이미 걸린 items) 기준으로 센다.
  // 핀에 마우스를 올리면 지금 걸려 있는 홍보물을 바로 보여준다 — 이름과 D-day만으로는
  // "어느 시안이 걸렸더라"가 안 잡혀서, 확인하려면 핀을 하나하나 눌러 봐야 했다.
  //
  // 서명 URL은 한 번에 묶어 받는다(비공개 버킷). 올릴 때마다 요청하면 첫 hover가 매번
  // 굼뜨고, 같은 핀을 오갈 때마다 새로 부른다 — 지금 지도에 보이는 것만이라 양도 적다.
  const thumbPaths = useMemo(() => {
    const out = [];
    for (const o of items) for (const s of o.slots) {
      const p = s.overdue || s.current;
      if (p?.thumbPath) out.push(p.thumbPath);
    }
    return [...new Set(out)];
  }, [items]);
  const [thumbs, setThumbs] = useState(new Map());
  const thumbKey = thumbPaths.join('|');
  useEffect(() => {
    if (!thumbPaths.length) { setThumbs(new Map()); return; }
    let cancelled = false;
    getPostingImageUrls(thumbPaths).then((m) => { if (!cancelled) setThumbs(m); }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbKey]);

  const summary = useMemo(() => {
    const per = new Map();
    let count = 0, faces = 0;
    for (const o of items) {
      const f = Math.max(1, o.faces || 1);
      count += 1; faces += f;
      const cur = per.get(o.type) || { count: 0, faces: 0 };
      per.set(o.type, { count: cur.count + 1, faces: cur.faces + f });
    }
    return { count, faces, per: [...per.entries()].map(([code, v]) => ({ code, ...v })) };
  }, [items]);

  const clampPan = (x, y, z, r) => {
    const st = stageSize();
    const w = st.w * z, h = st.h * z;
    // 지도가 프레임보다 작은 방향(예: 높이를 크게 잡았을 때)은 붙여 두고 움직이지 않는다.
    return { x: clamp(x, Math.min(0, r.width - w), 0), y: clamp(y, Math.min(0, r.height - h), 0) };
  };

  // 각 핀을 현재 pan/zoom 기준 픽셀 좌표로 옮긴다. -50%,-56%는 기존 .pin CSS의 앵커 오프셋과 동일.
  const positionPins = useCallback((px, py, pz) => {
    const { w, h } = stageSize();
    if (!w) return;
    itemsRef.current.forEach((o) => {
      const el = pinRefs.current[o.id];
      if (!el) return;
      const x = px + (o.x / 100) * w * pz;
      const y = py + (o.y / 100) * h * pz;
      el.style.transform = `translate(${x}px,${y}px) translate(-50%,-56%)`;
    });
  }, [stageSize]);

  // 핀의 히트 영역은 손가락으로 누르기 쉽도록 아이콘보다 14px 넓다(.pin::before). 그런데 핀
  // 두 개가 가까이 붙으면 그 보이지 않는 여백이 이웃 핀의 아이콘을 덮어, 밑에 깔린 핀은
  // 아이콘을 정확히 눌러도 위 핀이 클릭을 가로챈다(실제로 재현됨). 이웃과의 거리에 맞춰
  // 여백을 줄여 서로 침범하지 않게 한다 — 떨어져 있으면 종전대로 14px 전부 쓴다.
  // 거리는 배율에만 좌우되고 이동(pan)에는 영향받지 않으므로 배율이 바뀔 때만 다시 계산한다.
  const HIT_MAX = 14;
  const sizePinHits = useCallback((pz) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const pts = itemsRef.current.map((o) => ({
      id: o.id,
      x: (o.x / 100) * r.width * pz,
      y: (o.y / 100) * r.height * pz,
    }));
    pts.forEach((a) => {
      const el = pinRefs.current[a.id];
      if (!el) return;
      let nearest = Infinity;
      for (const b of pts) {
        if (b.id === a.id) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < nearest) nearest = d;
      }
      // 두 아이콘 사이에 남는 빈 간격을 절반씩 나눠 갖는다(아이콘 폭은 실제 렌더 크기 기준).
      const gap = nearest - el.offsetWidth;
      const room = Number.isFinite(gap) ? Math.floor(gap / 2) : HIT_MAX;
      el.style.setProperty('--hit', -clamp(room, 0, HIT_MAX) + 'px');
    });
  }, []);

  const applyTransform = () => {
    const st = stageRef.current;
    if (!st) return;
    const { x, y, zoom: z } = panRef.current;
    st.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    positionPins(x, y, z);
  };

  const animateTransform = () => {
    const st = stageRef.current;
    if (!st) return;
    const transition = 'transform .32s cubic-bezier(.25,.8,.25,1)';
    const pinEls = Object.values(pinRefs.current);
    st.style.transition = transition;
    pinEls.forEach((el) => { el.style.transition = transition; });
    applyTransform();
    window.setTimeout(() => {
      if (st) st.style.transition = '';
      pinEls.forEach((el) => { el.style.transition = ''; });
    }, 340);
  };

  // 배너 시스템에서 겪은 두 번째 버그: 핀은 .mapstage와 분리된 레이어라 지도만 트랜지션을 걸면
  // 핀은 애니메이션 없이 즉시 최종 위치로 스냅돼 지도가 슬라이드되는 동안 핀만 먼저 튀어 보였다.
  // animateTransform이 핀 엘리먼트에도 같은 트랜지션을 걸어 함께 움직이게 한 것으로 위 해결됨.

  // 매체 목록(추가·드래그 이동·데이터 로드)이나 프레임 크기(반응형 리사이즈)가 바뀌면
  // 현재 pan/zoom 기준으로 모든 핀 위치를 다시 계산한다.
  useLayoutEffect(() => {
    const { x, y, zoom: z } = panRef.current;
    positionPins(x, y, z);
    sizePinHits(z);
  }, [items, positionPins, sizePinHits]);

  // 배율이 바뀌면 핀 사이 실제 거리가 달라지므로 히트 영역도 다시 재 본다(이동만으로는 안 바뀜).
  useLayoutEffect(() => { sizePinHits(zoom); }, [zoom, sizePinHits]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const { x, y, zoom: z } = panRef.current;
      positionPins(x, y, z);
      sizePinHits(z); // 화면 폭이 바뀌면 핀 사이 픽셀 거리도 바뀐다
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [positionPins, sizePinHits]);

  // 휠 줌 — useEffect + ref로 등록해 stale closure를 피하고, preventDefault를 위해
  // React onWheel(수동 리스너) 대신 네이티브 addEventListener를 쓴다.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e) => {
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      const { x, y, zoom: z } = panRef.current;
      const nz = clamp(z * Math.exp(-e.deltaY * 0.0012), MIN_ZOOM, MAX_ZOOM);
      const contentX = (cx - x) / z, contentY = (cy - y) / z;
      const next = clampPan(cx - contentX * nz, cy - contentY * nz, nz, r);
      panRef.current = { ...next, zoom: nz };
      applyTransform();
      setZoom(nz);
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, []);

  const pointerToPct = (e) => {
    const r = wrapRef.current.getBoundingClientRect();
    const { w, h } = stageSize();
    const { x, y, zoom: z } = panRef.current;
    const px = ((e.clientX - r.left - x) / z / w) * 100;
    const py = ((e.clientY - r.top - y) / z / h) * 100;
    return { x: clamp(px, 1, 99), y: clamp(py, 1, 99) };
  };

  const panToPin = (item) => {
    const wrap = wrapRef.current;
    if (!wrap || !item) return;
    const r = wrap.getBoundingClientRect();
    const targetZoom = Math.max(panRef.current.zoom, 1.8);
    const next = clampPan(
      r.width / 2 - (item.x / 100) * r.width * targetZoom,
      r.height / 2 - (item.y / 100) * r.height * targetZoom,
      targetZoom,
      r
    );
    panRef.current = { ...next, zoom: targetZoom };
    animateTransform();
    setZoom(targetZoom);
  };

  useEffect(() => {
    if (selMedia) panToPin(items.find((o) => o.id === selMedia));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selMedia, focusTick]);

  // 데스크톱(휠+드래그)과 모바일(핀치+드래그) 모두 지원 — Pointer Events로 손가락 2개를 추적한다.
  const onWrapPointerDown = (e) => {
    if (e.target.closest('.pin')) return; // 핀 위에서 시작한 드래그는 핀 자체가 처리
    wrapRef.current.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      const r = wrapRef.current.getBoundingClientRect();
      pinchRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: panRef.current.zoom,
        midX: (a.x + b.x) / 2 - r.left,
        midY: (a.y + b.y) / 2 - r.top,
        panX: panRef.current.x,
        panY: panRef.current.y,
      };
      panDragRef.current = null;
    } else if (pointersRef.current.size === 1) {
      panDragRef.current = { sx: e.clientX, sy: e.clientY, moved: false, ...panRef.current };
    }
  };
  const onWrapPointerMove = (e) => {
    if (dragPinRef.current) {
      const p = pointerToPct(e);
      onMoveLocal(dragPinRef.current, +p.x.toFixed(2), +p.y.toFixed(2));
      return;
    }
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const p = pinchRef.current;
      const r = wrapRef.current.getBoundingClientRect();
      const nz = clamp(p.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / p.dist), MIN_ZOOM, MAX_ZOOM);
      const scaleBefore = p.zoom, scaleAfter = nz;
      const contentX = (p.midX - p.panX) / scaleBefore, contentY = (p.midY - p.panY) / scaleBefore;
      const next = clampPan(p.midX - contentX * scaleAfter, p.midY - contentY * scaleAfter, nz, r);
      panRef.current = { ...next, zoom: nz };
      applyTransform();
      setZoom(nz);
      return;
    }
    if (panDragRef.current) {
      const { sx, sy, x, y, zoom: z } = panDragRef.current;
      if (Math.abs(e.clientX - sx) > CLICK_SLOP || Math.abs(e.clientY - sy) > CLICK_SLOP) panDragRef.current.moved = true;
      const r = wrapRef.current.getBoundingClientRect();
      const next = clampPan(x + (e.clientX - sx), y + (e.clientY - sy), z, r);
      panRef.current = { ...next, zoom: z };
      applyTransform();
    }
  };
  const onWrapPointerUp = (e) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (dragPinRef.current) {
      const id = dragPinRef.current;
      dragPinRef.current = null;
      const p = pointerToPct(e);
      onMoveCommit(id, +p.x.toFixed(2), +p.y.toFixed(2));
      return;
    }
    if (panDragRef.current) {
      const wasClick = !panDragRef.current.moved;
      panDragRef.current = null;
      if (wasClick && addMode) {
        // 화면(client) 좌표가 아니라 문서(page) 좌표로 잡는다 — position:fixed + client 좌표는
        // 화면에 붙어 있어서, 페이지를 스크롤하면 팝업만 따라오고 정작 누른 지도 위치에서
        // 떨어져 나갔다. 문서 좌표 + position:absolute면 지도와 같이 움직인다.
        setAddAt({ ...pointerToPct(e), pageX: e.pageX, pageY: e.pageY });
        setAddMode(false);
      } else if (wasClick && selMedia) {
        // 빈 지도를 누르면 선택을 푼다 — 강조된 핀을 끄는 방법이 없어서, 목록에서 지도로
        // 한 번 건너오면 그 표시가 계속 남아 있었다. 핀 위에서 시작한 포인터는 위쪽
        // onWrapPointerDown에서 걸러지므로(panDrag가 안 잡힌다) 핀을 눌러 선택하는 것과
        // 부딪히지 않고, 끌어서 지도를 옮긴 경우도 moved 판정으로 빠진다.
        onClearSelection();
      }
    }
  };

  const tog = (k) => setTypeFilter((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const zoneLabel = (z) => ZONES[z]?.label || z;

  return (
    <div className="mapcard" ref={cardRef}>
      <div className="maphead">
        <div className="mtitle"><b>구역 배치도</b></div>
        <div className="mtools">
          <div className="dd">
            <button className="btn" onClick={() => setOpen((v) => !v)}>매체 유형 {typeFilter.size === types.length ? '전체' : typeFilter.size} ▾</button>
            {open && (
              <div className="ddmenu" onMouseLeave={() => setOpen(false)}>
                <div className="ddtop"><button onClick={() => setTypeFilter(new Set(types.map((t) => t.code)))}>전체</button><button onClick={() => setTypeFilter(new Set())}>해제</button></div>
                {/* 보관한 유형에도 지도에 남아 있는 매체가 있을 수 있어, 목록에서 빼면 그 매체를
                    다시 보이게 할 방법이 없어진다 — 전체 유형을 보여주고 보관된 것만 표시한다. */}
                {types.map((t) => (
                  <label key={t.code}><input type="checkbox" checked={typeFilter.has(t.code)} onChange={() => tog(t.code)} /><i style={{ background: t.color }} />{t.label}{!t.active && <em className="sub" style={{ fontStyle: 'normal', marginLeft: 4 }}>(보관)</em>}</label>
                ))}
              </div>
            )}
          </div>
          {isEditor && (
            <label className="btn upload">
              배치도 업로드
              <input type="file" accept="image/*,.pdf,application/pdf" style={{ display: 'none' }} onChange={(e) => { if (e.target.files[0]) setCropFile(e.target.files[0]); e.target.value = ''; }} />
            </label>
          )}
          {isEditor && (
            <button className={'btn' + (editMode ? ' on' : '')} onClick={() => { setEditMode((v) => !v); setAddMode(false); }}>{editMode ? '위치 편집 중' : '위치 편집'}</button>
          )}
        </div>
      </div>

      <div
        className={'mapwrap' + (addMode ? ' addmode' : '')}
        /* 기본 높이는 지도 이미지에 딱 맞춘다 — 16:8로 못 박아 두면 3:1 지도를 올렸을 때
           아래에 빈 띠가 생긴 채로 시작하고, 사용자는 그걸 없애려고 매번 끌어야 한다. */
        style={mapH ? { height: mapH + 'px', aspectRatio: 'auto' } : { aspectRatio: String(mapAR) }}
        ref={wrapRef}
        onPointerDown={onWrapPointerDown}
        onPointerMove={onWrapPointerMove}
        onPointerUp={onWrapPointerUp}
        onPointerCancel={onWrapPointerUp}
      >
        {/* 추가 모드에 들어가도 바뀌는 건 멀리 있는 버튼 라벨뿐이라, 모바일에서는 지금이
            "위치를 고르는 중"인지 알기 어려웠다 — 지도 위에 직접 알려 준다.
            배너에서 시작된 포인터가 지도 클릭으로 이어지지 않게 전파를 막는다. */}
        {addMode && (
          <div className={'addhint' + (pinBump ? ' warn' : '')} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
            <span>{pinBump ? '이미 매체가 있는 자리입니다 — 핀이 겹치지 않게 조금 떨어진 곳을 눌러 주세요' : '새 매체를 놓을 위치를 눌러 주세요'}</span>
            <button onClick={() => setAddMode(false)}>취소</button>
          </div>
        )}
        <div className="mapstage" ref={stageRef} style={{ aspectRatio: String(mapAR), height: 'auto' }}>
          {mapImage ? (
            <img src={mapImage} alt="배치도" className="mapbg-img"
              onLoad={(e) => {
                const ar = e.currentTarget.naturalWidth / e.currentTarget.naturalHeight;
                if (ar && Math.abs(ar - mapAR) > 0.001) setMapAR(ar);
              }} />
          ) : (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mapbg">
              <rect x="0" y="0" width="100" height="100" fill="#D6D6D3" />
              {Object.entries(ZONES).map(([k, z]) => (
                <rect key={k} x={z.box[0]} y={z.box[1]} width={z.box[2]} height={z.box[3]} rx="1.2"
                  fill="#EBEBE8" stroke="#C7C7C3" strokeWidth="0.28" opacity={zoneFilter === 'ALL' || zoneFilter === k ? 1 : 0.32} />
              ))}
            </svg>
          )}
          {!mapImage && Object.entries(ZONES).map(([k, z]) => (
            <span key={k} className="zonelbl" style={{ left: z.box[0] + z.box[2] / 2 + '%', top: z.box[1] + 1.4 + '%', opacity: zoneFilter === 'ALL' || zoneFilter === k ? 1 : 0.3 }}>{z.label}</span>
          ))}
        </div>
        <div className="pin-layer">
          {items.map((o) => {
            const t = T[o.type]; if (!t) return null;
            // 'empty'가 아니라 'vacant'를 쓴다 — 전역 .empty{padding:18px...}(빈 목록 안내문구용)와
            // 클래스명이 충돌해 핀 버튼이 56px까지 부풀어 오르며 위치 앵커(-50%,-56%)가 어긋나던 버그였다.
            const tone = o.overdue ? 'stale' : o.isEmpty ? 'vacant' : 'full';
            return (
              <button key={o.id}
                ref={(el) => { if (el) pinRefs.current[o.id] = el; else delete pinRefs.current[o.id]; }}
                className={'pin ' + tone + (selMedia === o.id ? ' sel' : '') + (editMode ? ' editable' : '') + (zoom >= 1.5 ? ' zoomed' : '')}
                onPointerDown={(e) => {
                  if (!editMode) return;
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  dragPinRef.current = o.id;
                }}
                onClick={() => { if (addMode) { showBump(); return; } if (!editMode) onOpenMedia(o.id); }} onMouseEnter={() => setHover(o.id)} onMouseLeave={() => setHover(null)}>
                <div className="pin-inner">
                  <span className="pdot">{t.glyph}</span>
                  {/* 확대해서 보고 있으면 매체명을 핀 위에 그대로 띄운다 — 핀에 들어가는 건
                      유형 약자(D·FW) 한두 글자뿐이라, 어느 자리인지는 하나씩 올려 봐야 알았다.
                      호버·선택 중에는 아래 라벨이 이미 이름을 보여주므로 겹쳐 띄우지 않는다. */}
                  {zoom >= 1.5 && hover !== o.id && selMedia !== o.id && (
                    <span className="pname">{o.name}</span>
                  )}
                  {(hover === o.id || selMedia === o.id) && (
                    <span className={'plabel' + (o.y > 55 ? ' up' : '')}>
                      {/* 지금 걸려 있는 시안. 여러 면이면 면마다 한 장씩(너무 길어지지 않게 6장까지). */}
                      {(() => {
                        const shots = o.slots
                          .map((s) => ({ s, url: thumbs.get((s.overdue || s.current)?.thumbPath) }))
                          .filter((x) => x.url);
                        if (!shots.length) return null;
                        return (
                          <span className="pshots">
                            {shots.slice(0, 6).map(({ s, url }) => (
                              <img key={s.face} src={url} alt="" title={o.faces > 1 ? s.faceLabel : o.name} />
                            ))}
                            {shots.length > 6 && <em>+{shots.length - 6}</em>}
                          </span>
                        );
                      })()}
                      {o.name}
                      {/* 면이 여러 개면 값 하나로는 "일부만 비었다" 같은 걸 담을 수 없어서
                          (o.overdue/o.live 등은 여러 면 중 가장 급한 것의 대표값이다),
                          면별로 한 줄씩 정확히 보여준다. 단일 면은 지금까지와 동일하다. */}
                      {o.faces > 1 ? (
                        o.slots.map((s) => (
                          <i key={s.face}>{s.faceLabel} {s.overdue ? '만료 +' + s.overdueDays + '일' : s.open ? '게시중' : s.live ? 'D-' + s.dToRemove : '비어있음'}</i>
                        ))
                      ) : (
                        <i>{o.overdue ? '만료 +' + o.overdueDays + '일' : o.open ? '게시중' : o.live ? 'D-' + o.dToRemove : '비어있음'}</i>
                      )}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {addAt && createPortal(
        <AddMediaPopover
          types={active} at={addAt} allMedia={allMedia}
          archived={allMedia.filter((m) => !m.active)} zoneLabel={zoneLabel}
          onCancel={() => setAddAt(null)}
          onSubmit={(payload) => {
            if (payload.mode === 'existing') onRestoreAt(payload.id, addAt.x, addAt.y);
            else onCreate(payload, addAt.x, addAt.y);
            setAddAt(null);
          }}
        />,
        document.body
      )}

      {/* 지도 아래 손잡이 — 끌어서 높이 조절, 두 번 누르면 기본값으로 되돌린다. */}
      <div className="mapgrab" onPointerDown={onGrabDown} onPointerMove={onGrabMove}
        onPointerUp={onGrabUp} onPointerCancel={onGrabUp}
        onDoubleClick={() => saveMapH(0)}
        title="끌어서 지도 높이 조절 · 두 번 누르면 기본 높이">
        <i />
        {mapH > 0 && <button className="mapgrab-reset" onPointerDown={(e) => e.stopPropagation()} onClick={() => saveMapH(0)}>기본 높이로</button>}
      </div>

      <div className="legend">
        <span><i className="lg full" />정상</span><span><i className="lg stale" />만료</span><span><i className="lg vacant" />비어있음</span>
        <span className="legend-sum">
          {summary.count === 0 ? '보이는 매체 없음' : (
            <>
              <b>{summary.count}개</b> · <b>{summary.faces}면</b>
              {summary.per.length > 1 && (
                <em>{summary.per.map((x) => `${T[x.code]?.label || x.code} ${x.count}개·${x.faces}면`).join(' / ')}</em>
              )}
            </>
          )}
        </span>
      </div>

      {cropFile && (
        <MapCropModal
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={(blob) => { setCropFile(null); onMapImage(blob); }}
        />
      )}
    </div>
  );
}

function AddMediaPopover({ types, at, archived, zoneLabel, onCancel, onSubmit, allMedia }) {
  const [source, setSource] = useState('new'); // 'new' | 'existing' — 보관 중이던 매체를 이 자리로 옮겨 복구
  const [type, setType] = useState(types[0]?.code || '');
  const t = types.find((x) => x.code === type);
  const [name, setName] = useState('');
  // 면수를 빈 칸으로 시작하면 2면 유형(웨더워리어 등)을 추가할 때 깜빡 잊고 1을 넣기
  // 쉽다 — 그러면 그 매체만 조용히 1면짜리가 돼서, 나중에 배치할 때 면 선택이 아예 안
  // 뜨는 걸 보고서야 알아챈다. 유형의 기본 면수로 미리 채워 두고, 필요하면 고치게 한다.
  const [faces, setFaces] = useState(types[0]?.faces || 1);
  const archivedOfType = archived.filter((m) => m.type === type);
  const [existingId, setExistingId] = useState(archivedOfType[0]?.id || '');

  useEffect(() => {
    const list = archived.filter((m) => m.type === type);
    setExistingId(list[0]?.id || '');
    setFaces(types.find((x) => x.code === type)?.faces || 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // 이미 쓰는 이름이면 누르기 전에 알려 준다 — 눌러 봐야 토스트로 튕기면 왜 안 되는지
  // 알기 어렵고, 이름을 다시 지어야 한다는 것도 그때야 알게 된다.
  const dup = !!name.trim() && nameTaken(allMedia || [], name);
  const submit = () => {
    if (source === 'existing') { if (existingId) onSubmit({ mode: 'existing', id: existingId }); }
    else if (name && faces && !dup) onSubmit({ mode: 'new', type, name, faces: +faces });
  };

  return (
    <div className="addpop" style={{ '--ax': at.pageX + 'px', '--ay': at.pageY + 'px' }} onClick={(e) => e.stopPropagation()}>
      <b>새 매체 추가</b>
      <select className="sel" value={type} onChange={(e) => setType(e.target.value)}>
        {types.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
      </select>
      <div className="seg">
        <button className={source === 'new' ? 'on' : ''} onClick={() => setSource('new')}>새로 만들기</button>
        <button className={source === 'existing' ? 'on' : ''} onClick={() => setSource('existing')}>보관함에서</button>
      </div>
      {source === 'new' ? (
        <>
          <input className={'inp' + (dup ? ' bad' : '')} value={name} onChange={(e) => setName(e.target.value)} placeholder="매체명을 입력해주세요" />
          {dup && <p className="sub" style={{ color: '#A74D46', margin: 0 }}>이미 있는 매체명입니다</p>}
          <input className="inp" type="number" min="1" value={faces} onChange={(e) => setFaces(e.target.value)} placeholder="면수를 입력해주세요" />
        </>
      ) : archivedOfType.length > 0 ? (
        <select className="sel" value={existingId} onChange={(e) => setExistingId(e.target.value)}>
          {archivedOfType.map((m) => <option key={m.id} value={m.id}>{m.name} · {zoneLabel(m.zone)}</option>)}
        </select>
      ) : (
        <p className="sub" style={{ padding: '4px 0' }}>보관해 둔 {t?.label}이(가) 없습니다.</p>
      )}
      <div className="addpop-btns">
        <button className="mini" onClick={onCancel}>취소</button>
        <button className="mini ok" disabled={source === 'new' ? (!name || !faces || dup) : !existingId} onClick={submit}>{source === 'existing' ? '이 자리로 복구' : '추가'}</button>
      </div>
    </div>
  );
}
