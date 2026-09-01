import React from 'react';

// 종료일 칸 — 날짜 입력과 "미정" 체크를 한 줄에 나란히 둔다.
//
// 실측(2026-08-30): 걸려 있는 배치 83건 중 62건(75%)이 종료일 미정이다. 미정이 예외가
// 아니라 기본이라, 기본값도 미정으로 열고 날짜가 있는 배치만 눌러서 넣게 한다.
//
// 스위치를 칸 제목 줄(.fldhead)에 두면 안 된다 — .mini 버튼이 모바일에서 37px이라 제목
// 줄이 그만큼 높아지는데, 짝이 되는 시작일 칸의 제목은 그냥 글자(19px)라 두 칸의 입력
// 상자가 서로 다른 높이에서 시작한다. 나란히 놓인 날짜 두 개가 어긋나 보이던 원인이다.
//
// 그래서 한동안 칸 아래에 폭을 꽉 채운 버튼으로 뒀는데, 이번엔 종료일 칸만 한 줄 길어져
// 짝인 시작일 칸 아래에 빈 공간이 남았다. 위아래 어디에 두든 두 칸이 어긋나는 셈이라,
// 날짜 옆으로 옮기고 체크박스로 바꿨다 — 켜고 끄는 것임이 모양에서 바로 보이고,
// 줄 수가 늘지 않아 시작일 칸과 높이가 같다. 매체 상세의 기간 수정도 같은 모양이다.
export default function EndDateField({ end, noEnd, onChangeEnd, onToggleNoEnd }) {
  return (
    <div className="fld">
      <span>종료일</span>
      <div className="endrow">
        {/* 미정을 끄면 빈 날짜칸이 남는데, iOS는 값 없는 date input에 아무것도 안 그려서
            누를 것이 없는 빈 상자로 보인다(.datefld 자리표시). 미정일 때는 칸이 비활성이라
            자리표시가 오히려 누를 수 있다는 오해를 주므로 켜지 않는다. */}
        <span className="datefld" data-empty={!noEnd && !end ? '1' : '0'}>
          <input type="date" value={end} disabled={noEnd} onChange={(e) => onChangeEnd(e.target.value)} />
        </span>
        <label className="chk"><input type="checkbox" checked={noEnd}
          onChange={(e) => onToggleNoEnd(e.target.checked)} />미정</label>
      </div>
    </div>
  );
}
