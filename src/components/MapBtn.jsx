import React from 'react';

// 목록에서 그 매체를 지도에서 보여 주는 버튼.
//
// 글자("지도") 대신 아이콘만 둔다. 홍보물 카드는 같은 매체라도 면마다 줄이 하나씩 생겨서
// (WWH02·1면 / WWH02·2면) "지도"라는 같은 말이 세로로 반복됐고, 만료된 배치는 철거·다시
// 걸기 버튼이 둘 다 붙어서 좁은 화면에서 칸이 서로 밀려 줄 높이가 제각각으로 튀었다.
// 아이콘은 폭이 고정이라 줄마다 같은 자리에 온다.
//
// 지도는 면이 아니라 매체에 붙는 개념이지만, 홍보물 하나가 서로 다른 매체 여러 곳에 걸리는
// 경우가 훨씬 흔해서(23건 중 15건, 많게는 8개 매체) 카드에 하나만 둘 수는 없다 — 어느
// 매체로 가는 버튼인지 알 수 없어진다. 줄마다 두되 폭을 줄이는 쪽으로 푼다.
//
// 아이콘만 있는 버튼이라 이름을 따로 준다(aria-label) — 없으면 화면 낭독기가 "버튼"으로만
// 읽고, title은 마우스에서만 뜬다.
export default function MapBtn({ mediaId, onShowOnMap, className }) {
  if (!onShowOnMap) return null;
  return (
    <button
      type="button"
      className={'iconbtn' + (className ? ' ' + className : '')}
      title="지도에서 이 매체 위치 보기"
      aria-label="지도에서 이 매체 위치 보기"
      // 카드·표의 줄 전체가 눌리면 상세가 열린다 — 위로 새면 지도로 보내 놓고 그 위에
      // 상세 시트를 덮어 버린다.
      onClick={(e) => { e.stopPropagation(); onShowOnMap(mediaId); }}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
        <path d="M12 21.5s6.6-7.4 6.6-12.1a6.6 6.6 0 1 0-13.2 0c0 4.7 6.6 12.1 6.6 12.1z"
          fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        <circle cx="12" cy="9.4" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.9" />
      </svg>
    </button>
  );
}
