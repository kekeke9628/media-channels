import { useEffect, useRef } from 'react';

// 열려 있는 팝업들의 스택. 팝업 위에 팝업이 뜨는 경우(매체 상세 → "홍보물 배치")가 있어서,
// Esc 하나로 두 개가 한꺼번에 닫히면 안 된다. window에 붙인 리스너끼리는 stopPropagation이
// 통하지 않으므로(같은 대상의 다른 리스너는 그대로 실행된다) 맨 위인지 직접 판단한다.
const stack = [];
let locked = null;

// 팝업이 떠 있는 동안 뒤쪽 페이지가 같이 스크롤되지 않게 한다.
// 모바일에서 팝업 본문을 끝까지 밀면 스크롤이 뒤 페이지로 넘어가(scroll chaining) 팝업은
// 그대로인데 배경만 움직였다 — "팝업이 아래로 안 내려간다"고 느끼게 되는 주된 원인이고,
// iOS에서는 배경이 움직이며 주소창이 접혔다 펴져 팝업 높이까지 흔들린다.
function syncLock() {
  const want = stack.length > 0;
  if (want === !!locked) return;
  const st = document.body.style;
  if (want) {
    const y = window.scrollY;
    // 데스크톱에서 스크롤바가 사라지면 그만큼 본문이 옆으로 튄다 — 없어질 폭을 미리 재서 채운다.
    const bar = window.innerWidth - document.documentElement.clientWidth;
    locked = { y, top: st.top, pos: st.position, w: st.width, pr: st.paddingRight };
    // overflow:hidden만으로는 iOS Safari가 배경을 계속 스크롤한다 — 위치를 고정하고
    // 스크롤 위치를 top으로 옮겨 둔 뒤, 닫을 때 원래 자리로 되돌린다.
    st.position = 'fixed';
    st.top = `-${y}px`;
    st.width = '100%';
    if (bar > 0) st.paddingRight = `${bar}px`;
  } else {
    const l = locked;
    st.position = l.pos; st.top = l.top; st.width = l.w; st.paddingRight = l.pr;
    window.scrollTo(0, l.y);
    locked = null;
  }
}

// 모달 공통 키보드 처리. 지금까지는 매체 상세만 Esc로 닫혔고, 등록·배치 모달은 마우스로
// "취소"나 ✕를 정확히 눌러야만 빠져나올 수 있었다 — 사용자가 당연히 기대하는 동작이라 맞춘다.
//
// - Esc: 닫기. 단, 저장 중일 때는 무시한다(요청은 이미 날아갔는데 화면만 닫히면 결과를 못 본다).
// - Enter: 주 동작 실행. 다만 아래는 제외한다.
//   · textarea·select·버튼 위: 그 요소 고유 동작(줄바꿈·선택·클릭)이 우선
//   · 한글 입력 조합 중(isComposing): 조합을 끝내는 Enter가 제출로 오인된다
//   · 확인이 필요한 상태(겹침 경고 등): 확인 단계를 건너뛰면 안 되므로 호출 쪽에서 canSubmit=false로 막는다
export function useModalKeys({ onClose, onSubmit, canSubmit = false, busy = false }) {
  const me = useRef({});

  useEffect(() => {
    const token = me.current;
    stack.push(token);
    syncLock();
    return () => {
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
      syncLock();
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (stack[stack.length - 1] !== me.current) return; // 맨 위 팝업만 반응한다
      if (e.key === 'Escape') {
        if (busy) return;
        onClose?.();
        return;
      }
      if (e.key !== 'Enter' || !onSubmit || !canSubmit || busy) return;
      if (e.isComposing || e.keyCode === 229) return;
      const t = e.target;
      const tag = t?.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      e.preventDefault();
      onSubmit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onSubmit, canSubmit, busy]);
}
