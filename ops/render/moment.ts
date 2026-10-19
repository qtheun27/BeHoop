// Rendu d'un Moment (V2) : passage de 15–30 s en vertical 9:16, fond flou, bandeau score + logos, logo BeHoop discret.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { ff } from './run';
import { momentArgs } from '../../shared/ffmpeg';
import { admin, R2, notifyUsers } from '../lib/admin';
import { settingsFromStore } from '../../shared/types';
import { N } from '../../shared/notifText';

const ROOT = resolve(import.meta.dirname, '../..');
const id = process.argv[2];
const { db, FieldValue } = admin();
const r2 = new R2();
const ref = db.doc(`moments/${id}`);
try {
  const m = (await ref.get()).data()!;
  const mv = (await db.doc(`matchVideos/${m.matchVideoId}`).get()).data()!;
  const work = join(ROOT, 'out', 'moment', id); rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
  await ref.update({ status: 'running' });
  // Source : variante 1080p HLS (lecture directe des segments nécessaires par FFmpeg via URL pré-signée)
  const src1080 = mv.hls.masterKey.replace('master.m3u8', '1080p/index.m3u8');
  await r2.download(src1080, join(work, 'index.m3u8'));
  const list = (await import('node:fs')).readFileSync(join(work, 'index.m3u8'), 'utf8').split('\n');
  let t = 0; const need: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const d = /#EXTINF:([\d.]+)/.exec(list[i]); if (!d) continue;
    const seg = list[i + 1]; const dur = Number(d[1]);
    if (t + dur >= m.start - 6 && t <= m.end + 6) need.push(seg);
    t += dur;
  }
  for (const s of need) await r2.download(src1080.replace('index.m3u8', s), join(work, s));
  // Bandeau 1080×260 rendu par Chromium (même style que les planches)
  const st = settingsFromStore(mv.settings); const [h, a] = st.scores[3];
  const html = `<html><head><style>body{margin:0;width:1080px;height:300px;background:linear-gradient(#0a0c12f0,#0a0c1200);font-family:Oswald,Arial;color:#fff;display:flex;align-items:center;justify-content:center;gap:28px}
    .l{width:110px;height:110px;border-radius:50%;background:#fff;display:grid;place-items:center;overflow:hidden}.l img{width:78%;height:78%;object-fit:contain}
    .s{font-family:Anton,Impact;font-size:96px}.g{color:#f2c14e}.b{position:absolute;right:28px;top:20px;font-size:22px;letter-spacing:.3em;opacity:.6}</style></head>
    <body><div class="l" style="box-shadow:0 0 0 5px ${st.home.color}"><img src="${st.home.logo}"></div><div class="s ${h > a ? 'g' : ''}">${h}</div><div class="s" style="opacity:.5">–</div>
    <div class="s ${a > h ? 'g' : ''}">${a}</div><div class="l" style="box-shadow:0 0 0 5px ${st.away.color}"><img src="${st.away.logo}"></div><div class="b">BEHOOP</div></body></html>`;
  writeFileSync(join(work, 'banner.html'), html);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 300 } });
  await p.goto('file://' + join(work, 'banner.html')); await p.waitForLoadState('networkidle');
  await p.screenshot({ path: join(work, 'banner.png'), omitBackground: true }); await b.close();
  const out = join(work, 'moment.mp4');
  await ff(momentArgs(join(work, 'index.m3u8'), m.start, m.end, join(work, 'banner.png'), out).map((x) => x));
  const vis = mv.visibility === 'team' ? `team-${mv.teamIdPrivate}` : 'public';
  const key = `moments/${vis}/${m.matchVideoId}/${id}.mp4`;
  await r2.upload(key, out, 'video/mp4');
  await ref.update({ status: 'ready', r2Key: key, readyAt: FieldValue.serverTimestamp() });
  await db.doc(`posts/moment-${id}`).set({
    type: 'moment', authorUid: m.authorUid, authorName: m.authorName ?? '', clubId: null, teamIds: mv.teamIds, targets: mv.teamIds.filter(Boolean).map((x: number) => `t:${x}`),
    visibility: mv.visibility, teamIdPrivate: mv.teamIdPrivate ?? null, hidden: false, reactions: {}, createdAt: FieldValue.serverTimestamp(),
    payload: { matchVideoId: m.matchVideoId, momentId: id, title: st.title, duration: m.end - m.start, posterKey: mv.hls.posterKey, score: `${h} – ${a}` },
  });
  await notifyUsers([m.authorUid], { title: N.momentReady, body: st.title, url: `/app/#/video/${m.matchVideoId}/m-${id}` }, 'videoReady', null).catch(() => 0);
} catch (e) {
  console.error(e); await ref.update({ status: 'error', error: String((e as Error).message).slice(0, 300) }); process.exitCode = 1;
}
