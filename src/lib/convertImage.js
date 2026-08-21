// 사진 한 장을 브라우저 canvas에서 WebP 2단(view 1600px / thumb 400px)으로 줄인다 (사양서 6장).
// 홍보물 이미지와 설치 확인 사진이 같은 결과 모양을 쓴다 — 그래야 인쇄 시안 없이 올라온
// 현장 사진을 그대로 홍보물 이미지로 돌려쓸 수 있다.
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
        return { url: cv.toDataURL('image/webp', q), w: cv.width, h: cv.height };
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
