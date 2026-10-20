// Lecture des pages FIBA : objets JSON extraits du flux Next.js, y compris avec des accolades dans les textes.
import { describe, it, expect } from 'vitest';
import { jsonObjects } from '../pro';

describe('jsonObjects', () => {
  it('extrait chaque match complet, même avec « { » dans un nom', () => {
    const txt = 'x:[{"gameId":1,"teamA":{"officialName":"BC {Test}"},"round":{"roundId":3}},{"gameId":2,"teamA":"$62:props:teamA"}]';
    const out = jsonObjects(txt, '{"gameId":');
    expect(out.map((g) => g.gameId)).toEqual([1, 2]);
    expect(out[0].teamA.officialName).toBe('BC {Test}');
  });
});
