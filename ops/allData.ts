// Données basket fusionnées : AWBB (data.json, Wallonie-Bruxelles) + Basketbal Vlaanderen (vbl.json, Flandre).
// Même format allégé pour tout le monde : l'appli, les cartes de score et les notifications ne font pas la différence.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { slimClub, slimGame, type SlimClub, type SlimGame } from './appData';

export interface Standing { team: number; played: number; wins: number; losses: number; pf: number; pa: number; pts: number }
export interface AllData { generated_at: string; season: string; clubs: SlimClub[]; games: SlimGame[]; series: Map<number, { id: number; name: string; short: string }>; standings: Map<number, Standing[]> }

export function loadAll(root = '.'): AllData {
  const d = JSON.parse(readFileSync(join(root, 'data.json'), 'utf8'));
  const clubs: SlimClub[] = d.clubs.map(slimClub);
  const games: SlimGame[] = d.games.map(slimGame);
  const series = new Map<number, { id: number; name: string; short: string }>(d.series.map((s: any) => [s.id, { id: s.id, name: s.division_name ?? s.name, short: s.short_name }]));
  const standings = new Map<number, Standing[]>();
  for (const [sid, rows] of Object.entries<any[]>(d.classements ?? {}))
    standings.set(+sid, rows.map((r) => ({ team: r.team_id, played: r.played, wins: r.wins, losses: r.losses, pf: r.score_for, pa: r.score_against, pts: r.points })));
  const vf = join(root, 'vbl.json');
  if (existsSync(vf)) {
    const v = JSON.parse(readFileSync(vf, 'utf8'));
    clubs.push(...v.clubs); games.push(...v.games);
    // Équipes nationales des clubs wallons : rattachées au club AWBB seulement si le matricule correspond exactement
    // (matricule lu dans le nom du fichier logo AWBB) ; sinon club national à part entière (ex. CityX Mons).
    const byStam = new Map<string, SlimClub>();
    for (const c of clubs) { const m = /\/(\d{3,5})-[^/]+$/.exec(c.logo ?? ''); if (m && c.id < 1e10) byStam.set(String(+m[1]), c); }
    for (const n of v.national ?? []) {
      const c = byStam.get(String(+n.stamNr));
      if (c) c.teams.push(...n.teams.filter((t: { id: number }) => !c.teams.some((x) => x.id === t.id)));
      else clubs.push({ id: n.id, name: n.name, short: n.name, province: 'National', logo: n.logo, c1: n.c1, c2: n.c2, city: n.city, venue: null, teams: n.teams });
    }
    for (const [k, s] of Object.entries<any>(v.series)) series.set(+k, s);
    for (const [k, s] of Object.entries<any>(v.standings)) standings.set(+k, s);
  }
  // Corrections BeHoop (nouveau nom d'un club, etc.) : corrections.json
  const cf = join(root, 'corrections.json');
  if (existsSync(cf)) {
    const corr = JSON.parse(readFileSync(cf, 'utf8')).clubs ?? {};
    for (const c of clubs) {
      const k = corr[c.id]; if (!k) continue;
      const old: string[] = k.ancienNom ?? [c.name, c.short];
      // Correction temporaire : appliquée seulement tant que la fédération affiche encore l'ancien nom
      if (k.lie) (c as SlimClub & { linked?: number }).linked = k.lie;
      if (!k.name && !k.short) continue; // correction sans changement de nom (lien seul)
      if (!old.includes(c.name) && !old.includes(c.short)) continue;
      const fix = (n: string) => old.reduce((acc, o) => acc.replace(o, k.short ?? k.name), n);
      const mine = new Set(c.teams.map((t) => t.id));
      c.name = k.name ?? c.name; c.short = k.short ?? c.short;
      c.teams.forEach((t) => { t.name = fix(t.name); });
      for (const g of games) { if (mine.has(g.h)) g.hn = fix(g.hn); if (mine.has(g.a)) g.an = fix(g.an); }
    }
  }
  // Logos : copie locale servie par behoop.be (voir ops/logos.py), sinon l'adresse d'origine
  for (const c of clubs) {
    if (existsSync(join(root, 'logos', `${c.id}.webp`))) c.logo = `/logos/${c.id}.webp`;
    else if (c.logo?.includes('vbldataOrgLogo')) c.logo = null; // club flamand sans logo publié : initiales
  }
  return { generated_at: d.generated_at, season: d.season?.name, clubs, games, series, standings };
}
