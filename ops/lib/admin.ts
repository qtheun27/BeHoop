// Accès serveur : Firestore (firebase-admin, compte de service) et R2 (API S3 signée avec aws4fetch).
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { AwsClient } from 'aws4fetch';
import { createReadStream, createWriteStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pick, type Txt } from '../../shared/notifText';

let configured = false;
export function admin() {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (sa) initializeApp({ credential: cert(JSON.parse(sa)) });
    else if (process.env.FIRESTORE_EMULATOR_HOST) initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-behoop' });
    else throw new Error('FIREBASE_SERVICE_ACCOUNT manquant (ou FIRESTORE_EMULATOR_HOST pour l’émulateur)');
  }
  const db = getFirestore();
  if (!configured) { db.settings({ ignoreUndefinedProperties: true }); configured = true; }
  return { db, messaging: getMessaging(), FieldValue };
}
export const hasFirebase = () => !!(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIRESTORE_EMULATOR_HOST);

export class R2 {
  private c: AwsClient; private base: string;
  constructor(env = process.env) {
    this.c = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY!, service: 's3', region: 'auto' });
    // Bucket en juridiction UE : point d'accès https://<compte>.eu.r2.cloudflarestorage.com
    this.base = `https://${env.R2_ACCOUNT_ID}${(env.R2_JURISDICTION ?? 'eu') ? '.' + (env.R2_JURISDICTION ?? 'eu') : ''}.r2.cloudflarestorage.com/${env.R2_BUCKET}`;
  }
  url(key: string) { return `${this.base}/${key.split('/').map(encodeURIComponent).join('/')}`; }
  async download(key: string, to: string) {
    const r = await this.c.fetch(this.url(key));
    if (!r.ok || !r.body) throw new Error(`R2 GET ${key} → ${r.status}`);
    await pipeline(Readable.fromWeb(r.body as any), createWriteStream(to));
  }
  async upload(key: string, from: string, type: string, cache = 'public, max-age=31536000, immutable') {
    const r = await this.c.fetch(this.url(key), { method: 'PUT', body: createReadStream(from) as any, duplex: 'half',
      headers: { 'Content-Type': type, 'Content-Length': String(statSync(from).size), 'Cache-Control': cache } } as RequestInit);
    if (!r.ok) throw new Error(`R2 PUT ${key} → ${r.status} ${await r.text()}`);
  }
  async list(prefix: string): Promise<{ key: string; lastModified: string }[]> {
    const out: { key: string; lastModified: string }[] = []; let token = '';
    do {
      const r = await this.c.fetch(`${this.base}?list-type=2&prefix=${encodeURIComponent(prefix)}${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`);
      const x = await r.text();
      for (const m of x.matchAll(/<Key>([^<]+)<\/Key>.*?<LastModified>([^<]+)<\/LastModified>/gs)) out.push({ key: m[1], lastModified: m[2] });
      token = /<NextContinuationToken>([^<]+)</.exec(x)?.[1] ?? '';
    } while (token);
    return out;
  }
  async remove(key: string) { await this.c.fetch(this.url(key), { method: 'DELETE' }); }
  async copy(from: string, to: string) {
    const r = await this.c.fetch(this.url(to), { method: 'PUT', headers: { 'x-amz-copy-source': `/${process.env.R2_BUCKET}/${from}` } });
    if (!r.ok) throw new Error(`R2 COPY ${from} → ${r.status}`);
  }
}

/** Envoi FCM avec préférences et anti-spam (max 1 notif par équipe et par heure, sauf « vidéo prête »). */
export async function notifyUsers(uids: string[], n: { title: Txt; body: Txt; url: string }, type: string, teamId: number | null, dedupeKey?: string) {
  const { db, messaging } = admin();
  const hour = new Date().toISOString().slice(0, 13);
  let sent = 0;
  for (const uid of [...new Set(uids)]) {
    const p = (await db.doc(`profiles/${uid}`).get()).data();
    if (!p?.fcmTokens?.length || p.notifPrefs?.[type] === false) continue;
    const logs = [dedupeKey && `notifLog/${uid}_${dedupeKey}`, teamId && type !== 'videoReady' && `notifLog/${uid}_${teamId}_${hour}`].filter(Boolean) as string[];
    let skip = false;
    for (const l of logs) if ((await db.doc(l).get()).exists) skip = true;
    if (skip) continue;
    await Promise.all(logs.map((l) => db.doc(l).set({ at: new Date() })));
    const r = await messaging.sendEachForMulticast({ tokens: p.fcmTokens, notification: { title: pick(n.title, p.lang), body: pick(n.body, p.lang) }, data: { url: n.url, tag: type },
      webpush: { fcmOptions: { link: `https://behoop.be${n.url}` } } });
    const dead = r.responses.map((x, i) => (!x.success && /registration-token-not-registered|invalid-argument/.test(x.error?.code ?? '') ? p.fcmTokens[i] : null)).filter(Boolean);
    if (dead.length) await db.doc(`profiles/${uid}`).update({ fcmTokens: p.fcmTokens.filter((t: string) => !dead.includes(t)) });
    sent++;
  }
  return sent;
}

/** Comptes qui suivent ces équipes (directement ou via le club, sauf équipe désactivée). */
export async function followers(teamIds: number[], teamClub: Map<number, number>) {
  const { db } = admin();
  const out = new Set<string>();
  const t = await db.collectionGroup('items').where('type', '==', 'team').where('refId', 'in', teamIds).get();
  t.forEach((d) => out.add(d.ref.parent.parent!.id));
  const clubs = [...new Set(teamIds.map((x) => teamClub.get(x)).filter(Boolean))] as number[];
  if (clubs.length) {
    const c = await db.collectionGroup('items').where('type', '==', 'club').where('refId', 'in', clubs).get();
    c.forEach((d) => { const muted: number[] = d.data().mutedTeams ?? []; if (!teamIds.every((x) => muted.includes(x))) out.add(d.ref.parent.parent!.id); });
  }
  return [...out];
}
