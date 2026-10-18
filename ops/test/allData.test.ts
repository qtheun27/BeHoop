import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAll } from '../allData';

function fixture(awbbName: string) {
  const root = mkdtempSync(join(tmpdir(), 'bh-'));
  writeFileSync(join(root, 'data.json'), JSON.stringify({ generated_at: 'x', season: { name: '2026-2027' }, series: [], classements: {},
    clubs: [{ id: 1312, name: awbbName, short_name: awbbName, province: 'Hainaut', logo_url: 'https://x/uploads/club1312/1036-mons.jpg', teams: [{ id: 1, name: `R1H ${awbbName} B`, category: 'R1H B' }] },
      { id: 2, name: 'BC AMLL', short_name: 'BC AMLL', province: 'Hainaut', logo_url: 'https://x/uploads/club2/1592-amll.png', teams: [] }],
    games: [{ id: 9, date: '2026-10-10', time: '13:00:00', serie_id: 5, home_team_id: 1, away_team_id: 7, home_team_short_name: `${awbbName} B`, away_team_short_name: 'X', home_score: 1, away_score: 2 }] }));
  writeFileSync(join(root, 'vbl.json'), JSON.stringify({ clubs: [], games: [], series: {}, standings: {}, national: [
    { id: 20, stamNr: '1592', name: 'BC AMLL', city: '', logo: '', c1: '#000000', c2: '#000000', teams: [{ id: 21, name: 'AMLL HSE A', cat: 'Seniors · National', ag: 'seniors' }] },
    { id: 30, stamNr: '9999', name: 'Union Mons Hainaut', city: 'Mons', logo: '', c1: '#000000', c2: '#000000', teams: [{ id: 31, name: 'CityX Mons HSE A', cat: 'Seniors · National', ag: 'seniors' }] }] }));
  writeFileSync(join(root, 'corrections.json'), JSON.stringify({ clubs: {
    1312: { name: 'Mons Basketball', short: 'Mons Basketball', ancienNom: ['Union Mons-Hainaut'], lie: 30 }, 30: { name: 'CityX Mons', short: 'CityX Mons', ancienNom: ['Union Mons Hainaut'], lie: 1312 } } }));
  return loadAll(root);
}

describe('données fusionnées et corrections', () => {
  it('renomme tant que la fédération affiche l’ancien nom, y compris équipes et matchs', () => {
    const d = fixture('Union Mons-Hainaut');
    const c = d.clubs.find((x) => x.id === 1312)!;
    expect(c.name).toBe('Mons Basketball');
    expect(c.teams[0].name).toBe('R1H Mons Basketball B');
    expect(d.games[0].hn).toBe('Mons Basketball B');
  });
  it('correction sans effet quand la fédération a déjà changé le nom (pas de « undefined »)', () => {
    const d = fixture('Nouveau Nom');
    const c = d.clubs.find((x) => x.id === 1312)!;
    expect(c.name).toBe('Nouveau Nom');
    expect(JSON.stringify(d.clubs)).not.toContain('undefined');
    expect((c as any).linked).toBe(30);
  });
  it('équipe nationale rattachée seulement si le matricule correspond, sinon club national à part', () => {
    const d = fixture('Mons Basketball');
    expect(d.clubs.find((x) => x.id === 2)!.teams.map((t) => t.id)).toContain(21);
    const cx = d.clubs.find((x) => x.id === 30)!;
    expect(cx.name).toBe('CityX Mons');
    expect(cx.province).toBe('National');
  });
});
