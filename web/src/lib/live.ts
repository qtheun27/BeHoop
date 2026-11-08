// Résultats rapides (écrits par ops/live-results.ts dans Firestore results/{match}) : appliqués aux matchs chargés
// depuis app-data, et classement provisoire recalculé avec le moteur (engine.ts) en attendant la mise à jour officielle.
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { standings, offsetsFrom, rule } from './engine';
import type { Game, Standing } from './data';

type Live = { hs: number; as: number; at: number };
let cache: { at: number; p: Promise<Map<number, Live>> } | null = null;
/** Résultats rapides des 3 derniers jours (relus au plus toutes les 2 minutes) */
export function liveResults() {
  if (!cache || Date.now() - cache.at > 120_000) {
    // Un document par jour (resultsDay/{date}) : 5 lectures, des 3 derniers jours à demain (dates belges ≠ dates UTC vers minuit)
    const days = Array.from({ length: 5 }, (_, i) => new Date(Date.now() + (1 - i) * 864e5).toISOString().slice(0, 10));
    cache = { at: Date.now(), p: Promise.all(days.map((d) => getDoc(doc(db, 'resultsDay', d)).catch(() => null)))
      .then((snaps) => { const m = new Map<number, Live>();
        for (const s of snaps) for (const [id, v] of Object.entries((s?.data()?.r ?? {}) as Record<string, { hs: number; as: number; at?: { toMillis?: () => number } }>))
          m.set(+id, { hs: v.hs, as: v.as, at: v.at?.toMillis?.() ?? Date.now() });
        return m; }) };
  }
  return cache.p;
}

/** Copie des matchs avec les scores arrivés depuis la dernière mise à jour officielle (live: true) */
export async function withLive(games: Game[]): Promise<{ games: Game[]; latest: number | null }> {
  if (!games.some((g) => g.hs == null)) return { games, latest: null };
  const live = await liveResults();
  let latest: number | null = null;
  const out = games.map((g) => {
    const r = g.hs == null ? live.get(g.id) : undefined;
    if (!r) return g;
    latest = Math.max(latest ?? 0, r.at);
    return { ...g, hs: r.hs, as: r.as, live: true };
  });
  return { games: out, latest };
}

/** Classement provisoire : l'officiel (corrections comprises) + les nouveaux résultats, avec la règle validée de la série.
 *  Sans règle validée (serie.rule absent) : on garde l'officiel tel quel. */
export function provisional(official: Standing[], games: Game[], ruleName?: string): Standing[] | null {
  const r = ruleName ? rule(ruleName) : null;
  if (!r || !official.length || !games.some((g) => g.live)) return null;
  const teams = official.map((o) => o.team);
  const before = games.filter((g) => !g.live);
  const rows = standings(teams, games, r, offsetsFrom(official as never, teams, before, r));
  return rows.map((x) => ({ team: x.team, played: x.played, wins: x.wins, losses: x.losses, pf: x.pf, pa: x.pa, pts: x.pts, draws: x.draws || undefined, rank: x.rank }));
}

