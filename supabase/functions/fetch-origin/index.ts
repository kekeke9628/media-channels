import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// 원본 파일 가져오기 — 구글드라이브(또는 일반 http) 링크를 서버에서 받아 그대로 브라우저에
// 돌려준다. 브라우저가 직접 못 가져오는 이유는 구글드라이브가 CORS 헤더를 주지 않아서다:
// <img crossorigin>이 실패하고, 어찌 그려도 canvas가 오염돼 toDataURL()이 막힌다.
// 서버끼리는 CORS가 없으므로 여기서 받아 CORS 헤더를 붙여 넘기면, 변환(WebP 2단)은 기존
// 클라이언트 로직을 그대로 재사용할 수 있다 — 서버에서 이미지 처리를 하지 않는 이유.
console.info("fetch-origin function booted (instore-media-admin)");

const MAX_BYTES = 30 * 1024 * 1024; // 30MB — 인쇄 원본이 커도 미리보기용으론 이 이상 필요 없다
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const fail = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// 공유 링크에서 파일 ID를 뽑아 실제 내려받기 주소로 바꾼다. 사용자는 보통
// ".../file/d/<ID>/view?usp=sharing"을 그대로 붙여넣으므로 그 형태를 먼저 본다.
function driveDownloadUrl(raw: string): string | null {
  let id: string | null = null;
  const m1 = raw.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  const m2 = raw.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m1) id = m1[1];
  else if (m2) id = m2[1];
  if (!id) return null;
  // usercontent 도메인은 큰 파일의 "바이러스 검사 안내" 페이지를 건너뛴다(confirm=t).
  return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return fail(405, "method not allowed");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // 아무나 쓰는 열린 프록시가 되지 않도록, 로그인한 직원인지 확인한다.
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData?.user) return fail(401, "인증되지 않았습니다.");
  const { data: adminRow } = await caller.from("admins").select("user_id").eq("user_id", userData.user.id).maybeSingle();
  if (!adminRow) return fail(403, "권한이 없습니다.");

  let body: { url?: string };
  try { body = await req.json(); } catch { return fail(400, "잘못된 요청입니다."); }
  const input = (body.url ?? "").trim();
  if (!input) return fail(400, "링크가 비어 있습니다.");

  let target: string;
  if (/drive\.google\.com|docs\.google\.com/i.test(input)) {
    const d = driveDownloadUrl(input);
    if (!d) return fail(400, "구글드라이브 링크에서 파일을 찾지 못했습니다. 파일의 '링크 복사'로 받은 주소인지 확인해 주세요.");
    target = d;
  } else if (/^https?:\/\//i.test(input)) {
    target = input;
  } else {
    return fail(400, "http(s)로 시작하는 링크만 사용할 수 있습니다.");
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
  } catch (e) {
    return fail(502, "링크에 접속하지 못했습니다: " + (e instanceof Error ? e.message : String(e)));
  }
  if (!upstream.ok) return fail(502, `링크를 열지 못했습니다 (${upstream.status}). 공유 설정이 "링크가 있는 모든 사용자"인지 확인해 주세요.`);

  const type = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  // 비공개 파일이면 구글이 로그인 페이지(HTML)를 돌려준다 — 파일을 받은 게 아니다.
  if (type.startsWith("text/html")) {
    return fail(403, '비공개 파일로 보입니다. 구글드라이브에서 공유를 "링크가 있는 모든 사용자"로 바꾼 뒤 다시 시도해 주세요.');
  }
  const isImage = type.startsWith("image/");
  const isPdf = type === "application/pdf" || type === "application/postscript"; // .ai는 대개 PDF 호환
  if (!isImage && !isPdf) {
    return fail(415, `이 형식(${type || "알 수 없음"})은 자동으로 불러올 수 없습니다. 사진을 직접 올려 주세요.`);
  }

  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return fail(413, `파일이 너무 큽니다(${(buf.byteLength / 1048576).toFixed(0)}MB). 30MB 이하만 자동으로 불러올 수 있습니다.`);
  }

  return new Response(buf, {
    headers: { ...CORS, "Content-Type": type, "Content-Length": String(buf.byteLength), "Cache-Control": "no-store" },
  });
});
