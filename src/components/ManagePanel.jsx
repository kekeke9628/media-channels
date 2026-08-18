import React, { useState } from 'react';
import { ZONES } from '../data/seed.js';

const zoneLabel = (z) => ZONES[z]?.label || z;

// 매체 관리 — 매체 유형 CRUD(보관), 매체 보관/복구/삭제. 매체 추가·위치 이동은 지도에서 한다.
export default function ManagePanel({ T, types, media, postings, isEditor, onAddType, onToggleType, onEditType, onRemoveMedia, onRestoreMedia }) {
  const [sec, setSec] = useState('media');
  const [editing, setEditing] = useState(null);
  const [edit, setEdit] = useState({});
  const [nt, setNt] = useState({ label: '', spec: '', faces: 1, color: '#5E7B8A', glyph: '▪', movable: false, openEnded: false });
  const [q, setQ] = useState('');

  const countOf = (code) => media.filter((m) => m.type === code && m.active).length;
  const rows = media.filter((m) => !q || (m.name + m.id + zoneLabel(m.zone)).toLowerCase().includes(q.toLowerCase()));

  const startEdit = (t) => { setEditing(t.code); setEdit({ label: t.label, spec: t.spec, faces: t.faces, glyph: t.glyph, color: t.color }); };
  const saveEdit = () => { onEditType(editing, edit); setEditing(null); };

  return (
    <div>
      <div className="toolrow">
        <div className="seg"><button className={sec === 'media' ? 'on' : ''} onClick={() => setSec('media')}>매체</button><button className={sec === 'type' ? 'on' : ''} onClick={() => setSec('type')}>매체 유형</button></div>
        <span className="count mono">{sec === 'media' ? media.filter((m) => m.active).length + '개 운영중' : types.length + '종'}</span>
      </div>

      {sec === 'type' && (
        <>
          <div className="scroll" style={{ maxHeight: 340, marginBottom: 16 }}>
            <table>
              <thead><tr><th>아이콘</th><th>유형</th><th>기본 규격</th><th className="r">면수</th><th>이동형</th><th>종료일</th><th className="r">등록 매체</th><th className="r">관리</th></tr></thead>
              <tbody>
                {types.map((t) => {
                  const isEd = editing === t.code;
                  return (
                    <tr key={t.code}>
                      <td>{isEd ? <input className="iconinp" value={edit.glyph} onChange={(e) => setEdit({ ...edit, glyph: e.target.value })} maxLength={2} /> : <span className="chip" style={{ background: t.color + '1A', color: t.color }}>{t.glyph}</span>}</td>
                      <td>{isEd ? <input className="inp" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /> : t.label}</td>
                      <td className="sub">{isEd ? <input className="inp" value={edit.spec} onChange={(e) => setEdit({ ...edit, spec: e.target.value })} /> : (t.spec || '—')}</td>
                      <td className="r mono">{isEd ? <input className="inp num" type="number" min="1" max="6" value={edit.faces} onChange={(e) => setEdit({ ...edit, faces: +e.target.value })} /> : t.faces}</td>
                      <td className="sub">{t.movable ? '예' : '—'}</td>
                      <td className="sub">{t.openEnded ? '미정 기본' : '필수'}</td>
                      <td className="r mono">{countOf(t.code)}</td>
                      <td className="r">
                        {!isEditor ? <span className="sub">—</span> : isEd ? (
                          <><button className="mini ok" onClick={saveEdit}>저장</button><button className="mini" onClick={() => setEditing(null)}>취소</button></>
                        ) : (
                          <><button className="mini" onClick={() => startEdit(t)}>수정</button><button className="mini" onClick={() => onToggleType(t.code)}>{t.active ? '보관' : '복구'}</button></>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {isEditor && (
            <section className="block">
              <h3>매체 유형 추가</h3>
              <div className="formrow">
                <input className="inp" placeholder="유형명" value={nt.label} onChange={(e) => setNt({ ...nt, label: e.target.value })} />
                <input className="inp" placeholder="기본 규격 (예: 900×1800mm)" value={nt.spec} onChange={(e) => setNt({ ...nt, spec: e.target.value })} />
                <input className="inp num" type="number" min="1" max="6" title="면수" value={nt.faces} onChange={(e) => setNt({ ...nt, faces: +e.target.value })} />
                <input className="iconinp" placeholder="아이콘" value={nt.glyph} onChange={(e) => setNt({ ...nt, glyph: e.target.value })} maxLength={2} />
                <input className="colorinp" type="color" value={nt.color} onChange={(e) => setNt({ ...nt, color: e.target.value })} />
                <label className="chk"><input type="checkbox" checked={nt.movable} onChange={(e) => setNt({ ...nt, movable: e.target.checked })} />이동형</label>
                <label className="chk"><input type="checkbox" checked={nt.openEnded} onChange={(e) => setNt({ ...nt, openEnded: e.target.checked })} />종료일 미정 기본</label>
                <button className="btn primary" disabled={!nt.label} onClick={() => { onAddType({ ...nt, code: 't' + Date.now(), active: true }); setNt({ label: '', spec: '', faces: 1, color: '#5E7B8A', glyph: '▪', movable: false, openEnded: false }); }}>추가</button>
              </div>
            </section>
          )}
        </>
      )}

      {sec === 'media' && (
        <>
          {isEditor && <p className="hint" style={{ marginBottom: 12 }}>새 매체는 상단의 <b>"+매체 관리"</b>로 원하는 위치에 바로 배치합니다. 위치를 옮기려면 "위치 편집" 모드에서 지도 핀을 드래그하세요.</p>}
          <div className="toolrow"><input className="inp" placeholder="매체명 · 구역 검색" value={q} onChange={(e) => setQ(e.target.value)} /><span className="count mono">{rows.length}건</span></div>
          <div className="scroll tall">
            <table>
              <thead><tr><th>매체</th><th>유형</th><th>구역</th><th className="r">면수</th><th className="r">게시 이력</th><th className="r">관리</th></tr></thead>
              <tbody>
                {rows.map((m) => {
                  const t = T[m.type];
                  const hist = postings.filter((p) => p.mediaId === m.id).length;
                  return (
                    <tr key={m.id} className={m.active ? '' : 'archived'}>
                      <td><b>{m.name}</b><i className="sub mono">{m.id}</i></td>
                      <td>{t && <span className="chip" style={{ background: t.color + '1A', color: t.color }}>{t.label}</span>}</td>
                      <td>{zoneLabel(m.zone)}</td>
                      <td className="r mono">{m.faces}</td>
                      <td className="r mono">{hist}건</td>
                      <td className="r">{!isEditor ? <span className="sub">—</span> : m.active ? <button className="mini no" onClick={() => onRemoveMedia(m.id)}>{hist ? '보관' : '삭제'}</button> : <button className="mini" onClick={() => onRestoreMedia(m.id)}>복구</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>게시 이력이 있는 매체는 삭제하면 과거 기록이 사라지므로 <b>보관 처리</b>됩니다.</p>
        </>
      )}
    </div>
  );
}
