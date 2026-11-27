// Publication d'une vidéo de match sur la chaîne YouTube de l'utilisateur (workflow youtube.yml, lancé par le Worker) :
// fichier MP4 1080p (préparé si besoin) → envoi « reprenable » en morceaux vers YouTube → playlist → vignette.
// L'avancement est écrit dans matchVideos/{id}.youtube (suivi en direct dans l'appli).
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { admin, R2, notifyUsers } from '../lib/admin';
import { buildMp4 } from './mp4';

const id = process.argv[2];
if (!id || !/^[a-z0-9]{8,32}$/.test(id)) throw new Error('identifiant de vidéo invalide');
const ROOT = resolve(import.meta.dirname, '../..');
const { db } = admin();
const r2 = new R2();
// Moment (2e argument) : envoyé en Short (vertical, < 60 s : YouTube le classe tout seul en Short)
const momentId = /^[a-f0-9]{16}$/.test(process.argv[3] ?? '') ? process.argv[3] : null;
const mvRef = db.doc(`matchVideos/${id}`);
const ref = momentId ? db.doc(`moments/${momentId}`) : mvRef;
const CHUNK = 32 * 1024 * 1024; // multiple de 256 Ko (exigé par Google)
const set = (p: Record<string, unknown>) => ref.update(Object.fromEntries(Object.entries(p).map(([k, v]) => [`youtube.${k}`, v])));

/** Message clair pour l'appli selon l'erreur Google */
function explain(e: unknown): string {
  const m = String((e as Error)?.message ?? e);
  if (m.includes('YT_RECONNECT')) return 'Connexion à YouTube expirée : reconnecte ta chaîne dans ton profil.';
  if (/quota/i.test(m)) return 'Limite quotidienne de YouTube atteinte pour BeHoop : réessaie demain.';
  if (/uploadLimitExceeded/i.test(m)) return 'Ta chaîne a atteint sa limite d’envois du jour : réessaie demain.';
  if (/youtubeSignupRequired|channelNotFound/i.test(m)) return 'Ce compte Google n’a pas encore de chaîne YouTube.';
  return `Envoi impossible : ${m.slice(0, 200)}`;
}

let tmp = '';
try {
  const mv = (await mvRef.get()).data()!;
  const moment = momentId ? (await ref.get()).data()! : null;
  const yt = (moment ?? mv).youtube; if (!yt) throw new Error('aucune publication demandée');
  // Bande son libre de droits : l'auteur est cité dans la description (exigé par les licences CC BY / BY-SA)
  const mu = moment?.music;
  const description = [yt.description ?? '', mu ? `♪ Musique : ${mu.title} — ${mu.artist} (${mu.license}) ${mu.url}` : ''].filter(Boolean).join('\n\n').slice(0, 5000);
  const cfg = (await db.doc('config/google').get()).data();
  const tk = (await db.doc(`ytTokens/${yt.uid}`).get()).data();
  if (!cfg?.clientId || !cfg?.clientSecret) throw new Error('identifiants Google absents');
  if (!tk?.refreshToken) throw new Error('YT_RECONNECT');
  let token = '', tokenAt = 0;
  const access = async () => {
    if (token && Date.now() - tokenAt < 45 * 60e3) return token;
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: tk.refreshToken, grant_type: 'refresh_token' }) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(j.error === 'invalid_grant' ? 'YT_RECONNECT' : `jeton Google ${r.status}`);
    token = j.access_token; tokenAt = Date.now(); return token;
  };
  const gapi = async (url: string, init: RequestInit = {}) => {
    const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${await access()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${j.error?.errors?.[0]?.reason ?? ''} ${j.error?.message ?? r.status}`.trim());
    return j;
  };
  await access(); // connexion valide avant de préparer quoi que ce soit

  // Diagnostic (YT_CHECK=1) : état de la vidéo déjà envoyée, vu par YouTube
  if (process.env.YT_CHECK === '1') {
    if (!yt.videoId) throw new Error('aucune vidéo YouTube enregistrée');
    const v = await gapi(`https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails,fileDetails,suggestions&id=${yt.videoId}`);
    console.log(JSON.stringify(v.items?.[0] ?? v, null, 2));
    process.exit(0);
  }

  // 1. Fichier : le Moment (MP4 vertical déjà prêt) ou le MP4 1080p du match (préparé maintenant s'il n'existe pas encore)
  let key = (moment ? moment.r2Key : mv.hls?.mp4Key1080) as string | undefined;
  if (!key) { await set({ status: 'preparing', progress: 0 }); console.log('préparation du fichier 1080p'); key = await buildMp4(id, '1080p', false); }
  const work = join(ROOT, 'out', 'youtube', momentId ?? id); rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
  tmp = work;
  const file = join(work, 'film.mp4');
  await r2.download(key, file);
  const size = statSync(file).size;
  console.log(`fichier : ${(size / 1e6).toFixed(0)} Mo`);

  // 2. Playlist à créer (nom choisi dans l'appli)
  let playlistId: string | null = yt.playlistId ?? null;
  if (!playlistId && yt.newPlaylist) {
    const p = await gapi('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', { method: 'POST',
      body: JSON.stringify({ snippet: { title: yt.newPlaylist }, status: { privacyStatus: yt.privacy === 'public' ? 'public' : 'unlisted' } }) });
    playlistId = p.id; console.log('playlist créée', playlistId);
  }

  // 3. Envoi reprenable : session, puis morceaux de 32 Mo (reprise au dernier octet reçu après une coupure)
  await set({ status: 'uploading', progress: 0 });
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', { method: 'POST',
    headers: { Authorization: `Bearer ${await access()}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': 'video/mp4' },
    body: JSON.stringify({ snippet: { title: yt.title, description, categoryId: '17' /* Sports */ },
      status: { privacyStatus: yt.privacy, selfDeclaredMadeForKids: false, embeddable: true } }) });
  if (!init.ok) { const j: any = await init.json().catch(() => ({})); throw new Error(`${j.error?.errors?.[0]?.reason ?? ''} ${j.error?.message ?? init.status}`.trim()); }
  const session = init.headers.get('location')!;
  const fh = await open(file, 'r');
  let sent = 0, video: any = null, tries = 0, lastPct = -1;
  try {
    while (!video) {
      const len = Math.min(CHUNK, size - sent), buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, sent);
      try {
        const r = await fetch(session, { method: 'PUT', body: buf, signal: AbortSignal.timeout(300_000),
          headers: { Authorization: `Bearer ${await access()}`, 'Content-Length': String(len), 'Content-Range': `bytes ${sent}-${sent + len - 1}/${size}` } });
        if (r.status === 200 || r.status === 201) { video = await r.json(); break; }
        if (r.status !== 308) throw new Error(`YouTube ${r.status} ${(await r.text()).slice(0, 200)}`);
        const range = r.headers.get('range'); sent = range ? Number(range.split('-')[1]) + 1 : 0; tries = 0;
      } catch (e) {
        if (++tries > 5) throw e;
        console.warn(`morceau à ${sent} : ${(e as Error).message}, reprise`);
        await new Promise((res) => setTimeout(res, 5000 * tries));
        // Où en est YouTube ? (requête d'état de la session)
        const st = await fetch(session, { method: 'PUT', headers: { Authorization: `Bearer ${await access()}`, 'Content-Length': '0', 'Content-Range': `bytes */${size}` } }).catch(() => null);
        if (st && (st.status === 200 || st.status === 201)) { video = await st.json(); break; }
        const range = st?.headers.get('range'); sent = range ? Number(range.split('-')[1]) + 1 : 0;
      }
      const pct = Math.floor((sent / size) * 100);
      if (pct >= lastPct + 5) { lastPct = pct; await set({ progress: pct }); console.log(`  envoyé ${pct} %`); }
    }
  } finally { await fh.close(); }
  console.log('vidéo YouTube', video.id);

  // 4. Playlist et vignette (affiche de fin de match) : facultatives, une erreur ici n'annule pas la publication
  if (playlistId) await gapi('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', { method: 'POST',
    body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId: video.id } } }) }).catch((e) => console.warn('playlist :', e.message));
  // (Short : pas de vignette personnalisée, YouTube choisit une image du Moment)
  const thumbKey = moment ? undefined : (mv.hls?.affiches as string[] | undefined)?.find((k) => k.endsWith('/fin.jpg')) ?? mv.hls?.posterKey;
  if (thumbKey) {
    const th = join(work, 'thumb.jpg');
    await r2.download(thumbKey, th).then(async () => {
      const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${video.id}`, { method: 'POST',
        headers: { Authorization: `Bearer ${await access()}`, 'Content-Type': 'image/jpeg' }, body: (await import('node:fs')).readFileSync(th) });
      if (!r.ok) console.warn('vignette :', r.status, (await r.text()).slice(0, 200)); // chaîne non vérifiée : vignette refusée par YouTube
    }).catch(() => {});
  }
  await set({ status: 'done', progress: 100, videoId: video.id, url: `https://youtu.be/${video.id}`, playlistId, doneAt: Date.now(), error: null });
  await notifyUsers([yt.uid], { title: { fr: '▶️ Vidéo publiée sur YouTube', nl: '▶️ Video gepubliceerd op YouTube', en: '▶️ Video published on YouTube' }, body: yt.title, url: momentId ? `/app/#/video/${id}/m-${momentId}` : `/app/#/video/${id}` }, 'videoReady', null).catch(() => 0);
} catch (e) {
  console.error(e);
  await set({ status: 'error', error: explain(e) }).catch(() => {});
  process.exitCode = 1;
} finally {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
}
