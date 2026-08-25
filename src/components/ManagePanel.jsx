import React, { useState } from 'react';
import { ZONES } from '../data/seed.js';
import { typeChipStyle, matches, sideOf, nameTaken, byName } from '../constants.js';

const zoneLabel = (z) => ZONES[z]?.label || z;
// 구역은 이제 매체명에서 읽는다(constants.zoneOf) — 이름과 구역이 어긋날 수가 없어서
// 예전의 "이름은 EAST" 경고는 걷어냈다.

// 지도 핀에 찍히는 글자(아이콘)와 유형 색은 화면에서 유형을 구분하는 데 실제로 쓰인다 —
// 핀 라벨, 필터 목록의 색점, 유형 칩이 전부 이 두 값을 읽는다. 다만 유형을 만드는 사람이
// 매번 고를 일은 아니라(무엇을 골라야 할지도 알 수 없다) 이름에서 자동으로 정한다.
// 마음에 안 들면 아래 유형 목록에서 언제든 고칠 수 있다.
const PALETTE = ['#4B7B58', '#3C6E9E', '#B4834B', '#7A5AA6', '#C2703D', '#8E6B2C', '#5E7B8A', '#A74D46'];
const autoColor = (types) => {
  const used = new Set(types.map((t) => (t.color || '').toUpperCase()));
  return PALETTE.find((c) => !used.has(c)) || PALETTE[types.length % PALETTE.length];
};
// 한글은 한 글자로 충분하고(핀이 모바일에서 19px까지 줄어든다), 영문은 두 글자를 쓴다.
// 이미 있는 유형과 겹치면 한 글자 늘려 구분한다.
const autoGlyph = (label, types) => {
  const t = (label || '').replace(/\s+/g, '');
  if (!t) return '▪';
  const hangul = /[\uAC00-\uD7A3]/.test(t[0]);
  const used = new Set(types.map((x) => x.glyph));
  for (const n of hangul ? [1, 2] : [2, 3]) {
    const g = t.slice(0, n).toUpperCase();
    if (!used.has(g)) return g;
  }
  return t.slice(0, hangul ? 1 : 2).toUpperCase();
};


// 매체 관리 — 매체 유형 CRUD(보관), 매체 보관/복구/삭제. 매체 추가·위치 이동은 지도에서 한다.
export default function ManagePanel({ T, types, media, postings, isEditor, narrow, onAddType, onToggleType, onEditType, onRemoveType, onEditMediaFaces, onRenameMedia, onChangeMediaType, onRemoveMedia, onRestoreMedia }) {
  const [sec, setSec] = useState('media');
  const [editing, setEditing] = useState(null);
  const [edit, setEdit] = useState({});
  const [nt, setNt] = useState({ label: '', specW: '', specH: '', faces: 1 });
  const [q, setQ] = useState('');
  // EAST/WEST는 매체명 두 번째 글자로 갈린다(DEH01 → E) — 매체가 늘어나면 한쪽만
  // 훑어보는 일이 많아 목록에서 바로 거를 수 있게 한다.
  const [side, setSide] = useState('ALL');

  // 매체 하나의 면수 수정 — 듀라트란스처럼 자리마다 판 개수가 제각각인 유형은 유형 기본값
  // 하나로 못 맞추니 개별 매체마다 고칠 수 있어야 한다. 줄이는 쪽은 위험하다 — 안 보이게
  // 되는 면에 아직 철거 안 한 배치가 있으면 그 배치가 화면 어디에도 안 뜨는 채로 살아있게
  // 되므로(슬롯은 media.faces 개수만큼만 만들어진다), 그 경우엔 막는다.
  // 매체명도 같은 자리에서 고친다 — 오타나 현장 표기 변경이 흔한데 만들 때 정하면 끝이라
  // 방법이 없었다. 이름은 표시용이라 배치 이력에는 영향이 없다(배치는 id로 묶인다).
  const [editingMediaId, setEditingMediaId] = useState(null);
  const [edName, setEdName] = useState('');
  const [edFaces, setEdFaces] = useState(1);
  const [faceErr, setFaceErr] = useState('');
  const [edType, setEdType] = useState('');
  const startEditMedia = (m) => { setEditingMediaId(m.id); setEdName(m.name); setEdFaces(m.faces); setEdType(m.type); setFaceErr(''); };
  const saveMedia = (m) => {
    const n = +edFaces;
    const name = (edName || '').trim();
    if (!n || n < 1) return;
    if (!name) { setFaceErr('매체명을 비워 둘 수 없습니다.'); return; }
    if (nameTaken(media, name, m.id)) { setFaceErr(`"${name}"은(는) 이미 있는 매체명입니다.`); return; }
    const blocking = postings.filter((p) => p.mediaId === m.id && !p.removedAt && (p.face || 1) > n);
    if (blocking.length > 0) {
      setFaceErr(`${Math.max(...blocking.map((p) => p.face || 1))}면에 아직 철거하지 않은 배치가 있어 줄일 수 없습니다.`);
      return;
    }
    if (name !== m.name) onRenameMedia(m.id, name);
    if (n !== m.faces) onEditMediaFaces(m.id, n);
    if (edType && edType !== m.type) onChangeMediaType(m.id, edType);
    setEditingMediaId(null);
  };

  const countOf = (code) => media.filter((m) => m.type === code && m.active).length;
  const histOf = (id) => postings.filter((p) => p.mediaId === id).length;
  const rows = media.filter((m) => {
    if (side !== 'ALL' && sideOf(m) !== side) return false;
    if (!q) return true;
    const t = T[m.type];
    const haystack = [m.name, m.id, zoneLabel(m.zone), t?.label, m.faces, histOf(m.id) + '건'].join(' ');
    return matches(haystack, q);
  }).sort((a, b) => byName(a.name, b.name));

  // "900×1800mm" 같은 규격 문자열 ↔ 가로/세로 숫자 두 칸. 저장 형식은 기존과 동일한
  // 문자열이라(AddModal의 비율 검사 정규식 등 다른 곳에서 그대로 읽는다), 입력만 숫자
  // 두 칸으로 나누고 제출 시 다시 합친다.
  const parseSpec = (spec) => {
    const m = (spec || '').match(/(\d+)\D+(\d+)/);
    return m ? { w: m[1], h: m[2] } : { w: '', h: '' };
  };
  const joinSpec = (w, h) => (w && h ? `${w}×${h}mm` : '');

  const startEdit = (t) => {
    const { w, h } = parseSpec(t.spec);
    setEditing(t.code);
    setEdit({ label: t.label, specW: w, specH: h, faces: t.faces, glyph: t.glyph, color: t.color });
  };
  const saveEdit = () => { onEditType(editing, { label: edit.label, spec: joinSpec(edit.specW, edit.specH), faces: edit.faces, glyph: edit.glyph, color: edit.color }); setEditing(null); };

  return (
    <div>
      <div className="toolrow">
        <div className="seg"><button className={sec === 'media' ? 'on' : ''} onClick={() => setSec('media')}>매체</button><button className={sec === 'type' ? 'on' : ''} onClick={() => setSec('type')}>매체 유형</button></div>
        <span className="count mono">{sec === 'media' ? media.filter((m) => m.active).length + '개 운영중' : types.length + '종'}</span>
      </div>

      {sec === 'type' && (
        <>
          {narrow ? (
            <div className="mlist" style={{ marginBottom: 16 }}>
              {types.map((t) => {
                const isEd = editing === t.code;
                return (
                  <div className={'mcard' + (t.active ? '' : ' archived')} key={t.code}>
                    {isEd ? (
                      <>
                        <div className="fld2">
                          <label className="fld"><span>유형명</span><input value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></label>
                          <label className="fld"><span>아이콘</span><input value={edit.glyph} onChange={(e) => setEdit({ ...edit, glyph: e.target.value })} maxLength={2} /></label>
                        </div>
                        <div className="fld2" style={{ marginTop: 8 }}>
                          <label className="fld"><span>가로 (mm)</span><input type="number" min="1" value={edit.specW} onChange={(e) => setEdit({ ...edit, specW: e.target.value })} /></label>
                          <label className="fld"><span>세로 (mm)</span><input type="number" min="1" value={edit.specH} onChange={(e) => setEdit({ ...edit, specH: e.target.value })} /></label>
                        </div>
                        <label className="fld" style={{ marginTop: 8 }}><span>면수</span><input type="number" min="1" value={edit.faces} onChange={(e) => setEdit({ ...edit, faces: +e.target.value })} /></label>
                        <div className="conflictbtns" style={{ marginTop: 10 }}>
                          <button className="btn primary" onClick={saveEdit}>저장</button>
                          <button className="btn" onClick={() => setEditing(null)}>취소</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="mcard-top">
                          <b>{t.label}</b>
                          <span className="chip" style={typeChipStyle(t.color)}>{t.glyph}</span>
                        </div>
                        <div className="mcard-meta">
                          <span className="sub mono">{t.spec || '규격 미정'} · {t.faces}면</span>
                        </div>
                        <div className="mcard-date">
                          등록 매체 {countOf(t.code)}개
                        </div>
                        {isEditor && (
                          <div className="conflictbtns" style={{ marginTop: 9 }}>
                            <button className="btn" onClick={() => startEdit(t)}>수정</button>
                            <button className="btn" onClick={() => onToggleType(t.code)}>{t.active ? '보관' : '복구'}</button>
                            <button className="btn danger" onClick={() => onRemoveType(t.code)}>삭제</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
          <div className="scroll" style={{ maxHeight: 340, marginBottom: 16 }}>
            <table>
              <thead><tr><th>아이콘</th><th>유형</th><th>기본 규격</th><th className="r">면수</th><th className="r">등록 매체</th><th className="r">관리</th></tr></thead>
              <tbody>
                {types.map((t) => {
                  const isEd = editing === t.code;
                  return (
                    <tr key={t.code}>
                      <td>{isEd ? <input className="iconinp" value={edit.glyph} onChange={(e) => setEdit({ ...edit, glyph: e.target.value })} maxLength={2} /> : <span className="chip" style={typeChipStyle(t.color)}>{t.glyph}</span>}</td>
                      <td>{isEd ? <input className="inp" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /> : t.label}</td>
                      <td className="sub">
                        {isEd ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input className="inp num" type="number" min="1" placeholder="가로" value={edit.specW} onChange={(e) => setEdit({ ...edit, specW: e.target.value })} />
                            <span>×</span>
                            <input className="inp num" type="number" min="1" placeholder="세로" value={edit.specH} onChange={(e) => setEdit({ ...edit, specH: e.target.value })} />
                          </div>
                        ) : (t.spec || '—')}
                      </td>
                      <td className="r mono">{isEd ? <input className="inp num" type="number" min="1" value={edit.faces} onChange={(e) => setEdit({ ...edit, faces: +e.target.value })} /> : t.faces}</td>
                      <td className="r mono">{countOf(t.code)}</td>
                      <td className="r">
                        {!isEditor ? <span className="sub">—</span> : isEd ? (
                          <><button className="mini ok" onClick={saveEdit}>저장</button><button className="mini" onClick={() => setEditing(null)}>취소</button></>
                        ) : (
                          <><button className="mini" onClick={() => startEdit(t)}>수정</button><button className="mini" onClick={() => onToggleType(t.code)}>{t.active ? '보관' : '복구'}</button><button className="mini danger" onClick={() => onRemoveType(t.code)}>삭제</button></>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
          {isEditor && (
            <section className="block">
              <h3>매체 유형 추가</h3>
              <div className="formrow">
                <label className="fld"><span>유형명</span><input placeholder="예: 듀라트란스" value={nt.label} onChange={(e) => setNt({ ...nt, label: e.target.value })} /></label>
                <div className="fld2">
                  <label className="fld"><span>가로 (mm)</span><input type="number" min="1" placeholder="900" value={nt.specW} onChange={(e) => setNt({ ...nt, specW: e.target.value })} /></label>
                  <label className="fld"><span>세로 (mm)</span><input type="number" min="1" placeholder="1800" value={nt.specH} onChange={(e) => setNt({ ...nt, specH: e.target.value })} /></label>
                </div>
                <label className="fld"><span>면수</span><input type="number" min="1" value={nt.faces} onChange={(e) => setNt({ ...nt, faces: +e.target.value })} /></label>
                {nt.label && (
                  <p className="hint">지도 핀 — <span className="chip" style={typeChipStyle(autoColor(types))}>{autoGlyph(nt.label, types)}</span> 색과 글자는 이름에서 자동으로 정해집니다. 아래 목록에서 고칠 수 있습니다.</p>
                )}
                <button className="btn primary" disabled={!nt.label} onClick={() => {
                  onAddType({
                    label: nt.label, spec: joinSpec(nt.specW, nt.specH), faces: nt.faces,
                    color: autoColor(types), glyph: autoGlyph(nt.label, types),
                    code: 't' + Date.now(), active: true,
                  });
                  setNt({ label: '', specW: '', specH: '', faces: 1 });
                }}>추가</button>
              </div>
            </section>
          )}
        </>
      )}

      {sec === 'media' && (
        <>
          <div className="toolrow">
            <div className="seg">
              {[['ALL', '전체'], ['EAST', 'EAST'], ['WEST', 'WEST']].map(([k, label]) => (
                <button key={k} className={side === k ? 'on' : ''} onClick={() => setSide(k)}>{label}</button>
              ))}
            </div>
            <input className="inp" placeholder="매체명 · 유형 · 구역 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="count mono">{rows.length}건</span>
          </div>
          {rows.length === 0 ? (
            <p className="empty">
              {media.length === 0
                ? '아직 등록된 매체가 없습니다. "+매체 추가"를 누른 뒤 배치도에서 위치를 찍어 등록하세요.'
                : '조건에 맞는 매체가 없습니다.'}
            </p>
          ) : narrow ? (
            <div className="mlist">
              {rows.map((m) => {
                const t = T[m.type];
                const hist = histOf(m.id);
                return (
                  <div className={'mcard' + (m.active ? '' : ' archived')} key={m.id}>
                    <div className="mcard-top">
                      {editingMediaId === m.id
                        ? <input className="inp" value={edName} onChange={(e) => setEdName(e.target.value)} placeholder="매체명" />
                        : <b>{m.name}</b>}
                      {editingMediaId === m.id
                        ? <select className="sel" value={edType} onChange={(e) => setEdType(e.target.value)}>
                            {types.filter((x) => x.active || x.code === m.type).map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
                          </select>
                        : t && <span className="chip" style={typeChipStyle(t.color)}>{t.label}</span>}
                    </div>
                    <div className="mcard-meta">
                      <span className="sub">{zoneLabel(m.zone)}</span>
                      {editingMediaId === m.id ? (
                        <span className="sub mono" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <input className="inp num" type="number" min="1" style={{ width: 56 }} value={edFaces} onChange={(e) => setEdFaces(e.target.value)} />면
                        </span>
                      ) : (
                        <span className="sub mono">{m.spec || T[m.type]?.spec || '규격 미정'} · {m.faces}면</span>
                      )}
                    </div>
                    {editingMediaId === m.id && faceErr && <p className="warnbox" style={{ marginTop: 6 }}>{faceErr}</p>}
                    <div className="mcard-date">지난 배치 {hist}건</div>
                    {isEditor && (
                      editingMediaId === m.id ? (
                        <div className="conflictbtns" style={{ marginTop: 8 }}>
                          <button className="btn primary" onClick={() => saveMedia(m)}>저장</button>
                          <button className="btn" onClick={() => setEditingMediaId(null)}>취소</button>
                        </div>
                      ) : (
                        <div className="conflictbtns" style={{ marginTop: 8 }}>
                          <button className="btn" onClick={() => startEditMedia(m)}>수정</button>
                          {m.active
                            ? <button className="btn danger" onClick={() => onRemoveMedia(m.id)}>{hist ? '보관' : '삭제'}</button>
                            : <button className="btn" onClick={() => onRestoreMedia(m.id)}>복구</button>}
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
          <div className="scroll tall">
            <table>
              <thead><tr><th>매체명</th><th>유형</th><th>구역</th><th className="r">면수</th><th className="r">지난 배치</th><th className="r">관리</th></tr></thead>
              <tbody>
                {rows.map((m) => {
                  const t = T[m.type];
                  const hist = histOf(m.id);
                  return (
                    <tr key={m.id} className={m.active ? '' : 'archived'}>
                      <td>{editingMediaId === m.id
                        ? <input className="inp" value={edName} onChange={(e) => setEdName(e.target.value)} placeholder="매체명" />
                        : <b>{m.name}</b>}</td>
                      <td>{editingMediaId === m.id
                        ? <select className="sel" value={edType} onChange={(e) => setEdType(e.target.value)}>
                            {types.filter((x) => x.active || x.code === m.type).map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
                          </select>
                        : t && <span className="chip" style={typeChipStyle(t.color)}>{t.label}</span>}</td>
                      <td>{zoneLabel(m.zone)}</td>
                      <td className="r mono">
                        {editingMediaId === m.id ? (
                          <>
                            <input className="inp num" type="number" min="1" value={edFaces} onChange={(e) => setEdFaces(e.target.value)} />
                            {faceErr && <div className="sub" style={{ color: '#B4534B', marginTop: 4, textAlign: 'left' }}>{faceErr}</div>}
                          </>
                        ) : m.faces}
                      </td>
                      <td className="r mono">{hist}건</td>
                      <td className="r">
                        {!isEditor ? <span className="sub">—</span> : editingMediaId === m.id ? (
                          <><button className="mini ok" onClick={() => saveMedia(m)}>저장</button><button className="mini" onClick={() => setEditingMediaId(null)}>취소</button></>
                        ) : (
                          <>
                            <button className="mini" onClick={() => startEditMedia(m)}>수정</button>
                            {m.active ? <button className="mini no" onClick={() => onRemoveMedia(m.id)}>{hist ? '보관' : '삭제'}</button> : <button className="mini" onClick={() => onRestoreMedia(m.id)}>복구</button>}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </>
      )}
    </div>
  );
}
