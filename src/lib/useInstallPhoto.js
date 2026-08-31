import { useState } from 'react';
import { convertImage } from './convertImage.js';

// 설치 확인 사진 한 장을 고르고 들고 있는 상태 — 배치 팝업 넷(AddModal·AssignModal·
// PlaceOnMediaModal·SwapModal)이 똑같은 것을 각자 적어 두고 있었다.
//
// 변환(convertImage)은 브라우저 canvas에서 도는 데 시간이 걸려서 busy 표시가 꼭 필요하다.
// 그걸 팝업마다 따로 들고 있으면 한 곳만 빠뜨려도 현장에서는 먹통으로 느낀다 —
// 실제로 SwapModal만 핸들러를 인라인으로 적어 두고 있어서 모양이 갈라져 있었다.
export function useInstallPhoto() {
  const [installPhoto, setInstallPhoto] = useState(null);
  const [installBusy, setInstallBusy] = useState(false);
  const pickInstallPhoto = async (file) => {
    setInstallBusy(true);
    setInstallPhoto(await convertImage(file));
    setInstallBusy(false);
  };
  const clearInstallPhoto = () => setInstallPhoto(null);
  return { installPhoto, installBusy, pickInstallPhoto, clearInstallPhoto };
}
