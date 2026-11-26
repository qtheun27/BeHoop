// Liens de partage (WhatsApp, Facebook…) : une petite page par vidéo de match ou Moment, avec le bon titre et la bonne
// affiche (balises Open Graph lues par les réseaux sociaux), puis redirection immédiate vers l'appli.
// Vie privée : contenus d'équipes Jeunes → image générale de BeHoop (leur affiche montre les joueurs).
import type { Firestore } from './firestore';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function sharePage(fs: Firestore, site: string, media: string, kind: 'v' | 'm', id: string, team: string | null): Promise<Response> {
  const app = (h: string) => `${site}/app/#/${h}`;
  let title = 'BeHoop', desc = 'Tout le basket belge, gratuit.', image = `${site}/icons/og-image.jpg`, target = `${site}/app/`, vertical = false;
  if (/^[a-z0-9]{8,32}$/.test(id)) {
    if (kind === 'v') {
      const v = await fs.get<any>(`matchVideos/${id}`).catch(() => null);
      if (v && v.status !== 'deleted') {
        title = v.title ?? title; desc = 'Vidéo du match sur BeHoop';
        target = app(`video/${id}${team && /^\d+$/.test(team) ? `?e=${team}` : ''}`);
        if (v.visibility === 'public' && v.hls) image = `${media}/s/img/v/${id}.jpg`;
      }
    } else {
      const m = await fs.get<any>(`moments/${id}`).catch(() => null);
      const v = m ? await fs.get<any>(`matchVideos/${m.matchVideoId}`).catch(() => null) : null;
      if (m && v) {
        title = m.title || `Moment · ${v.title}`; desc = m.text || 'Un Moment sur BeHoop 🏀';
        target = app(`video/${m.matchVideoId}/m-${id}`);
        if (m.visibility === 'public' && m.posterKey) { image = `${media}/s/img/m/${id}.jpg`; vertical = true; }
      }
    }
  }
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta property="og:type" content="video.other"><meta property="og:site_name" content="BeHoop"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${esc(image)}">${vertical ? '' : '<meta property="og:image:width" content="1280"><meta property="og:image:height" content="720">'}
<meta name="twitter:card" content="summary_large_image"><meta http-equiv="refresh" content="0;url=${esc(target)}">
</head><body><script>location.replace(${JSON.stringify(target)})</script><a href="${esc(target)}">${esc(title)}</a></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}

/** Affiche publique d'une vidéo / d'un Moment Seniors (jamais pour les équipes Jeunes) */
export async function shareImage(fs: Firestore, bucket: R2Bucket, kind: 'v' | 'm', id: string): Promise<Response> {
  const none = () => new Response('Not found', { status: 404 });
  if (!/^[a-z0-9]{8,32}$/.test(id)) return none();
  let key: string | undefined;
  if (kind === 'v') {
    const v = await fs.get<any>(`matchVideos/${id}`).catch(() => null);
    if (!v || v.visibility !== 'public' || v.status === 'deleted') return none();
    key = (v.hls?.affiches as string[] | undefined)?.find((k) => k.endsWith('/fin.jpg')) ?? v.hls?.posterKey;
  } else {
    const m = await fs.get<any>(`moments/${id}`).catch(() => null);
    if (!m || m.visibility !== 'public') return none();
    key = m.posterKey;
  }
  const obj = key ? await bucket.get(key) : null;
  if (!obj) return none();
  return new Response(obj.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
}
