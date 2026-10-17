import type { CumulativeScores } from './types';

/** Points marqués pendant chaque quart à partir des scores cumulés. */
export function quarterScores(cum: CumulativeScores): [number, number][] {
  return cum.map(([h, a], i) => {
    const [ph, pa] = i === 0 ? [0, 0] : cum[i - 1];
    return [h - ph, a - pa];
  });
}

export function validateScores(cum: CumulativeScores): string | null {
  for (let i = 0; i < cum.length; i++) {
    const [h, a] = cum[i];
    if (h < 0 || a < 0 || !Number.isInteger(h) || !Number.isInteger(a)) return 'Les scores doivent être des nombres positifs.';
    if (i > 0 && (h < cum[i - 1][0] || a < cum[i - 1][1])) return `Le score de fin de Q${i + 1} ne peut pas être inférieur à celui de Q${i}.`;
  }
  return null;
}

export function resultLabel(homeName: string, awayName: string, home: number, away: number): string {
  if (home === away) return 'Match nul';
  const w = home > away ? homeName : awayName;
  // « Victoire de l'Union… » / « Victoire du BC… » / « Victoire de … »
  const art = /^(union|équipe|entente|étoile|académie|alliance)\b/i.test(w) ? "de l'" : /^(BC|RBC|club|cercle|basket)\b/i.test(w) ? 'du ' : 'de ';
  return `Victoire ${art}${w}`;
}

export function ordinal(n: number): { num: string; sup: string } {
  return { num: String(n), sup: n === 1 ? 'er' : 'e' };
}
