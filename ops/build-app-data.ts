// Découpe data.json en fichiers légers pour l'appli : app-data/index.json, clubs/{id}.json, series/{id}.json.
// Lancé par update.yml juste après le scraper (le scraper lui-même n'est pas modifié).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { slimClub, slimGame, type SlimGame } from './appData';

const root = process.argv[2] ?? '.';
const out = join(root, 'app-data');
const data = JSON.parse(readFileSync(join(root, 'data.json'), 'utf8'));
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'clubs'), { recursive: true });
mkdirSync(join(out, 'series'), { recursive: true });

const clubs = data.clubs.map(slimClub);
const games: SlimGame[] = data.games.map(slimGame);
const teamClub = new Map<number, number>();
clubs.forEach((c: { id: number; teams: { id: number }[] }) => c.teams.forEach((t) => teamClub.set(t.id, c.id)));

const byClub = new Map<number, SlimGame[]>();
const bySerie = new Map<number, SlimGame[]>();
for (const g of games) {
  for (const tid of [g.h, g.a]) {
    const cid = teamClub.get(tid);
    if (cid === undefined) continue;
    const l = byClub.get(cid) ?? []; if (!l.includes(g)) l.push(g); byClub.set(cid, l);
  }
  const s = bySerie.get(g.s) ?? []; s.push(g); bySerie.set(g.s, s);
}
const series = new Map<number, { id: number; name: string; short: string }>(
  data.series.map((s: { id: number; name: string; short_name: string; division_name?: string }) => [s.id, { id: s.id, name: s.division_name ?? s.name, short: s.short_name }]));

writeFileSync(join(out, 'index.json'), JSON.stringify({ generated_at: data.generated_at, season: data.season?.name, clubs }));
for (const c of clubs) {
  const list = (byClub.get(c.id) ?? []).sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t));
  writeFileSync(join(out, 'clubs', `${c.id}.json`), JSON.stringify({ club: c, games: list }));
}
for (const [sid, list] of bySerie) {
  const standings = (data.classements?.[sid] ?? []).map((r: Record<string, number>) => ({
    team: r.team_id, played: r.played, wins: r.wins, losses: r.losses, pf: r.score_for, pa: r.score_against, pts: r.points,
  }));
  writeFileSync(join(out, 'series', `${sid}.json`), JSON.stringify({ serie: series.get(sid) ?? { id: sid }, standings, games: list }));
}
console.log(`app-data : ${clubs.length} clubs, ${bySerie.size} séries, ${games.length} matchs`);
