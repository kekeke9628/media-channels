// 매직링크 인증 + admins 판별 (사양서 2.1 — 배너 시스템의 매직링크/admins/is_admin() 패턴 재사용)
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';

// 로그인 링크가 만료/재사용됐을 때 GoTrue가 #error=...(구현 실패) 또는 ?error=...(PKCE)로
// 리다이렉트한다. URL에서 읽어 사용자에게 보여주고, 재파싱되지 않도록 주소를 정리한다.
function consumeAuthErrorFromUrl() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  const description = hash.get('error_description') || query.get('error_description');
  if (!description) return null;
  window.history.replaceState({}, '', window.location.pathname);
  return description.replace(/\+/g, ' ');
}

export function useAuth() {
  const [session, setSession] = useState(undefined); // undefined = 확인 중, null = 비로그인
  const [admin, setAdmin] = useState(undefined); // undefined = 확인 중, null = 미승인, 객체 = 승인된 직원
  const [authError, setAuthError] = useState(() => consumeAuthErrorFromUrl());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) { setAdmin(null); return; }
    setAdmin(undefined);
    supabase
      .from('admins')
      .select('role, name, email')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setAdmin(data ?? null));
  }, [session]);

  const loading = session === undefined || (!!session && admin === undefined);

  return {
    session,
    admin,
    loading,
    authError,
    isStaff: !!admin,
    isEditor: admin?.role === 'editor',
    signOut: () => supabase.auth.signOut(),
  };
}
