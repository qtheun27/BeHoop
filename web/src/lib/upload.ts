// Envoi direct navigateur → R2 en multipart S3 (parties de 10 Mo, 3 en parallèle) avec URLs pré-signées par le Worker.
// L'état (parties envoyées) est gardé en IndexedDB : après une coupure, un verrouillage d'écran ou une réouverture
// de l'appli, on reprend là où on s'était arrêté (l'utilisateur resélectionne les mêmes fichiers si l'appli a été fermée).
import { openDB } from 'idb';
import { api } from './api';

export const PART = 10 * 1024 * 1024;
const PARALLEL = 3;
interface State { id: string; key: string; uploadId: string; size: number; parts: Record<number, string>; done?: boolean }
const dbp = openDB('behoop-uploads', 1, { upgrade: (d) => d.createObjectStore('uploads', { keyPath: 'id' }) });
export const fileId = (scope: string, f: File) => `${scope}:${f.name}:${f.size}:${f.lastModified}`;
export async function savedState(id: string) { return (await dbp).get('uploads', id) as Promise<State | undefined>; }
const save = async (s: State) => (await dbp).put('uploads', s);
export async function clearScope(scope: string) { const d = await dbp; for (const k of await d.getAllKeys('uploads')) if (String(k).startsWith(scope + ':')) await d.delete('uploads', k); }

let wake: { release: () => Promise<void> } | null = null;
export async function keepAwake(on: boolean) {
  try {
    if (on && !wake && 'wakeLock' in navigator) wake = await (navigator as any).wakeLock.request('screen');
    if (!on && wake) { await wake.release(); wake = null; }
  } catch { /* Wake Lock indisponible */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wake) { wake = null; keepAwake(true); } });

/** Dernier mouvement d'un envoi (octets envoyés) : sert à l'interface pour dire « en attente du réseau » */
export let lastMove = Date.now();
const STALL = 45_000;
/** Un PUT avec suivi des octets (XHR) : si plus rien ne bouge pendant 45 s (connexion figée sans erreur, fréquent en 4G
 *  ou au passage Wi-Fi ↔ 4G sur iPhone), on coupe et on réessaie ; coupure réseau : on attend son retour. */
function putOnce(url: string, body: Blob, onBytes: (n: number) => void, signal?: AbortSignal): Promise<string> {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    let watch = setTimeout(() => x.abort(), STALL);
    const alive = () => { clearTimeout(watch); watch = setTimeout(() => x.abort(), STALL); lastMove = Date.now(); };
    x.open('PUT', url);
    x.upload.onprogress = (e) => { alive(); onBytes(e.loaded); };
    x.onload = () => { clearTimeout(watch); if (x.status >= 200 && x.status < 300) res((x.getResponseHeader('ETag') ?? '').replaceAll('"', '')); else rej(new Error(`R2 ${x.status}`)); };
    x.onerror = () => { clearTimeout(watch); rej(new Error('réseau')); };
    x.onabort = () => { clearTimeout(watch); rej(new Error('bloqué')); };
    signal?.addEventListener('abort', () => x.abort(), { once: true });
    x.send(body);
  });
}
export async function putWithRetry(url: string, body: Blob, signal?: AbortSignal, onBytes: (n: number) => void = () => {}): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await putOnce(url, body, onBytes, signal);
    } catch (e) {
      if (signal?.aborted) throw e;
      onBytes(0);
      // coupure réseau : on attend le retour du réseau puis on réessaie (backoff jusqu'à 30 s)
      if (!navigator.onLine) await new Promise((r) => window.addEventListener('online', r, { once: true }));
      await new Promise((r) => setTimeout(r, Math.min(30000, 1000 * 2 ** attempt)));
    }
  }
}

/** Envoie un fichier (multipart), en reprenant si possible. onProgress reçoit les octets envoyés. */
export async function uploadFile(scope: string, file: File, meta: Record<string, unknown>, onProgress: (sent: number) => void, signal?: AbortSignal, id = fileId(scope, file)): Promise<string> {
  let st = await savedState(id);
  if (st?.done) { onProgress(file.size); return st.key; }
  if (!st) {
    const r = await api<{ key: string; uploadId: string }>('/upload/create', { ...meta, name: file.name, size: file.size, type: file.type || 'application/octet-stream' });
    st = { id, key: r.key, uploadId: r.uploadId, size: file.size, parts: {} };
    await save(st);
  }
  const total = Math.ceil(file.size / PART);
  const todo = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !st!.parts[n]);
  let sent = (total - todo.length) * PART;
  const flying = new Map<number, number>();
  const report = () => onProgress(Math.min(file.size, sent + [...flying.values()].reduce((x, y) => x + y, 0)));
  report();
  const worker = async () => {
    while (todo.length) {
      const batch = todo.splice(0, 4);
      const { urls } = await api<{ urls: Record<number, string> }>('/upload/sign', { key: st!.key, uploadId: st!.uploadId, parts: batch });
      for (const n of batch) {
        const blob = file.slice((n - 1) * PART, Math.min(n * PART, file.size));
        // Avancement en continu (octets de la partie en cours), pas seulement à la fin de chaque partie de 10 Mo
        st!.parts[n] = await putWithRetry(urls[n], blob, signal, (b) => { flying.set(n, b); report(); });
        flying.delete(n);
        await save(st!);
        sent += blob.size; report();
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  await api('/upload/complete', { key: st.key, uploadId: st.uploadId, parts: Object.entries(st.parts).map(([n, etag]) => ({ partNumber: +n, etag })) });
  st.done = true; await save(st);
  return st.key;
}

/** Petit fichier (photo compressée) : un seul PUT pré-signé. */
export async function uploadSmall(kind: 'photo' | 'avatar' | 'logo' | 'clip', blob: Blob, meta: Record<string, unknown>): Promise<string> {
  const r = await api<{ key: string; url: string }>('/upload/single', { kind, type: blob.type || 'image/jpeg', size: blob.size, ...meta });
  await putWithRetry(r.url, blob);
  return r.key;
}
