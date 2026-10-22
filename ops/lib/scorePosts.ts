// Carte « score » d'un match terminé (post score-{id}, idempotent) + notification « Résultat final » aux abonnés.
// Utilisé par la mise à jour complète (sync-scores.ts) et par les résultats rapides (live-results.ts).
import type { Firestore } from 'firebase-admin/firestore';
import { notifyUsers, followers } from './admin';
import { N } from '../../shared/notifText';
import type { SlimGame } from '../appData';

type ClubLite = { id: number; short?: string; logo?: string | null; c1?: string };
export function scoreSync(db: Firestore, teamClub: Map<number, ClubLite>) {
  const tc = new Map<number, number>(); teamClub.forEach((c, t) => tc.set(t, c.id));
  return async function syncGame(g: SlimGame): Promise<'created' | 'updated' | 'skip'> {
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
    // Pas de notification pour un résultat ancien (rattrapage) : seulement les matchs des dernières 36 h
    if (Date.parse(`${g.d}T23:59:00`) < Date.now() - 36 * 3600e3) return 'created';
    const uids = await followers([g.h, g.a], tc);
    await notifyUsers(uids, { title: N.result(payload.home.name, g.hs!, g.as!, payload.away.name), body: g.sn, url: `/app/#/post/score-${g.id}` }, 'result', g.h, `result_${g.id}`).catch(() => 0);
    return 'created';
  };
}
