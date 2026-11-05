// Ordre des classements (sans dépendance au navigateur : utilisé aussi par les tests).
import type { Game, Standing } from './data';
import { standings, rule } from './engine';

/** Classement dans l'ordre officiel : le rang de la fédération (départages compris), jamais recalculé.
 *  Repli (anciennes données sans rang) : l'ordre de la source. */
export function ranked(rows: Standing[]): (Standing & { rank: number })[] {
  return rows.every((r) => r.rank) ? [...rows].sort((a, b) => a.rank! - b.rank!) as (Standing & { rank: number })[] : rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Classement BeHoop d'une série sans classement officiel (mini-basket) : tous les matchs de championnat joués, toutes les
 *  équipes du calendrier. Un 0–0 n'est pas un match joué (score non encodé). */
export function unofficial(games: Game[], ruleName: string): Standing[] | null {
  const r = rule(ruleName);
  if (!r) return null;
  const list = games.filter((g) => g.ty !== 'amical').map((g) => (g.hs === 0 && g.as === 0 ? { ...g, hs: null, as: null } : g));
  if (!list.some((g) => g.hs != null)) return null;
  const teams = [...new Set(list.flatMap((g) => [g.h, g.a]))].filter(Boolean);
  return standings(teams, list, r).map((x) => ({ team: x.team, played: x.played, wins: x.wins, losses: x.losses, pf: x.pf, pa: x.pa, pts: x.pts, draws: x.draws || undefined, rank: x.rank }));
}
