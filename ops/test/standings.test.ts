// Classements : on affiche toujours l'ordre officiel de la fédération (départages compris), jamais un tri maison.
import { describe, it, expect } from 'vitest';
import { ranked } from '../../web/src/lib/standings';

const row = (team: number, pts: number, pf: number, pa: number, rank?: number) => ({ team, played: 5, wins: 4, losses: 1, pf, pa, pts, rank });

describe('ranked', () => {
  it('garde le rang officiel même quand la différence de points dirait autre chose', () => {
    // P1H Bruxelles-Brabant (AWBB) : trois équipes à 13 pts, départagées à la confrontation directe
    const rows = [row(3, 13, 405, 285, 3), row(1, 13, 358, 322, 1), row(2, 13, 342, 317, 2)];
    expect(ranked(rows).map((r) => [r.team, r.rank])).toEqual([[1, 1], [2, 2], [3, 3]]);
  });
  it('sans rang (anciennes données) : ordre de la source', () => {
    expect(ranked([row(7, 2, 0, 0), row(5, 9, 0, 0)]).map((r) => [r.team, r.rank])).toEqual([[7, 1], [5, 2]]);
  });
});
