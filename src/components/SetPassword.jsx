import React, { useState } from 'react';

// 로그인한 사람이 스스로 비밀번호를 바꾸는 화면(이메일 불필요).
export default function SetPassword({ onClose, onSubmit }) {
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
        <h1>비밀번호 변경</h1>
        {done ? (
          <>
            <p className="okbox">비밀번호가 변경되었습니다.</p>
            {onClose && <button className="btn primary wide" onClick={onClose}>닫기</button>}
          </>
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
              {busy ? '저장 중…' : '비밀번호 변경'}
            </button>
            {onClose && <button type="button" className="btn wide" onClick={onClose}>취소</button>}
          </form>
        )}
      </div>
    </div>
  );
}
