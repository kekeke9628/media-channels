import React, { useState, useMemo, useEffect } from 'react';
import { ALERT_DAYS, LONG_OPEN, getToday } from './constants.js';
import { autoClose, buildState } from './lib/status.js';
import { uploadCenterMap, getCenterMapUrl } from './lib/centerMap.js';
import { fetchMediaTypes, fetchMedia, fetchPostings, updateMediaPosition, createMedia, archiveMedia, restoreMedia, deleteMedia, createPosting, markPostingRemoved, undoPostingRemoval, adjustPostingEnd } from './lib/queries.js';
import { zoneAt } from './data/seed.js';
import { useAuth } from './lib/useAuth.js';

import Login from './components/Login.jsx';
import Unauthorized from './components/Unauthorized.jsx';
import MapPanel from './components/MapPanel.jsx';
import PostsPanel from './components/PostsPanel.jsx';
import StatusPanel from './components/StatusPanel.jsx';
import GalleryPanel from './components/GalleryPanel.jsx';
import TimelinePanel from './components/TimelinePanel.jsx';
import ManagePanel from './components/ManagePanel.jsx';
import AlertPanel from './components/AlertPanel.jsx';
import AdminsPanel from './components/AdminsPanel.jsx';
import MediaSheet from './components/MediaSheet.jsx';
import AddModal from './components/AddModal.jsx';

const TABS = { posts: '홍보물 관리', status: '매체 현황', gallery: '게시물', timeline: '타임라인', manage: '매체 관리', alert: '알람 예정', admins: '관리자 관리' };
const EDITOR_ONLY_TABS = new Set(['admins']);

export default function App() {
  const { session, admin, loading, authError, isEditor, signOut } = useAuth();

  if (loading) {
    return (
      <div className="authwrap">
        <div className="authcard"><div className="bmark">YPO</div><p className="sub">불러오는 중…</p></div>
      </div>
    );
  }
  if (!session) return <Login initialError={authError} />;
  if (!admin) return <Unauthorized email={session.user.email} onSignOut={signOut} />;

  return <AppShell admin={admin} isEditor={isEditor} meId={session.user.id} onSignOut={signOut} />;
}

function AppShell({ admin, isEditor, meId, onSignOut }) {
  const [refDate, setRefDate] = useState(getToday());
  const [types, setTypes] = useState([]);
  const [media, setMedia] = useState([]);
  const [postings, setPostings] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [tab, setTab] = useState('posts');
  const [selMedia, setSelMedia] = useState(null);
  const [typeFilter, setTypeFilter] = useState(new Set());
  const [zoneFilter, setZoneFilter] = useState('ALL');
  const [toast, setToast] = useState('');
  const [narrow, setNarrow] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [mapImage, setMapImage] = useState(null);

  useEffect(() => {
    getCenterMapUrl().then((url) => url && setMapImage(url));
  }, []);

  useEffect(() => {
    Promise.all([fetchMediaTypes(), fetchMedia(), fetchPostings()]).then(([t, m, p]) => {
      setTypes(t);
      setTypeFilter(new Set(t.map((x) => x.code)));
      setMedia(m);
      setPostings(p);
      setDataLoading(false);
    });
  }, []);

  useEffect(() => {
    const on = () => setNarrow(window.innerWidth <= 980);
    on(); window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const T = useMemo(() => Object.fromEntries(types.map((t) => [t.code, t])), [types]);
  const state = useMemo(() => buildState(media, autoClose(postings, refDate), refDate), [media, postings, refDate]);
  const byId = useMemo(() => Object.fromEntries(state.map((o) => [o.id, o])), [state]);

  const visible = useMemo(
    () => state.filter((o) => typeFilter.has(o.type) && (zoneFilter === 'ALL' || o.zone === zoneFilter)),
    [state, typeFilter, zoneFilter]
  );

  const kpi = useMemo(() => {
    const live = state.filter((o) => o.live).length;
    const open = state.filter((o) => o.open).length;
    const stale = state.filter((o) => o.overdue).length;
    const longOpen = state.filter((o) => o.open && o.openDays >= LONG_OPEN).length;
    const week = state.filter((o) => o.live && o.dToRemove >= 0 && o.dToRemove <= 7).length;
    return { total: state.length, live, open, stale, longOpen, week };
  }, [state]);

  const alerts = useMemo(() => ({
    soon: state.filter((o) => o.live && o.dToRemove >= 0 && o.dToRemove <= ALERT_DAYS).sort((a, b) => a.dToRemove - b.dToRemove),
    stale: state.filter((o) => o.overdue).sort((a, b) => b.overdueDays - a.overdueDays),
  }), [state]);

  // 지도 드래그 중 실시간 시각 피드백(로컬만, 서버 호출 없음)
  const moveMediaLocal = (id, x, y) => {
    setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, x, y } : m)));
  };
  // 드롭 시 즉시 커밋 — 낱개 매체는 가벼운 마커라 별도 저장 확인 단계 없이 바로 반영한다.
  const moveMediaCommit = async (id, x, y) => {
    const zone = zoneAt(x, y);
    setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, x, y, zone } : m)));
    try {
      await updateMediaPosition(id, x, y, zone);
    } catch (e) {
      flash('위치 저장에 실패했습니다: ' + e.message);
    }
  };
  const addMediaAt = async ({ type, name, faces }, x, y) => {
    const zone = zoneAt(x, y);
    const id = 'M' + Date.now().toString(36).toUpperCase();
    try {
      const created = await createMedia({ id, type, name, faces, spec: '', x, y, zone });
      setMedia((prev) => [...prev, created]);
      flash('매체를 추가했습니다.');
    } catch (e) {
      flash('매체 추가에 실패했습니다: ' + e.message);
    }
  };

  const markRemoved = async (id) => {
    try {
      await markPostingRemoved(id, refDate);
      setPostings((prev) => prev.map((p) => (p.id === id ? { ...p, removedAt: refDate, removalSource: 'manual' } : p)));
      flash('철거 완료로 기록했습니다.');
    } catch (e) { flash('처리에 실패했습니다: ' + e.message); }
  };
  const undoRemoved = async (id) => {
    try {
      await undoPostingRemoval(id);
      setPostings((prev) => prev.map((p) => (p.id === id ? { ...p, removedAt: null, removalSource: null } : p)));
      flash('철거 기록을 취소했습니다.');
    } catch (e) { flash('처리에 실패했습니다: ' + e.message); }
  };
  // silent: 일괄 등록에서 N건을 등록할 때 매번 토스트가 뜨는 걸 막고, 호출 쪽에서 한 번만 요약해서 보여준다.
  const addPosting = async (p, { silent } = {}) => {
    try {
      const created = await createPosting(p);
      setPostings((prev) => [...prev, created]);
      if (!silent) flash('게시물을 등록했습니다.');
      return true;
    } catch (e) { if (!silent) flash('게시물 등록에 실패했습니다: ' + e.message); return false; }
  };
  // 겹침 조정(기존 게시물 철거일 단축)은 새 게시물을 넣기 전에 반드시 먼저 커밋돼야 한다 —
  // DB에 겹치는 기간을 막는 exclusion 제약이 있어, 순서가 뒤바뀌면 새 게시물 삽입이 거부된다.
  const adjustEnd = async (id, newEnd) => {
    try {
      await adjustPostingEnd(id, newEnd);
      setPostings((prev) => prev.map((p) => (p.id === id ? { ...p, end: newEnd } : p)));
      return true;
    } catch (e) { flash('철거 예정일 조정에 실패했습니다: ' + e.message); return false; }
  };

  const addType = (t) => { setTypes((prev) => [...prev, t]); flash('매체 유형을 추가했습니다.'); };
  const toggleType = (code) => setTypes((prev) => prev.map((t) => (t.code === code ? { ...t, active: !t.active } : t)));
  const editType = (code, patch) => { setTypes((prev) => prev.map((t) => (t.code === code ? { ...t, ...patch } : t))); flash('매체 유형을 수정했습니다.'); };

  const removeMedia = async (id) => {
    const used = postings.some((p) => p.mediaId === id);
    try {
      if (used) {
        await archiveMedia(id);
        setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, active: false } : m)));
        flash('게시 이력이 있어 보관 처리했습니다.');
      } else {
        await deleteMedia(id);
        setMedia((prev) => prev.filter((m) => m.id !== id));
        flash('매체를 삭제했습니다.');
      }
      setSelMedia(null);
    } catch (e) {
      flash('처리에 실패했습니다: ' + e.message);
    }
  };
  const restoreMediaItem = async (id) => {
    try {
      await restoreMedia(id);
      setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, active: true } : m)));
      flash('보관을 해제했습니다.');
    } catch (e) {
      flash('복구에 실패했습니다: ' + e.message);
    }
  };

  // MapCropModal이 PDF/이미지에서 팬·줌으로 고른 2:1 영역을 이미 1600×800 PNG blob으로 넘겨준다.
  const saveMapImage = async (blob) => {
    try {
      await uploadCenterMap(blob);
      setMapImage(await getCenterMapUrl());
      flash('배치도 이미지를 적용했습니다.');
    } catch (e) {
      flash('배치도 업로드에 실패했습니다: ' + e.message);
    }
  };

  const ctx = { T, types, refDate, isEditor };
  const tabEntries = Object.entries(TABS).filter(([k]) => isEditor || !EDITOR_ONLY_TABS.has(k));

  if (dataLoading) {
    return (
      <div className="authwrap">
        <div className="authcard"><div className="bmark">YPO</div><p className="sub">데이터 불러오는 중…</p></div>
      </div>
    );
  }

  return (
    <div className={'app' + (narrow ? ' narrow' : '')}>
      <aside className="side">
        <div className="brand">
          <div className="bmark">YPO</div>
          <div><b>점내 홍보매체</b><span>여주 프리미엄 아울렛</span></div>
        </div>
        <div className="sidekpi">
          <div className="skv"><em>게시중</em><b>{kpi.live + kpi.open}<i>/{kpi.total}</i></b></div>
          <div className="skv bad"><em>만료</em><b>{kpi.stale}</b></div>
        </div>
        <nav>
          {tabEntries.map(([k, v]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {v}{k === 'posts' && kpi.stale > 0 && <em className="red">{kpi.stale}</em>}
            </button>
          ))}
        </nav>
        {isEditor && <button className="btn primary wide" onClick={() => setAddOpen(true)}>+ 게시물 등록</button>}
        <label className="reffield">기준일<input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} /></label>
        <div className="sidefoot">
          {admin.name || admin.email} · {isEditor ? '편집자' : '조회자'}
          <button className="signout" onClick={onSignOut}>로그아웃</button>
        </div>
      </aside>

      <main>
        <MapPanel
          {...ctx} items={visible} zoneFilter={zoneFilter} setZoneFilter={setZoneFilter}
          typeFilter={typeFilter} setTypeFilter={setTypeFilter}
          selMedia={selMedia} setSelMedia={setSelMedia}
          onMoveLocal={moveMediaLocal} onMoveCommit={moveMediaCommit} onCreate={addMediaAt}
          mapImage={mapImage} onMapImage={saveMapImage}
        />

        <div className="tabs">
          {tabEntries.map(([k, v]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{v}{k === 'posts' && kpi.stale > 0 && <em>{kpi.stale}</em>}</button>
          ))}
        </div>

        <div className="panel">
          {tab === 'posts' && <PostsPanel {...ctx} state={state} postings={postings} media={media} onRemove={markRemoved} onUndo={undoRemoved} onPick={setSelMedia} />}
          {tab === 'status' && <StatusPanel {...ctx} state={visible} postings={postings} media={media} onPick={setSelMedia} />}
          {tab === 'gallery' && <GalleryPanel {...ctx} postings={postings} media={media} onPick={setSelMedia} />}
          {tab === 'timeline' && <TimelinePanel {...ctx} state={state} onPick={setSelMedia} />}
          {tab === 'manage' && (
            <ManagePanel {...ctx} media={media} postings={postings}
              onAddType={addType} onToggleType={toggleType} onEditType={editType}
              onRemoveMedia={removeMedia} onRestoreMedia={restoreMediaItem} />
          )}
          {tab === 'alert' && <AlertPanel alerts={alerts} kpi={kpi} />}
          {tab === 'admins' && isEditor && <AdminsPanel meId={meId} />}
        </div>
      </main>

      {selMedia && byId[selMedia] && (
        <MediaSheet {...ctx} o={byId[selMedia]} onClose={() => setSelMedia(null)} onRemove={markRemoved} onDelete={removeMedia} />
      )}
      {addOpen && isEditor && (
        <AddModal
          {...ctx} media={media} postings={postings} onClose={() => setAddOpen(false)}
          onAdd={addPosting} onAdjustEnd={adjustEnd}
          onDone={(ok, failed) => flash(`${ok}건 등록 완료${failed ? ` · ${failed}건 실패` : ''}`)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
