-- 저장 공간 사용량 조회. storage.objects는 클라이언트에서 직접 못 읽으므로(PostgREST에
-- 노출 안 됨) SECURITY DEFINER 함수로 합계만 돌려준다. 로그인한 관리자에게만 응답한다.
create or replace function public.storage_usage()
returns table (bucket text, files bigint, bytes bigint)
language sql
security definer
set search_path = ''
as $$
  select o.bucket_id::text,
         count(*)::bigint,
         coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
  from storage.objects o
  where exists (select 1 from public.admins a where a.user_id = auth.uid())
  group by o.bucket_id;
$$;

revoke all on function public.storage_usage() from public, anon;
grant execute on function public.storage_usage() to authenticated;
