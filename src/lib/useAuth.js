// 이메일+비밀번호 인증 + admins 판별. 매직링크 발신 한도(시간당 2통) 문제로
// 비밀번호 로그인으로 전환했다(가로등배너 banner-admin과 동일한 전환).
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';

// 이 계정으로 로그인한 사람만 "관리자 비밀번호 초기화" 메뉴를 볼 수 있다.
// 실제 권한 검사는 서버 쪽 Edge Function(reset-admin-password)이 JWT로 다시 확인하므로,
// 여기 값은 UI 노출 여부만 결정할 뿐 보안 경계가 아니다.
export const OWNER_EMAIL = 'kekeke9628@gmail.com';

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

  // 로그인한 사람이 스스로 비밀번호를 바꾼다(이메일 불필요, 세션만 있으면 된다).
  const updatePassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };

  return {
    session,
    admin,
    loading,
    authError,
    isStaff: !!admin,
    isEditor: admin?.role === 'editor',
    signOut: () => supabase.auth.signOut(),
    updatePassword,
  };
}

// 소유자가 다른 관리자의 비밀번호를 공용 초기값(shinsegae1@)으로 되돌린다.
// service_role 키가 필요한 작업이라 프론트에서 직접 못 하고, Edge Function을 거친다.
export async function resetAdminPassword(targetEmail, accessToken) {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-admin-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ target_email: targetEmail }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '초기화에 실패했습니다.');
  return data;
}
