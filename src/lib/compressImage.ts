/** Resize large camera photos and re-encode as JPEG to avoid localStorage quota failures. */
export function compressDataUrl(dataUrl: string, maxEdge = 1600, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w0 = img.naturalWidth || img.width;
        const h0 = img.naturalHeight || img.height;
        if (!w0 || !h0) {
          resolve(dataUrl);
          return;
        }
        const scale = Math.min(1, maxEdge / Math.max(w0, h0));
        const tw = Math.max(1, Math.round(w0 * scale));
        const th = Math.max(1, Math.round(h0 * scale));
        const canvas = document.createElement('canvas');
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, tw, th);
        const jpeg = canvas.toDataURL('image/jpeg', quality);
        resolve(jpeg.length < dataUrl.length * 0.98 ? jpeg : dataUrl);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => reject(new Error('decode'));
    img.src = dataUrl;
  });
}
