// Format allégé des données BeHoop pour l'appli (généré depuis data.json).
import { classifyCategory } from '../shared/ageGroup';
import type { AgeGroup } from '../shared/types';

export interface SlimTeam { id: number; name: string; cat: string; ag: AgeGroup }
export interface SlimClub {
  id: number; name: string; short: string; province: string; logo: string | null; c1: string; c2: string; city: string;
  venue?: { name: string; street: string; zip: string; city: string; lat?: number; lng?: number } | null; teams: SlimTeam[];
}
export interface SlimGame {
  id: number; d: string; t: string; s: number; sn: string; h: number; a: number; hn: string; an: string;
  hs: number | null; as: number | null; v: string; adr: string; lat?: number; lng?: number; ty: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function slimGame(g: any): SlimGame {
  return {
    id: g.id, d: g.date, t: (g.time ?? '').slice(0, 5), s: g.serie_id, sn: g.serie_short_name ?? g.serie_name ?? '',
    h: g.home_team_id, a: g.away_team_id, hn: g.home_team_short_name ?? g.home_team_name, an: g.away_team_short_name ?? g.away_team_name,
    hs: g.home_score ?? null, as: g.away_score ?? null, v: g.venue_name ?? '',
    adr: [g.venue_street, [g.venue_zip, g.venue_city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    lat: g.venue_lat ? +g.venue_lat : undefined, lng: g.venue_lng ? +g.venue_lng : undefined, ty: g.match_type ?? '',
  };
}

export function slimClub(c: any): SlimClub {
  return {
    id: c.id, name: c.name, short: c.short_name ?? c.name, province: c.province, logo: c.logo_url ?? null,
    c1: c.primary_color ?? '#0b5cab', c2: c.accent_color ?? '#f2c14e', city: c.city ?? '',
    venue: c.venue ? { name: c.venue.name, street: c.venue.street, zip: c.venue.zip, city: c.venue.city, lat: c.venue.lat ? +c.venue.lat : undefined, lng: c.venue.lng ? +c.venue.lng : undefined } : null,
    teams: (c.teams ?? []).map((t: any) => ({ id: t.id, name: t.name, cat: t.category ?? '', ag: classifyCategory(t.category) })),
  };
}

export function isPlayed(g: SlimGame): boolean {
  return g.hs !== null && g.as !== null && !(g.hs === 0 && g.as === 0);
}
