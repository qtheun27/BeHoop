// Découpe les données basket (AWBB + Flandre) en fichiers légers pour l'appli :
// app-data/index.json, clubs/{id}.json, series/{id}.json. Lancé par update.yml après les récupérations.
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadAll } from './allData';
import { buildCompetitions } from './competitions';
import { ics } from './vbl';
import type { SlimGame } from './appData';
import { pickRule } from '../web/src/lib/engine';
import { family, pointsOf } from './standings-check';
import { isMini } from '../shared/mini';

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
// Classement officiel tel que publié par la fédération. Une fédération qui ne tient pas de classement
// (ex. U12 en Flandre : que des zéros alors que des matchs sont joués) → pas de tableau plutôt qu'un tableau faux.
const official = (sid: number, list: SlimGame[]) => {
  const rows = all.standings.get(sid) ?? [];
  return rows.length && rows.every((r) => !r.played) && list.some((g) => g.hs !== null) ? [] : rows;
};
// Moteur de classement (web/src/lib/engine.ts) : règle qui reproduit exactement le classement officiel de la série
// (serie.rule, ex. « be/reglement ») ; sans règle, l'appli n'affichera jamais de classement provisoire pour cette série.
// Mini-basket (U6–U13) : la fédération ne publie pas de classement, mais les clubs encodent des scores. L'appli calcule
// alors un classement BeHoop (non officiel) à partir de ces scores : serie.unofficial = règle utilisée (voir loadSerie).
const UNOFFICIAL = 'be/reglement';
const ruleStats: Record<string, [number, number]> = {};
for (const [sid, list] of bySerie) {
  const standings = official(sid, list);
  const fam = family(sid);
  let rule: string | null = null;
  if (standings.length && fam !== 'NBA' && fam !== 'WNBA' && list.some((g) => g.hs !== null)) {
    rule = pickRule(standings, list, pointsOf(fam));
    const st = (ruleStats[fam] ??= [0, 0]); st[1]++; if (rule) st[0]++;
  }
  const name = all.series.get(sid)?.name ?? list[0]?.sn ?? '';
  const unofficial = !standings.length && isMini(name) && list.every((g) => g.ty === 'championnat') && list.some((g) => g.hs !== null);
  writeFileSync(join(out, 'series', `${sid}.json`), JSON.stringify({ serie: { ...(all.series.get(sid) ?? { id: sid }), ...(rule ? { rule } : {}), ...(unofficial ? { unofficial: UNOFFICIAL } : {}) }, standings, games: list }));
}
console.log('Moteur de classement (séries reproduites exactement) :', Object.entries(ruleStats).map(([f, [ok, n]]) => `${f} ${ok}/${n}`).join(', '));
const comps = buildCompetitions(all);
writeFileSync(join(out, 'competitions.json'), JSON.stringify(comps));
// Page d'accueil behoop.be (web/src/screens/Welcome.tsx) : tout ce qu'elle affiche d'emblée dans un seul petit fichier
// (chiffres, compétitions mises en avant, derniers résultats du haut niveau belge), sans charger index/compétitions/séries.
{
  const clubOf = new Map<number, (typeof all.clubs)[number]>();
  all.clubs.forEach((c) => c.teams.forEach((t) => clubOf.set(t.id, c)));
  const be = all.clubs.filter((c) => c.id < 2e10);
  const POP = ['bnxt', 'tdm1', 'tdw', 'lions', 'cats'];
  const TICK = ['bnxt', 'tdm1', 'tdw', 'tdm2a', 'tdm2b', 'lions', 'cats'];
  const since = new Date(Date.now() - 12 * 864e5).toISOString().slice(0, 10);
  const side = (id: number, name: string) => { const c = clubOf.get(id); return { n: c?.short ?? name, l: c?.logo ?? null, c: c?.c1 ?? '#3d8fdb' }; };
  const ticker = [...new Map(comps.filter((c) => TICK.includes(c.id)).flatMap((c) => c.series).flatMap((sid) => bySerie.get(sid) ?? [])
    .filter((g) => g.hs !== null && g.as !== null && !(g.hs === 0 && g.as === 0) && g.d >= since && !isMini(g.sn)).map((g) => [g.id, g])).values()]
    .sort((a, b) => b.d.localeCompare(a.d)).slice(0, 14)
    .map((g) => ({ id: g.id, s: g.s, hs: g.hs, as: g.as, h: side(g.h, g.hn), a: side(g.a, g.an) }));
  const pick = ({ id, name, cat, women, youth, logo, dark }: (typeof comps)[number]) => ({ id, name, cat, women, youth, logo, dark });
  writeFileSync(join(out, 'landing.json'), JSON.stringify({
    generated_at: all.generated_at, clubs: be.length, teams: be.reduce((n, c) => n + c.teams.length, 0), competitions: comps.length,
    comps: POP.map((id) => comps.find((c) => c.id === id)).filter(Boolean).map((c) => pick(c!)), ticker,
  }));
}
// Calendrier de chaque compétition (tous ses matchs, depuis un mois) : calendars/comp-{id}.ics
mkdirSync('calendars', { recursive: true });
const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
for (const c of comps) {
  const list = [...new Map(c.series.flatMap((sid) => bySerie.get(sid) ?? []).filter((g) => g.ty !== 'amical' && g.d >= since).map((g) => [g.id, g])).values()]
    .sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t));
  writeFileSync(join('calendars', `comp-${c.id}.ics`), ics(c.name, list, `comp-${c.id}`));
}
console.log(`app-data : ${comps.length} compétitions, ${all.clubs.length} clubs, ${bySerie.size} séries, ${all.games.length} matchs`);
