// Compétitions qu'on peut suivre (app-data/competitions.json) : une par série, sauf regroupements
// (NBA = 2 conférences, Coupe de Belgique = tous ses tours et poules). Chaque compétition liste ses séries
// et les clubs qui y jouent (pour ses actus), une catégorie pour l'onglet Rechercher et des mots-clés pour les actus.
import type { AllData } from './allData';

export type CompCat = 'national' | 'wallonie' | 'flandre' | 'europe' | 'monde' | 'nba';
export interface Competition {
  id: string; name: string; sub: string; cat: CompCat; women: boolean; youth: boolean;
  series: number[]; clubs: number[]; teams: number; games: number;
  /** Mots-clés cherchés dans les actus (compétitions pro et nationales seulement) */
  kw?: string[];
  /** Mots qui excluent l'actu (ex. « wnba » pour la NBA) */
  not?: string[];
  /** Ordre d'affichage (plus petit = plus haut) */
  rank: number;
  /** Logo officiel (logos/comps/) ; dark : logo blanc, à poser sur fond sombre */
  logo?: string; dark?: boolean;
}

/** Logos officiels (sites des ligues et de la FIBA, Wikipédia) rangés dans logos/comps/.
 *  Séries régionales : logo de la fédération qui les organise (AWBB, Basketbal Vlaanderen). */
export const COMP_LOGOS: Record<string, { logo: string; dark?: boolean }> = {
  bnxt: { logo: '/logos/comps/bnxt.webp' }, nba: { logo: '/logos/comps/nba.webp' }, wnba: { logo: '/logos/comps/wnba.webp' },
  lions: { logo: '/logos/comps/lions.webp' }, cats: { logo: '/logos/comps/cats.webp' },
  euroleague: { logo: '/logos/comps/euroleague.webp' }, eurocup: { logo: '/logos/comps/eurocup.webp' },
  bcl: { logo: '/logos/comps/bcl.webp', dark: true }, fec: { logo: '/logos/comps/fec.webp' },
  elw: { logo: '/logos/comps/elw.webp' }, ecw: { logo: '/logos/comps/ecw.webp' },
  eurobasket: { logo: '/logos/comps/eurobasket.webp', dark: true }, 'eurobasket-w': { logo: '/logos/comps/eurobasket-w.webp', dark: true },
  wc: { logo: '/logos/comps/wc.webp', dark: true }, wcq: { logo: '/logos/comps/wc.webp', dark: true }, ebwq: { logo: '/logos/comps/eurobasket-w.webp', dark: true }, wwc: { logo: '/logos/comps/wwc.webp', dark: true },
  wallonie: { logo: '/logos/comps/awbb.webp' }, flandre: { logo: '/logos/comps/vbl.webp' },
};

const WOMEN = /\b(dames?|women|meisjes|filles|vrouwen|wnba|cats|ladies|w)\b|\b[PR]\d\s?D\b|U\d{2}\s?D\b|\bTDW|\bD\s*[A-Z]?$/i;
const YOUTH = /\bU\s?\d{1,2}\b|minibasket|jeunes|jeugd/i;
// Tours de coupe et poules : regroupés sous le nom de la coupe
const CUP_ROUND = /\s+(poule\s+\w+|\d+\/\d+\s*e?\s*(finale|final)|1\/\d+.*|kwartfinale|halve finale|demi-finales?|quarts? de finale|finale|final four|tour \d+|ronde \d+)\s*$/i;

/** Compétitions connues : nom, catégorie, sous-titre, mots-clés pour les actus (not : mots qui excluent), ordre */
const KNOWN: { test: RegExp; id: string; name: string; cat: CompCat; sub: string; kw: string[]; not?: string[]; rank: number; women?: boolean }[] = [
  { test: /^BNXT League/i, id: 'bnxt', name: 'BNXT League', cat: 'national', sub: 'Belgique · Pays-Bas', kw: ['bnxt'], rank: 1 },
  { test: /^NBA ·/, id: 'nba', name: 'NBA', cat: 'nba', sub: 'États-Unis', kw: ['nba'], not: ['wnba'], rank: 2 },
  { test: /^EuroLeague ·/, id: 'euroleague', name: 'EuroLeague', cat: 'europe', sub: 'Europe · Messieurs', kw: ['euroleague', 'euroligue'], not: ['euroleague women', 'euroligue feminine'], rank: 3 },
  { test: /^Coupe du monde 2027 · Qualifications/, id: 'wcq', name: 'Coupe du monde 2027 · Qualifications', cat: 'monde', sub: 'FIBA · Europe', kw: ['qualifications pour la coupe du monde', 'wk-kwalificatie'], rank: 4 },
  { test: /^EuroBasket féminin 2027 · Qualifications/, id: 'ebwq', name: 'EuroBasket féminin 2027 · Qualifications', cat: 'europe', sub: 'FIBA Europe · Dames', kw: [], rank: 6, women: true },
  { test: /^EuroBasket féminin 2027 ·/, id: 'eurobasket-w', name: 'EuroBasket féminin 2027', cat: 'europe', sub: 'Belgique · Finlande · Suède · Lituanie', kw: ['eurobasket feminin', 'eurobasket women', 'eurobasket vrouwen'], rank: 5, women: true },
  { test: /^Coupe du monde féminine 2026/, id: 'wwc', name: 'Coupe du monde féminine 2026', cat: 'monde', sub: 'FIBA · Allemagne', kw: ["women's world cup", 'coupe du monde feminine'], rank: 7, women: true },
  { test: /^EuroCup ·/, id: 'eurocup', name: 'EuroCup', cat: 'europe', sub: 'Europe · Messieurs', kw: ['eurocup', 'eurocoupe'], not: ['eurocup women'], rank: 8 },
  { test: /^Basketball Champions League/, id: 'bcl', name: 'Basketball Champions League', cat: 'europe', sub: 'FIBA Europe · Messieurs', kw: ['basketball champions league', 'bcl'], rank: 9 },
  { test: /^FIBA Europe Cup/, id: 'fec', name: 'FIBA Europe Cup', cat: 'europe', sub: 'FIBA Europe · Messieurs', kw: ['fiba europe cup', 'europe cup'], rank: 10 },
  { test: /^EuroLeague Women/, id: 'elw', name: 'EuroLeague Women', cat: 'europe', sub: 'FIBA Europe · Dames', kw: ['euroleague women', 'euroligue feminine'], rank: 11, women: true },
  { test: /^EuroCup Women/, id: 'ecw', name: 'EuroCup Women', cat: 'europe', sub: 'FIBA Europe · Dames', kw: ['eurocup women'], rank: 12, women: true },
  { test: /^WNBA ·/, id: 'wnba', name: 'WNBA', cat: 'nba', sub: 'États-Unis · Dames', kw: ['wnba'], rank: 13, women: true },
  { test: /^Top Division Men 1/i, id: 'tdm1', name: 'Top Division Men 1', cat: 'national', sub: 'Belgique', kw: ['top division men 1', 'tdm1'], rank: 20 },
  { test: /^Top Division Men 2 A/i, id: 'tdm2a', name: 'Top Division Men 2 A', cat: 'national', sub: 'Belgique', kw: ['tdm2 a'], rank: 21 },
  { test: /^Top Division Men 2 B/i, id: 'tdm2b', name: 'Top Division Men 2 B', cat: 'national', sub: 'Belgique', kw: ['tdm2 b'], rank: 22 },
  { test: /^Top Division Women/i, id: 'tdw', name: 'Top Division Women', cat: 'national', sub: 'Belgique', kw: ['top division women', 'top division dames', 'tdw1'], rank: 23, women: true },
  { test: /^Beker van België Heren/i, id: 'beker-heren', name: 'Coupe de Belgique · Messieurs', cat: 'national', sub: 'Belgique', kw: ['coupe de belgique', 'beker van belgie', 'beker van belgië'], rank: 25 },
  { test: /^Beker van België Dames/i, id: 'beker-dames', name: 'Coupe de Belgique · Dames', cat: 'national', sub: 'Belgique', kw: [], rank: 26, women: true },
];
/** Équipes nationales : une « compétition » qui réunit toutes les épreuves où elles jouent (voir ops/pro.ts) */
const NATIONAL = [
  { team: 23e9 + 106761, id: 'lions', name: 'Belgian Lions', sub: 'Équipe nationale · Messieurs', kw: ['belgian lions'], rank: 3.5, women: false },
  { team: 23e9 + 1e6, id: 'cats', name: 'Belgian Cats', sub: 'Équipe nationale · Dames', kw: ['belgian cats'], rank: 3.6, women: true },
];

export function buildCompetitions(all: AllData): Competition[] {
  const clubOf = new Map<number, { id: number; province: string }>();
  all.clubs.forEach((c) => c.teams.forEach((t) => clubOf.set(t.id, { id: c.id, province: c.province })));
  const bySerie = new Map<number, { teams: Set<number>; games: number; amical: number }>();
  for (const g of all.games) {
    const x = bySerie.get(g.s) ?? { teams: new Set<number>(), games: 0, amical: 0 };
    x.teams.add(g.h); x.teams.add(g.a); x.games++; if (g.ty === 'amical') x.amical++;
    bySerie.set(g.s, x);
  }
  for (const [sid, rows] of all.standings) { const x = bySerie.get(sid); if (x) rows.forEach((r) => x.teams.add(r.team)); }
  const comps = new Map<string, Competition & { _teams: Set<number> }>();
  for (const [sid, info] of bySerie) {
    const s = all.series.get(sid); if (!s?.name) continue;
    if (info.amical === info.games || /amica|tournoi|vriendschap/i.test(`${s.name} ${s.comp ?? ''}`)) continue; // matchs amicaux : pas une compétition
    const known = KNOWN.find((k) => k.test.test(s.name));
    const isVbl = sid >= 1e10 && sid < 20e9, isPro = sid >= 20e9;
    // Province : celle de l'AWBB, sinon la plus fréquente parmi les clubs de la série
    const provs = new Map<string, number>();
    info.teams.forEach((t) => { const p = clubOf.get(t)?.province; if (p) provs.set(p, (provs.get(p) ?? 0) + 1); });
    const prov = s.org ?? [...provs].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    let id = known?.id ?? `s${sid}`, name = known?.name ?? s.name.trim(), sub: string;
    const slug = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (!known && isVbl && /^beker/i.test(name)) { name = name.replace(CUP_ROUND, '').trim(); id = `cup-${slug(name)}`; }
    // Coupes AWBB : toutes les poules et tous les tours d'une même coupe ensemble
    const awbbCup = !known && !isVbl && !isPro && /coupe/i.test(`${s.comp ?? ''} ${name}`);
    if (awbbCup) id = `cup-${slug(`${name} ${s.org ?? ''}`)}`;
    if (known) sub = known.sub;
    else if (isVbl) sub = /vlaanderen|antwerpen|limburg|brabant|landelijk/i.test(name) ? 'Basketbal Vlaanderen' : [prov, 'Basketbal Vlaanderen'].filter(Boolean).join(' · ');
    else sub = awbbCup ? prov : [prov, s.short].filter(Boolean).join(' · ');
    const text = `${s.name} ${s.short} ${s.comp ?? ''}`;
    const cat: CompCat = known?.cat ?? (isPro ? 'monde' : isVbl ? (/landelijk|top division|beker van belgi/i.test(name) ? 'national' : 'flandre')
      : /régional|national|awbb/i.test(s.comp ?? '') ? 'wallonie' : 'wallonie');
    const c = comps.get(id) ?? { id, name, sub, cat, women: known?.women ?? WOMEN.test(text), youth: YOUTH.test(text), series: [], clubs: [], teams: 0, games: 0,
      kw: known?.kw.length ? known.kw : undefined, ...(known?.not ? { not: known.not } : {}), rank: known?.rank ?? (cat === 'national' ? 40 : YOUTH.test(text) ? 300 : 100), _teams: new Set<number>() };
    c.series.push(sid); c.games += info.games; info.teams.forEach((t) => c._teams.add(t));
    comps.set(id, c);
  }
  // Belgian Lions / Belgian Cats : toutes les séries où l'équipe joue
  for (const n of NATIONAL) {
    const sids = [...bySerie].filter(([, x]) => x.teams.has(n.team)).map(([sid]) => sid);
    if (!sids.length) continue;
    const ts = new Set<number>(); let games = 0; sids.forEach((sid) => { bySerie.get(sid)!.teams.forEach((t) => ts.add(t)); games += bySerie.get(sid)!.games; });
    comps.set(n.id, { id: n.id, name: n.name, sub: n.sub, cat: 'monde', women: n.women, youth: false, series: sids, clubs: [], teams: 0, games, kw: n.kw, rank: n.rank, _teams: ts });
  }
  return [...comps.values()].map(({ _teams, ...c }) => {
    const clubs = [...new Set([..._teams].map((t) => clubOf.get(t)?.id).filter((x): x is number => x !== undefined))];
    return { ...c, clubs, teams: _teams.size, ...(COMP_LOGOS[c.id] ?? COMP_LOGOS[c.cat] ?? {}) };
  }).filter((c) => c.teams > 1).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'fr'));
}
