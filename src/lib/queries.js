// Supabase 조회 레이어 — 사양서 3장 스키마를 M1의 mock 데이터 형태(camelCase)로 매핑한다.
// 기준일(refDate)이 클라이언트에서 바뀔 수 있으므로(사양서 7장) 파생 상태는 여전히
// lib/status.js에서 클라이언트가 계산한다.
//
// postings(홍보물)와 placements(배치)는 분리된 테이블이다 — 홍보물 하나가 여러 매체에
// 동시에 걸리거나, 아직 어느 매체에도 걸리지 않은 채로 존재할 수 있다.
//   - fetchPostings(): 순수 홍보물 목록(브랜드·내용·이미지) — 매체·일정과 무관하게 홍보물
//     자체를 관리하는 화면(PromosPanel)에서 쓴다.
//   - fetchPlacements(): 배치 + 해당 홍보물 정보를 평탄화한 목록 — 매체별 현재 상태·타임라인·
//     이력처럼 "어느 매체에 무엇이 걸려 있는가" 관점의 화면에서 예전 postings와 같은 모양으로 쓴다.
import { supabase } from './supabaseClient.js';

// 갤러리·매체 상세 카드의 그라데이션 색상 — 실 이미지가 없는 동안 id로 결정적으로 생성한다.
function hueOf(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

export async function fetchMediaTypes() {
  const { data, error } = await supabase.from('media_types').select('*').order('sort_order');
  if (error) throw error;
  return data.map((t) => ({
    code: t.code,
    label: t.label,
    spec: t.default_spec,
    faces: t.faces,
    color: t.color,
    glyph: t.glyph,
    movable: t.movable,
    openEnded: t.open_ended,
    active: t.active,
  }));
}

export async function fetchMedia() {
  const { data, error } = await supabase.from('media').select('*');
  if (error) throw error;
  return data.map((m) => ({
    id: m.id,
    type: m.type,
    name: m.name,
    faces: m.faces,
    spec: m.spec || '',
    active: m.active,
    zone: m.zone,
    x: +m.x,
    y: +m.y,
  }));
}

// 지도 위 드래그로 매체 위치를 옮길 때 즉시 저장한다(사양서와 달리, 낱개 매체는 가벼운 마커라
// 지점처럼 별도 draft/save 확인 단계를 두지 않고 드롭하는 즉시 커밋한다).
export async function updateMediaPosition(id, x, y, zone) {
  const { error } = await supabase.from('media').update({ x, y, zone }).eq('id', id);
  if (error) throw error;
}

export async function createMedia({ id, type, name, faces, spec, x, y, zone }) {
  const { data, error } = await supabase
    .from('media')
    .insert({ id, type, name, faces, spec: spec || null, x, y, zone, active: true })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, type: data.type, name: data.name, faces: data.faces, spec: data.spec || '', active: data.active, zone: data.zone, x: +data.x, y: +data.y };
}

export async function archiveMedia(id) {
  const { error } = await supabase.from('media').update({ active: false }).eq('id', id);
  if (error) throw error;
}

export async function restoreMedia(id) {
  const { error } = await supabase.from('media').update({ active: true }).eq('id', id);
  if (error) throw error;
}

// 보관 중인(숨겨진) 매체를 지도의 새 위치에서 복구한다 — 이력(게시 기록)은 그대로
// 유지한 채, 물리적으로 프레임이 옮겨진 것처럼 위치만 새로 저장한다.
export async function restoreMediaAt(id, x, y, zone) {
  const { data, error } = await supabase.from('media').update({ active: true, x, y, zone }).eq('id', id).select().single();
  if (error) throw error;
  return { id: data.id, type: data.type, name: data.name, faces: data.faces, spec: data.spec || '', active: data.active, zone: data.zone, x: +data.x, y: +data.y };
}

export async function deleteMedia(id) {
  const { error } = await supabase.from('media').delete().eq('id', id);
  if (error) throw error;
}

function mapPosting(p) {
  return {
    id: p.id,
    type: p.type,
    brand: p.brand,
    title: p.title || '',
    driveUrl: p.origin_url,
    thumbPath: p.thumb_path,
    viewPath: p.view_path,
    installPhoto: !!p.install_photo_path,
    faces: p.faces || null,
    hue: hueOf(p.id),
    bytesOrig: p.bytes_orig || 0,
    bytesLight: p.bytes_light || 0,
    createdAt: p.created_at,
  };
}

function mapPlacement(pl) {
  return {
    id: pl.id,
    postingId: pl.posting_id,
    mediaId: pl.media_id,
    start: pl.start_date,
    end: pl.end_date,
    removedAt: pl.removed_at,
    removalSource: pl.removal_source,
  };
}

// 순수 홍보물 목록 — 매체 배치와 무관하게 홍보물 자체(브랜드·내용·이미지)를 관리한다.
export async function fetchPostings() {
  const { data, error } = await supabase.from('postings').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(mapPosting);
}

// 배치 목록 — 배치 정보에 소속 홍보물 정보를 얹어 평탄화한다. 매체별 현재 상태 표,
// 타임라인, 이력 조회처럼 "어느 매체에 무엇이 걸려 있었는가" 화면들이 쓰는 모양.
export async function fetchPlacements() {
  const { data, error } = await supabase.from('placements').select('*, postings(*)').order('start_date');
  if (error) throw error;
  return data.map((pl) => ({ ...mapPosting(pl.postings), ...mapPlacement(pl) }));
}

// data:URL(webp) → Blob. AddModal이 canvas.toDataURL로 만든 2단(view/thumb) 이미지를
// Storage에 올리기 위해 필요하다 — 원본 파일 자체는 절대 업로드하지 않는다.
function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const POSTING_BUCKET = 'posting-images';
const POSTING_IMAGE_URL_TTL = 60 * 60; // 1시간, 배치도(center-map)와 동일

// 홍보물 이미지 서명 URL을 한 번에 여러 개 받아온다(갤러리 카드·매체 상세가 각각 여러 장을
// 동시에 보여줘야 해서 경로별로 하나씩 요청하지 않고 배치로 처리). 비공개 버킷이라 서명 URL이
// 필요하고, 존재하지 않는 경로는 조용히 건너뛴다(과거 데이터에 이미지가 없을 수 있음).
export async function getPostingImageUrls(paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data, error } = await supabase.storage.from(POSTING_BUCKET).createSignedUrls(unique, POSTING_IMAGE_URL_TTL);
  if (error) throw error;
  return new Map((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}

async function uploadPostingImage(path, dataUrl) {
  const { error } = await supabase.storage.from(POSTING_BUCKET).upload(path, dataUrlToBlob(dataUrl), {
    upsert: true,
    contentType: 'image/webp',
  });
  if (error) throw error;
  return path;
}

// 홍보물 등록 — 매체·일정과 무관하게 브랜드·내용·이미지만 먼저 등록한다. 어느 매체에
// 걸지는 나중에(또는 여러 번) createPlacement로 따로 정한다. faces===2(웨더워리어류)이면
// face 배열(앞/뒤 방향+변환결과)을 받아 면마다 별도 이미지를 올리고 faces(jsonb)에 담는다.
export async function createPosting({ type, brand, title, driveUrl, singleResult, faceResults, installPhoto }) {
  const { data: userData } = await supabase.auth.getUser();
  const { data: inserted, error: insertError } = await supabase
    .from('postings')
    .insert({
      type,
      brand,
      title: title || null,
      origin_url: driveUrl || null,
      created_by: userData?.user?.id || null,
    })
    .select()
    .single();
  if (insertError) throw insertError;
  const id = inserted.id;

  const patch = {};
  if (faceResults) {
    const faces = [];
    for (let i = 0; i < faceResults.length; i++) {
      const f = faceResults[i];
      if (!f.result) { faces.push({ direction: f.direction || '', thumbPath: null, viewPath: null, bytesOrig: 0, bytesLight: 0 }); continue; }
      const viewPath = await uploadPostingImage(`${id}/face${i + 1}-view.webp`, f.result.view.url);
      const thumbPath = await uploadPostingImage(`${id}/face${i + 1}-thumb.webp`, f.result.thumb.url);
      faces.push({ direction: f.direction || '', thumbPath, viewPath, bytesOrig: f.result.orig, bytesLight: f.result.view.bytes });
    }
    patch.faces = faces;
    patch.bytes_orig = faces.reduce((s, f) => s + f.bytesOrig, 0);
    patch.bytes_light = faces.reduce((s, f) => s + f.bytesLight, 0);
    patch.thumb_path = faces[0]?.thumbPath || null;
    patch.view_path = faces[0]?.viewPath || null;
  } else if (singleResult) {
    patch.view_path = await uploadPostingImage(`${id}/view.webp`, singleResult.view.url);
    patch.thumb_path = await uploadPostingImage(`${id}/thumb.webp`, singleResult.thumb.url);
    patch.bytes_orig = singleResult.orig;
    patch.bytes_light = singleResult.view.bytes;
  }
  if (installPhoto) {
    patch.install_photo_path = await uploadPostingImage(`${id}/install.webp`, installPhoto.url);
  }

  if (Object.keys(patch).length === 0) return mapPosting(inserted);
  const { data: updated, error: updateError } = await supabase.from('postings').update(patch).eq('id', id).select().single();
  if (updateError) throw updateError;
  return mapPosting(updated);
}

// 이미 등록된 홍보물이 매체·이미지 전부 없이 텍스트 실수 등으로 잘못 만들어졌을 때를 위한
// 삭제 — 배치가 하나라도 있으면 이력이 걸린 셈이라 호출 쪽(App)에서 막는다.
export async function deletePosting(id) {
  const { error } = await supabase.from('postings').delete().eq('id', id);
  if (error) throw error;
}

// 등록된 홍보물을 매체에 배치한다 — 처음 배치든, 이미 다른 매체(들)에 걸려 있는 홍보물의
// 추가 배치든 동일하게 새 placements 행을 하나 만든다.
export async function createPlacement({ postingId, mediaId, start, end }) {
  const { data, error } = await supabase
    .from('placements')
    .insert({ posting_id: postingId, media_id: mediaId, start_date: start, end_date: end })
    .select()
    .single();
  if (error) throw error;
  return mapPlacement(data);
}

// 배치를 잘못 만들었을 때(엉뚱한 매체 선택 등) 되돌리는 삭제 — 실제 철거 기록(removed_at)과는
// 다르다. 실제 철거는 markPlacementRemoved를 쓴다.
export async function deletePlacement(id) {
  const { error } = await supabase.from('placements').delete().eq('id', id);
  if (error) throw error;
}

export async function markPlacementRemoved(id, removedAt) {
  const { error } = await supabase.from('placements').update({ removed_at: removedAt, removal_source: 'manual' }).eq('id', id);
  if (error) throw error;
}

export async function undoPlacementRemoval(id) {
  const { error } = await supabase.from('placements').update({ removed_at: null, removal_source: null }).eq('id', id);
  if (error) throw error;
}

export async function adjustPlacementEnd(id, newEnd) {
  const { error } = await supabase.from('placements').update({ end_date: newEnd }).eq('id', id);
  if (error) throw error;
}

export async function fetchAdmins() {
  const { data, error } = await supabase.from('admins').select('user_id, email, name, role').order('created_at');
  if (error) throw error;
  return data;
}

// admins 테이블은 auth.users(가입 여부)를 직접 조회할 수 없어, 이메일로 user_id를
// 찾아주는 전용 RPC(admin_find_user_id, 012 마이그레이션)를 거친다. 아직 로그인 링크를
// 한 번도 요청한 적 없는 이메일이면 null이 온다 — 그 경우 먼저 로그인 시도가 필요하다.
export async function findUserIdByEmail(email) {
  const { data, error } = await supabase.rpc('admin_find_user_id', { p_email: email });
  if (error) throw error;
  return data;
}

export async function addAdmin({ userId, email, name, role }) {
  const { data, error } = await supabase
    .from('admins')
    .insert({ user_id: userId, email, name: name || null, role })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAdminRole(userId, role) {
  const { error } = await supabase.from('admins').update({ role }).eq('user_id', userId);
  if (error) throw error;
}

export async function removeAdmin(userId) {
  const { error } = await supabase.from('admins').delete().eq('user_id', userId);
  if (error) throw error;
}
