import { useEffect } from 'react';

// 모달 공통 키보드 처리. 지금까지는 매체 상세만 Esc로 닫혔고, 등록·배치 모달은 마우스로
// "취소"나 ✕를 정확히 눌러야만 빠져나올 수 있었다 — 사용자가 당연히 기대하는 동작이라 맞춘다.
//
// - Esc: 닫기. 단, 저장 중일 때는 무시한다(요청은 이미 날아갔는데 화면만 닫히면 결과를 못 본다).
// - Enter: 주 동작 실행. 다만 아래는 제외한다.
//   · textarea·select·버튼 위: 그 요소 고유 동작(줄바꿈·선택·클릭)이 우선
//   · 한글 입력 조합 중(isComposing): 조합을 끝내는 Enter가 제출로 오인된다
//   · 확인이 필요한 상태(겹침 경고 등): 확인 단계를 건너뛰면 안 되므로 호출 쪽에서 canSubmit=false로 막는다
export function useModalKeys({ onClose, onSubmit, canSubmit = false, busy = false }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (busy) return;
        e.stopPropagation();
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
