// Langues de l'appli : français (texte source), néerlandais, anglais.
// t('Texte en français') renvoie la traduction de la langue active ; {nom} est remplacé par vars.nom.
// La langue suit le téléphone au premier lancement, puis le choix fait dans l'en-tête (mémorisé).
import { NL } from '../i18n/nl';
import { EN } from '../i18n/en';

export type Lang = 'fr' | 'nl' | 'en';
export const LANGS: { id: Lang; label: string; name: string }[] = [
  { id: 'fr', label: 'FR', name: 'Français' }, { id: 'nl', label: 'NL', name: 'Nederlands' }, { id: 'en', label: 'EN', name: 'English' },
];
const KEY = 'behoop.lang';
const DICT: Record<Lang, Record<string, string>> = { fr: {}, nl: NL, en: EN };

export function detectLang(): Lang {
  try { const s = localStorage.getItem(KEY); if (s === 'fr' || s === 'nl' || s === 'en') return s; } catch { /* stockage indisponible */ }
  for (const l of navigator.languages ?? [navigator.language]) {
    const p = (l ?? '').slice(0, 2).toLowerCase();
    if (p === 'fr' || p === 'nl' || p === 'en') return p;
    if (p === 'de' || p === 'af') return 'nl';
  }
  return 'fr';
}

let current: Lang = detectLang();
document.documentElement.lang = current;
const listeners = new Set<(l: Lang) => void>();

export const lang = () => current;
export function setLang(l: Lang) {
  current = l;
  document.documentElement.lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* stockage indisponible */ }
  listeners.forEach((f) => f(l));
}
export const onLang = (f: (l: Lang) => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

export function t(fr: string, vars?: Record<string, string | number>) {
  const s = current === 'fr' ? fr : DICT[current][fr] ?? fr;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : s;
}
/** Pluriel simple : t1 au singulier, tn au pluriel ({n} disponible). */
export const tn = (n: number, one: string, many: string, vars?: Record<string, string | number>) => t(n === 1 ? one : many, { n, ...vars });

export const locale = () => ({ fr: 'fr-BE', nl: 'nl-BE', en: 'en-GB' })[current];
