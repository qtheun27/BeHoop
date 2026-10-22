// Accès aux données publiques BeHoop (app-data généré depuis data.json par le scraper).
import { DATA_BASE } from './config';
import type { AgeGroup } from '../../../shared/types';
import type { IconName } from '../ui/icons';

export interface Team { id: number; name: string; cat: string; ag: AgeGroup }
export interface Club { id: number; name: string; short: string; province: string; logo: string | null; c1: string; c2: string; city: string;
  venue?: { name: string; street: string; zip: string; city: string; lat?: number; lng?: number } | null; teams: Team[]; linked?: number }
export interface Game { id: number; d: string; t: string; s: number; sn: string; h: number; a: number; hn: string; an: string;
  hs: number | null; as: number | null; v: string; adr: string; lat?: number; lng?: number; ty: string;
  /** Score arrivé par les résultats rapides (lib/live.ts), pas encore dans la mise à jour officielle */ live?: boolean }
export interface Standing { team: number; played: number; wins: number; losses: number; pf: number; pa: number; pts: number; /** Matchs nuls (jeunes en Flandre) */ draws?: number; /** Rang officiel (départages de la fédération compris) */ rank?: number }

export { ranked } from './standings';

const cache = new Map<string, Promise<unknown>>();
function get<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = fetch(`${DATA_BASE}/${path}`).then((r) => { if (!r.ok) throw new Error('Données indisponibles'); return r.json(); });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path) as Promise<T>;
}
/** alias : anciens identifiants de club fusionnés (ex. fiche nationale + fiche AWBB) → identifiant actuel */
export interface Index { generated_at: string; season: string; clubs: Club[]; alias?: Record<string, number> }
export const loadIndex = () => get<Index>('index.json');
export const clubAlias = async (id: number) => (await loadIndex()).alias?.[id] ?? id;
/** Matchs d'un club ; scores des résultats rapides inclus (lib/live.ts) */
export const loadClub = async (id: number) => {
  const d = await get<{ club: Club; games: Game[] }>(`clubs/${await clubAlias(id)}.json`);
  const { withLive } = await import('./live');
  return { ...d, games: (await withLive(d.games)).games };
};
/** Série : classement officiel, ou provisoire (provisional = heure du dernier résultat) si des résultats rapides sont arrivés
 *  et que le moteur reproduit exactement le classement officiel de cette série (serie.rule) */
export const loadSerie = async (id: number) => {
  const d = await get<{ serie: { id: number; name: string; short: string; rule?: string }; standings: Standing[]; games: Game[] }>(`series/${id}.json`);
  const { withLive, provisional } = await import('./live');
  const { games, latest } = await withLive(d.games);
  const prov = latest ? provisional(d.standings, games, d.serie.rule) : null;
  return { ...d, games, standings: prov ?? d.standings, provisional: prov ? latest : null };
};

/* ---------- Compétitions (competitions.json, voir ops/competitions.ts) ---------- */
export type CompCat = 'national' | 'wallonie' | 'flandre' | 'europe' | 'monde' | 'nba';
export interface Competition { id: string; name: string; sub: string; cat: CompCat; women: boolean; youth: boolean; series: number[]; clubs: number[]; teams: number; games: number; kw?: string[]; rank: number; logo?: string; dark?: boolean }
/** Source officielle d'une donnée, d'après la plage de son identifiant (voir ops/ : AWBB < 1e10, VBL, puis bases 20e9…) */
export function dataSource(id: number) {
  if (id < 1e10) return 'AWBB';
  if (id < 20e9) return 'Basketbal Vlaanderen';
  if (id < 21e9) return 'BNXT League';
  if ((id >= 22e9 && id < 23e9) || (id >= 26e9 && id < 27e9)) return 'ESPN';
  if (id >= 24e9 && id < 26e9) return 'EuroLeague Basketball';
  return 'FIBA';
}
/** Noms et sous-titres dans la langue de l'appli (voir trName) */
export const loadComps = async () => (await get<Competition[]>('competitions.json')).map((c) => ({ ...c, name: trName(c.name), sub: trName(c.sub) }));
export async function getComp(id: string) { return (await loadComps()).find((c) => c.id === id) ?? null; }
/** Icône d'une compétition sans logo officiel (voir CompLogo) */
export const compIcon = (c: Pick<Competition, 'id' | 'cat' | 'women' | 'youth'>): IconName =>
  /beker|cup|coupe/.test(c.id) ? 'trophy' : c.cat === 'europe' ? 'europe' : c.cat === 'monde' ? 'globe' : c.youth ? 'youth' : c.cat === 'national' ? 'flag' : 'ball';

let teamMap: Map<number, { team: Team; club: Club }> | null = null;
export async function teamIndex() {
  if (!teamMap) {
    const idx = await loadIndex();
    teamMap = new Map();
    idx.clubs.forEach((c) => c.teams.forEach((t) => teamMap!.set(t.id, { team: t, club: c })));
  }
  return teamMap;
}
export const isPlayed = (g: Game) => g.hs !== null && g.as !== null && !(g.hs === 0 && g.as === 0);
import { teamLabel as frTeamLabel } from '../../../shared/teamLabel';
import { lang } from './i18n';
// Libellés d'équipe (générés en français) : mots traduits selon la langue de l'appli
const CAT_WORDS: Record<'nl' | 'en', Record<string, string>> = {
  nl: { Mixte: 'Gemengd', Seniors: 'Senioren', Garçons: 'Jongens', Messieurs: 'Heren', Filles: 'Meisjes', Dames: 'Dames', National: 'Nationaal', nationale: 'nationaal', Régionale: 'Regionaal', Provinciale: 'Provinciaal', Équipe: 'Ploeg' },
  en: { Mixte: 'Mixed', Seniors: 'Seniors', Garçons: 'Boys', Messieurs: 'Men', Filles: 'Girls', Dames: 'Women', National: 'National', nationale: 'national', Régionale: 'Regional', Provinciale: 'Provincial', Équipe: 'Team' },
};
export function trCat(s: string) {
  const l = lang(); if (l === 'fr') return s;
  return s.replace(/[A-Za-zÀ-ÿ]+/g, (w) => CAT_WORDS[l][w] ?? w);
}
export const teamLabel = (t: { cat: string; name: string }) => trCat(frTeamLabel(t));
/** Noms de compétitions et de séries écrits en français dans les données (« Coupe du monde 2027 · Qualifications »,
 *  « EuroCup · Groupe A ») : traduits morceau par morceau (séparateur « · »), les noms propres restent tels quels. */
const NAME_PARTS: Record<'nl' | 'en', Record<string, string>> = {
  nl: { Belgique: 'België', 'Pays-Bas': 'Nederland', 'États-Unis': 'Verenigde Staten', Dames: 'Dames', Messieurs: 'Heren', Europe: 'Europa', 'Équipe nationale': 'Nationale ploeg',
    'Coupe du monde 2027': 'WK 2027', 'Coupe du monde féminine 2026': 'WK vrouwen 2026', 'EuroBasket féminin 2027': 'EuroBasket vrouwen 2027', Qualifications: 'Kwalificaties',
    Allemagne: 'Duitsland', Finlande: 'Finland', Suède: 'Zweden', Lituanie: 'Litouwen', 'Saison régulière': 'Reguliere competitie', 'Phase de groupes': 'Groepsfase',
    '1er tour': '1e ronde', '2e tour': '2e ronde', Huitièmes: 'Achtste finales', 'Play-offs': 'Play-offs', 'Quarts de finale': 'Kwartfinales', 'Demi-finales': 'Halve finales',
    Finale: 'Finale', 'Pays hôtes': 'Gastlanden', 'Phase finale': 'Eindfase', 'Conférence Est': 'Oostelijke conferentie', 'Conférence Ouest': 'Westelijke conferentie',
    'Coupe de Belgique': 'Beker van België', 'FIBA Europe': 'FIBA Europe', Wallonie: 'Wallonië', Flandre: 'Vlaanderen' },
  en: { Belgique: 'Belgium', 'Pays-Bas': 'Netherlands', 'États-Unis': 'United States', Dames: 'Women', Messieurs: 'Men', Europe: 'Europe', 'Équipe nationale': 'National team',
    'Coupe du monde 2027': 'World Cup 2027', 'Coupe du monde féminine 2026': "Women's World Cup 2026", 'EuroBasket féminin 2027': "Women's EuroBasket 2027", Qualifications: 'Qualifiers',
    Allemagne: 'Germany', Finlande: 'Finland', Suède: 'Sweden', Lituanie: 'Lithuania', 'Saison régulière': 'Regular season', 'Phase de groupes': 'Group phase',
    '1er tour': '1st round', '2e tour': '2nd round', Huitièmes: 'Round of 16', 'Play-offs': 'Play-offs', 'Quarts de finale': 'Quarter-finals', 'Demi-finales': 'Semi-finals',
    Finale: 'Final', 'Pays hôtes': 'Hosts', 'Phase finale': 'Final phase', 'Conférence Est': 'Eastern Conference', 'Conférence Ouest': 'Western Conference',
    'Coupe de Belgique': 'Belgian Cup', 'FIBA Europe': 'FIBA Europe', Wallonie: 'Wallonia', Flandre: 'Flanders' },
};
export function trName(s: string) {
  const l = lang(); if (l === 'fr' || !s) return s;
  return s.split(' · ').map((p) => NAME_PARTS[l][p] ?? p.replace(/^Groupe (\w+)$/, l === 'nl' ? 'Groep $1' : 'Group $1')).join(' · ');
}
export function normalize(s: string) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

/* ---------- Actualités (titre, accroche, source et lien vers l'article original) ---------- */
export interface News { id: string; title: string; excerpt: string; url: string; source: string; image: string | null; date: string; cat: 'belgique' | 'regional' | 'international' | 'nba'; clubs?: number[]; comps?: string[]; frame?: boolean;
  lang?: 'fr' | 'nl' | 'en' }
/** Article écrit dans la langue de l'appli (chaque langue a ses propres sources, pas de traduction). */
export const readable = (n: News) => !n.lang || n.lang === lang();
export const loadNews = () => get<{ generated_at: string; items: News[] }>('news.json');
