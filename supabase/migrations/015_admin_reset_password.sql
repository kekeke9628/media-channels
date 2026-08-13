-- 소유자 전용 "관리자 비밀번호 초기화" 기능이 쓰는 함수. service_role(Edge Function)에서만
-- 호출 가능하다 — 프론트엔드(anon/authenticated)에는 절대 노출하지 않는다.
-- pgcrypto(extensions 스키마)가 이미 설치돼 있어 별도 extension 생성 불필요.
-- (가로등배너 banner-admin 프로젝트의 009_admin_reset_password.sql과 동일한 패턴)
create or replace function public.admin_reset_password(p_email text, p_password text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
  where lower(email) = lower(p_email);
$$;

revoke all on function public.admin_reset_password(text, text) from public;
grant execute on function public.admin_reset_password(text, text) to service_role;
