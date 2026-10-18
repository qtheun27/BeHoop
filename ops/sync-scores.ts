// Extension du scraper (lancé par update.yml juste après scraper.py, sans le modifier) :
//  • crée/met à jour les posts « score » (idempotent, id = score-{idMatchAWBB}) pour chaque résultat récent ;
//  • alimente teamInfo (catégorie → Jeunes/Seniors) quand la liste des équipes change ;
//  • remplace le score en direct par le résultat officiel et envoie « Résultat final ».
// Sans secret FIREBASE_SERVICE_ACCOUNT, le script ne fait rien (le site public n'est jamais bloqué).
import { createHash } from 'node:crypto';
import { admin, hasFirebase, notifyUsers, followers } from './lib/admin';
import { isPlayed } from './appData';
import { loadAll } from './allData';

if (!hasFirebase()) { console.log('ℹ️  Pas de compte de service Firebase : synchronisation sociale ignorée.'); process.exit(0); }
const { db, FieldValue } = admin();
// AWBB + Flandre fusionnés (avec les corrections BeHoop et les logos locaux)
const all = loadAll(process.argv[2] ?? '.');
const clubs = all.clubs;
const teamClub = new Map<number, (typeof clubs)[number]>();
clubs.forEach((c: any) => c.teams.forEach((t: any) => teamClub.set(t.id, c)));

// 1. teamInfo (seulement si la liste a changé : on garde une empreinte dans meta/teamInfo)
const teams = clubs.flatMap((c: any) => c.teams.map((t: any) => ({ id: t.id, clubId: c.id, name: t.name, category: t.cat, ageGroup: t.ag })));
const hash = createHash('sha1').update(JSON.stringify(teams)).digest('hex');
const meta = await db.doc('meta/teamInfo').get();
if (meta.data()?.hash !== hash) {
  for (let i = 0; i < teams.length; i += 400) {
    const b = db.batch();
    teams.slice(i, i + 400).forEach((t: any) => b.set(db.doc(`teamInfo/${t.id}`), { awbbId: t.id, clubId: t.clubId, name: t.name, category: t.category, ageGroup: t.ageGroup }, { merge: true }));
    await b.commit();
  }
  await db.doc('meta/teamInfo').set({ hash, count: teams.length, at: new Date() });
  console.log(`teamInfo : ${teams.length} équipes mises à jour`);
}

// 2. Posts score des 4 derniers jours
const since = new Date(Date.now() - 4 * 864e5).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);
// Matchs sans adversaire (exempt, forfait administratif) ignorés
const recent = all.games.filter((g: any) => g.d >= since && g.d <= today && isPlayed(g) && g.h && g.a);
let created = 0, updated = 0;
const tc = new Map<number, number>(); teamClub.forEach((c, t) => tc.set(t, c.id));
async function syncGame(g: (typeof recent)[number]): Promise<'created' | 'updated' | 'skip'> {
  const ref = db.doc(`posts/score-${g.id}`);
  const cur = await ref.get();
  const hc = teamClub.get(g.h), ac = teamClub.get(g.a);
  const payload = { gameId: g.id, date: g.d, time: g.t, competition: g.sn, official: true,
    home: { id: g.h, name: hc?.short ?? g.hn, logo: hc?.logo ?? null, color: hc?.c1 ?? '#3d8fdb', score: g.hs },
    away: { id: g.a, name: ac?.short ?? g.an, logo: ac?.logo ?? null, color: ac?.c1 ?? '#8a1e36', score: g.as } };
  const old = cur.data()?.payload;
  if (cur.exists && old?.home?.score === g.hs && old?.away?.score === g.as && old?.home?.name === payload.home.name && old?.away?.name === payload.away.name && old?.home?.logo === payload.home.logo && old?.away?.logo === payload.away.logo) return 'skip';
  await ref.set({ type: 'score', authorUid: null, authorName: 'BeHoop', clubId: hc?.id ?? null, teamIds: [g.h, g.a],
    targets: [`t:${g.h}`, `t:${g.a}`, ...(hc ? [`c:${hc.id}`] : []), ...(ac ? [`c:${ac.id}`] : [])],
    visibility: 'public', teamIdPrivate: null, hidden: false, payload,
    ...(cur.exists ? {} : { reactions: {}, createdAt: new Date(`${g.d}T${g.t || '20:00'}:00+02:00`) }) }, { merge: true });
  // Le résultat officiel remplace le score en direct
  const live = db.doc(`liveScores/${g.id}`);
  if ((await live.get()).exists) { await live.update({ status: 'official', home: g.hs, away: g.as }); await db.doc(`posts/live-${g.id}`).delete().catch(() => {}); }
  if (cur.exists) return 'updated';
  const uids = await followers([g.h, g.a], tc);
  await notifyUsers(uids, { title: `Résultat final : ${payload.home.name} ${g.hs} – ${g.as} ${payload.away.name}`, body: g.sn, url: `/app/#/post/score-${g.id}` }, 'result', g.h, `result_${g.id}`).catch(() => 0);
  return 'created';
}
// 10 matchs traités en parallèle (rattrapage rapide même après une grosse journée)
const queue = [...recent];
await Promise.all(Array.from({ length: 10 }, async () => {
  for (let g = queue.shift(); g; g = queue.shift()) {
    const r = await syncGame(g).catch((e) => { console.error('carte', g!.id, e.message); return 'skip' as const; });
    if (r === 'created') created++; else if (r === 'updated') updated++;
  }
}));
console.log(`posts score : ${created} créés, ${updated} mis à jour (${recent.length} résultats récents)`);
void FieldValue;
