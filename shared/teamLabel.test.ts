import { it, expect } from 'vitest';
import { teamLabel } from './teamLabel';
const L = (cat: string) => teamLabel({ name: 'x', cat });
it('libellés d’équipes', () => {
  expect(L('PU14H A')).toBe('U14 A · Provinciale');
  expect(L('RU14H')).toBe('U14 · Régionale');
  expect(L('PU12HM B')).toBe('U12 B · Provinciale');
  expect(L('PU16D')).toBe('U16 Filles · Provinciale');
  expect(L('R1H B')).toBe('R1 Messieurs B');
  expect(L('P3D')).toBe('P3 Dames');
  expect(L('PU8')).toBe('U8 · Provinciale');
  expect(L('TDW1 A')).toBe('Top Division Dames 1 A');
});
