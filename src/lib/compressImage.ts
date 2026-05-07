/** Resize large camera photos and re-encode as JPEG to keep storage manageable. */
export function compressDataUrl(dataUrl: string, maxEdge = 1280, quality = 0.72): Promise<string> {
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
        // Always prefer the re-encoded JPEG when it is smaller — iPhone HEIC
        // photos can be huge even after a small resize, so the previous 2 %
        // gate would keep the original and blow our storage budget.
        resolve(jpeg.length < dataUrl.length ? jpeg : dataUrl);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => reject(new Error('decode'));
    img.src = dataUrl;
  });
}

/**
 * Compress a File directly to a JPEG data URL. Decodes via an object URL
 * (much cheaper than holding the raw bytes as a base64 string in RAM)
 * and ALWAYS returns JPEG — never falls back to the original encoding.
 *
 * Throws when the browser can't decode the file (e.g. HEIC on a desktop
 * Chrome) so the caller can show a clear error instead of silently
 * stuffing un-renderable bytes into state.
 */
export function compressFileToJpeg(
  file: File,
  maxEdge = 1280,
  quality = 0.72
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const cleanup = () => URL.revokeObjectURL(url);
    img.onload = () => {
      try {
        const w0 = img.naturalWidth || img.width;
        const h0 = img.naturalHeight || img.height;
        if (!w0 || !h0) {
          cleanup();
          reject(new Error('decode'));
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
          cleanup();
          reject(new Error('canvas'));
          return;
        }
        ctx.drawImage(img, 0, 0, tw, th);
        const jpeg = canvas.toDataURL('image/jpeg', quality);
        cleanup();
        resolve(jpeg);
      } catch {
        cleanup();
        reject(new Error('encode'));
      }
    };
    img.onerror = () => {
      cleanup();
      reject(new Error('decode'));
    };
    img.src = url;
  });
}
