-- 015에서 "프론트엔드(anon/authenticated)에는 절대 노출하지 않는다"고 의도했지만, 실제
-- 운영 DB에서는 anon·authenticated 모두 EXECUTE를 갖고 있었다(2026-08-24 점검에서 발견).
--
-- 원인: 015의 `revoke all ... from public`은 PUBLIC 의사 역할에서만 회수한다. Supabase는
-- public 스키마에 만들어지는 함수에 anon/authenticated EXECUTE를 default privileges로 따로
-- 부여하므로, 그 두 역할의 권한은 회수되지 않고 그대로 남았다.
--
-- 영향: 이 함수는 권한 검사가 전혀 없이 auth.users의 비밀번호를 바꾼다. anon 키는 공개
-- 사이트의 클라이언트 번들에 그대로 들어 있으므로, 누구나 아래 한 번의 요청으로 소유자
-- 계정을 포함한 아무 계정이나 탈취할 수 있는 상태였다.
--   POST /rest/v1/rpc/admin_reset_password  {"p_email": "...", "p_password": "..."}
--
-- 정상 경로인 Edge Function(reset-admin-password)은 호출자 JWT와 소유자 이메일을 검증한 뒤
-- service_role 키로 호출하므로 이 회수의 영향을 받지 않는다.
revoke execute on function public.admin_reset_password(text, text) from anon;
revoke execute on function public.admin_reset_password(text, text) from authenticated;
revoke execute on function public.admin_reset_password(text, text) from public;

-- 앞으로 이 함수를 create or replace 해도 기본 권한이 다시 붙지 않도록 명시적으로 고정한다.
grant execute on function public.admin_reset_password(text, text) to service_role;
