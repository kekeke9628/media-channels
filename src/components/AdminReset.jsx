import React, { useState } from 'react';

// 소유자 전용. 다른 관리자의 비밀번호를 공용 초기값으로 되돌린다(useAuth.js resetAdminPassword).
export default function AdminReset({ onClose, onSubmit }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit(email);
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
        <h1>관리자 비밀번호 초기화</h1>
        {done ? (
          <>
            <p className="okbox">{email}의 비밀번호를 초기값으로 되돌렸습니다. 본인에게 알려주시고, 로그인 후 바로 비밀번호를 바꾸도록 안내하세요.</p>
            <button className="btn primary wide" onClick={onClose}>닫기</button>
          </>
        ) : (
          <form onSubmit={submit} className="authform">
            <p className="sub">대상 계정의 비밀번호를 공용 초기값으로 되돌립니다.</p>
            <label className="fld">
              <span>대상 이메일</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" />
            </label>
            {error && <p className="warnbox">{error}</p>}
            <button className="btn primary wide" type="submit" disabled={busy || !email}>
              {busy ? '초기화 중…' : '비밀번호 초기화'}
            </button>
            <button type="button" className="btn wide" onClick={onClose}>취소</button>
          </form>
        )}
      </div>
    </div>
  );
}
