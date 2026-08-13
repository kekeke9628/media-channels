import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// 소유자 전용 "관리자 비밀번호 초기화" API. OWNER_EMAIL/RESET_PASSWORD는 이 프로젝트의
// Edge Function Secrets에 등록돼 있다(대시보드 > Edge Functions > Secrets) — 이 파일에는
// 값이 없으므로 안전하게 공개 저장소에 커밋한다. SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY는
// 모든 Edge Function에 자동 주입되는 기본 시크릿이라 별도 등록이 필요 없다.
// (가로등배너 banner-admin 프로젝트와 동일한 함수)
console.info("reset-admin-password function booted (instore-media-admin)");

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ownerEmail = Deno.env.get("OWNER_EMAIL")!;
  const resetPassword = Deno.env.get("RESET_PASSWORD")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // 호출자가 진짜 로그인한 사용자인지 JWT로 검증한다(익명 anon key만으론 통과 못 함).
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "인증되지 않았습니다." }), { status: 401 });
  }
  if ((userData.user.email ?? "").toLowerCase() !== ownerEmail.toLowerCase()) {
    return new Response(JSON.stringify({ error: "권한이 없습니다." }), { status: 403 });
  }

  let body: { target_email?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "잘못된 요청입니다." }), { status: 400 });
  }
  const targetEmail = (body.target_email ?? "").trim();
  if (!targetEmail) {
    return new Response(JSON.stringify({ error: "target_email이 필요합니다." }), { status: 400 });
  }

  // service_role 키는 여기(서버 쪽)에서만 쓴다 — 브라우저 번들에는 절대 노출 안 됨.
  const adminClient = createClient(supabaseUrl, serviceKey);
  const { error: rpcError } = await adminClient.rpc("admin_reset_password", {
    p_email: targetEmail,
    p_password: resetPassword,
  });
  if (rpcError) {
    return new Response(JSON.stringify({ error: rpcError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
