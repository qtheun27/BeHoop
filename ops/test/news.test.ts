import { describe, it, expect } from 'vitest';
import { classify, pageImage } from '../news';
describe('classement des actualités', () => {
  it.each([
    ['Droomaffiche voor Basket Willebroek: tweedeklasser krijgt in beker bezoek', 'belgique'],
    ['Belgian Cats komen op 12 november opnieuw in actie na het WK', 'international'],
    ['BNXT League : Louvain impose ses vues à Courtrai', 'belgique'],
    ['Pourquoi vous ne devez pas rater les Finales WNBA', 'nba'],
    ['Les Knicks sacrifient Bruce Brown pour garder James Wiseman', 'nba'],
    ['EuroBasket 2027 : la Belgique connaît ses adversaires', 'international'],
  ])('%s → %s', (t, c) => expect(classify(t, 'auto', 'Sporza')).toBe(c));
});

describe("image d'aperçu des articles", () => {
  it('lit og:image, quel que soit l’ordre des attributs', () => {
    expect(pageImage('<meta content="/img/a.jpg" property="og:image">', 'https://site.be/art/1')).toBe('https://site.be/img/a.jpg');
    expect(pageImage('<meta name="twitter:image" content="https://cdn.be/b.jpg?w=1&amp;h=2"/>', 'https://site.be')).toBe('https://cdn.be/b.jpg?w=1&h=2');
  });
  it('ignore les logos génériques du site', () => {
    expect(pageImage('<meta property="og:image" content="https://site.be/logoSeo.svg">', 'https://site.be')).toBeNull();
    expect(pageImage('<meta property="og:image" content="https://site.be/1638_sudinfo_opengraph.png">', 'https://site.be')).toBeNull();
  });
});
