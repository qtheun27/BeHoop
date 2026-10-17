import type { MatchSettings } from './types';
// Match de test (cahier des charges §15) : BC AMLL vs Union Mons Hainaut, samedi 10/10/2026 13h00, jeunes.
export function demoSettings(base = '/docs/test'): MatchSettings {
  const ph = (n: string) => `${base}/photos/${n}.jpg`;
  return {
    home: { name: 'BC AMLL', logo: `${base}/logo_amll.png`, color: '#3d8fdb', awbbTeamId: 51656 },
    away: { name: 'Union Mons Hainaut', logo: `${base}/logo_mons.jpg`, color: '#8a1e36', awbbTeamId: 50757 },
    date: '2026-10-10', time: '13:00', venue: 'Salle Omnisports de Bouvy, La Louvière', competition: 'U14H B',
    scores: [[0, 17], [1, 45], [3, 73], [11, 94]],
    title: 'BC AMLL vs Union Mons Hainaut — 10/10/2026',
    photos: {
      pre: ph('q2_2'),
      q1: ['q1_1', 'q1_2', 'q1_3'].map(ph), q2: ['q2_1', 'q2_2', 'q2_3'].map(ph), q3: ['q3_1', 'q3_2', 'q3_3', 'q3_4', 'q3_5'].map(ph),
      fin: ['q3_5', 'q1_2', 'q2_2', 'q3_2', 'q1_3', 'q2_3', 'q3_4', 'q2_1'].map(ph),
    },
  };
}
