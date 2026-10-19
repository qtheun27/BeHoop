// Tâches planifiées (notify.yml, toutes les 30 min) :
//  • « Match dans 2 h » aux abonnés ; • rappel covoiturage la veille (18 h) ; • purge des rushes 48 h après le montage.
import { admin, hasFirebase, notifyUsers, followers, R2 } from './lib/admin';
import { isPlayed } from './appData';
import { loadAll } from './allData';
import { N } from '../shared/notifText';

if (!hasFirebase()) { console.log('ℹ️  Pas de compte de service Firebase : rien à faire.'); process.exit(0); }
const { db } = admin();
const all = loadAll('.');
const tc = new Map<number, number>();
all.clubs.forEach((c) => c.teams.forEach((t) => tc.set(t.id, c.id)));
// Heure de Bruxelles
const nowBxl = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Brussels' }));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const games = all.games.filter((g) => !isPlayed(g));

// 1. Match dans 2 h (fenêtre 1 h 45 – 2 h 15)
let n = 0;
for (const g of games.filter((g: any) => g.d === iso(nowBxl) && g.t)) {
  const [h, m] = g.t.split(':').map(Number);
  const diff = (h * 60 + m) - (nowBxl.getHours() * 60 + nowBxl.getMinutes());
  if (diff < 105 || diff >= 135) continue;
  const uids = await followers([g.h, g.a], tc);
  n += await notifyUsers(uids, { title: N.match2h(g.hn, g.an), body: `${g.t} · ${g.v}`, url: `/app/#/matchs?g=${g.id}` }, 'match2h', g.h, `m2h_${g.id}`);
}
// 2. Rappel covoiturage la veille, à 18 h
if (nowBxl.getHours() === 18 && nowBxl.getMinutes() < 30) {
  const tomorrow = iso(new Date(nowBxl.getTime() + 864e5));
  for (const g of games.filter((g: any) => g.d === tomorrow)) {
    const offers = await db.collection(`carpools/${g.id}/offers`).get();
    for (const o of offers.docs) {
      const d = o.data(); const riders = Object.entries(d.requests ?? {}).filter(([, r]: any) => r.status === 'accepted').map(([u]) => u);
      if (riders.length) n += await notifyUsers([d.driverUid, ...riders], { title: N.carpoolTomorrow, body: N.carpoolDetail(g.hn, g.an, d.time, d.from), url: `/app/#/matchs?g=${g.id}` }, 'carpool', null, `car_${o.id}`);
    }
  }
}
console.log(`${n} notification(s) envoyée(s)`);

// 3. Purge des rushes vidéo 48 h après un montage réussi (les photos ont été copiées pour la galerie)
if (process.env.R2_ACCESS_KEY_ID) {
  const r2 = new R2();
  const due = await db.collection('matchVideos').where('purgeAfter', '<', new Date()).limit(20).get();
  for (const d of due.docs) {
    if (d.data().rushesPurged) continue;
    const objs = await r2.list(`rushes/${d.id}/`);
    for (const o of objs) await r2.remove(o.key);
    await d.ref.update({ rushesPurged: true });
    console.log(`rushes purgés : ${d.id} (${objs.length} fichiers)`);
  }
}
