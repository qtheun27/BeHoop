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

async function putWithRetry(url: string, body: Blob, signal?: AbortSignal): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { method: 'PUT', body, signal });
      if (!r.ok) throw new Error(`R2 ${r.status}`);
      return (r.headers.get('ETag') ?? '').replaceAll('"', '');
    } catch (e) {
      if (signal?.aborted) throw e;
      // coupure réseau : on attend le retour du réseau puis on réessaie (backoff jusqu'à 30 s)
      if (!navigator.onLine) await new Promise((r) => window.addEventListener('online', r, { once: true }));
      await new Promise((r) => setTimeout(r, Math.min(30000, 1000 * 2 ** attempt)));
    }
  }
}

/** Envoie un fichier (multipart), en reprenant si possible. onProgress reçoit les octets envoyés. */
export async function uploadFile(scope: string, file: File, meta: Record<string, unknown>, onProgress: (sent: number) => void, signal?: AbortSignal): Promise<string> {
  const id = fileId(scope, file);
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
  onProgress(Math.min(sent, file.size));
  const worker = async () => {
    while (todo.length) {
      const batch = todo.splice(0, 4);
      const { urls } = await api<{ urls: Record<number, string> }>('/upload/sign', { key: st!.key, uploadId: st!.uploadId, parts: batch });
      for (const n of batch) {
        const blob = file.slice((n - 1) * PART, Math.min(n * PART, file.size));
        st!.parts[n] = await putWithRetry(urls[n], blob, signal);
        await save(st!);
        sent += blob.size; onProgress(Math.min(sent, file.size));
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
