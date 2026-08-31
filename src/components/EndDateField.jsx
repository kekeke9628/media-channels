import React from 'react';

// 종료일 칸 — 날짜 입력과 "미정" 스위치를 한 칸 안에 세로로 쌓는다.
//
// 실측(2026-08-30): 걸려 있는 배치 83건 중 62건(75%)이 종료일 미정이다. 미정이 예외가
// 아니라 기본이라, 기본값도 미정으로 열고 날짜가 있는 배치만 눌러서 넣게 한다.
//
// 스위치를 칸 제목 줄(.fldhead)에 두면 안 된다 — .mini 버튼이 모바일에서 37px이라 제목
// 줄이 그만큼 높아지는데, 짝이 되는 시작일 칸의 제목은 그냥 글자(19px)라 두 칸의 입력
// 상자가 서로 다른 높이에서 시작한다. 나란히 놓인 날짜 두 개가 어긋나 보이던 원인이다.
// 제목 줄은 양쪽 다 글자만 두고, 스위치는 입력칸 아래에 칸 폭을 꽉 채워 놓는다.
export default function EndDateField({ end, noEnd, onChangeEnd, onToggleNoEnd }) {
  return (
    <div className="fld">
      <span>종료일</span>
      <input type="date" value={end} disabled={noEnd} onChange={(e) => onChangeEnd(e.target.value)} />
      {/* 버튼 글자가 곧 설명이다 — "철거 알람을 보내지 않습니다" 같은 안내를 따로 깔면
          평소에 안 읽히고 자리만 먹는다. */}
      <button type="button" className={'mini wide' + (noEnd ? ' ok' : '')} onClick={() => onToggleNoEnd(!noEnd)}>
        {noEnd ? '미정 ✓' : '미정으로'}
      </button>
    </div>
  );
}
