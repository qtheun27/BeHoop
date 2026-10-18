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
export interface Index { generated_at: string; season: string; clubs: Club[] }
export const loadIndex = () => get<Index>('index.json');
export const loadClub = (id: number) => get<{ club: Club; games: Game[] }>(`clubs/${id}.json`);
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
export { teamLabel } from '../../../shared/teamLabel';
export function normalize(s: string) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
