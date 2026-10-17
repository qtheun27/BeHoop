// Contrôle d'accès aux médias R2 (fonctions pures, testées).
export interface MediaClaims { uid: string; teams: number[]; exp: number }

const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function hmac(secret: string, data: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}
/** Cookie signé (HMAC-SHA256) : « payload.signature », valable 6 h. */
export async function signCookie(c: MediaClaims, secret: string) {
  const p = b64u(enc.encode(JSON.stringify(c)));
  return `${p}.${await hmac(secret, p)}`;
}
export async function verifyCookie(v: string | undefined, secret: string, now = Date.now()): Promise<MediaClaims | null> {
  if (!v) return null;
  const [p, s] = v.split('.');
  if (!p || !s) return null;
  const expected = await hmac(secret, p);
  if (expected.length !== s.length) return null;
  let diff = 0; for (let i = 0; i < s.length; i++) diff |= s.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff) return null;
  const c = JSON.parse(new TextDecoder().decode(unb64u(p))) as MediaClaims;
  return c.exp * 1000 > now ? c : null;
}
export function readCookie(header: string | null, name = 'bh_media') {
  return header?.split(/;\s*/).find((x) => x.startsWith(name + '='))?.slice(name.length + 1);
}

/**
 * Règles d'accès par préfixe de clé :
 * - logos/…                         public (planches, cartes de score)
 * - photos|videos|moments/public/…  tout compte connecté (cookie valide) — contenus Seniors
 * - photos|videos|moments/team-N/…  membres acceptés de l'Équipe 🔒 N uniquement
 * - rushes/… et le reste            jamais servis
 */
export function canAccess(key: string, c: MediaClaims | null): boolean {
  if (key.includes('..')) return false;
  if (key.startsWith('logos/')) return true;
  const m = /^(photos|videos|moments)\/(public|team-(\d+))\//.exec(key);
  if (!m || !c) return false;
  if (m[2] === 'public') return true;
  return c.teams.includes(Number(m[3]));
}

export function contentType(key: string, fallback = 'application/octet-stream') {
  const ext = key.split('.').pop()!.toLowerCase();
  return ({ m3u8: 'application/vnd.apple.mpegurl', ts: 'video/mp2t', mp4: 'video/mp4', vtt: 'text/vtt', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as Record<string, string>)[ext] ?? fallback;
}
export const safeName = (n: string) => n.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80);
