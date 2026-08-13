-- 로그인 화면에서 매직링크 전송 전에, 입력한 이메일이 admins 허용 목록에 있는지
-- 비로그인 상태(anon)에서도 확인할 수 있게 하는 함수.
-- admins 테이블 자체는 RLS로 본인 행만 조회 가능(admins_select_self)하므로,
-- 존재 여부만 반환하는 이 함수를 통해서만 우회 조회를 허용한다.
-- (가로등배너 banner-admin 프로젝트의 008_allowed_email_check.sql과 동일한 패턴)
create or replace function public.is_allowed_admin_email(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where lower(email) = lower(p_email)
  );
$$;

revoke all on function public.is_allowed_admin_email(text) from public;
grant execute on function public.is_allowed_admin_email(text) to anon, authenticated;
