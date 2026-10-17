// Client du Worker Cloudflare (media.behoop.be) : authentifié par le jeton Firebase.
import { auth } from './firebase';
import { WORKER_URL, USE_EMULATOR } from './config';

export async function api<T = unknown>(path: string, body?: unknown, method = body ? 'POST' : 'GET'): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch(`${WORKER_URL}/api${path}`, {
    method, credentials: 'include',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(path.startsWith('/upload') ? 120_000 : 15_000),
  });
  if (!r.ok) throw new Error((await r.text().catch(() => '')) || `Erreur ${r.status}`);
  return r.json() as Promise<T>;
}

let cookieUntil = 0;
/** Obtient (ou renouvelle) le cookie signé de lecture des médias (6 h). */
export async function ensureMediaCookie() {
  if (USE_EMULATOR || Date.now() < cookieUntil || !auth.currentUser) return; // en local : médias servis directement
  try { const r = await api<{ exp: number }>('/media-cookie', {}); cookieUntil = r.exp * 1000 - 10 * 60 * 1000; } catch { /* Worker indisponible */ }
}
/** URL d'un média stocké sur R2 (ou URL directe pour la démo). */
export function mediaUrl(key: string) {
  if (/^(https?:|\/|data:|blob:)/.test(key)) return key;
  return `${WORKER_URL}/m/${key}`;
}
