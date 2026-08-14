import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const DOMAINS = ['gmail.com', 'naver.com', 'premiumoutlets.co.kr'];
const CUSTOM = '__custom__';

export default function Login({ initialError }) {
  const [local, setLocal] = useState('');
  const [domain, setDomain] = useState(DOMAINS[0]);
  const [customDomain, setCustomDomain] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    initialError ? '로그인 링크가 만료되었거나 이미 사용되었습니다. 새 링크를 요청하세요. (' + initialError + ')' : ''
  );

  const email = local && `${local}@${domain === CUSTOM ? customDomain : domain}`;

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password || busy) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
  };

  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="bmark">YPO</div>
        <h1>점내 홍보매체</h1>
        <p className="sub">여주 프리미엄 아울렛 · 내부 직원 전용</p>

        <form onSubmit={submit} className="authform">
          <label className="fld">
            <span>직원 이메일</span>
            <div className="emailfld">
              <input
                type="text"
                required
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="name"
                autoCapitalize="off"
                autoCorrect="off"
              />
              <span className="at">@</span>
              {domain === CUSTOM ? (
                <input
                  type="text"
                  required
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="도메인 직접 입력"
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              ) : (
                <select value={domain} onChange={(e) => setDomain(e.target.value)}>
                  {DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                  <option value={CUSTOM}>직접 입력</option>
                </select>
              )}
            </div>
          </label>
          <label className="fld">
            <span>비밀번호</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
            />
          </label>
          {error && <p className="warnbox">{error}</p>}
          <button className="btn primary wide" type="submit" disabled={busy}>
            {busy ? '로그인 중…' : '로그인'}
          </button>
          <p className="sub" style={{ marginTop: 10 }}>비밀번호를 잊으면 소유자 계정에 초기화를 요청하세요.</p>
        </form>
      </div>
    </div>
  );
}
