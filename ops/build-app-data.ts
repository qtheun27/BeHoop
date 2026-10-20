// Découpe les données basket (AWBB + Flandre) en fichiers légers pour l'appli :
// app-data/index.json, clubs/{id}.json, series/{id}.json. Lancé par update.yml après les récupérations.
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadAll } from './allData';
import { buildCompetitions } from './competitions';
import type { SlimGame } from './appData';

const root = process.argv[2] ?? '.';
const out = join(root, 'app-data');
const all = loadAll(root);
// Les actualités (ops/news.ts) sont conservées d'une génération à l'autre
const news = existsSync(join(out, 'news.json')) ? readFileSync(join(out, 'news.json')) : null;
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'clubs'), { recursive: true });
mkdirSync(join(out, 'series'), { recursive: true });
if (news) writeFileSync(join(out, 'news.json'), news);

const teamClub = new Map<number, number>();
all.clubs.forEach((c) => c.teams.forEach((t) => teamClub.set(t.id, c.id)));
const byClub = new Map<number, Set<SlimGame>>(); const bySerie = new Map<number, SlimGame[]>();
for (const g of all.games) {
  for (const tid of [g.h, g.a]) { const cid = teamClub.get(tid); if (cid !== undefined) { const s = byClub.get(cid) ?? new Set(); s.add(g); byClub.set(cid, s); } }
  const s = bySerie.get(g.s) ?? []; s.push(g); bySerie.set(g.s, s);
}
writeFileSync(join(out, 'index.json'), JSON.stringify({ generated_at: all.generated_at, season: all.season, clubs: all.clubs, alias: all.alias }));
for (const c of all.clubs) {
  const list = [...(byClub.get(c.id) ?? [])].sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t));
  writeFileSync(join(out, 'clubs', `${c.id}.json`), JSON.stringify({ club: c, games: list }));
}
for (const [sid, list] of bySerie)
  writeFileSync(join(out, 'series', `${sid}.json`), JSON.stringify({ serie: all.series.get(sid) ?? { id: sid }, standings: all.standings.get(sid) ?? [], games: list }));
const comps = buildCompetitions(all);
writeFileSync(join(out, 'competitions.json'), JSON.stringify(comps));
console.log(`app-data : ${comps.length} compétitions, ${all.clubs.length} clubs, ${bySerie.size} séries, ${all.games.length} matchs`);
