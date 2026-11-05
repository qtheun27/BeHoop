// Classements : on affiche toujours l'ordre officiel de la fédération (départages compris), jamais un tri maison.
import { describe, it, expect } from 'vitest';
import { ranked, unofficial } from '../../web/src/lib/standings';

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

describe('unofficial (mini-basket : classement BeHoop)', () => {
  const g = (id: number, h: number, a: number, hs: number | null, as: number | null, ty = 'championnat') => ({ id, d: '2026-10-01', t: '10:00', s: 1, sn: 'U12', h, a, hn: `E${h}`, an: `E${a}`, hs, as, v: '', adr: '', ty }) as never;
  it('compte victoires, nuls et défaites ; 0–0 et amicaux ignorés ; toutes les équipes du calendrier', () => {
    const rows = unofficial([g(1, 1, 2, 40, 20), g(2, 3, 1, 16, 16), g(3, 2, 3, 0, 0), g(4, 4, 1, 50, 10, 'amical'), g(5, 2, 5, null, null)], 'be/reglement')!;
    const by = new Map(rows.map((r) => [r.team, r]));
    expect(by.get(1)).toMatchObject({ played: 2, wins: 1, draws: 1, pts: 5, rank: 1 });
    expect(by.get(2)).toMatchObject({ played: 1, wins: 0, pts: 1 });
    expect(by.get(5)).toMatchObject({ played: 0 });
    expect(by.has(4)).toBe(false);
  });
  it('aucun score encodé : pas de classement', () => {
    expect(unofficial([g(1, 1, 2, null, null), g(2, 1, 2, 0, 0)], 'be/reglement')).toBeNull();
  });
});
