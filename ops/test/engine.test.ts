// Moteur de classement : règles officielles (AWBB/VBL, FIBA) et corrections officielles conservées.
import { describe, it, expect } from 'vitest';
import { standings, offsetsFrom, pickRule, rule, FIBA, type EGame } from '../../web/src/lib/engine';

const g = (h: number, a: number, hs: number, as: number): EGame => ({ h, a, hs, as });
const rank = (rows: { team: number; rank: number }[]) => Object.fromEntries(rows.map((r) => [r.team, r.rank]));

describe('moteur de classement', () => {
  it('AWBB / VBL : 3 pts victoire, 1 défaite ; égalité → matchs directs', () => {
    // 1 et 2 : 2 victoires chacun ; 2 a battu 1 → 2 devant
    const games = [g(1, 3, 80, 60), g(2, 3, 70, 60), g(2, 1, 75, 70), g(1, 4, 90, 50), g(3, 4, 60, 59), g(4, 2, 80, 70)];
    const rows = standings([1, 2, 3, 4], games, rule('be/reglement')!);
    expect(rows.find((r) => r.team === 1)!.pts).toBe(3 * 2 + 1);
    expect(rank(rows)[2]).toBeLessThan(rank(rows)[1]);
  });
  it('AWBB / VBL : quotient (marqués ÷ encaissés) et pas la différence', () => {
    // Trois équipes à égalité, une victoire chacune entre elles : départage au quotient des matchs directs
    const games = [g(1, 2, 100, 90), g(2, 3, 60, 50), g(3, 1, 45, 40)];
    // différences : 1 → +5, 2 → 0, 3 → −5 ; quotients : 1 = 140/135, 2 = 150/150, 3 = 95/100
    const q = rank(standings([1, 2, 3], games, rule('be/reglement')!));
    expect([q[1], q[2], q[3]]).toEqual([1, 2, 3]);
    const d = rank(standings([1, 2, 3], [g(1, 2, 100, 99), g(2, 3, 30, 10), g(3, 1, 52, 50)], rule('be/reglement')!));
    // différences : 1 → −1, 2 → +19, 3 → −18 ; quotients : 1 = 150/151 (0,993), 2 = 129/110 (1,17), 3 = 62/80 (0,775)
    expect([d[2], d[1], d[3]]).toEqual([1, 2, 3]);
  });
  it('FIBA : 2 pts / 1 pt, égalité à trois → matchs entre elles puis différence', () => {
    const games = [g(1, 2, 80, 70), g(2, 3, 80, 70), g(3, 1, 90, 70)];
    const r = rank(standings([1, 2, 3], games, FIBA)); // h2h : chacun 1-1 ; différences : 1 −10, 2 0, 3 +10
    expect([r[3], r[2], r[1]]).toEqual([1, 2, 3]);
  });
  it('corrections officielles (points retirés, résultats annulés) conservées, puis nouveaux résultats ajoutés', () => {
    const games = [g(1, 2, 80, 70)];
    const official = [{ team: 1, played: 1, wins: 1, losses: 0, pf: 80, pa: 70, pts: 0, rank: 2 }, { team: 2, played: 1, wins: 0, losses: 1, pf: 70, pa: 80, pts: 1, rank: 1 }];
    const r = rule('be/reglement')!;
    const off = offsetsFrom(official, [1, 2], games, r); // l'équipe 1 a 3 points retirés
    const after = standings([1, 2], [...games, g(1, 2, 60, 50)], r, off);
    expect(after.find((x) => x.team === 1)!.pts).toBe(3); // 0 + 3 (nouvelle victoire)
    expect(after.find((x) => x.team === 2)!.pts).toBe(2);
  });
  it('choix de la règle : celle qui reproduit le classement officiel, sinon aucune', () => {
    const games = [g(1, 2, 80, 70), g(3, 4, 80, 70)];
    const exaequo = [{ team: 1, played: 1, wins: 1, losses: 0, pf: 80, pa: 70, pts: 3, rank: 1 }, { team: 3, played: 1, wins: 1, losses: 0, pf: 80, pa: 70, pts: 3, rank: 1 },
      { team: 2, played: 1, wins: 0, losses: 1, pf: 70, pa: 80, pts: 1, rank: 3 }, { team: 4, played: 1, wins: 0, losses: 1, pf: 70, pa: 80, pts: 1, rank: 3 }];
    expect(pickRule(exaequo, games, 'be')).toBe('be/reglement'); // jamais rencontrées, même quotient : ex aequo aussi selon le règlement
    const impossible = exaequo.map((o) => ({ ...o, rank: o.team === 2 ? 1 : 4 }));
    expect(pickRule(impossible, games, 'be')).toBeNull();
  });
});
