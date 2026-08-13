// 이메일+비밀번호 인증 + admins 판별. 매직링크 발신 한도(시간당 2통) 문제로
// 비밀번호 로그인으로 전환했다(가로등배너 banner-admin과 동일한 전환).
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
  // 비밀번호 재설정 메일 링크를 열면 PASSWORD_RECOVERY 이벤트와 함께 임시 세션이 생긴다.
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true);
    });
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

  const updatePassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setIsRecovery(false);
  };

  return {
    session,
    admin,
    loading,
    authError,
    isRecovery,
    isStaff: !!admin,
    isEditor: admin?.role === 'editor',
    signOut: () => supabase.auth.signOut(),
    updatePassword,
  };
}
