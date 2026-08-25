import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ALERT_DAYS, LONG_OPEN, getToday } from './constants.js';
import { autoClose, buildState, flattenSlots } from './lib/status.js';
import { uploadCenterMap, getCenterMapUrl } from './lib/centerMap.js';
import {
  fetchMediaTypes, fetchMedia, fetchPostings, fetchPlacements, updateMediaPosition, updateMediaFaces, createMedia,
  archiveMedia, restoreMedia, restoreMediaAt, deleteMedia, createPosting, deletePosting,
  createPlacement, deletePlacement, markPlacementRemoved, undoPlacementRemoval, adjustPlacementEnd, setPostingImage,
  setPlacementInstallPhoto, variantFor, addPostingVariant,
  createMediaType, updateMediaType, setMediaTypeActive, deleteMediaType, countMediaTypeUsage, updateMediaName,
} from './lib/queries.js';
import { zoneAt } from './data/seed.js';
import { useCodeFilter } from './lib/useCodeFilter.js';
import { useAuth, OWNER_EMAIL, resetAdminPassword } from './lib/useAuth.js';

import Login from './components/Login.jsx';
import SetPassword from './components/SetPassword.jsx';
import AdminReset from './components/AdminReset.jsx';
import Unauthorized from './components/Unauthorized.jsx';
import MapPanel from './components/MapPanel.jsx';
import PostsPanel from './components/PostsPanel.jsx';
import PromosPanel from './components/PromosPanel.jsx';
import TimelinePanel from './components/TimelinePanel.jsx';
import ManagePanel from './components/ManagePanel.jsx';
import AlertPanel from './components/AlertPanel.jsx';
import AdminsPanel from './components/AdminsPanel.jsx';
import MediaSheet from './components/MediaSheet.jsx';
import AddModal from './components/AddModal.jsx';
import AssignModal from './components/AssignModal.jsx';
import PlaceOnMediaModal from './components/PlaceOnMediaModal.jsx';
import AddVariantModal from './components/AddVariantModal.jsx';

const TABS = { posts: '매체 현황', promos: '홍보물', timeline: '타임라인', manage: '매체 관리', alert: '알람 예정', admins: '관리자 관리' };
const EDITOR_ONLY_TABS = new Set(['alert', 'admins']);

export default function App() {
  const { session, admin, loading, authError, isEditor, signOut, updatePassword } = useAuth();

  if (loading) {
    return (
      <div className="authwrap">
        <div className="authcard"><div className="bmark">YPO</div><p className="sub">불러오는 중…</p></div>
      </div>
    );
  }
  if (!session) return <Login initialError={authError} />;
  if (!admin) return <Unauthorized email={session.user.email} onSignOut={signOut} />;

  return (
    <AppShell
      admin={admin} isEditor={isEditor} meId={session.user.id} onSignOut={signOut}
      email={session.user.email} accessToken={session.access_token} updatePassword={updatePassword}
    />
  );
}

function AppShell({ admin, isEditor, meId, onSignOut, email, accessToken, updatePassword }) {
  const [refDate, setRefDate] = useState(getToday());
  const [types, setTypes] = useState([]);
  // 유형 목록이 바뀌면(추가·삭제) 지도의 유형 필터도 같이 맞춘다 — 안 맞으면 개수가
  // 틀리게 나오거나, 새로 만든 유형의 매체가 지도에서 안 보인다.
  const [typeFilter, setTypeFilter] = useCodeFilter(types.map((t) => t.code));
  const [media, setMedia] = useState([]);
  // postings = 홍보물(브랜드·내용·이미지, 매체와 무관) / placements = 배치(홍보물이 얹혀
  // 평탄화된 것, 매체별 현재 상태·타임라인·이력 화면이 예전 postings와 같은 모양으로 쓴다).
  const [postings, setPostings] = useState([]);
  const [placements, setPlacements] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [tab, setTab] = useState('posts');
  const [selMedia, setSelMedia] = useState(null);
  const [zoneFilter, setZoneFilter] = useState('ALL');
  const [toast, setToast] = useState(null); // { msg, undo? }
  const [narrow, setNarrow] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addMediaId, setAddMediaId] = useState(null);
  const [addFace, setAddFace] = useState(null);
  const [placingMediaId, setPlacingMediaId] = useState(null);
  const [placingFace, setPlacingFace] = useState(null);
  const [assigningId, setAssigningId] = useState(null);
  // "다시 걸기" — 지난 배치와 같은 매체·면을 미리 채운 채로 배치 화면을 연다. 매달 같은
  // 업체를 같은 자리에 다시 거는 일이 잦은데, 지금까지는 매번 목록에서 매체를 다시 찾아야 했다.
  const [assignPreset, setAssignPreset] = useState(null); // { mediaId, face }
  const [variantFor_, setVariantFor_] = useState(null); // 규격 추가 대상 홍보물
  const [editMode, setEditMode] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [mapImage, setMapImage] = useState(null);
  const [changePwOpen, setChangePwOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    getCenterMapUrl().then((url) => url && setMapImage(url));
  }, []);

  useEffect(() => {
    Promise.all([fetchMediaTypes(), fetchMedia(), fetchPostings(), fetchPlacements()]).then(([t, m, p, pl]) => {
      setTypes(t);
      setMedia(m);
      setPostings(p);
      setPlacements(pl);
      setDataLoading(false);
    });
  }, []);

  useEffect(() => {
    const on = () => setNarrow(window.innerWidth <= 980);
    on(); window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  // undo를 넘기면 토스트에 "되돌리기" 버튼이 붙고, 누를 시간을 주려고 더 오래 떠 있는다.
  // 철거처럼 되돌리는 경로가 화면에 없던 동작에 실행취소를 주기 위한 것.
  // 타이머를 ref로 잡아 두고 매번 취소한다 — 그러지 않으면 연달아 동작했을 때 앞선
  // 토스트의 타이머가 방금 띄운 토스트를 지워 버려 결과가 안 보였다(보관→복구에서 발생).
  const toastTimer = useRef(null);
  const flash = (m, undo) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg: m, undo });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 7000 : 2500);
  };

  const T = useMemo(() => Object.fromEntries(types.map((t) => [t.code, t])), [types]);
  // state = 매체 단위(지도 핀·상세시트가 씀, 매체당 항목 1개 · .slots에 면별 detail).
  // slots = 면(face) 단위로 펼친 것(매체 현황·타임라인·알람이 씀 — 2면 매체는 항목 2개).
  // 진짜 재고 단위는 매체가 아니라 면이라, 카운트·알람도 면 기준이 맞다 — 웨더워리어처럼
  // 2면인 매체는 앞/뒤가 서로 다른 광고주로 독립적으로 걸릴 수 있기 때문이다.
  // 캠페인에 규격이 여러 벌 있어도, 웨더워리어에 걸린 배치에 보여줄 것은 웨더워리어용
  // 인쇄 파일이다 — 어느 파일인지는 그 배치가 걸린 매체의 유형이 정한다.
  const placementsView = useMemo(() => {
    const typeOf = Object.fromEntries(media.map((m) => [m.id, m.type]));
    const postingById = Object.fromEntries(postings.map((p) => [p.id, p]));
    return placements.map((pl) => {
      const v = variantFor(postingById[pl.postingId], typeOf[pl.mediaId]);
      return v ? { ...pl, thumbPath: v.thumbPath, viewPath: v.viewPath } : pl;
    });
  }, [placements, media, postings]);

  const state = useMemo(() => buildState(media, autoClose(placementsView, refDate), refDate), [media, placementsView, refDate]);
  const slots = useMemo(() => flattenSlots(state), [state]);
  const byId = useMemo(() => Object.fromEntries(state.map((o) => [o.id, o])), [state]);

  const visible = useMemo(
    () => state.filter((o) => typeFilter.has(o.type) && (zoneFilter === 'ALL' || o.zone === zoneFilter)),
    [state, typeFilter, zoneFilter]
  );

  const kpi = useMemo(() => {
    const live = slots.filter((o) => o.live).length;
    const open = slots.filter((o) => o.open).length;
    const stale = slots.filter((o) => o.overdue).length;
    const longOpen = slots.filter((o) => o.open && o.openDays >= LONG_OPEN).length;
    const week = slots.filter((o) => o.live && o.dToRemove >= 0 && o.dToRemove <= 7).length;
    return { total: slots.length, live, open, stale, longOpen, week };
  }, [slots]);

  const alerts = useMemo(() => ({
    soon: slots.filter((o) => o.live && o.dToRemove >= 0 && o.dToRemove <= ALERT_DAYS).sort((a, b) => a.dToRemove - b.dToRemove),
    stale: slots.filter((o) => o.overdue).sort((a, b) => b.overdueDays - a.overdueDays),
  }), [slots]);

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
  // 보관 중이던 매체를 지도의 새 위치에서 복구한다 — 게시 이력은 유지한 채 프레임을
  // 옮긴 것처럼 처리(신규 생성 대신).
  const restoreMediaAtLocal = async (id, x, y) => {
    const zone = zoneAt(x, y);
    try {
      const updated = await restoreMediaAt(id, x, y, zone);
      setMedia((prev) => prev.map((m) => (m.id === id ? updated : m)));
      flash('매체를 복구했습니다.');
    } catch (e) {
      flash('매체 복구에 실패했습니다: ' + e.message);
    }
  };

  const markRemoved = async (id) => {
    try {
      await markPlacementRemoved(id, refDate);
      setPlacements((prev) => prev.map((p) => (p.id === id ? { ...p, removedAt: refDate, removalSource: 'manual' } : p)));
      flash('철거한 것으로 기록했습니다.', () => undoRemoved(id));
    } catch (e) { flash('처리에 실패했습니다: ' + e.message); }
  };
  const undoRemoved = async (id) => {
    try {
      await undoPlacementRemoval(id);
      setPlacements((prev) => prev.map((p) => (p.id === id ? { ...p, removedAt: null, removalSource: null } : p)));
      flash('철거 기록을 취소했습니다.');
    } catch (e) { flash('처리에 실패했습니다: ' + e.message); }
  };
  // silent: 등록+배치를 한 번에 하는 흐름에서 중간 토스트 없이 마지막 결과만 보여줄 때 쓴다.
  const addPosting = async (p, { silent } = {}) => {
    try {
      const created = await createPosting(p);
      setPostings((prev) => [created, ...prev]);
      if (!silent) flash('홍보물을 등록했습니다.');
      return created;
    } catch (e) { if (!silent) flash('홍보물 등록에 실패했습니다: ' + e.message); return null; }
  };
  const deletePostingItem = async (id) => {
    try {
      await deletePosting(id);
      setPostings((prev) => prev.filter((p) => p.id !== id));
      flash('홍보물을 삭제했습니다.');
    } catch (e) { flash('삭제에 실패했습니다: ' + e.message); }
  };
  // 홍보물을 매체에 배치한다 — posting은 이미 state에 있는(또는 방금 등록한) 홍보물 전체
  // 객체를 그대로 받아, placements 목록에 얹을 때 브랜드·이미지 등을 함께 평탄화한다.
  // face/faceLabel은 여러 면을 가진 매체에서 어느 면에 거는지(단일 면 매체는 생략해도 1).
  const addPlacement = async (posting, { mediaId, start, end, installPhoto, face, faceLabel }, { silent } = {}) => {
    try {
      const created = await createPlacement({ postingId: posting.id, mediaId, start, end, installPhoto, face, faceLabel });
      // 인쇄 시안 없이 등록해 둔 홍보물에 현장 사진이 처음 올라오면, 그 사진을 홍보물
      // 이미지로도 채운다 — 그러지 않으면 목록이 계속 빈 칸이라 무엇이 걸려 있는지 모른다.
      // 이미 이미지가 있으면 덮지 않는다. 여기서 실패해도 배치 자체는 이미 저장됐으므로
      // 되돌리지 않고 이미지만 비운 채 넘어간다.
      let p = posting;
      const mediaType = media.find((m) => m.id === mediaId)?.type;
      if (installPhoto && mediaType && !variantFor(posting, mediaType)?.thumbPath) {
        try {
          p = await setPostingImage(posting, installPhoto, mediaType);
          setPostings((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...p } : x)));
          setPlacements((prev) => prev.map((pl) => (pl.postingId === p.id
            ? { ...pl, thumbPath: p.thumbPath, viewPath: p.viewPath, bytesOrig: p.bytesOrig, bytesLight: p.bytesLight }
            : pl)));
        } catch { p = posting; }
      }
      setPlacements((prev) => [...prev, { ...p, ...created }]);
      // 엉뚱한 매체·기간에 잘못 건 걸 바로 무를 수 있게 한다. "철거 처리"로는 못 무른다 —
      // 그건 실제로 걸렸다가 뗀 기록이라, 걸린 적도 없는 배치가 이력에 영구히 남는다.
      if (!silent) flash('매체에 배치했습니다.', () => cancelPlacement(created.id));
      return true;
    } catch (e) { if (!silent) flash('배치에 실패했습니다: ' + e.message); return false; }
  };
  // 현장에서 찍은 설치 확인 사진을 이미 걸려 있는 배치에 나중에 붙인다. 홍보물 이미지가
  // 아직 비어 있으면 배치 생성 때와 동일하게 그 사진으로 함께 채운다.
  const attachInstallPhoto = async (placementId, result) => {
    try {
      const updated = await setPlacementInstallPhoto(placementId, result);
      setPlacements((prev) => prev.map((p) => (p.id === placementId
        ? { ...p, installPhoto: true, installPhotoPath: updated.installPhotoPath } : p)));
      const target = placements.find((p) => p.id === placementId);
      const posting = target && postings.find((x) => x.id === target.postingId);
      const mType = target && media.find((m) => m.id === target.mediaId)?.type;
      if (posting && mType && !variantFor(posting, mType)?.thumbPath) {
        try {
          const np = await setPostingImage(posting, result, mType);
          setPostings((prev) => prev.map((x) => (x.id === np.id ? { ...x, ...np } : x)));
          setPlacements((prev) => prev.map((pl) => (pl.postingId === np.id
            ? { ...pl, thumbPath: np.thumbPath, viewPath: np.viewPath } : pl)));
        } catch { /* 사진은 이미 배치에 붙었으므로 홍보물 이미지 채우기 실패는 넘어간다 */ }
      }
      flash('설치 확인 사진을 등록했습니다.');
      return true;
    } catch (e) { flash('사진 등록에 실패했습니다: ' + e.message); return false; }
  };

  // 잘못 만든 배치를 기록째 지운다 — 실제 철거(markPlacementRemoved)와는 다르다. 철거는
  // "걸렸다가 뗐다"는 사실 기록이라 이력에 남아야 하지만, 애초에 잘못 만든 배치는 남으면
  // 그 매체에 걸린 적도 없는 업체가 이력에 찍힌다.
  const cancelPlacement = async (id) => {
    try {
      await deletePlacement(id);
      setPlacements((prev) => prev.filter((p) => p.id !== id));
      flash('배치를 취소했습니다.');
    } catch (e) { flash('취소에 실패했습니다: ' + e.message); }
  };

  // 겹침 조정(기존 배치 종료일 단축)은 새 배치를 넣기 전에 반드시 먼저 커밋돼야 한다 —
  // DB에 겹치는 기간을 막는 exclusion 제약이 있어, 순서가 뒤바뀌면 새 배치 삽입이 거부된다.
  const adjustEnd = async (id, newEnd) => {
    try {
      await adjustPlacementEnd(id, newEnd);
      setPlacements((prev) => prev.map((p) => (p.id === id ? { ...p, end: newEnd } : p)));
      return true;
    } catch (e) { flash('종료일 조정에 실패했습니다: ' + e.message); return false; }
  };

  // 이미 만든 캠페인에 다른 규격의 인쇄 파일을 더한다.
  const addVariant = async (postingId, type, result) => {
    try {
      const updated = await addPostingVariant(postingId, type, result);
      setPostings((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      flash(`${T[type]?.label || type} 규격을 추가했습니다.`);
      return true;
    } catch (e) { flash('규격 추가에 실패했습니다: ' + e.message); return false; }
  };

  // 이 네 가지는 여태 화면 상태만 바꾸고 DB에 쓰지 않았다 — 유형을 만들어도 새로고침하면
  // 사라졌다. 저장이 실패하면 화면도 되돌린다(반쯤 반영된 채로 두면 다음 동작이 엉킨다).
  const addType = async (t) => {
    try {
      await createMediaType(t);
      setTypes((prev) => [...prev, t]);
      flash('매체 유형을 추가했습니다.');
    } catch (e) { flash('매체 유형 추가에 실패했습니다: ' + e.message); }
  };
  const toggleType = async (code) => {
    const cur = types.find((t) => t.code === code);
    if (!cur) return;
    try {
      await setMediaTypeActive(code, !cur.active);
      setTypes((prev) => prev.map((t) => (t.code === code ? { ...t, active: !t.active } : t)));
      flash(cur.active ? '매체 유형을 보관했습니다.' : '매체 유형을 복구했습니다.');
    } catch (e) { flash('처리에 실패했습니다: ' + e.message); }
  };
  const editType = async (code, patch) => {
    try {
      await updateMediaType(code, patch);
      setTypes((prev) => prev.map((t) => (t.code === code ? { ...t, ...patch } : t)));
      flash('매체 유형을 수정했습니다.');
    } catch (e) { flash('매체 유형 수정에 실패했습니다: ' + e.message); }
  };
  // 삭제는 되돌릴 수 없고 FK로 묶인 것이 있으면 DB가 막는다 — 무엇 때문에 못 지우는지
  // 사람이 읽을 수 있게 먼저 세어 보고, 쓰이는 데가 있으면 보관을 권한다.
  const removeType = async (code) => {
    const label = T[code]?.label || code;
    try {
      const { media: mc, variants: vc } = await countMediaTypeUsage(code);
      if (mc || vc) {
        const parts = [mc && `등록된 매체 ${mc}개`, vc && `홍보물 규격 ${vc}건`].filter(Boolean).join(', ');
        flash(`"${label}"은(는) ${parts}에서 쓰고 있어 삭제할 수 없습니다. 대신 "보관"하면 새 등록에서만 빠집니다.`);
        return;
      }
      if (!window.confirm(`매체 유형 "${label}"을(를) 완전히 삭제합니다. 되돌릴 수 없습니다.`)) return;
      await deleteMediaType(code);
      setTypes((prev) => prev.filter((t) => t.code !== code));
      flash(`매체 유형 "${label}"을(를) 삭제했습니다.`);
    } catch (e) { flash('매체 유형 삭제에 실패했습니다: ' + e.message); }
  };

  const renameMedia = async (id, name) => {
    const clean = (name || '').trim();
    if (!clean) return;
    try {
      await updateMediaName(id, clean);
      setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, name: clean } : m)));
      flash('매체명을 바꿨습니다.');
    } catch (e) { flash('매체명 변경에 실패했습니다: ' + e.message); }
  };

  const editMediaFaces = async (id, faces) => {
    try {
      await updateMediaFaces(id, faces);
      setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, faces } : m)));
      flash('면수를 수정했습니다.');
    } catch (e) { flash('면수 수정에 실패했습니다: ' + e.message); }
  };

  const removeMedia = async (id) => {
    const used = placements.some((p) => p.mediaId === id);
    try {
      if (used) {
        // 아직 철거 기록이 없는 배치는 여기서 함께 철거 처리한다 — 프레임 자체를 내리는
        // 것이므로 물리적으로 그 위의 홍보물도 같이 내려온다. 이걸 안 하면 그 배치가
        // "게시중"인 채로 남는데, 매체 현황·타임라인·알람은 활성 매체만 보므로(buildState)
        // 화면 어디에도 안 뜨는 유령 배치가 된다 — 철거 알람도 영영 안 울린다.
        const living = placements.filter((p) => p.mediaId === id && !p.removedAt);
        for (const p of living) await markPlacementRemoved(p.id, refDate);
        if (living.length) {
          const ids = new Set(living.map((p) => p.id));
          setPlacements((prev) => prev.map((p) => (ids.has(p.id) ? { ...p, removedAt: refDate, removalSource: 'manual' } : p)));
        }
        await archiveMedia(id);
        setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, active: false } : m)));
        flash(living.length
          ? `배치 기록이 있어 보관 처리했습니다 — 게시 중이던 ${living.length}건도 함께 철거 처리했습니다.`
          : '배치 기록이 있어 삭제 대신 보관 처리했습니다.');
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

  // MapCropModal이 PDF/이미지에서 팬·줌으로 고른 2:1 영역을 이미 3200×1600 PNG blob으로 넘겨준다.
  const saveMapImage = async (blob) => {
    try {
      await uploadCenterMap(blob);
      setMapImage(await getCenterMapUrl());
      flash('배치도 이미지를 적용했습니다.');
    } catch (e) {
      flash('배치도 업로드에 실패했습니다: ' + e.message);
    }
  };

  // narrow는 패널이 표 대신 모바일 카드 목록을 그릴지 정하는 데 쓴다.
  const ctx = { T, types, refDate, isEditor, narrow };
  const tabEntries = Object.entries(TABS).filter(([k]) => isEditor || !EDITOR_ONLY_TABS.has(k));
  // 사이드바(왼쪽) 탭 버튼은 지도 아래 본문 영역까지 화면을 안 움직여 줘서, 지도를 스크롤해
  // 내려간 상태에서 누르면 바뀐 내용이 화면 밖에 있는 것처럼 보였다 — 탭 바까지 스크롤해준다.
  const panelTopRef = useRef(null);
  const goTab = (k) => {
    setTab(k);
    panelTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
          <div>
            <b>점내 홍보매체</b><span>여주 프리미엄 아울렛</span>
            {/* 모바일 전용 — "여주 프리미엄 아울렛" 자리에 한눈에 보이도록 KPI를 대신 넣는다.
                데스크톱에서는 CSS로 숨기고, 아래 원래 .sidekpi를 그대로 쓴다. */}
            <div className="sidekpi mobile-kpi">
              <div className="skv"><em>게시중</em><b>{kpi.live + kpi.open}<i>/{kpi.total}</i></b></div>
              <div className="skv bad"><em>만료</em><b>{kpi.stale}</b></div>
            </div>
          </div>
          {/* 모바일 전용 — 기준일+홍보물 등록을 브랜드 행 오른쪽 여백에 압축해 넣어 2행을 없앤다.
              데스크톱에서는 숨기고 아래 원래 .side-row2를 그대로 쓴다. */}
          <div className="mobile-quickrow">
            <label className="reffield" title="이 날짜를 기준으로 게시중·만료 등 상태를 계산합니다. 기본값은 오늘입니다.">기준일<input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} /></label>
            {isEditor && (
              <div className="quickbtns">
                <button className="btn primary" onClick={() => setAddOpen(true)}>+홍보물 등록</button>
                <button className={'btn primary' + (addMode ? ' on' : '')} onClick={() => { setAddMode((v) => !v); setEditMode(false); }}>
                  {addMode ? '위치 선택 중…' : '+매체 추가'}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="sidekpi">
          <div className="skv"><em>게시중</em><b>{kpi.live + kpi.open}<i>/{kpi.total}</i></b></div>
          <div className="skv bad"><em>만료</em><b>{kpi.stale}</b></div>
        </div>
        <nav>
          {tabEntries.map(([k, v]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => goTab(k)}>
              {v}{k === 'posts' && kpi.stale > 0 && <em className="red">{kpi.stale}</em>}
            </button>
          ))}
        </nav>
        {/* 모바일에서 "홍보물 등록"+"기준일"을 2행으로 묶기 위한 래퍼 — 데스크톱에서는
            display:contents로 기존 세로 배치에 영향을 주지 않는다. */}
        <div className="side-row2">
          {isEditor && (
            <div className="quickbtns wide">
              <button className="btn primary" onClick={() => setAddOpen(true)}>+홍보물 등록</button>
              <button className={'btn primary' + (addMode ? ' on' : '')} onClick={() => { setAddMode((v) => !v); setEditMode(false); }}>
                {addMode ? '위치 선택 중…' : '+매체 추가'}
              </button>
            </div>
          )}
          <label className="reffield" title="이 날짜를 기준으로 게시중·만료 등 상태를 계산합니다. 기본값은 오늘입니다.">기준일<input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} /></label>
        </div>
        <div className="sidefoot">
          {admin.name || admin.email} · {isEditor ? '편집자' : '조회자'}
          <div className="sub" style={{ fontSize: 12, lineHeight: 1.4 }}>
            공용 초기 비밀번호를 사용 중이라면 아래 '비밀번호 변경'으로 본인만의 비밀번호로 바꿔주세요.
          </div>
          <button className="signout" onClick={() => setChangePwOpen(true)}>비밀번호 변경</button>
          {email?.toLowerCase() === OWNER_EMAIL && (
            <button className="signout" onClick={() => setResetOpen(true)}>관리자 비밀번호 초기화</button>
          )}
          <button className="signout" onClick={onSignOut}>로그아웃</button>
        </div>
      </aside>
      {changePwOpen && (
        <SetPassword
          onClose={() => setChangePwOpen(false)}
          onSubmit={async (password) => { await updatePassword(password); }}
        />
      )}
      {resetOpen && (
        <AdminReset
          onClose={() => setResetOpen(false)}
          onSubmit={(targetEmail) => resetAdminPassword(targetEmail, accessToken)}
        />
      )}

      <main>
        <MapPanel
          {...ctx} items={visible} allMedia={media} zoneFilter={zoneFilter} setZoneFilter={setZoneFilter}
          typeFilter={typeFilter} setTypeFilter={setTypeFilter}
          selMedia={selMedia} setSelMedia={setSelMedia}
          editMode={editMode} setEditMode={setEditMode} addMode={addMode} setAddMode={setAddMode}
          onMoveLocal={moveMediaLocal} onMoveCommit={moveMediaCommit} onCreate={addMediaAt} onRestoreAt={restoreMediaAtLocal}
          mapImage={mapImage} onMapImage={saveMapImage}
        />

        {/* 기준일을 바꿔 놓고 잊으면 "오늘 상태"인 줄 알고 잘못 판단하게 된다 — 오늘이
            아닐 때만 눈에 띄게 알리고 한 번에 되돌린다. */}
        {refDate !== getToday() && (
          <div className="refwarn">
            <span><b className="mono">{refDate}</b> 기준으로 보는 중 — 오늘 상태가 아닙니다.</span>
            <button onClick={() => setRefDate(getToday())}>오늘로</button>
          </div>
        )}

        <div className="tabs" ref={panelTopRef}>
          {tabEntries.map(([k, v]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => goTab(k)}>{v}{k === 'posts' && kpi.stale > 0 && <em>{kpi.stale}</em>}</button>
          ))}
        </div>

        <div className="panel">
          {tab === 'posts' && <PostsPanel {...ctx} state={slots} postings={placements} media={media} onRemove={markRemoved} onUndo={undoRemoved} onPick={setSelMedia} />}
          {tab === 'promos' && (
            <PromosPanel {...ctx} postings={postings} placements={placements} media={media}
              onPick={setSelMedia} onRemove={markRemoved} onUndo={undoRemoved} onCancel={cancelPlacement} onDeletePosting={deletePostingItem}
              onAssign={(id) => { setAssignPreset(null); setAssigningId(id); }}
              onRepeat={(pl) => { setAssignPreset({ mediaId: pl.mediaId, face: pl.face || 1 }); setAssigningId(pl.postingId); }}
              onAddVariant={setVariantFor_} />
          )}
          {tab === 'timeline' && <TimelinePanel {...ctx} state={slots} onPick={setSelMedia} />}
          {tab === 'manage' && (
            <ManagePanel {...ctx} media={media} postings={placements}
              onAddType={addType} onToggleType={toggleType} onEditType={editType} onRemoveType={removeType}
              onEditMediaFaces={editMediaFaces} onRenameMedia={renameMedia}
              onRemoveMedia={removeMedia} onRestoreMedia={restoreMediaItem} />
          )}
          {tab === 'alert' && isEditor && <AlertPanel alerts={alerts} kpi={kpi} isEditor={isEditor} onRemove={markRemoved} onPick={setSelMedia} />}
          {tab === 'admins' && isEditor && <AdminsPanel meId={meId} narrow={narrow} />}
        </div>
      </main>

      {selMedia && byId[selMedia] && (
        <MediaSheet
          {...ctx} o={byId[selMedia]} onClose={() => setSelMedia(null)} onRemove={markRemoved} onDelete={removeMedia}
          onEditMediaFaces={editMediaFaces} onRenameMedia={renameMedia} onAttachPhoto={attachInstallPhoto}
          onQuickAdd={(id, face) => { setPlacingMediaId(id); setPlacingFace(face || null); }}
        />
      )}
      {placingMediaId && isEditor && media.find((m) => m.id === placingMediaId) && (
        <PlaceOnMediaModal
          {...ctx} media={media.find((m) => m.id === placingMediaId)} postings={postings} placements={placements}
          initialFace={placingFace}
          onClose={() => { setPlacingMediaId(null); setPlacingFace(null); }}
          onAssign={addPlacement} onAdjustEnd={adjustEnd}
          onCreateNew={() => {
            // 원하는 홍보물이 목록에 없으면, 이 매체를 고정한 채로 등록 화면(AddModal)의
            // "특정 매체용" 경로로 넘어가 등록과 동시에 배치한다.
            setAddMediaId(placingMediaId); setAddFace(placingFace); setAddOpen(true);
            setPlacingMediaId(null); setPlacingFace(null);
          }}
        />
      )}
      {addOpen && isEditor && (
        <AddModal
          {...ctx} media={media} placements={placements} initialMediaId={addMediaId} initialFace={addFace}
          onClose={() => { setAddOpen(false); setAddMediaId(null); setAddFace(null); }}
          onAdd={addPosting} onAssign={addPlacement} onAdjustEnd={adjustEnd}
          onDone={({ placed, registeredOnly, bulk }) => {
            // 배치 없이 등록만 하면 방금 만든 홍보물이 어느 화면에도 안 보여서, 다음 할 일이
            // 있는 홍보물 화면으로 옮겨 주고 무엇을 해야 하는지 문구로 알려준다.
            if (registeredOnly) { setTab('promos'); flash('홍보물을 등록했습니다. 이제 "배치 추가"로 매체에 걸어 주세요.'); return; }
            if (bulk) { flash(`홍보물을 등록하고 ${bulk.ok}곳에 배치했습니다.${bulk.failed ? ` · ${bulk.failed}곳 실패` : ''}`); return; }
            flash(placed ? '홍보물을 등록하고 매체에 배치했습니다.' : '홍보물은 등록했지만 배치에 실패했습니다.');
          }}
        />
      )}
      {assigningId && isEditor && (
        <AssignModal
          {...ctx} posting={postings.find((p) => p.id === assigningId)} media={media} placements={placements}
          preset={assignPreset}
          onClose={() => { setAssigningId(null); setAssignPreset(null); }} onAssign={addPlacement} onAdjustEnd={adjustEnd}
          onDone={(ok, failed) => flash(`${ok}건 배치 완료${failed ? ` · ${failed}건 실패` : ''}`)}
        />
      )}
      {variantFor_ && isEditor && (
        <AddVariantModal
          {...ctx} posting={postings.find((p) => p.id === variantFor_.id) || variantFor_}
          onClose={() => setVariantFor_(null)} onSubmit={addVariant}
        />
      )}
      {toast && (
        <div className="toast">
          {toast.msg}
          {toast.undo && <button className="toast-undo" onClick={() => { toast.undo(); setToast(null); }}>되돌리기</button>}
        </div>
      )}
    </div>
  );
}
