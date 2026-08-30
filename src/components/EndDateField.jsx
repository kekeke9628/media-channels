import React from 'react';

// 종료일 + "미정" 스위치를 한 박스로 묶는다.
//
// 예전엔 종료일 입력칸과 "종료일을 아직 정하지 않음 — 철거 알람을 보내지 않습니다"
// 체크박스가 따로 떨어진 두 줄이었다. 실측(2026-08-30 기준): 걸려 있는 배치 83건 중
// 62건(75%)이 종료일 미정이다 — 미정이 예외가 아니라 기본이라, 기본값도 미정으로 열고
// 날짜가 있는 배치만 직접 눌러서 넣게 한다. 안내 문구도 미정일 때만 보여 준다 — 날짜를
// 넣은 대부분의 경우에는 안 볼 문구다.
//
// <label>로 감싸지 않는다 — 라벨 안에 버튼을 두면 브라우저가 라벨의 첫 폼 요소로 클릭을
// 한 번 더 보내는 사고가 다른 화면에서 있었다(CLAUDE.md). div + span으로만 묶는다.
export default function EndDateField({ end, noEnd, onChangeEnd, onToggleNoEnd }) {
  return (
    <div className="fld">
      <span className="fldhead">종료일
        <span className="fldhead-btns">
          <button type="button" className={noEnd ? 'mini ok' : 'mini'} onClick={() => onToggleNoEnd(!noEnd)}>
            {noEnd ? '미정 ✓' : '미정으로'}
          </button>
        </span>
      </span>
      <input type="date" value={end} disabled={noEnd} onChange={(e) => onChangeEnd(e.target.value)} />
      {noEnd && <p className="hint" style={{ margin: '4px 0 0' }}>철거 알람을 보내지 않습니다 — 날짜가 정해지면 눌러서 넣어 주세요.</p>}
    </div>
  );
}
