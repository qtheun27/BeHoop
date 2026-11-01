// Préparation des médias côté client : compression photo 2048 px, métadonnées (date de prise de vue, durée), vignettes.
import exifr from 'exifr';

export const ACCEPT = '.mov,.mp4,.m4v,.heic,.heif,.jpg,.jpeg,.png,.webp,video/*,image/*';
export const isVideo = (f: File) => f.type.startsWith('video/') || /\.(mov|mp4|m4v)$/i.test(f.name);

export async function compressImage(file: File | Blob, max = 2048, quality = 0.86): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('compression'))), 'image/jpeg', quality));
  } catch {
    return file; // HEIC non décodable par ce navigateur : converti dans le pipeline
  }
}

/** Lit la date « QuickTime creationdate » (atome mvhd) d'une vidéo MOV/MP4 sans tout charger. */
async function quicktimeDate(file: File): Promise<number | null> {
  const scan = async (start: number, len: number) => {
    const buf = new Uint8Array(await file.slice(start, start + len).arrayBuffer());
    for (let i = 0; i < buf.length - 20; i++) {
      if (buf[i] === 0x6d && buf[i + 1] === 0x76 && buf[i + 2] === 0x68 && buf[i + 3] === 0x64) { // 'mvhd'
        const dv = new DataView(buf.buffer, i + 4);
        const v = dv.getUint8(0);
        const secs = v === 1 ? Number(dv.getBigUint64(4)) : dv.getUint32(4);
        const ms = (secs - 2082844800) * 1000; // epoch 1904 → 1970
        return ms > 946684800000 ? ms : null;
      }
    }
    return null;
  };
  return (await scan(0, 512 * 1024)) ?? (file.size > 512 * 1024 ? await scan(Math.max(0, file.size - 4 * 1024 * 1024), 4 * 1024 * 1024) : null);
}

/** Petite vignette intégrée (≈10 Ko), conservée avec le brouillon du montage */
export async function thumbData(file: File | Blob): Promise<string> {
  const small = await compressImage(file, 240, .6);
  return await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.onerror = () => r(''); fr.readAsDataURL(small); });
}

/** « com.apple.quicktime.creationdate » (ex. 2026-10-31T14:05:12+0100) : vraie date d'enregistrement d'une vidéo d'iPhone.
 *  La date du conteneur (mvhd) peut être celle de l'export au moment de la sélection. */
async function appleCreationDate(file: File): Promise<number | null> {
  const scan = async (start: number, len: number) => {
    const txt = new TextDecoder('latin1').decode(await file.slice(start, start + len).arrayBuffer());
    const i = txt.indexOf('com.apple.quicktime.creationdate');
    if (i < 0) return null;
    const m = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:?\d{2}|Z)?)/.exec(txt.slice(i, i + 4000));
    const t = m ? Date.parse(m[1].replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : NaN;
    return Number.isFinite(t) && t > 946684800000 ? t : null;
  };
  return (await scan(0, 1024 * 1024)) ?? (file.size > 1024 * 1024 ? await scan(Math.max(0, file.size - 4 * 1024 * 1024), 4 * 1024 * 1024) : null);
}

export interface Prepared { file: File; kind: 'video' | 'photo'; takenAt: number; duration?: number; width?: number; height?: number; thumb: string }

export async function prepare(file: File): Promise<Prepared> {
  if (isVideo(file)) {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.src = url;
    await new Promise((r) => { v.onloadedmetadata = r; v.onerror = r; setTimeout(r, 5000); });
    let thumb = '';
    try {
      // Vignette seulement si la vidéo se décode (sinon on n'attend pas pour rien) ; attente courte
      if (!v.error && v.videoWidth) {
        v.currentTime = Math.min(1, (v.duration || 2) / 2);
        await new Promise((r) => { v.onseeked = r; v.onerror = r; setTimeout(r, 1500); });
      } else throw new Error('pas de décodage');
      const c = document.createElement('canvas'); c.width = 320; c.height = Math.round(320 * (v.videoHeight || 9) / (v.videoWidth || 16));
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height); thumb = c.toDataURL('image/jpeg', .6);
    } catch { /* vignette facultative */ }
    URL.revokeObjectURL(url);
    // Date de prise de vue de l'iPhone (métadonnée Apple, gardée quand Photos prépare la vidéo), sinon date du conteneur
    const takenAt = (await appleCreationDate(file).catch(() => null)) ?? (await quicktimeDate(file).catch(() => null)) ?? file.lastModified;
    return { file, kind: 'video', takenAt, duration: Number.isFinite(v.duration) ? v.duration : undefined, width: v.videoWidth, height: v.videoHeight, thumb };
  }
  const exif = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']).catch(() => null);
  const takenAt = (exif?.DateTimeOriginal ?? exif?.CreateDate)?.getTime?.() ?? file.lastModified;
  let thumb = '', width, height;
  try {
    thumb = await thumbData(file);
    const bmp = await createImageBitmap(file); width = bmp.width; height = bmp.height;
  } catch { /* HEIC */ }
  return { file, kind: 'photo', takenAt, width, height, thumb };
}
