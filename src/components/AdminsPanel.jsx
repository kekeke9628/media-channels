import React, { useEffect, useState } from 'react';
import { fetchAdmins, findUserIdByEmail, addAdmin, updateAdminRole, removeAdmin, fetchStorageUsage, cleanupOrphanImages, STORAGE_LIMIT } from '../lib/queries.js';

// 관리자 관리 — admins 테이블 CRUD. auth.users를 직접 못 보므로, 이메일로 로그인 시도한
// 적 있는지(user_id 존재) 먼저 조회한 뒤에만 admins에 추가할 수 있다(012 마이그레이션).
const mb = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(2) + 'GB' : (b / 1048576).toFixed(1) + 'MB');

export default function AdminsPanel({ meId, narrow }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'editor' });
  // 저장 공간 — 사진이 쌓이면 언젠가 한도에 닿으므로 지금 얼마나 쓰는지 보이게 한다.
  const [usage, setUsage] = useState(null);
  const loadUsage = () => fetchStorageUsage().then(setUsage).catch(() => setUsage(null));
  useEffect(() => { loadUsage(); }, []);
  // 어느 홍보물도 참조하지 않는 사진 걷어내기 — 삭제 경로가 파일을 안 지우던 시절의
  // 찌꺼기와, 파일 삭제가 실패했을 때 남은 것들을 정리한다.
  const [sweeping, setSweeping] = useState(false);
  const [swept, setSwept] = useState('');
  const sweep = async () => {
    setSweeping(true); setSwept('');
    try {
      const r = await cleanupOrphanImages();
      setSwept(r.files ? `사진 ${r.files}개(${mb(r.bytes)})를 지웠습니다.` : '지울 사진이 없습니다 — 모두 쓰이고 있습니다.');
      await loadUsage();
    } catch (e) { setSwept('정리하지 못했습니다: ' + e.message); }
    setSweeping(false);
  };

  const load = () => {
    setLoading(true);
    fetchAdmins()
      .then(setAdmins)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const submit = async (e) => {
    e.preventDefault();
    const email = form.email.trim();
    if (!email || busy) return;
    setBusy(true);
    setErr('');
    try {
      const userId = await findUserIdByEmail(email);
      if (!userId) {
        setErr(`${email}은(는) 아직 로그인 링크를 요청한 적이 없습니다. 먼저 로그인 페이지에서 링크를 한 번 요청하도록 안내한 뒤 다시 추가해주세요.`);
        return;
      }
      const created = await addAdmin({ userId, email, name: form.name.trim(), role: form.role });
      setAdmins((prev) => [...prev, created]);
      setForm({ email: '', name: '', role: 'editor' });
    } catch (e) {
      setErr(e.code === '23505' ? '이미 등록된 관리자입니다.' : e.message);
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (userId, role) => {
    setErr('');
    const prev = admins;
    setAdmins((cur) => cur.map((a) => (a.user_id === userId ? { ...a, role } : a)));
    try {
      await updateAdminRole(userId, role);
    } catch (e) {
      setAdmins(prev);
      setErr(e.message);
    }
  };

  const remove = async (userId) => {
    setErr('');
    const prev = admins;
    setAdmins((cur) => cur.filter((a) => a.user_id !== userId));
    try {
      await removeAdmin(userId);
    } catch (e) {
      setAdmins(prev);
      setErr(e.message);
    }
  };

  return (
    <div>
      <div className="toolrow">
        <span className="count mono">{admins.length}명</span>
      </div>

      {usage && (() => {
        const used = usage.reduce((n, u) => n + u.bytes, 0);
        const files = usage.reduce((n, u) => n + u.files, 0);
        const pct = Math.min(100, (used / STORAGE_LIMIT) * 100);
        return (
          <section className="block" style={{ marginBottom: 16 }}>
            <h3>저장 공간</h3>
            <div className="gauge"><i style={{ width: Math.max(pct, 0.6) + '%' }} /></div>
            <p className="hint" style={{ marginTop: 8 }}>
              사진 {files}개로 <b className="mono">{mb(used)}</b> 사용 중 · 전체 <b className="mono">1.0GB</b>
              {pct < 1 ? ' (1%도 안 씀)' : ` (${pct.toFixed(pct < 10 ? 1 : 0)}%)`}
            </p>
            <p className="hint">한도에 가까워지면 요금제를 올리거나 오래된 홍보물의 사진을 지우면 됩니다.</p>
            <div className="facerow" style={{ marginTop: 10, cursor: 'default' }}>
              <span>안 쓰는 사진 정리 — 어느 홍보물도 참조하지 않는 파일을 찾아 지웁니다.</span>
              <button className="mini" style={{ marginLeft: 'auto' }} onClick={sweep} disabled={sweeping}>
                {sweeping ? '정리 중…' : '정리하기'}
              </button>
            </div>
            {swept && <p className="hint" style={{ marginTop: 6 }}>{swept}</p>}
          </section>
        );
      })()}

      {err && <p className="warnbox">{err}</p>}

      {/* 좁은 화면에서 이메일 주소가 든 4열 표는 옆으로 밀어야만 권한·제거가 보였다 —
          다른 화면들과 같이 카드 목록으로 바꾼다. */}
      {loading ? (
        <p className="sub">불러오는 중…</p>
      ) : narrow ? (
        <div className="mlist" style={{ marginBottom: 16 }}>
          {admins.map((a) => {
            const self = a.user_id === meId;
            return (
              <div className="mcard" key={a.user_id}>
                <div className="mcard-top"><b>{a.email}</b>{self && <span className="sub">(나)</span>}</div>
                <div className="mcard-meta"><span className="sub">{a.name || '이름 없음'}</span></div>
                <label className="fld"><span>권한</span>
                  <select value={a.role} onChange={(e) => changeRole(a.user_id, e.target.value)}>
                    <option value="editor">편집자</option>
                    <option value="viewer">조회자</option>
                  </select>
                </label>
                {!self && <button className="btn wide danger" onClick={() => remove(a.user_id)}>이 관리자 제거</button>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="scroll pinlast short">
          <table>
            <thead><tr><th>이메일</th><th>이름</th><th>권한</th><th className="r">관리</th></tr></thead>
            <tbody>
              {admins.map((a) => {
                const self = a.user_id === meId;
                return (
                  <tr key={a.user_id}>
                    <td><b>{a.email}</b>{self && <i className="sub"> (나)</i>}</td>
                    <td className="sub">{a.name || '—'}</td>
                    <td>
                      <select className="inp" value={a.role} onChange={(e) => changeRole(a.user_id, e.target.value)}>
                        <option value="editor">편집자</option>
                        <option value="viewer">조회자</option>
                      </select>
                    </td>
                    <td className="r">
                      {self ? <span className="sub">—</span> : <button className="mini no" onClick={() => remove(a.user_id)}>제거</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="block">
        <h3>관리자 추가</h3>
        <p className="hint" style={{ marginBottom: 12 }}>
          추가하려는 사람이 <b>먼저 로그인 페이지에서 링크를 한 번 요청</b>해야 합니다(로그인은 안 해도 됨). 그 후에만 여기서 추가할 수 있습니다.
        </p>
        <form className="formrow" onSubmit={submit}>
          <input className="inp" type="email" required placeholder="이메일" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="inp" placeholder="이름 (선택)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="inp" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="editor">편집자</option>
            <option value="viewer">조회자</option>
          </select>
          <button className="btn primary" type="submit" disabled={busy || !form.email.trim()}>{busy ? '확인 중…' : '추가'}</button>
        </form>
      </section>
    </div>
  );
}
