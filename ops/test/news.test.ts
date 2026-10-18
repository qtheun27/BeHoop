import { describe, it, expect } from 'vitest';
import { classify } from '../news';
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
