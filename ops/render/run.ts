// Pipeline de montage (GitHub Actions render.yml) — aussi utilisable en local : npm run render:local -- <dossier>
//   distant : tsx ops/render/run.ts <matchVideoId>     (Firestore + R2)
//   local   : tsx ops/render/run.ts --local <dossier>  (dossier contenant job.json + fichiers, sortie dans out/render/<id>)
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, statSync, readdirSync, copyFileSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createReadStream } from 'node:fs';
import { chromium, type Page } from '@playwright/test';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { normalizeArgs, framesToClipArgs, photoClipArgs, segmentArgs, concatListArgs, hlsArgs, type ProbeInfo } from '../../shared/ffmpeg';
import { buildChapters, chaptersToVtt, type Segment } from '../../shared/chapters';
import { mosaicPhotos, quarterItems } from '../../shared/quarters';
import { settingsFromStore, type MatchSettings, type MediaItem, type PlancheType } from '../../shared/types';
import { N } from '../../shared/notifText';

const ROOT = resolve(import.meta.dirname, '../..');
const FFMPEG = process.env.FFMPEG ?? (existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : (ffmpegStatic as unknown as string));
const FFPROBE = process.env.FFPROBE ?? (existsSync('/usr/bin/ffprobe') ? '/usr/bin/ffprobe' : ffprobeStatic.path);
const DUR: Record<PlancheType, number> = { pre: 6, q1: 5, q2: 5, q3: 5, fin: 8, wipe: 0.6 };
const WHOOSH = join(ROOT, 'render/assets/whoosh.m4a');

export function run(bin: string, args: string[]): Promise<string> {
  return new Promise((ok, ko) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err = (err + d).slice(-4000)));
    p.on('close', (c) => (c === 0 ? ok(out) : ko(new Error(`${bin.split('/').pop()} a échoué (${c}) : ${err.slice(-800)}`))));
  });
}
export const ff = (args: string[]) => run(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args]);

async function probe(file: string): Promise<ProbeInfo> {
  const j = JSON.parse(await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]));
  const v = j.streams.find((s: any) => s.codec_type === 'video') ?? {};
  const rot = Number(v.tags?.rotate ?? v.side_data_list?.find((x: any) => x.rotation !== undefined)?.rotation ?? 0);
  return { width: v.width ?? 1920, height: v.height ?? 1080, rotation: rot, hasAudio: j.streams.some((s: any) => s.codec_type === 'audio'), duration: Number(j.format?.duration ?? v.duration ?? 0) };
}
const durationOf = async (f: string) => (await probe(f)).duration;

/** Petit serveur statique : /app (build), /docs (démo), /work (fichiers du rendu). */
function serve(workDir: string): Promise<{ server: Server; base: string }> {
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.json': 'application/json', '.webp': 'image/webp' };
  const server = createServer((req, res) => {
    const u = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const f = u.startsWith('/work/') ? join(workDir, u.slice(6)) : join(ROOT, u);
    if (!f.startsWith(ROOT) && !f.startsWith(workDir)) { res.statusCode = 403; return res.end(); }
    if (!existsSync(f) || !statSync(f).isFile()) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', types[extname(f).toLowerCase()] ?? 'application/octet-stream');
    createReadStream(f).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${(server.address() as any).port}` })));
}

/** Capture image par image (30 i/s) d'une planche ; la page rend l'état exact à l'instant t. */
async function captureFrames(page: Page, base: string, st: MatchSettings, type: PlancheType, dir: string, from = 0, to = Math.round(DUR[type] * 30)) {
  mkdirSync(dir, { recursive: true });
  await page.addInitScript((s) => { (window as any).__SETTINGS__ = s; }, st);
  await page.goto(`${base}/app/render/planche.html?type=${type}`);
  await page.evaluate(() => (window as any).plancheReady);
  for (let i = from; i < to; i++) {
    await page.evaluate((t) => (window as any).setT(t), i / 30);
    await page.screenshot(type === 'wipe' ? { path: join(dir, `${String(i - from).padStart(4, '0')}.png`), omitBackground: true } : { path: join(dir, `${String(i - from).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
  }
}

export interface Job {
  id: string; version: number; settings: MatchSettings; media: (MediaItem & { local?: string })[];
  visibility: 'public' | 'team'; teamIdPrivate: number | null;
}
export interface Hooks { progress: (p: number, step: string) => Promise<void>; fetchMedia: (m: MediaItem, to: string) => Promise<void> }

/** Rendu complet ; renvoie le dossier HLS et les métadonnées. */
export async function render(job: Job, work: string, hooks: Hooks) {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, 'photos'), { recursive: true }); mkdirSync(join(work, 'clips'), { recursive: true });
  const P = hooks.progress;
  const media = job.media.filter((m) => !m.excluded);

  // 1. Photos (légères) : téléchargées d'abord pour les planches
  await P(2, 'Préparation des photos');
  for (const m of media.filter((x) => x.kind === 'photo')) { m.local = join(work, 'photos', `${m.id}.jpg`); await hooks.fetchMedia(m, m.local); }

  // 2. Vidéos : téléchargement → normalisation → suppression de l'original (disque du runner limité)
  const videos = media.filter((m) => m.kind === 'video').sort((a, b) => (a.quarter! - b.quarter!) || ((a.order ?? 0) - (b.order ?? 0)));
  const norm = new Map<string, { path: string; duration: number }>();
  for (const [i, m] of videos.entries()) {
    await P(5 + Math.round((i / Math.max(1, videos.length)) * 50), `Préparation des vidéos (${i + 1}/${videos.length})`);
    const src = join(work, `src_${m.id}${extname(m.name) || '.mov'}`);
    await hooks.fetchMedia(m, src);
    const out = join(work, 'clips', `norm_${m.id}.mp4`);
    await ff(normalizeArgs(src, out, await probe(src)).map((a) => (a === 'veryfast' ? 'superfast' : a)));
    rmSync(src, { force: true });
    norm.set(m.id, { path: out, duration: await durationOf(out) });
  }

  // 3. Photos des planches (fallback : images extraites des vidéos du quart)
  const url = (p: string) => `/work/${p.slice(work.length + 1)}`;
  const grab = async (q: number) => {
    const out: string[] = [];
    for (const v of quarterItems(videos, q).slice(0, 4)) {
      const n = norm.get(v.id)!; const f = join(work, 'photos', `grab_${v.id}.jpg`);
      await ff(['-y', '-ss', String(n.duration / 2), '-i', n.path, '-frames:v', '1', '-q:v', '3', f]); out.push(url(f));
    }
    return out;
  };
  const photosOf = async (q: number) => { const p = mosaicPhotos(media, q).map((m) => url(m.local!)); return p.length ? p : grab(q); };
  const allPlay = media.filter((m) => m.kind === 'photo' && !m.offPlay && !m.scoreboardOfQuarter).map((m) => url(m.local!));
  const q1 = await photosOf(1), q2 = await photosOf(2), q3 = await photosOf(3);
  const fin = allPlay.length >= 4 ? allPlay.filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 8)) === 0).slice(0, 8) : [...q1, ...q2, ...q3].slice(0, 8);
  const st: MatchSettings = { ...job.settings, photos: { pre: (media.find((m) => m.featured && m.quarter === 1)?.local ? url(media.find((m) => m.featured && m.quarter === 1)!.local!) : q1[0]), q1, q2, q3, fin } };

  // 4. Planches animées + vague (Playwright, 30 i/s)
  await P(58, 'Création des planches animées');
  const { server, base } = await serve(work);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const planche: Record<string, string> = {};
  try {
    for (const t of ['pre', 'q1', 'q2', 'q3', 'fin'] as PlancheType[]) {
      const dir = join(work, `frames_${t}`);
      await captureFrames(page, base, st, t, dir);
      planche[t] = join(work, 'clips', `planche_${t}.mp4`);
      await ff(framesToClipArgs(join(dir, '%04d.jpg'), planche[t], DUR[t]));
      if (t === 'fin') copyFileSync(join(dir, `${String(DUR.fin * 30 - 1).padStart(4, '0')}.jpg`), join(work, 'poster.jpg'));
      rmSync(dir, { recursive: true, force: true });
    }
    // Vague : 0–9 couvre l'écran (fin du segment A), 9–17 révèle la suite (début du segment B)
    await captureFrames(page, base, st, 'wipe', join(work, 'wipe_in'), 0, 10);
    await captureFrames(page, base, st, 'wipe', join(work, 'wipe_out'), 9, 18);
  } finally { await browser.close(); server.close(); }

  // 5. Segments (une seule passe d'encodage chacun) : fondus vidéo↔vidéo + vague planche↔vidéo
  const order: { kind: 'planche' | 'quarter'; key: string; chapter: string }[] = [
    { kind: 'planche', key: 'pre', chapter: 'Avant-match' }, { kind: 'quarter', key: '1', chapter: 'Q1' }, { kind: 'planche', key: 'q1', chapter: 'Q1' },
    { kind: 'quarter', key: '2', chapter: 'Q2' }, { kind: 'planche', key: 'q2', chapter: 'Q2' }, { kind: 'quarter', key: '3', chapter: 'Q3' },
    { kind: 'planche', key: 'q3', chapter: 'Q3' }, { kind: 'quarter', key: '4', chapter: 'Q4' }, { kind: 'planche', key: 'fin', chapter: 'Fin' }];
  const parts: { path: string; duration: number; chapter: string }[] = [];
  const pieces = await Promise.all(order.map(async (o) => {
    if (o.kind === 'planche') return [{ path: planche[o.key], duration: DUR[o.key as PlancheType] }];
    const q = Number(o.key);
    const vids = quarterItems(videos, q).map((v) => norm.get(v.id)!).filter(Boolean);
    if (vids.length) return vids;
    // quart sans vidéo : quelques photos en Ken Burns
    const ph = mosaicPhotos(media, q, 4);
    const out = [];
    for (const m of ph) { const f = join(work, 'clips', `photo_${m.id}.mp4`); await ff(photoClipArgs(m.local!, f, 3)); out.push({ path: f, duration: 3 }); }
    return out;
  }));
  const kept = order.map((o, i) => ({ ...o, inputs: pieces[i] })).filter((x) => x.inputs.length);
  for (const [i, s] of kept.entries()) {
    await P(62 + Math.round((i / kept.length) * 20), `Assemblage (${i + 1}/${kept.length})`);
    const out = join(work, `seg_${i}.mp4`);
    const r = segmentArgs(s.inputs, out, {
      head: i > 0 ? join(work, 'wipe_out', '%04d.png') : undefined,
      tail: i < kept.length - 1 ? join(work, 'wipe_in', '%04d.png') : undefined,
      whoosh: existsSync(WHOOSH) ? WHOOSH : undefined,
    });
    await ff(r.args);
    parts.push({ path: out, duration: await durationOf(out), chapter: s.chapter });
  }
  for (const f of readdirSync(join(work, 'clips'))) rmSync(join(work, 'clips', f), { force: true });

  // 6. Concaténation sans réencodage, chapitres, HLS, affiche
  await P(84, 'Finalisation de la vidéo');
  writeFileSync(join(work, 'list.txt'), parts.map((p) => `file '${p.path}'`).join('\n'));
  const film = join(work, 'film.mp4');
  await ff(concatListArgs(join(work, 'list.txt'), film));
  parts.forEach((p) => rmSync(p.path, { force: true }));
  const chapters = buildChapters(parts.map<Segment>((p) => ({ label: p.chapter, chapter: p.chapter, duration: p.duration })));
  const hls = join(work, 'hls');
  mkdirSync(join(hls, '1080p'), { recursive: true }); mkdirSync(join(hls, '720p'), { recursive: true });
  writeFileSync(join(hls, 'chapters.vtt'), chaptersToVtt(chapters));
  await P(88, 'Préparation de la lecture en streaming');
  await ff(hlsArgs(film, hls));
  await ff(['-y', '-i', join(work, 'poster.jpg'), '-vf', 'scale=1280:-2', '-q:v', '3', join(hls, 'poster.jpg')]);
  let mp4: string | undefined;
  if (job.visibility === 'public') { mp4 = join(hls, 'film_720p.mp4'); await ff(['-y', '-i', join(hls, '720p', 'index.m3u8'), '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', mp4]); }
  const duration = await durationOf(film);
  rmSync(film, { force: true });
  return { hls, chapters, duration, mp4 };
}

/* ---------------- Mode GitHub Actions (Firestore + R2) ---------------- */
async function remote(id: string) {
  const { admin, R2, notifyUsers, followers } = await import('../lib/admin');
  const { db, FieldValue } = admin();
  const r2 = new R2();
  const ghRunUrl = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
  const jobRef = db.doc(`renderJobs/${id}`), mvRef = db.doc(`matchVideos/${id}`);
  await jobRef.set({ status: 'running', progress: 1, step: 'Démarrage', ghRunUrl, startedAt: FieldValue.serverTimestamp() }, { merge: true });
  try {
    const mv = (await mvRef.get()).data();
    if (!mv) throw new Error('Montage introuvable');
    const version = (mv.version ?? 0) + 1;
    const job: Job = { id, version, settings: settingsFromStore(mv.settings), media: mv.media, visibility: mv.visibility, teamIdPrivate: mv.teamIdPrivate ?? null };
    let last = 0;
    const res = await render(job, join(ROOT, 'out', 'render', id), {
      progress: async (p, step) => { if (p - last >= 2 || p < last) { last = p; await jobRef.update({ progress: p, step }); } },
      fetchMedia: (m, to) => r2.download(m.r2Key, to),
    });
    await jobRef.update({ progress: 92, step: 'Mise en ligne' });
    const prefix = `videos/${job.visibility === 'team' ? `team-${job.teamIdPrivate}` : 'public'}/${id}/v${version}`;
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    const ct: Record<string, string> = { '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.vtt': 'text/vtt', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' };
    const files = walk(res.hls);
    for (let i = 0; i < files.length; i += 8) await Promise.all(files.slice(i, i + 8).map((f) => r2.upload(`${prefix}/${f.slice(res.hls.length + 1)}`, f, ct[extname(f)] ?? 'application/octet-stream', f.endsWith('.m3u8') ? 'public, max-age=60' : undefined)));
    // Photos conservées (2048 px) pour la galerie
    const vis = job.visibility === 'team' ? `team-${job.teamIdPrivate}` : 'public';
    for (const m of job.media.filter((x) => x.kind === 'photo' && !x.excluded)) await r2.copy(m.r2Key, `photos/${vis}/${id}/${m.id}.jpg`).catch(() => {});
    const [fh, fa] = job.settings.scores[3];
    const hls = { masterKey: `${prefix}/master.m3u8`, chapters: res.chapters, duration: Math.round(res.duration), posterKey: `${prefix}/poster.jpg`, ...(res.mp4 ? { mp4Key: `${prefix}/film_720p.mp4` } : {}) };
    await mvRef.update({ status: 'ready', version, hls, purgeAfter: new Date(Date.now() + 48 * 3600e3), voteUntil: new Date(Date.now() + 48 * 3600e3) });
    const teamIds: number[] = mv.teamIds.filter(Boolean);
    await db.doc(`posts/video-${id}`).set({
      type: 'video', authorUid: mv.authorUid, authorName: mv.authorName ?? '', clubId: null, teamIds, targets: teamIds.map((t) => `t:${t}`),
      visibility: job.visibility, teamIdPrivate: job.teamIdPrivate, hidden: false, reactions: {}, createdAt: FieldValue.serverTimestamp(),
      payload: { matchVideoId: id, title: job.settings.title, duration: hls.duration, posterKey: hls.posterKey, score: `${fh} – ${fa}` },
    }, { merge: true });
    await jobRef.update({ status: 'done', progress: 100, step: 'Vidéo prête', finishedAt: FieldValue.serverTimestamp() });
    await notifyUsers([mv.authorUid], { title: N.videoReady, body: job.settings.title, url: `/app/#/video/${id}` }, 'videoReady', null).catch(() => 0);
    // « Nouvelle vidéo de [équipe] » : membres de l'Équipe 🔒 (Jeunes) ou abonnés (Seniors)
    let to: string[] = [];
    if (job.visibility === 'team') to = (await db.collection(`teamMembers/${job.teamIdPrivate}/members`).where('status', '==', 'accepted').get()).docs.map((d) => d.id);
    else { const idx = JSON.parse(readFileSync(join(ROOT, 'app-data/index.json'), 'utf8')); const m = new Map<number, number>(); idx.clubs.forEach((c: any) => c.teams.forEach((t: any) => m.set(t.id, c.id))); to = await followers(teamIds, m); }
    await notifyUsers(to.filter((u) => u !== mv.authorUid), { title: N.newVideo(job.settings.home.name, job.settings.away.name), body: job.settings.title, url: `/app/#/video/${id}` }, 'newVideo', teamIds[0], `video_${id}_${version}`).catch(() => 0);
  } catch (e) {
    console.error(e);
    await jobRef.set({ status: 'error', step: 'Erreur', error: `Le montage a échoué : ${String((e as Error).message).slice(0, 300)}`, ghRunUrl, finishedAt: FieldValue.serverTimestamp() }, { merge: true });
    process.exitCode = 1;
  }
}

/* ---------------- Mode local (tests de bout en bout) ---------------- */
async function local(dir: string) {
  const job = JSON.parse(readFileSync(join(dir, 'job.json'), 'utf8')) as Job;
  const t0 = Date.now();
  const res = await render(job, join(ROOT, 'out', 'render', job.id), {
    progress: async (p, s) => console.log(`${String(p).padStart(3)} % · ${s}`),
    fetchMedia: async (m, to) => copyFileSync(resolve(dir, m.r2Key), to),
  });
  console.log(`✅ ${res.duration.toFixed(1)} s de vidéo en ${((Date.now() - t0) / 1000).toFixed(0)} s → ${res.hls}`);
  console.log(res.chapters.map((c) => `${c.title} ${c.start.toFixed(1)}–${c.end.toFixed(1)}`).join(' · '));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [a, b] = process.argv.slice(2);
  if (a === '--local') local(b);
  else if (a) remote(a);
}
