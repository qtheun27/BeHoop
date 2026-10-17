import type { AgeGroup } from './types';

// Classement Jeunes / Seniors à partir de la catégorie AWBB (ex. « PU12HM A », « P3H B », « RU21H »).
// Règle de sécurité : tout ce qui n'est pas reconnu comme Seniors est classé Jeunes.
const JEUNES = /(^|[^A-Z])U\s?\d{1,2}|BENJAMIN|PUPILLE|MINIME|CADET|JUNIOR|POUSSIN|ESPOIR|JEUNE|KIDS|MINI/i;
const SENIORS = /^(P|R|N|TDM|TD)\s?\d?\s?[HDM]\b|SENIOR|DAMES|MESSIEURS|HOMMES|R[ÉE]GIONAL|PROVINCIAL|NATIONAL|VÉTÉRAN|VETERAN/i;

export function classifyCategory(category: string | null | undefined): AgeGroup {
  const c = (category ?? '').trim().toUpperCase();
  if (!c) return 'jeunes';
  if (JEUNES.test(c)) return 'jeunes';
  if (SENIORS.test(c)) return 'seniors';
  return 'jeunes';
}

/** Applique une éventuelle correction du super admin. */
export function ageGroupOf(category: string | null | undefined, override?: AgeGroup | null): AgeGroup {
  return override ?? classifyCategory(category);
}
