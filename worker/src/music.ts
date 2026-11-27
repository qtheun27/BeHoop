// Catalogue de musique libre pour les Moments : API Jamendo (morceaux sous licence Creative Commons).
// On ne garde que les licences qui permettent d'utiliser le morceau dans une vidéo, même monétisée (YouTube) :
// CC0, CC BY, CC BY-SA — jamais « NC » (pas d'usage commercial) ni « ND » (pas de modification, or on le coupe et on le monte).

/** Ambiances proposées dans l'appli → étiquettes Jamendo */
export const MUSIC_MOODS: Record<string, string> = {
  energie: 'energetic+sport', hiphop: 'hiphop', electro: 'electronic', rock: 'rock', epique: 'epic+cinematic', chill: 'chillout+lofi',
};

export interface MusicTrack { id: string; title: string; artist: string; duration: number; audio: string; image: string | null; license: string; licenseUrl: string; url: string }

/** Nom court de la licence (« CC BY 3.0 »), ou null si elle ne convient pas */
export function licenseOf(url: string): string | null {
  const m = /creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)\/([\d.]+)?/i.exec(url ?? '');
  if (!m) return null;
  const k = m[2].toLowerCase();
  if (m[1] === 'publicdomain') return k === 'zero' || k === 'mark' ? 'CC0' : null;
  if (k.includes('nc') || k.includes('nd')) return null;
  return k === 'by' || k === 'by-sa' ? `CC ${k.toUpperCase()}${m[3] ? ' ' + m[3] : ''}` : null;
}

export async function jamendo(clientId: string, q: Record<string, string>): Promise<{ ok: true; tracks: MusicTrack[] } | { ok: false; error: string }> {
  const p = new URLSearchParams({ client_id: clientId, format: 'json', audioformat: 'mp32', imagesize: '200', ccnc: 'false', ccnd: 'false', include: 'licenses', ...q });
  let j: any;
  try { const r = await fetch(`https://api.jamendo.com/v3.0/tracks/?${p}`); j = await r.json(); } catch { return { ok: false, error: 'Jamendo injoignable' }; }
  if (j?.headers?.status !== 'success') return { ok: false, error: `Jamendo : ${j?.headers?.error_message || 'erreur'}` };
  const tracks = (j.results ?? []).flatMap((r: any): MusicTrack[] => {
    const license = licenseOf(r.license_ccurl);
    if (!license || !r.audio || !(Number(r.duration) > 0)) return [];
    return [{ id: String(r.id), title: String(r.name ?? '').slice(0, 120), artist: String(r.artist_name ?? '').slice(0, 120), duration: Number(r.duration),
      audio: String(r.audio).replace(/^http:/, 'https:'), image: r.image ? String(r.image).replace(/^http:/, 'https:') : null, license, licenseUrl: String(r.license_ccurl), url: String(r.shareurl ?? `https://www.jamendo.com/track/${r.id}`) }];
  });
  return { ok: true, tracks };
}
