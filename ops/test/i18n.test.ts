import { describe, it, expect } from 'vitest';
import { collectKeys } from '../i18n-keys';
import { NL } from '../../web/src/i18n/nl';
import { EN } from '../../web/src/i18n/en';

// Chaque texte affiché par l'appli (clé française) doit exister en néerlandais et en anglais, avec les mêmes {variables}.
describe('traductions de l’appli', () => {
  const keys = [...collectKeys()];
  const vars = (s: string) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort().join();
  it.each([['nl', NL], ['en', EN]] as const)('%s : aucun texte manquant', (_, dict) => {
    expect(keys.filter((k) => !(k in dict))).toEqual([]);
  });
  it.each([['nl', NL], ['en', EN]] as const)('%s : mêmes variables', (_, dict) => {
    expect(Object.entries(dict).filter(([fr, tr]) => vars(fr) !== vars(tr)).map(([fr]) => fr)).toEqual([]);
  });
});
