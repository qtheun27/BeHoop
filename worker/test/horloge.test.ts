import { describe, expect, it } from 'vitest';
import { dueWorkflows } from '../src/index';

const at = (h: number, m: number) => dueWorkflows(new Date(Date.UTC(2026, 10, 3, h, m)));
describe('horloge des mises à jour', () => {
  it('résultats rapides de 8 h à 1 h, notifications toutes les 30 min', () => {
    expect(at(15, 15)).toEqual(['live.yml']);
    expect(at(14, 30)).toEqual(['live.yml', 'notify.yml']);
    expect(at(3, 0)).toEqual(['notify.yml']);
  });
  it('actus toutes les 2 h, mise à jour complète à 6 h et 18 h', () => {
    expect(at(10, 15)).toEqual(['live.yml', 'news.yml']);
    expect(at(11, 15)).toEqual(['live.yml']);
    expect(at(18, 0)).toEqual(['live.yml', 'notify.yml', 'update.yml']);
    expect(at(6, 0)).toEqual(['notify.yml', 'update.yml']);
  });
  it('tolère un léger retard du déclenchement', () => expect(at(10, 16)).toEqual(['live.yml', 'news.yml']));
});
