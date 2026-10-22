// Extension du scraper (lancé par update.yml juste après scraper.py, sans le modifier) :
//  • crée/met à jour les posts « score » (idempotent, id = score-{idMatchAWBB}) pour chaque résultat récent ;
//  • alimente teamInfo (catégorie → Jeunes/Seniors) quand la liste des équipes change ;
//  • remplace le score en direct par le résultat officiel et envoie « Résultat final ».
// Sans secret FIREBASE_SERVICE_ACCOUNT, le script ne fait rien (le site public n'est jamais bloqué).
import { createHash } from 'node:crypto';
import { admin, hasFirebase } from './lib/admin';
import { isPlayed, type SlimGame } from './appData';
import { loadAll } from './allData';
import { scoreSync } from './lib/scorePosts';

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
// Fenêtre : 4 jours pour tous ; toute la saison (60 jours) pour les équipes pro, nationales et internationales
// (BNXT, NBA, Belgian Lions, équipes « National »), pour qu'un nouvel abonné voie leurs derniers résultats.
const proTeams = new Set<number>();
clubs.forEach((c) => c.teams.forEach((t) => { if (t.id >= 20e9 || /National|BNXT|NBA/.test(t.cat)) proTeams.add(t.id); }));
const sincePro = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
const recent: SlimGame[] = all.games.filter((g) => (proTeams.has(g.h) || proTeams.has(g.a)) && g.d >= sincePro && g.d <= today && isPlayed(g) && g.h && g.a).concat(all.games.filter((g: any) => g.d >= since && g.d <= today && isPlayed(g) && g.h && g.a && !(proTeams.has(g.h) || proTeams.has(g.a))));
let created = 0, updated = 0;
const syncGame = scoreSync(db, teamClub);
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
