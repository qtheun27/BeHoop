import { describe, it, expect } from 'vitest';
import { newsForTeams } from '../../web/src/lib/newsMatch';

describe('actus et suivi réel d’un club', () => {
  it('je ne suis que les U14 : pas d’actu P3, mais les actus générales et U14 oui', () => {
    const u14 = ['PU14H'];
    expect(newsForTeams('Basket – Provinciale 3 | Terminé pour Obrian Vandam', u14)).toBe(false);
    expect(newsForTeams('Le P3 de Stambruges s’impose', u14)).toBe(false);
    expect(newsForTeams('Les U14 de Stambruges invaincus', u14)).toBe(true);
    expect(newsForTeams('Stambruges inaugure sa nouvelle salle', u14)).toBe(true);
  });
  it('je suis l’équipe P3 : actu Provinciale 3 oui, U12 non', () => {
    expect(newsForTeams('3e provinciale : Stambruges C gagne', ['P3H C'])).toBe(true);
    expect(newsForTeams('Les U12 en finale', ['P3H C'])).toBe(false);
  });
  it('Flandre : équipe seniors sans niveau connu → toute actu seniors passe', () => {
    expect(newsForTeams('2e provinciale: zege voor Gistel', ['Messieurs Seniors B'])).toBe(true);
    expect(newsForTeams('U16 kampioen', ['Messieurs Seniors B'])).toBe(false);
  });
});
