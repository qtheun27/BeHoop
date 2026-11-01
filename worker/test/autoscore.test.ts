import { describe, expect, it, vi } from 'vitest';
import { autoScores } from '../src/index';

describe('score automatique du montage', () => {
  it('lit les photos du marquoir, ajoute le résultat officiel, sans écraser ni accepter un score qui redescend', async () => {
    const reads: Record<string, { home: number; away: number }> = { 'rushes/x/q1.jpg': { home: 12, away: 9 }, 'rushes/x/q2.jpg': { home: 30, away: 22 }, 'rushes/x/q3.jpg': { home: 20, away: 10 } };
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      if (String(url).includes('anthropic')) { const key = JSON.parse(init.body).messages[0].content[0].source.data; return new Response(JSON.stringify({ content: [{ text: JSON.stringify(reads[atob(key)]) }] })); }
      if (String(url).endsWith('/app-data/index.json')) return new Response(JSON.stringify({ clubs: [{ id: 7, teams: [{ id: 100 }] }] }));
      if (String(url).endsWith('/app-data/clubs/7.json')) return new Response(JSON.stringify({ games: [{ id: 555, hs: 66, as: 48 }] }));
      return new Response('', { status: 404 });
    }));
    const env: any = { ANTHROPIC_API_KEY: 'k', SITE_URL: 'https://site', BUCKET: { get: async (k: string) => ({ arrayBuffer: async () => new TextEncoder().encode(k).buffer }) } };
    const v = { matchAwbbId: 555, settings: { home: { awbbTeamId: 100 }, scores: [{ home: 0, away: 0 }, { home: 0, away: 0 }, { home: 0, away: 0 }, { home: 0, away: 0 }] },
      media: [1, 2, 3].map((q) => ({ kind: 'photo', r2Key: `rushes/x/q${q}.jpg`, scoreboardOfQuarter: q })) };
    const r = await autoScores(env, v);
    // Q3 lu (20–10) est plus bas que Q2 : écarté ; score final = résultat officiel
    expect(r.scores).toEqual([[12, 9], [30, 22], [0, 0], [66, 48]]);
    expect(r.read).toEqual([1, 2]);
    expect(r.official).toBe(true);
    vi.unstubAllGlobals();
  });
});
