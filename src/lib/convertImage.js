// 사진 한 장을 브라우저 canvas에서 WebP 2단(view 1600px / thumb 400px)으로 줄인다 (사양서 6장).
// 홍보물 이미지와 설치 확인 사진이 같은 결과 모양을 쓴다 — 그래야 인쇄 시안 없이 올라온
// 현장 사진을 그대로 홍보물 이미지로 돌려쓸 수 있다.
// toDataURL은 브라우저가 그 형식을 인코딩하지 못하면 조용히 PNG를 돌려준다(사양대로).
// 그래서 사진이 WebP인 줄 알고 PNG로 저장돼 있었다 — 실제 저장된 파일이 3.1MB짜리
// PNG였고, 같은 사진을 WebP로 뽑으면 200KB대다(10배 이상 차이). 한 번 재보고, WebP를
// 못 쓰면 JPEG로 떨어뜨린다(어느 브라우저에나 있고 사진에는 PNG보다 훨씬 알맞다).
let encodeType = null;
function bestType() {
  if (!encodeType) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    encodeType = c.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
  }
  return encodeType;
}

export function convertImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const make = (max, q) => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        return { url: cv.toDataURL(bestType(), q), w: cv.width, h: cv.height };
      };
      const view = make(1600, 0.75), thumb = make(400, 0.7);
      // dataURL의 base64 길이로 실제 바이트 수를 어림한다(정확한 Blob을 또 만들지 않으려고).
      const b = (d) => Math.round((d.length - d.indexOf(',') - 1) * 0.75);
      URL.revokeObjectURL(url);
      resolve({
        w: img.width, h: img.height, ratio: (img.width / img.height).toFixed(2), orig: file.size,
        view: { ...view, bytes: b(view.url) }, thumb: { ...thumb, bytes: b(thumb.url) },
      });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
