import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { clamp } from '../constants.js';
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
// 모바일 지도 박스를 배치도 원본 비율(2:1)에 맞추면서 화면 폭 전체를 그대로 보여주게 됐는데,
// 그만큼 예전(잘못 잘려서 확대돼 보이던 상태)보다 글자가 작아 보인다 — 시작할 때 이 배율로
// 살짝 당겨서 예전과 비슷한 크기로 보여주고, 양옆까지 보고 싶으면 손가락으로 줌아웃(1배까지)하면 된다.
const DEFAULT_NARROW_ZOOM = 1.5;

export default function MapPanel({ T, types, items, allMedia, zoneFilter, setZoneFilter, typeFilter, setTypeFilter, selMedia, setSelMedia, editMode, setEditMode, addMode, setAddMode, onMoveLocal, onMoveCommit, onCreate, onRestoreAt, mapImage, onMapImage, isEditor, narrow }) {
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
  const [open, setOpen] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const active = types.filter((t) => t.active);

  const clampPan = (x, y, z, r) => {
    const w = r.width * z, h = r.height * z;
    return { x: clamp(x, r.width - w, 0), y: clamp(y, r.height - h, 0) };
  };

  // 각 핀을 현재 pan/zoom 기준 픽셀 좌표로 옮긴다. -50%,-56%는 기존 .pin CSS의 앵커 오프셋과 동일.
  const positionPins = useCallback((px, py, pz) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    itemsRef.current.forEach((o) => {
      const el = pinRefs.current[o.id];
      if (!el) return;
      const x = px + (o.x / 100) * r.width * pz;
      const y = py + (o.y / 100) * r.height * pz;
      el.style.transform = `translate(${x}px,${y}px) translate(-50%,-56%)`;
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
  }, [items, positionPins]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const { x, y, zoom: z } = panRef.current;
      positionPins(x, y, z);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [positionPins]);

  // 모바일에서 처음 열렸을 때 한 번만 기본 확대를 걸어 둔다 — narrow가 리사이즈로 나중에
  // true가 될 수도 있어 마운트 시점이 아니라 narrow가 true가 되는 첫 순간에 건다. 이후
  // 사용자가 직접 줌을 조작해도 이 효과가 다시 끼어들지 않도록 한 번 걸리면 끈다.
  const narrowZoomedRef = useRef(false);
  useLayoutEffect(() => {
    if (!narrow || narrowZoomedRef.current) return;
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    narrowZoomedRef.current = true;
    const z = DEFAULT_NARROW_ZOOM;
    const next = clampPan(r.width * (1 - z) / 2, r.height * (1 - z) / 2, z, r);
    panRef.current = { ...next, zoom: z };
    applyTransform();
    setZoom(z);
  }, [narrow]);

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
    const { x, y, zoom: z } = panRef.current;
    const px = ((e.clientX - r.left - x) / z / r.width) * 100;
    const py = ((e.clientY - r.top - y) / z / r.height) * 100;
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
  }, [selMedia]);

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
        setAddAt({ ...pointerToPct(e), clientX: e.clientX, clientY: e.clientY });
        setAddMode(false);
      }
    }
  };

  const tog = (k) => setTypeFilter((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const zoneLabel = (z) => ZONES[z]?.label || z;

  return (
    <div className="mapcard">
      <div className="maphead">
        <div className="mtitle"><b>구역 배치도</b></div>
        <div className="mtools">
          <div className="dd">
            <button className="btn" onClick={() => setOpen((v) => !v)}>매체 유형 {typeFilter.size === active.length ? '전체' : typeFilter.size} ▾</button>
            {open && (
              <div className="ddmenu" onMouseLeave={() => setOpen(false)}>
                <div className="ddtop"><button onClick={() => setTypeFilter(new Set(active.map((t) => t.code)))}>전체</button><button onClick={() => setTypeFilter(new Set())}>해제</button></div>
                {active.map((t) => (
                  <label key={t.code}><input type="checkbox" checked={typeFilter.has(t.code)} onChange={() => tog(t.code)} /><i style={{ background: t.color }} />{t.label}</label>
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
          <div className="addhint" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
            <span>새 매체를 놓을 위치를 눌러 주세요</span>
            <button onClick={() => setAddMode(false)}>취소</button>
          </div>
        )}
        <div className="mapstage" ref={stageRef}>
          {mapImage ? (
            <img src={mapImage} alt="배치도" className="mapbg-img" />
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
                onClick={() => !editMode && !addMode && setSelMedia(o.id)} onMouseEnter={() => setHover(o.id)} onMouseLeave={() => setHover(null)}>
                <div className="pin-inner">
                  <span className="pdot">{t.glyph}</span>
                  {(hover === o.id || selMedia === o.id) && (
                    <span className="plabel">
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
          types={active} at={addAt}
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

      <div className="legend">
        <span><i className="lg full" />정상</span><span><i className="lg stale" />만료</span><span><i className="lg vacant" />비어있음</span>
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

function AddMediaPopover({ types, at, archived, zoneLabel, onCancel, onSubmit }) {
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

  const submit = () => {
    if (source === 'existing') { if (existingId) onSubmit({ mode: 'existing', id: existingId }); }
    else if (name && faces) onSubmit({ mode: 'new', type, name, faces: +faces });
  };

  return (
    <div className="addpop" style={{ '--ax': at.clientX + 'px', '--ay': at.clientY + 'px' }} onClick={(e) => e.stopPropagation()}>
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
          <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="매체명을 입력해주세요" />
          <input className="inp" type="number" min="1" max="6" value={faces} onChange={(e) => setFaces(e.target.value)} placeholder="면수를 입력해주세요" />
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
        <button className="mini ok" disabled={source === 'new' ? (!name || !faces) : !existingId} onClick={submit}>{source === 'existing' ? '이 자리로 복구' : '추가'}</button>
      </div>
    </div>
  );
}
