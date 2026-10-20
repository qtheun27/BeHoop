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
  /** Ordre d'affichage (plus petit = plus haut) */
  rank: number;
}

const WOMEN = /\b(dames?|women|meisjes|filles|vrouwen|wnba|cats|ladies|w)\b|\b[PR]\d\s?D\b|U\d{2}\s?D\b|\bTDW|\bD\s*[A-Z]?$/i;
const YOUTH = /\bU\s?\d{1,2}\b|minibasket|jeunes|jeugd/i;
// Tours de coupe et poules : regroupés sous le nom de la coupe
const CUP_ROUND = /\s+(poule\s+\w+|\d+\/\d+\s*e?\s*(finale|final)|1\/\d+.*|kwartfinale|halve finale|demi-finales?|quarts? de finale|finale|final four|tour \d+|ronde \d+)\s*$/i;

/** Compétitions connues : nom, catégorie, mots-clés pour les actus, ordre */
const KNOWN: { test: RegExp; id: string; name: string; cat: CompCat; kw: string[]; rank: number; women?: boolean }[] = [
  { test: /^BNXT League/i, id: 'bnxt', name: 'BNXT League', cat: 'national', kw: ['bnxt'], rank: 1 },
  { test: /^NBA ·/, id: 'nba', name: 'NBA', cat: 'nba', kw: ['nba'], rank: 2 },
  { test: /^FIBA · Belgian Lions/, id: 'lions', name: 'Belgian Lions', cat: 'monde', kw: ['belgian lions'], rank: 5 },
  { test: /^Top Division Men 1/i, id: 'tdm1', name: 'Top Division Men 1', cat: 'national', kw: ['top division men 1', 'tdm1'], rank: 10 },
  { test: /^Top Division Men 2 A/i, id: 'tdm2a', name: 'Top Division Men 2 A', cat: 'national', kw: ['tdm2 a'], rank: 11 },
  { test: /^Top Division Men 2 B/i, id: 'tdm2b', name: 'Top Division Men 2 B', cat: 'national', kw: ['tdm2 b'], rank: 12 },
  { test: /^Top Division Women/i, id: 'tdw', name: 'Top Division Women', cat: 'national', kw: ['top division women', 'top division dames', 'tdw1'], rank: 13, women: true },
  { test: /^Beker van België Heren/i, id: 'beker-heren', name: 'Coupe de Belgique · Messieurs', cat: 'national', kw: ['coupe de belgique', 'beker van belgie', 'beker van belgië'], rank: 15 },
  { test: /^Beker van België Dames/i, id: 'beker-dames', name: 'Coupe de Belgique · Dames', cat: 'national', kw: [], rank: 16, women: true },
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
    if (known) sub = known.cat === 'nba' ? 'États-Unis' : known.cat === 'monde' ? 'Équipe nationale' : 'Belgique';
    else if (isVbl) sub = /vlaanderen|antwerpen|limburg|brabant|landelijk/i.test(name) ? 'Basketbal Vlaanderen' : [prov, 'Basketbal Vlaanderen'].filter(Boolean).join(' · ');
    else sub = awbbCup ? prov : [prov, s.short].filter(Boolean).join(' · ');
    const text = `${s.name} ${s.short} ${s.comp ?? ''}`;
    const cat: CompCat = known?.cat ?? (isPro ? 'monde' : isVbl ? (/landelijk|top division|beker van belgi/i.test(name) ? 'national' : 'flandre')
      : /régional|national|awbb/i.test(s.comp ?? '') ? 'wallonie' : 'wallonie');
    const c = comps.get(id) ?? { id, name, sub, cat, women: known?.women ?? WOMEN.test(text), youth: YOUTH.test(text), series: [], clubs: [], teams: 0, games: 0,
      kw: known?.kw.length ? known.kw : undefined, rank: known?.rank ?? (cat === 'national' ? 40 : YOUTH.test(text) ? 300 : 100), _teams: new Set<number>() };
    c.series.push(sid); c.games += info.games; info.teams.forEach((t) => c._teams.add(t));
    comps.set(id, c);
  }
  return [...comps.values()].map(({ _teams, ...c }) => {
    const clubs = [...new Set([..._teams].map((t) => clubOf.get(t)?.id).filter((x): x is number => x !== undefined))];
    return { ...c, clubs, teams: _teams.size };
  }).filter((c) => c.teams > 1).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'fr'));
}
