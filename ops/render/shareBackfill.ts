// Affiches de partage sans photo pour les vidéos et Moments existants (workflow share-cards.yml, à lancer une fois)
import { join, resolve } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { admin, R2 } from '../lib/admin';
import { settingsFromStore } from '../../shared/types';
import { shareCard } from './shareCard';

const ROOT = resolve(import.meta.dirname, '../..');
const { db } = admin(); const r2 = new R2();
const work = join(ROOT, 'out', 'share-cards'); rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
const b = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
let n = 0, fail = 0;
try {
  const vids = await db.collection('matchVideos').where('status', '==', 'ready').get();
  const mv = new Map(vids.docs.map((d) => [d.id, d.data()]));
  for (const d of vids.docs) {
    const v = d.data(); if (!v.settings) continue;
    try { const f = await shareCard(b, settingsFromStore(v.settings), join(work, `v_${d.id}.jpg`)); await r2.upload(`share/v/${d.id}.jpg`, f, 'image/jpeg'); n++; }
    catch (e) { fail++; console.warn('vidéo', d.id, (e as Error).message); }
  }
  for (const d of (await db.collection('moments').where('status', '==', 'ready').get()).docs) {
    const m = d.data(), v = mv.get(m.matchVideoId); if (!v?.settings) continue;
    try { const f = await shareCard(b, settingsFromStore(v.settings), join(work, `m_${d.id}.jpg`), m.title || 'Moment'); await r2.upload(`share/m/${d.id}.jpg`, f, 'image/jpeg'); n++; }
    catch (e) { fail++; console.warn('Moment', d.id, (e as Error).message); }
  }
} finally { await b.close(); rmSync(work, { recursive: true, force: true }); }
console.log(`affiches créées : ${n}${fail ? ` · échecs : ${fail}` : ''}`);
if (fail && !n) process.exitCode = 1;
