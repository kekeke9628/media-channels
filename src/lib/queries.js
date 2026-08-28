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
import { zoneOf } from '../constants.js';

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

// 매체 유형 추가·수정·보관·삭제.
//
// 여태 이 네 가지가 전부 화면 상태(setTypes)만 바꾸고 DB에는 한 줄도 안 쓰고 있었다 —
// 유형을 만들어도 새로고침하면 사라졌다. 테이블과 RLS 정책은 처음부터 있었는데 부르는
// 쪽이 없었던 것.
const typeRow = (t) => ({
  label: t.label, default_spec: t.spec || null, faces: t.faces, color: t.color, glyph: t.glyph,
});

export async function createMediaType(t) {
  // 목록 맨 뒤에 붙인다 — sort_order가 겹치면 순서가 들쭉날쭉해진다.
  const { data: last } = await supabase.from('media_types').select('sort_order').order('sort_order', { ascending: false }).limit(1);
  const { error } = await supabase.from('media_types')
    .insert({ code: t.code, ...typeRow(t), sort_order: (last?.[0]?.sort_order ?? 0) + 1, active: true });
  if (error) throw error;
}

export async function updateMediaType(code, patch) {
  const row = {};
  if (patch.label !== undefined) row.label = patch.label;
  if (patch.spec !== undefined) row.default_spec = patch.spec || null;
  if (patch.faces !== undefined) row.faces = patch.faces;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.glyph !== undefined) row.glyph = patch.glyph;
  const { error } = await supabase.from('media_types').update(row).eq('code', code);
  if (error) throw error;
}

export async function setMediaTypeActive(code, active) {
  const { error } = await supabase.from('media_types').update({ active }).eq('code', code);
  if (error) throw error;
}

// 이 유형을 쓰고 있는 것이 있는지 — 매체(보관된 것 포함)와 홍보물 규격 둘 다 본다.
// 둘 다 FK로 묶여 있어서 남아 있으면 삭제가 DB에서 막히는데, 그때 뜨는 건 사람이 읽을 수
// 없는 제약 위반 메시지다. 무엇 때문에 못 지우는지 미리 세어서 알려 준다.
export async function countMediaTypeUsage(code) {
  const { count: media } = await supabase.from('media').select('id', { count: 'exact', head: true }).eq('type', code);
  return { media: media || 0, variants: 0 };
}

export async function deleteMediaType(code) {
  const { error } = await supabase.from('media_types').delete().eq('code', code);
  if (error) throw error;
}

// 매체 유형 변경 — 등록할 때 유형을 잘못 고르면 지금까지는 지우고 다시 만드는 수밖에
// 없었고, 그러면 배치 이력이 함께 사라졌다.
//
// 배치(placements)는 손댈 필요가 없다 — 어느 규격 파일을 보여줄지는 그 배치가 걸린 매체의
// 배치는 홍보물 id로만 묶이므로(규격 개념이 없다) 유형을 바꿔도 이력·이미지는 그대로다.
export async function setMediaType(id, type) {
  const { error } = await supabase.from('media').update({ type }).eq('id', id);
  if (error) throw error;
}

// 매체명 변경 — 처음엔 만들 때 정하면 끝이라고 봤는데, 실제로는 오타나 현장 표기가
// 바뀌는 일이 흔하다. 이름만 바꾸는 것이라 배치 이력에는 영향이 없다(배치는 id로 묶인다).
export async function updateMediaName(id, name) {
  const { error } = await supabase.from('media').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function fetchMedia() {
  // 정렬을 안 걸면 Postgres가 주는 순서는 정해져 있지 않다 — 화면 목록이 매번 뒤죽박죽으로
  // 보이고, 같은 이름이 나란히 안 붙어서 중복이 있어도 눈에 안 띈다.
  const { data, error } = await supabase.from('media').select('*').order('name');
  if (error) throw error;
  return data.map((m) => ({
    id: m.id,
    type: m.type,
    name: m.name,
    faces: m.faces,
    spec: m.spec || '',
    active: m.active,
    // 이름이 자리를 말한다 — 화면·필터가 전부 이 값을 쓰므로 들어오는 자리에서 한 번만 맞춘다.
    zone: zoneOf(m),
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

// 듀라트란스처럼 한 자리에 여러 판이 몰려 있는 경우, 면수를 처음 등록할 때 잘못 넣었거나
// 나중에 판이 늘고 줄면 고쳐야 한다 — 지금까지는 등록 시점에만 정할 수 있었다.
export async function updateMediaFaces(id, faces) {
  const { error } = await supabase.from('media').update({ faces }).eq('id', id);
  if (error) throw error;
}

export async function createMedia({ id, type, name, faces, spec, x, y, zone }) {
  const { data, error } = await supabase
    .from('media')
    .insert({ id, type, name, faces, spec: spec || null, x, y, zone, active: true })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, type: data.type, name: data.name, faces: data.faces, spec: data.spec || '', active: data.active, zone: zoneOf(data), x: +data.x, y: +data.y };
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
  return { id: data.id, type: data.type, name: data.name, faces: data.faces, spec: data.spec || '', active: data.active, zone: zoneOf(data), x: +data.x, y: +data.y };
}

export async function deleteMedia(id) {
  const { error } = await supabase.from('media').delete().eq('id', id);
  if (error) throw error;
}

// 홍보물 = 브랜드 + 내용 + 디자인 시안 한 장.
//
// 한때는 매체 유형별로 인쇄 파일을 따로 두었지만(posting_variants), 같은 디자인이 매체마다
// 크기만 조금 다를 뿐이라 똑같이 생긴 홍보물만 늘어났다 — 이 시스템은 인쇄 발주가 아니라
// "지금 무엇이 어디에 걸려 있는가"를 관리하는 것이라 규격은 관리 대상이 아니다(024).
function mapPosting(p) {
  return {
    id: p.id,
    brand: p.brand,
    title: p.title || '',
    thumbPath: p.thumb_path || null,
    viewPath: p.view_path || null,
    // 홍보물 자체의 게시 기간. 날짜가 없어도 "상시"와 "아직 안 넣음"은 다른 상태라
    // alwaysOn을 따로 들고 온다(026) — 판정은 constants.js periodLabel/periodUnset.
    start: p.start_date || null,
    end: p.end_date || null,
    alwaysOn: !!p.always_on,
    hue: hueOf(p.id),
    bytesOrig: p.bytes_orig || 0,
    bytesLight: p.bytes_light || 0,
    createdAt: p.created_at,
  };
}

// 어느 홍보물이든 어느 매체에나 걸 수 있다 — 규격을 따지지 않는다. 호출하는 쪽이 여러
// 군데라 이름은 남겨 두고 항상 통과시킨다.
export const canPlaceOn = () => true;

function mapPlacement(pl) {
  return {
    id: pl.id,
    postingId: pl.posting_id,
    mediaId: pl.media_id,
    start: pl.start_date,
    end: pl.end_date,
    removedAt: pl.removed_at,
    removalSource: pl.removal_source,
    installPhoto: !!pl.install_photo_path,
    installPhotoPath: pl.install_photo_path,
    // 매체가 여러 면(face)을 가질 때 이 배치가 어느 면인지 — 1부터 시작. 라벨이 비어
    // 있으면(직접 입력 안 함) 화면에서 "N면"으로 채운다(lib/status.js flattenSlots 등).
    face: pl.face || 1,
    faceLabel: pl.face_label || null,
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

// 홍보물 이미지는 DB 행만 지워도 스토리지에는 그대로 남는다 — 무료 요금제 1GB를 쓰면서
// 화면에 사용량 게이지까지 두고 있는데, 지운 홍보물이 계속 자리를 차지하고 있었다(실제로
// 5.7MB가 그렇게 떠 있었다). 행을 지우는 모든 경로에서 파일도 같이 지운다.
// 파일 삭제가 실패해도 DB 삭제는 이미 끝났으므로 흐름을 막지 않는다 — 남은 건 아래
// cleanupOrphanImages가 나중에 걷어낸다.
async function removePostingFiles(paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return 0;
  const { error } = await supabase.storage.from(POSTING_BUCKET).remove(unique);
  if (error) return 0;
  return unique.length;
}

async function uploadPostingImage(path, dataUrl) {
  // contentType을 'image/webp'로 못박아 뒀는데 브라우저가 실제로는 PNG를 만들어 준
  // 적이 있어(convertImage 주석 참고) 기록된 형식과 내용이 어긋났다 — 만들어진 그대로 쓴다.
  const blob = dataUrlToBlob(dataUrl);
  const { error } = await supabase.storage.from(POSTING_BUCKET).upload(path, blob, {
    upsert: true,
    contentType: blob.type,
  });
  if (error) throw error;
  return path;
}

// 홍보물 등록 — 매체·일정과 무관하게 브랜드·내용·이미지 한 장만 먼저 등록한다. 어느
// 매체의 어느 면에 걸지는 나중에(또는 여러 번) createPlacement로 따로 정한다. 예전에는
// 2면 매체용으로 앞/뒤 이미지 한 쌍을 홍보물 하나에 묶어 두었지만, 그러면 앞/뒤가 항상
// 같은 업체·같은 기간으로만 걸릴 수 있었다 — 실제로는 면마다 다른 광고주가 흔해서,
// 이제 홍보물은 언제나 단일 이미지고 "어느 면"은 배치(placements.face) 쪽 개념이다.
// 기간과 "상시"는 서로 배타다 — 상시를 고르면 날짜를 비우고, 날짜를 넣으면 상시를 푼다.
// 이걸 화면마다 따로 처리하면(등록·배치·매체에서 배치, 세 군데다) 언젠가 한 곳을 빠뜨려
// "상시인데 종료일이 남아 있는" 행이 생긴다. 데이터 경계인 여기서 한 번만 정리한다.
function periodRow({ start, end, alwaysOn }) {
  if (alwaysOn) return { start_date: null, end_date: null, always_on: true };
  return { start_date: start || null, end_date: end || null, always_on: false };
}

export async function createPosting({ brand, title, start, end, alwaysOn, singleResult }) {
  const { data: userData } = await supabase.auth.getUser();
  const { data: inserted, error: insertError } = await supabase
    .from('postings')
    .insert({ brand, title: title || null, ...periodRow({ start, end, alwaysOn }), created_by: userData?.user?.id || null })
    .select()
    .single();
  if (insertError) throw insertError;
  if (singleResult) await setPostingImage({ id: inserted.id }, singleResult);
  return fetchPosting(inserted.id);
}

// 홍보물의 업체명·내용 수정. 홍보물은 여러 자리에 걸릴 수 있으므로 여기서 바꾸면 그
// 홍보물이 걸린 모든 자리의 표시가 함께 바뀐다 — 호출 쪽에서 그 사실을 알려 준다.
export async function updatePostingText(id, { brand, title, start, end, alwaysOn }) {
  const row = {};
  if (brand !== undefined) row.brand = brand;
  if (title !== undefined) row.title = title || null;
  // 기간은 세 값이 한 덩어리다 — 업체명만 고치는 호출도 있어서, 셋 중 하나라도 들어왔을
  // 때만 손댄다. 하나씩 따로 넣으면 상시를 풀지 않은 채 날짜만 들어가 제약에 걸린다.
  if (start !== undefined || end !== undefined || alwaysOn !== undefined) {
    Object.assign(row, periodRow({ start, end, alwaysOn }));
  }
  const { data, error } = await supabase.from('postings').update(row).eq('id', id).select().single();
  if (error) throw error;
  return mapPosting(data);
}

// 홍보물의 디자인 시안을 넣거나 갈아 끼운다. 같은 경로에 덮어쓰므로 옛 파일이 남지 않는다.
export async function setPostingImage(posting, result) {
  if (!result) return fetchPosting(posting.id);
  const row = {
    view_path: await uploadPostingImage(`${posting.id}/view.webp`, result.view.url),
    thumb_path: await uploadPostingImage(`${posting.id}/thumb.webp`, result.thumb.url),
    bytes_orig: result.orig,
    bytes_light: result.view.bytes,
  };
  const { error } = await supabase.from('postings').update(row).eq('id', posting.id);
  if (error) throw error;
  return fetchPosting(posting.id);
}

async function fetchPosting(id) {
  const { data, error } = await supabase.from('postings').select('*').eq('id', id).single();
  if (error) throw error;
  return mapPosting(data);
}

// 이미 등록된 홍보물이 매체·이미지 전부 없이 텍스트 실수 등으로 잘못 만들어졌을 때를 위한
// 삭제 — 배치가 하나라도 있으면 이력이 걸린 셈이라 호출 쪽(App)에서 막는다.
export async function deletePosting(id) {
  // 배치(placements)는 FK cascade로 함께 사라지므로, 거기 딸린 설치 사진 경로까지 미리 모은다.
  const [{ data: own }, { data: pls }] = await Promise.all([
    supabase.from('postings').select('thumb_path, view_path').eq('id', id),
    supabase.from('placements').select('install_photo_path').eq('posting_id', id),
  ]);
  const { error } = await supabase.from('postings').delete().eq('id', id);
  if (error) throw error;
  await removePostingFiles([
    ...(own || []).flatMap((v) => [v.thumb_path, v.view_path]),
    ...(pls || []).map((p) => p.install_photo_path),
  ]);
}

// 등록된 홍보물을 매체에 배치한다 — 처음 배치든, 이미 다른 매체(들)에 걸려 있는 홍보물의
// 추가 배치든 동일하게 새 placements 행을 하나 만든다. 설치 확인 사진은 "이 배치가 실제로
// 이 매체에 설치됐다"는 증빙이라 홍보물이 아니라 이 배치 행에 붙는다. face는 여러 면을
// 가진 매체에서 어느 면인지(1부터) — 단일 면 매체는 항상 1이라 호출 쪽에서 생략해도 된다.
export async function createPlacement({ postingId, mediaId, start, end, installPhoto, face, faceLabel }) {
  const { data: inserted, error: insertError } = await supabase
    .from('placements')
    .insert({
      posting_id: postingId, media_id: mediaId, start_date: start, end_date: end,
      face: face || 1, face_label: (faceLabel || '').trim() || null,
    })
    .select()
    .single();
  if (insertError) throw insertError;
  if (!installPhoto) return mapPlacement(inserted);

  const install_photo_path = await uploadPostingImage(`placements/${inserted.id}/install.webp`, installPhoto.view.url);
  const { data: updated, error: updateError } = await supabase
    .from('placements')
    .update({ install_photo_path })
    .eq('id', inserted.id)
    .select()
    .single();
  if (updateError) throw updateError;
  return mapPlacement(updated);
}

// 이미 만들어진 배치에 설치 확인 사진을 나중에 붙인다. 실제 업무는 "사무실에서 배치를
// 등록 → 현장에 가서 부착 → 그 자리에서 사진 촬영" 순서인데, 지금까지는 배치를 만드는
// 순간에만 사진을 첨부할 수 있어서 현장에서 찍은 사진을 넣으려면 배치를 지우고 다시
// 만들어야 했다(기간·이력이 꼬인다). 이미 사진이 있으면 새 사진으로 교체한다.
export async function setPlacementInstallPhoto(placementId, result) {
  const install_photo_path = await uploadPostingImage(`placements/${placementId}/install.webp`, result.view.url);
  const { data, error } = await supabase
    .from('placements')
    .update({ install_photo_path })
    .eq('id', placementId)
    .select()
    .single();
  if (error) throw error;
  return mapPlacement(data);
}

// 현장 사진을 홍보물 이미지로 채운다 — 인쇄 시안 파일 없이 등록해 둔 홍보물이 흔한데,
// 그러면 홍보물 목록이 계속 빈 칸이라 무엇이 걸려 있는지 알 수 없었다. 설치 확인 사진과
// 홍보물 이미지는 같은 변환 결과 모양을 쓰므로 그대로 돌려쓴다. 이미 이미지가 있는
// 홍보물은 덮지 않는다(호출 쪽에서 판단).
// 현장 사진을 인쇄 파일 대신 채운다 — 시안 없이 등록된 캠페인이 목록에서 계속 빈 칸이라
// 무엇이 걸려 있는지 알 수 없던 문제 때문. 어느 규격에 넣을지는 걸린 매체의 유형이 정한다.


// 배치를 잘못 만들었을 때(엉뚱한 매체 선택 등) 되돌리는 삭제 — 실제 철거 기록(removed_at)과는
// 다르다. 실제 철거는 markPlacementRemoved를 쓴다.
export async function deletePlacement(id) {
  const { data: doomed } = await supabase.from('placements').select('install_photo_path').eq('id', id);
  const { error } = await supabase.from('placements').delete().eq('id', id);
  if (error) throw error;
  // 철거 기록(markPlacementRemoved)은 이력이라 사진을 남기지만, 잘못 만든 배치를 지우는
  // 이 경로는 그 배치가 없던 일이 되는 것이라 증빙 사진도 같이 지운다.
  await removePostingFiles((doomed || []).map((p) => p.install_photo_path));
}

// 교체 — 걸려 있던 홍보물을 내리고 그 자리에 새것을 건다. 두 가지가 같이 되거나 같이
// 안 되어야 하므로(중간에 실패하면 그 면이 빈 채로 남는다) DB 함수 한 번으로 처리한다(027).
// 매체·면·방향은 그 자리의 속성이라 함수가 옛 배치에서 그대로 물려받는다.
export async function replacePlacement({ oldId, postingId, date, end, installPhoto }) {
  const { data, error } = await supabase.rpc('replace_placement', {
    p_old_id: oldId, p_posting_id: postingId, p_date: date, p_end: end || null,
  });
  if (error) throw error;
  // 합성 타입을 돌려주는 함수라 행 하나가 그대로 온다(구현에 따라 배열로 오는 경우도 있다).
  const row = Array.isArray(data) ? data[0] : data;
  if (!installPhoto) return mapPlacement(row);

  const install_photo_path = await uploadPostingImage(`placements/${row.id}/install.webp`, installPhoto.view.url);
  const { data: updated, error: updateError } = await supabase
    .from('placements').update({ install_photo_path }).eq('id', row.id).select().single();
  if (updateError) throw updateError;
  return mapPlacement(updated);
}

export async function markPlacementRemoved(id, removedAt) {
  const { error } = await supabase.from('placements').update({ removed_at: removedAt, removal_source: 'manual' }).eq('id', id);
  if (error) throw error;
}

export async function undoPlacementRemoval(id) {
  const { error } = await supabase.from('placements').update({ removed_at: null, removal_source: null }).eq('id', id);
  if (error) throw error;
}

// 배치 기간 수정. 같은 매체·같은 면에 기간이 겹치면 DB의 배제 제약이 막는다 — 그 오류를
// 그대로 올려 호출 쪽에서 사람이 읽을 수 있는 문구로 바꾼다.
export async function updatePlacementDates(id, start, end) {
  const { data, error } = await supabase.from('placements')
    .update({ start_date: start, end_date: end || null }).eq('id', id).select().single();
  if (error) throw error;
  return { start: data.start_date, end: data.end_date };
}

export async function adjustPlacementEnd(id, newEnd) {
  const { error } = await supabase.from('placements').update({ end_date: newEnd }).eq('id', id);
  if (error) throw error;
}

// 저장 공간 사용량 — 무료 요금제는 파일 저장이 1GB까지라, 남은 여유를 볼 수 있게 한다.
export const STORAGE_LIMIT = 1024 * 1024 * 1024;
export async function fetchStorageUsage() {
  const { data, error } = await supabase.rpc('storage_usage');
  if (error) throw error;
  return (data || []).map((r) => ({ bucket: r.bucket, files: Number(r.files), bytes: Number(r.bytes) }));
}

// 어느 홍보물·배치도 더는 참조하지 않는 이미지를 찾아 지운다.
//
// 위의 삭제 경로들이 이제 파일을 같이 지우지만, 그 고침 이전에 지운 것들은 이미 스토리지에
// 남아 있다. 파일 삭제가 실패하는 경우(일시적 네트워크 오류 등)에도 찌꺼기가 생길 수 있어,
// 언제든 눌러서 걷어낼 수 있는 정리 경로를 따로 둔다.
//
// 버킷은 `<홍보물id>/파일명` 두 단계라 폴더를 훑어 내려간다. 살아 있는 경로 집합과 비교해
// 없는 것만 지우므로, 방금 올리는 중인 파일을 잘못 지울 위험은 DB 행이 먼저 생기는 한 없다.
export async function cleanupOrphanImages() {
  const [{ data: vs, error: ve }, { data: pls, error: pe }] = await Promise.all([
    supabase.from('postings').select('thumb_path, view_path'),
    supabase.from('placements').select('install_photo_path'),
  ]);
  if (ve) throw ve;
  if (pe) throw pe;
  const alive = new Set([
    ...(vs || []).flatMap((v) => [v.thumb_path, v.view_path]),
    ...(pls || []).map((p) => p.install_photo_path),
  ].filter(Boolean));

  const listAll = async (prefix) => {
    const { data, error } = await supabase.storage.from(POSTING_BUCKET)
      .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    const out = [];
    for (const e of data || []) {
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      // id가 없으면 파일이 아니라 폴더다(스토리지가 폴더를 가상으로 만들어 준다).
      if (e.id) out.push({ path, bytes: Number(e.metadata?.size) || 0 });
      else out.push(...(await listAll(path)));
    }
    return out;
  };

  const all = await listAll('');
  const orphans = all.filter((f) => !alive.has(f.path));
  if (orphans.length) {
    const { error } = await supabase.storage.from(POSTING_BUCKET).remove(orphans.map((f) => f.path));
    if (error) throw error;
  }
  return { files: orphans.length, bytes: orphans.reduce((n, f) => n + f.bytes, 0) };
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
