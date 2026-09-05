import React, { useState, useEffect, useMemo } from 'react';
import { contentOf, subOf, matches, periodLabel, periodUnset, postingExpired } from '../constants.js';
import { statusOf } from '../lib/status.js';
import { getPostingImageUrls } from '../lib/queries.js';
import StatusChip from './StatusChip.jsx';
import MapBtn from './MapBtn.jsx';

// 홍보물 — 매체·일정과 무관하게 홍보물(브랜드·내용·이미지) 자체를 관리하는 화면.
// 매체 배치는 홍보물에 딸린 부가 정보로 아래 미니 표에서 보여주고, "+ 배치 추가"로 몇 곳이든
// 추가할 수 있다(동시에 여러 매체에 걸거나, 시간차를 두고 다시 거는 것 모두 여기서 시작).

// 홍보물의 게시 기간 한 줄. 눌러서 그 자리에서 고친다(매체 상세의 칸 편집과 같은 방식).
// 기간을 정하지 않고 계속 쓰는 홍보물도 많은데, 그건 "상시"를 눌러 명시적으로 고른다 —
// 그냥 비워 두면 "기간 미입력"이라 눈에 띄게 표시된다(왜 나눴는지는 constants.js).
function PeriodLine({ p, isEditor, refDate, onSave }) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(p.start || '');
  const [end, setEnd] = useState(p.end || '');
  const [always, setAlways] = useState(!!p.alwaysOn);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setStart(p.start || ''); setEnd(p.end || ''); setAlways(!!p.alwaysOn);
  }, [p.id, p.start, p.end, p.alwaysOn]);

  const expired = postingExpired(p, refDate);
  const unset = periodUnset(p);
  if (!editing) {
    const body = (
      <>
        <span className={expired ? 'tag over' : unset ? 'tag todo' : 'sub mono'}>{periodLabel(p)}</span>
        {expired && <span className="sub">기간 지남</span>}
      </>
    );
    if (!isEditor || !onSave) return <div className="periodline">{body}</div>;
    return (
      <button type="button" className="periodline editable" onClick={(e) => { e.stopPropagation(); setErr(''); setEditing(true); }} title="눌러서 기간 수정">
        {body}<i className="statcell-pen">✎</i>
      </button>
    );
  }
  const commit = async (patch) => {
    setSaving(true);
    const ok = await onSave(p.id, patch);
    setSaving(false);
    if (ok) { setEditing(false); setErr(''); } else setErr('저장하지 못했습니다.');
  };
  const save = () => {
    if (!always && start && end && end < start) { setErr('종료일이 시작일보다 앞섭니다.'); return; }
    if (!always && !start && !end) { setErr('기간을 넣거나 "상시"를 골라 주세요.'); return; }
    return commit({ start: start || null, end: end || null, alwaysOn: always });
  };
  // 날짜를 넣으면 상시가 아니다 — 두 값이 같이 남아 있으면 어느 쪽이 진짜인지 알 수 없다.
  const pick = (set) => (e) => { set(e.target.value); if (e.target.value) setAlways(false); };
  return (
    <div className="periodline editing" onClick={(e) => e.stopPropagation()}>
      <input className="inp" type="date" value={start} onChange={pick(setStart)} />
      <span className="sub">~</span>
      <input className="inp" type="date" value={end} onChange={pick(setEnd)} />
      <div className="statcell-btns">
        <button className="mini ok" disabled={saving} onClick={save}>{saving ? '저장 중…' : '저장'}</button>
        {/* 누르면 그 자리에서 저장하고 닫는다. 날짜와 달리 더 채울 것이 없어서 저장을 한 번
            더 누르게 할 이유가 없다 — 고른 뒤 저장을 안 눌러 그대로 날아가기만 했다.
            체크 표시는 이미 상시인 홍보물을 열었을 때 현재 값을 알려 주는 용도로 남긴다. */}
        <button className={always ? 'mini ok' : 'mini'} disabled={saving}
          onClick={() => {
            setAlways(true); setStart(''); setEnd(''); setErr('');
            commit({ start: null, end: null, alwaysOn: true });
          }}>
          {always ? '상시 ✓' : '상시'}
        </button>
        <button className="mini" disabled={saving} onClick={() => { setStart(p.start || ''); setEnd(p.end || ''); setAlways(!!p.alwaysOn); setEditing(false); }}>취소</button>
      </div>
      {err && <span className="statcell-err">{err}</span>}
    </div>
  );
}

// 배치가 많은 홍보물은 네 곳만 보이고 나머지는 접어 둔다. 카드 격자는 한 줄에 놓인 카드
// 높이가 가장 큰 카드에 맞춰지므로, 15곳에 걸린 홍보물 하나가 옆 카드까지 같이 늘려
// 화면에 카드 두세 장밖에 안 남는다(PC에서 특히 심하다 — 열이 여러 개라 그 줄이 통째로).
// 실측(2026-09-05): 홍보물 31건 중 27건(87%)이 네 곳 이하라 대부분 카드는 그대로고,
// 6·9·10·15곳짜리 넷만 접힌다. 매체 현황의 면 줄과 같은 방식이다(PostsPanel FACES_SHOWN).
const PLACEMENTS_SHOWN = 4;
function PlacementList({ pls, isEditor, refDate, pLabel, isArchived, onPick, onShowOnMap, onRemove, onCancel, onUndo, onSwap }) {
  const [open, setOpen] = useState(false);
  const shown = open ? pls : pls.slice(0, PLACEMENTS_SHOWN);
  const hidden = pls.length - shown.length;
  return (
    <>
      <div className="pllist">{shown.map((pl) => {
        const s = statusOf(pl, refDate);
        const archived = isArchived(pl);
        // 조작 버튼을 미리 모은다 — 하나도 없을 때(자동 철거된 보관 매체 등)
        // 빈 줄이 생기지 않게 하려면 개수를 먼저 알아야 한다.
        // 버튼 글자는 짧게 쓴다. 이 줄에는 매체명·상태·지도까지 함께 들어가는데,
        // "홍보물 철거"를 그대로 두면 버튼만 147px을 먹어 매체명이 "WWH0…"로 잘렸다.
        // 무엇을 철거하는지 이름에 넣기로 한 건 매체 상세 얘기다(7157de1) — 거기엔
        // "매체 철거" 버튼이 나란히 있어 헷갈렸지만, 홍보물 카드에는 매체를 내리는
        // 버튼이 없고 카드 제목이 업체명이라 혼동할 대상이 없다. 매체 현황의 면 줄도
        // 이미 "철거"를 쓰고 있어 오히려 이쪽이 통일된다.
        const acts = isEditor ? [
          s !== 'upcoming' && s !== 'removed' &&
            <button key="rm" className="mini ok" onClick={() => onRemove(pl.id)}>철거</button>,
          // 아직 시작 안 한 배치는 실제로 걸린 적이 없다 — 철거가 아니라 취소(기록 삭제)가 맞다.
          // 철거로 처리하면 걸린 적도 없는 업체가 그 매체 이력에 남는다.
          s === 'upcoming' &&
            <button key="cx" className="mini no" onClick={() => onCancel(pl.id)}>배치 취소</button>,
          s === 'removed' && pl.removalSource === 'manual' &&
            <button key="un" className="mini" onClick={() => onUndo(pl.id)}>되돌리기</button>,
          // 걸려 있는(또는 만료된) 자리는 "교체" 하나로 처리한다. 예전에는
          // "다시 걸기"가 따로 있었는데, 그건 같은 홍보물을 그 자리에 또 거는
          // 것이라 교체와 헷갈렸다 — 게다가 옛 배치를 손대지 않고 새것만 만들어
          // 정리는 autoClose에 맡기는, 교체와 다른 기록을 남겼다.
          // 같은 홍보물로 다시 거는 것도 교체 팝업에서 그 홍보물을 고르면 된다.
          s !== 'upcoming' && s !== 'removed' && !archived &&
            <button key="sw" className="mini" onClick={() => onSwap(pl, pLabel(pl))}>교체</button>,
        ].filter(Boolean) : [];
        return (
          // 어느 면인지까지 넘긴다 — 상세가 그 면 구획으로 스크롤해 준다.
          // 듀라트란스는 한 매체에 면이 20개까지 있어서, 맨 위만 열어 주면
          // 방금 누른 17면을 찾으러 한참 내려야 했다(매체 현황 면 줄과 같은 동작).
          <div className={'plrow' + (archived ? ' off' : '')} key={pl.id}
            onClick={archived ? undefined : () => onPick(pl.mediaId, pl.face)}>
            <b className="plrow-name">{pLabel(pl)}</b>
            {archived && <i className="sub">보관된 매체</i>}
            {/* 설치 확인 사진 표시(📷)는 뺐다. 배치는 사실상 전부 사진이 있어서
                모든 줄에 똑같이 붙는 바람에 알려주는 게 없었고, 정작 중요한
                "사진이 없다"는 알람 예정 ③이 따로 모아 준다. 줄을 누르면 상세로
                넘어가 사진을 바로 볼 수 있다는 점도 같다. */}
            <StatusChip status={s} />
            {/* 보관된 매체는 지도에 핀이 없다 — 눌러도 아무 일이 없을 버튼은
                아예 안 보이는 편이 낫다(줄 전체 클릭을 막아 둔 것과 같은 이유). */}
            {!archived && <MapBtn mediaId={pl.mediaId} onShowOnMap={onShowOnMap} className="pushright" />}
            {acts.length > 0 && (
              <span className="plrow-btns" onClick={(e) => e.stopPropagation()}>{acts}</span>
            )}
          </div>
        );
      })}</div>
      {hidden > 0 && (
        <button className="mini wide" onClick={() => setOpen(true)}>+{hidden}곳 더 보기</button>
      )}
      {open && pls.length > PLACEMENTS_SHOWN && (
        <button className="mini wide" onClick={() => setOpen(false)}>접기</button>
      )}
    </>
  );
}

export default function PromosPanel({ T, types, postings, placements, media, refDate, isEditor, onPick, onShowOnMap, onAssign, onSwap, onRemove, onUndo, onCancel, onDeletePosting, onEditPeriod }) {
  const [openDD, setOpenDD] = useState(false);
  const [draftOnly, setDraftOnly] = useState(false);
  // 지난 캠페인이 목록에 계속 쌓여서 기본으로 숨긴다(매체 현황의 "만료 포함"과 같은 표현).
  const [showExpired, setShowExpired] = useState(false);
  const [q, setQ] = useState('');
  const [thumbUrls, setThumbUrls] = useState(new Map());
  // 카드는 이미지가 붙어 무거워서 한 번에 다 그리지 않는다. 다만 예전에는 그냥 60개에서
  // 잘라 버리고 아무 표시도 없어서, 위 "N건"과 실제로 보이는 개수가 달라도 알 수 없었다.
  const [limit, setLimit] = useState(60);
  const mName = (id) => media.find((m) => m.id === id)?.name || '-';
  // 매체가 여러 면을 가지면(웨더워리어 등) 어느 면에 걸렸는지 이름 옆에 붙인다.
  const pLabel = (pl) => mName(pl.mediaId) + ((media.find((m) => m.id === pl.mediaId)?.faces || 1) > 1 ? ` · ${pl.faceLabel || (pl.face || 1) + '면'}` : '');
  // 보관된(지도에서 내린) 매체에 걸린 배치 — 이제 보관 시 함께 철거 처리되지만, 그 전에
  // 만들어진 기록은 남아 있다. 이런 행은 매체 상세가 열리지 않으므로(활성 매체만 계산됨)
  // 클릭을 막고 이유를 표시한다 — 예전엔 눌러도 아무 일도 안 일어나는 먹통이었다.
  const isArchived = (pl) => media.find((m) => m.id === pl.mediaId)?.active === false;

  useEffect(() => {
    let cancelled = false;
    // 카드 그림은 전부 설치 확인 사진이다 — 인쇄 시안은 안 쓴다. 목록에서 알아봐야 하는
    // 건 "무슨 디자인이었나"가 아니라 "지금 현장에 어떻게 걸려 있나"라서.
    // 설치 확인 사진은 view 크기(긴 변 1600px) 한 장만 저장하므로 카드 폭을 꽉 채워도
    // 뭉개지지 않는다(예전 thumb 400px는 요즘 휴대폰에서 2배 넘게 늘어나 흐렸다).
    getPostingImageUrls(placements.map((pl) => pl.installPhotoPath))
      .then((m) => { if (!cancelled) setThumbUrls(m); });
    return () => { cancelled = true; };
    // 그림이 이제 전부 배치에서 오므로 placements를 본다 — 예전엔 postings만 봤는데,
    // 설치 사진을 새로 붙여도 목록 카드가 그대로였다.
  }, [placements]);

  useEffect(() => { setLimit(60); }, [q, draftOnly, showExpired]); // 조건이 바뀌면 처음부터 다시

  const placementsOf = useMemo(() => {
    const by = {};
    placements.forEach((pl) => (by[pl.postingId] = by[pl.postingId] || []).push(pl));
    // 철거된 자리는 뒤로 보낸다 — 목록을 네 곳만 남기고 접기 때문에, 섞여 있으면 지난
    // 배치가 앞자리를 차지하고 정작 지금 걸려 있는 자리가 "더 보기" 뒤로 숨는다.
    // 대표 사진을 고를 때 이미 같은 이유로 걸려 있는 자리를 먼저 본다.
    Object.values(by).forEach((arr) => arr.sort((a, b) => (
      (a.removedAt ? 1 : 0) - (b.removedAt ? 1 : 0) || b.start.localeCompare(a.start)
    )));
    return by;
  }, [placements]);

  // 게시 기간이 끝났어도 아직 어딘가에 걸려 있으면 숨기지 않는다 — 그건 내려야 할 일이
  // 남은 것이라, 목록에서 사라지면 잊힌다. 실제로 만료 2건 중 1건이 아직 걸려 있었다.
  const stillUp = (id) => (placementsOf[id] || []).some((pl) => !pl.removedAt);
  const isHidden = (p) => !showExpired && postingExpired(p, refDate) && !stillUp(p.id);
  const hiddenCount = postings.filter(isHidden).length;

  const rows = postings
    .filter((p) => !isHidden(p))
    .filter((p) => !draftOnly || !(placementsOf[p.id]?.length))
    .filter((p) => {
      if (!q) return true;
      const names = (placementsOf[p.id] || []).map((pl) => pLabel(pl)).join(' ');
      return matches(p.brand + contentOf(p) + names, q);
    })
    // 미배치가 맨 앞 — 아직 어디에도 안 걸린 것이 조치가 필요한 항목이고, 방금 등록한
    // 홍보물도 미배치라 목록 맨 아래까지 스크롤해야 찾을 수 있던 문제를 함께 없앤다.
    .sort((a, b) => {
      const da = placementsOf[a.id]?.length ? 1 : 0, db = placementsOf[b.id]?.length ? 1 : 0;
      if (da !== db) return da - db;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

  return (
    <div>
      {/* 홍보물과 매체가 분리돼 있다는 게 이 화면의 전제인데 처음 보는 사람은 알 수 없어,
          한 줄로 관계를 설명한다. */}
      <div className="toolrow">
        <input className="inp" placeholder="업체명 · 내용 · 매체명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="chk"><input type="checkbox" checked={draftOnly} onChange={(e) => setDraftOnly(e.target.checked)} />미배치만 보기</label>
        {/* 몇 건이 빠졌는지 같이 보여준다 — 조용히 걸러 내면 "등록했는데 목록에 없다"가 된다. */}
        <label className="chk"><input type="checkbox" checked={showExpired} onChange={(e) => setShowExpired(e.target.checked)} />
          만료 포함{hiddenCount > 0 && !showExpired ? ` (${hiddenCount})` : ''}</label>
        <span className="count mono">{rows.length}건</span>
      </div>
      {rows.length === 0 && (
        <p className="empty">
          {postings.length === 0
            ? '아직 등록된 홍보물이 없습니다. 왼쪽 위 "+홍보물 등록"으로 먼저 등록하세요.'
            : '조건에 맞는 홍보물이 없습니다. 검색어나 필터를 확인해 보세요.'}
        </p>
      )}
      <div className="cgrid">
        {rows.slice(0, limit).map((p) => {
          const pls = placementsOf[p.id] || [];
          return (
            <div className="ccard" key={p.id}>
              {(() => {
                // pls는 시작일 내림차순이라 첫 사진이 가장 최근 것이다. 지금 걸려 있는
                // 자리를 먼저 본다 — 철거된 자리의 사진을 대표로 쓰면 이미 없는 그림이
                // 목록에 남는다.
                const shotPl = pls.find((x) => x.installPhotoPath && !x.removedAt)
                  || pls.find((x) => x.installPhotoPath);
                const shot = thumbUrls.get(shotPl?.installPhotoPath);
                return (
                  <div className="cthumb" style={shot ? undefined : { background: `linear-gradient(150deg, hsl(${p.hue} 42% 52%), hsl(${(p.hue + 40) % 360} 38% 38%))` }}>
                    {/* 보이는 것만 받는다 — 사진이 전부 view 크기라 목록을 열자마자 통째로
                        내려받으면 현장 LTE에서 한참 멈춘다. */}
                    {shot && <img className="cthumb-img" src={shot} alt="" loading="lazy" decoding="async" />}
                    {shotPl?.removedAt && shot && <em className="cthumb-tag">지난 배치</em>}
                  </div>
                );
              })()}
              <div className="cbody">
                <b>{p.brand}</b>{subOf(p) && <i className="sub">{subOf(p)}</i>}
                {/* 이 홍보물을 쓰는 기간. 여기서 바로 고친다 — 고치러 다른 화면으로 갈 일이 없다. */}
                <PeriodLine p={p} isEditor={isEditor} refDate={refDate} onSave={onEditPeriod} />
                <div className="crow">
                  {pls.length === 0 ? <span className="tag vacant">미배치</span> : <span className="sub mono">{pls.length}곳에 배치</span>}
                </div>
                {pls.length > 0 && (
                  <PlacementList pls={pls} isEditor={isEditor} refDate={refDate} pLabel={pLabel} isArchived={isArchived}
                    onPick={onPick} onShowOnMap={onShowOnMap} onRemove={onRemove} onCancel={onCancel}
                    onUndo={onUndo} onSwap={onSwap} />
                )}
                {isEditor && <button className="btn primary wide" style={{ marginTop: 6 }} onClick={() => onAssign(p.id)}>+ 배치 추가</button>}
                {isEditor && pls.length === 0 && (
                  <div className="crow"><button className="mini no" onClick={() => onDeletePosting(p.id)}>홍보물 삭제</button></div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {rows.length > limit && (
        <button className="btn wide" onClick={() => setLimit((n) => n + 60)}>
          더 보기 · {rows.length - limit}건 남음
        </button>
      )}
    </div>
  );
}
