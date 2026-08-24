-- is_allowed_admin_email(p_email)은 "이 이메일이 관리자 목록에 있는가"를 boolean으로 돌려준다.
-- anon으로도 호출 가능해서, 공개된 anon 키만 있으면 누구나 임의의 이메일을 넣어 우리 쪽
-- 관리자 계정을 하나씩 찾아낼 수 있었다(계정 열거). 로그인 화면을 포함해 현재 코드
-- 어디서도 호출하지 않는 예전 잔재라, 회수해도 동작에 영향이 없다.
--
-- 주의: is_staff()/is_editor()는 여기서 건드리지 않는다 — RLS 정책이 조회하는 역할로
-- 실행하므로 anon/authenticated에 EXECUTE가 남아 있어야 정책이 동작한다. 익명이 직접
-- 호출해도 auth.uid()가 없어 false만 나오므로 노출 위험이 없다.
revoke execute on function public.is_allowed_admin_email(text) from anon;
revoke execute on function public.is_allowed_admin_email(text) from authenticated;
revoke execute on function public.is_allowed_admin_email(text) from public;
