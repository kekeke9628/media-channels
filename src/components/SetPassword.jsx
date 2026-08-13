import React, { useState } from 'react';

// 비밀번호 재설정 메일의 링크를 열면 뜨는 화면. recovery 세션 상태에서만 렌더된다(App.jsx).
export default function SetPassword({ onSubmit }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return; }
    if (password !== confirm) { setError('비밀번호가 서로 다릅니다.'); return; }
    setBusy(true);
    setError('');
    try {
      await onSubmit(password);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="bmark">YPO</div>
        <h1>새 비밀번호 설정</h1>
        {done ? (
          <p className="okbox">비밀번호가 설정되었습니다. 이제 이 비밀번호로 로그인할 수 있습니다.</p>
        ) : (
          <form onSubmit={submit} className="authform">
            <label className="fld">
              <span>새 비밀번호 (8자 이상)</span>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="새 비밀번호" />
            </label>
            <label className="fld">
              <span>새 비밀번호 확인</span>
              <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="새 비밀번호 확인" />
            </label>
            {error && <p className="warnbox">{error}</p>}
            <button className="btn primary wide" type="submit" disabled={busy}>
              {busy ? '저장 중…' : '비밀번호 설정'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
