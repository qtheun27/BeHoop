// Moteur de classement BeHoop : recalcule un classement à partir des matchs joués, selon les règles de chaque compétition.
// Sert à afficher un classement provisoire dès qu'un résultat arrive (avant la mise à jour officielle) ; il est comparé
// à chaque mise à jour avec le classement officiel (ops/standings-check.ts), qui reste toujours la référence affichée.
// Sans dépendance au navigateur : utilisé par l'appli, les scripts ops/ et les tests.

export interface EGame { h: number; a: number; hs: number | null; as: number | null }
export interface ERow { team: number; played: number; wins: number; losses: number; draws: number; pf: number; pa: number; pts: number; rank: number }

/** Règles d'une compétition.
 *  win/loss/draw : points par résultat.
 *  ties : départages dans l'ordre, appliqués au groupe d'équipes à égalité (h2h = matchs entre elles seulement). */
export interface Rules {
  win: number; loss: number; draw: number;
  /** Critère principal : points, ou % de victoires (ligues sans points) */
  primary: 'pts' | 'pct';
  ties: Tie[];
}
/** gate : les équipes à égalité doivent s'être toutes rencontrées (au moins une fois) ; sinon elles restent ex aequo */
export type Tie = 'gate' | 'h2hPts' | 'h2hWins' | 'h2hDiff' | 'h2hQuot' | 'h2hFor' | 'diff' | 'quot' | 'for' | 'wins';
/** Quotient (« goal average » AWBB / VBL) : points marqués ÷ points encaissés */
const quot = (pf: number, pa: number) => (pa ? pf / pa : pf ? Infinity : 0);

/** FIBA (règlement intérieur, livre 2, « classification des équipes ») : 2 pts victoire, 1 défaite ;
 *  égalité → matchs entre les équipes concernées (points, différence, points marqués), puis tous les matchs (différence, points marqués). */
export const FIBA: Rules = { win: 2, loss: 1, draw: 0, primary: 'pts', ties: ['h2hPts', 'h2hDiff', 'h2hFor', 'diff', 'for'] };

const blank = (team: number): ERow => ({ team, played: 0, wins: 0, losses: 0, draws: 0, pf: 0, pa: 0, pts: 0, rank: 0 });
const played = (g: EGame) => g.hs != null && g.as != null;

/** Bilans de chaque équipe sur une liste de matchs */
export function tally(teams: number[], games: EGame[], r: Rules): Map<number, ERow> {
  const m = new Map(teams.map((t) => [t, blank(t)]));
  for (const g of games) {
    if (!played(g)) continue;
    for (const [me, f, a] of [[g.h, g.hs!, g.as!], [g.a, g.as!, g.hs!]] as const) {
      const x = m.get(me); if (!x) continue;
      x.played++; x.pf += f; x.pa += a;
      if (f > a) { x.wins++; x.pts += r.win; } else if (f < a) { x.losses++; x.pts += r.loss; } else { x.draws++; x.pts += r.draw; }
    }
  }
  return m;
}

const pct = (x: ERow) => (x.played ? (x.wins + x.draws / 2) / x.played : 0.5);

/** Corrections officielles par équipe (officiel − calculé) : points retirés, forfaits, résultats annulés ou reportés
 *  d'un tour précédent. Calculées à chaque mise à jour officielle et réappliquées aux nouveaux résultats. */
export type Offsets = Map<number, Partial<Pick<ERow, 'played' | 'wins' | 'losses' | 'draws' | 'pf' | 'pa' | 'pts'>>>;
const FIELDS = ['played', 'wins', 'losses', 'draws', 'pf', 'pa', 'pts'] as const;
/** Écarts entre le classement officiel et celui calculé depuis les mêmes matchs */
export function offsetsFrom(official: Partial<ERow>[], teams: number[], games: EGame[], r: Rules): Offsets {
  const mine = tally(teams, games, r), out: Offsets = new Map();
  for (const o of official) {
    const m = mine.get(o.team!); if (!m) continue;
    const d: Record<string, number> = {};
    for (const f of FIELDS) if (o[f] != null && o[f] !== m[f]) d[f] = o[f]! - m[f];
    if (Object.keys(d).length) out.set(o.team!, d);
  }
  return out;
}

/** Classement complet : critère principal, puis départages successifs, appliqués récursivement aux groupes à égalité.
 *  Équipes encore à égalité après tous les critères : même rang. offsets : corrections officielles à conserver. */
export function standings(teams: number[], games: EGame[], r: Rules, offsets?: Offsets): ERow[] {
  const all = tally(teams, games, r);
  if (offsets) for (const [t, d] of offsets) { const x = all.get(t); if (x) for (const f of FIELDS) if (d[f]) x[f] += d[f]!; }
  const main = (x: ERow) => (r.primary === 'pts' ? x.pts : pct(x));
  const rows = [...all.values()];
  const order = split(rows, main);
  const out: ERow[][] = [];
  for (const grp of order) out.push(...breakTie(grp, games, r, 0));
  let rank = 1;
  for (const grp of out) { for (const x of grp) x.rank = rank; rank += grp.length; }
  return out.flat();
}

/** Groupes successifs d'équipes de même valeur (valeur décroissante) */
function split<T>(rows: T[], key: (x: T) => number): T[][] {
  const sorted = [...rows].sort((a, b) => key(b) - key(a));
  const out: T[][] = [];
  for (const x of sorted) { const last = out[out.length - 1]; if (last && key(last[0]) === key(x)) last.push(x); else out.push([x]); }
  return out;
}

function breakTie(grp: ERow[], games: EGame[], r: Rules, from: number): ERow[][] {
  if (grp.length < 2 || from >= r.ties.length) return [grp];
  const ids = new Set(grp.map((x) => x.team));
  const tie = r.ties[from];
  if (tie === 'gate') {
    const met = new Set(games.filter((g) => played(g) && ids.has(g.h) && ids.has(g.a)).map((g) => [g.h, g.a].sort().join('-')));
    const all = [...ids].every((x, i, arr) => arr.slice(i + 1).every((y) => met.has([x, y].sort().join('-'))));
    return all ? breakTie(grp, games, r, from + 1) : [grp];
  }
  let key: (x: ERow) => number;
  if (tie.startsWith('h2h')) {
    const mini = tally([...ids], games.filter((g) => ids.has(g.h) && ids.has(g.a)), r);
    const v = (x: ERow) => mini.get(x.team)!;
    key = tie === 'h2hPts' ? (x) => v(x).pts : tie === 'h2hWins' ? (x) => v(x).wins : tie === 'h2hDiff' ? (x) => v(x).pf - v(x).pa : tie === 'h2hQuot' ? (x) => quot(v(x).pf, v(x).pa) : (x) => v(x).pf;
  } else key = tie === 'diff' ? (x) => x.pf - x.pa : tie === 'quot' ? (x) => quot(x.pf, x.pa) : tie === 'for' ? (x) => x.pf : (x) => x.wins;
  const parts = split(grp, key);
  // Un critère qui ne départage personne : on passe au suivant pour le même groupe.
  // Sinon chaque sous-groupe encore à égalité repart du premier critère (règle FIBA : on recommence avec les équipes restantes).
  if (parts.length === 1) return breakTie(grp, games, r, from + 1);
  return parts.flatMap((p) => (p.length > 1 ? breakTie(p, games, r, 0) : [p]));
}

/** Systèmes de points (fixés par la compétition) et départages possibles (ils varient : selon la ligue, la province et la
 *  catégorie — AWBB : ex aequo chez les jeunes de Namur, départage FIBA en seniors à Liège…). Chaque série reçoit le
 *  départage qui reproduit son classement officiel (pickRule) ; nom de règle « système/départage », ex. « be/fiba ». */
export const POINTS = {
  be: { win: 3, loss: 1, draw: 2, primary: 'pts' },   // AWBB, Basketbal Vlaanderen
  fiba: { win: 2, loss: 1, draw: 0, primary: 'pts' }, // compétitions FIBA (BCL, FEC, coupes féminines, sélections)
  pct: { win: 1, loss: 0, draw: 0, primary: 'pct' },  // ligues au % de victoires (EuroLeague, EuroCup, BNXT)
} as const;
export const TIES: Record<string, Tie[]> = {
  // Règlements officiels : AWBB (PC 67) et Basketbal Vlaanderen (art. 268) — matchs directs, quotient des matchs directs,
  // puis quotient de la série ; EuroLeague (bylaws art. 19) ; FIBA (annexe D).
  reglement: ['h2hPts', 'h2hQuot', 'quot'],
  euroleague: ['h2hWins', 'h2hDiff', 'diff', 'for'],
  exaequo: [],
  fiba: ['h2hPts', 'h2hDiff', 'h2hFor', 'diff', 'for'],
  diff: ['diff', 'for', 'wins'], // (trois éléments : une paire serait prise pour un libellé à traduire par ops/i18n-keys.ts)
  gate: ['gate', 'h2hPts', 'h2hDiff', 'h2hFor', 'diff', 'for'],
  h2hwins: ['h2hWins', 'h2hDiff', 'diff', 'for'],
};
export type PointsSystem = keyof typeof POINTS;
export const rule = (name: string): Rules | null => {
  const [p, t] = name.split('/');
  return POINTS[p as PointsSystem] && TIES[t] ? { ...POINTS[p as PointsSystem], ties: TIES[t] } : null;
};

/** Le départage qui reproduit exactement le classement officiel d'une série, corrections officielles comprises ;
 *  null si aucun ne colle (on n'affichera alors jamais de classement provisoire pour cette série). */
export function pickRule(official: (Partial<ERow> & { team: number; rank?: number })[], games: EGame[], points: PointsSystem): string | null {
  if (!official.length || !official.every((o) => o.rank)) return null;
  const teams = official.map((o) => o.team);
  // D'abord le départage du règlement de la compétition, puis les autres (classements publiés autrement en cours de saison)
  const first: Record<PointsSystem, string> = { be: 'reglement', fiba: 'fiba', pct: 'euroleague' };
  for (const t of [first[points], ...Object.keys(TIES).filter((k) => k !== first[points])]) {
    const r = rule(`${points}/${t}`)!;
    const mine = standings(teams, games, r, offsetsFrom(official, teams, games, r));
    if (official.every((o) => mine.find((m) => m.team === o.team)?.rank === o.rank)) return `${points}/${t}`;
  }
  return null;
}
