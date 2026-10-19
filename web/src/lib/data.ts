// Accès aux données publiques BeHoop (app-data généré depuis data.json par le scraper).
import { DATA_BASE } from './config';
import type { AgeGroup } from '../../../shared/types';

export interface Team { id: number; name: string; cat: string; ag: AgeGroup }
export interface Club { id: number; name: string; short: string; province: string; logo: string | null; c1: string; c2: string; city: string;
  venue?: { name: string; street: string; zip: string; city: string; lat?: number; lng?: number } | null; teams: Team[]; linked?: number }
export interface Game { id: number; d: string; t: string; s: number; sn: string; h: number; a: number; hn: string; an: string;
  hs: number | null; as: number | null; v: string; adr: string; lat?: number; lng?: number; ty: string }
export interface Standing { team: number; played: number; wins: number; losses: number; pf: number; pa: number; pts: number }

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
export const loadClub = async (id: number) => get<{ club: Club; games: Game[] }>(`clubs/${await clubAlias(id)}.json`);
export const loadSerie = (id: number) => get<{ serie: { id: number; name: string; short: string }; standings: Standing[]; games: Game[] }>(`series/${id}.json`);

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
export function normalize(s: string) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

/* ---------- Actualités (titre, accroche, source et lien vers l'article original) ---------- */
export interface News { id: string; title: string; excerpt: string; url: string; source: string; image: string | null; date: string; cat: 'belgique' | 'regional' | 'international' | 'nba'; clubs?: number[];
  lang?: 'fr' | 'nl' | 'en' }
/** Article écrit dans la langue de l'appli (chaque langue a ses propres sources, pas de traduction). */
export const readable = (n: News) => !n.lang || n.lang === lang();
export const loadNews = () => get<{ generated_at: string; items: News[] }>('news.json');
