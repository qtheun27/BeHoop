export const haptic = (ms = 10) => { try { navigator.vibrate?.(ms); } catch { /* iOS : pas de vibration */ } };
export const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};
const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
export function ago(ms: number): string {
  const s = (ms - Date.now()) / 1000;
  if (Math.abs(s) < 60) return 'à l’instant';
  if (Math.abs(s) < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (Math.abs(s) < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (Math.abs(s) < 7 * 86400) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(ms).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' });
}
export function frDate(d: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-BE', opts);
}
export const dotted = (d: string) => d.split('-').reverse().join('.');
export const shortName = (full: string) => { const [p, ...r] = full.trim().split(/\s+/); return r.length ? `${p} ${r[r.length - 1][0].toUpperCase()}.` : p; };
export const initials = (n: string) => n.split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
export function mapsUrl(q: string, lat?: number, lng?: number) {
  const apple = /iPhone|iPad|Mac/.test(navigator.userAgent);
  const dest = lat && lng ? `${lat},${lng}` : encodeURIComponent(q);
  return apple ? `https://maps.apple.com/?daddr=${dest}&q=${encodeURIComponent(q)}` : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}
export function uid(n = 20) { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); }
