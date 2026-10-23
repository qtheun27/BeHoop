// Thème de l'appli : mode, couleur (palette basket ou couleurs d'un club), fond, accessibilité.
// Appliqué sur <html> et mémorisé localement pour éviter un « flash » au démarrage ; la source de vérité est le profil.
import type { Club } from './data';
import { store } from './util';

export interface ThemePrefs { mode: 'auto' | 'light' | 'dark'; accent: string; bg: 'parquet' | 'nuit' | 'uni'; rt: boolean; rm: boolean }
export const DEFAULT_THEME: ThemePrefs = { mode: 'auto', accent: 'ballon', bg: 'parquet', rt: false, rm: false };
export const ACCENTS: { id: string; label: string; css: string }[] = [
  { id: 'ballon', label: 'Ballon', css: 'linear-gradient(135deg,#f26a1b,#f2c14e)' },
  { id: 'maillot', label: 'Maillot bleu', css: 'linear-gradient(135deg,#1a6fe0,#3d8fdb)' },
  { id: 'rouge', label: 'Rouge', css: 'linear-gradient(135deg,#a50d26,#e8414f)' },
  { id: 'vert', label: 'Vert', css: 'linear-gradient(135deg,#0f7a41,#2fb36b)' },
  { id: 'violet', label: 'Violet', css: 'linear-gradient(135deg,#5a3fd1,#8a6cff)' },
  { id: 'nuit', label: 'Nuit & or', css: 'linear-gradient(135deg,#0a0c12 0%,#1c2233 55%,#f2c14e 100%)' },
];


/** Terrain dessiné en fond (ui/CourtBg) : couleurs d’origine du club, quand le fond « parquet » est choisi */
export interface CourtTheme { c1: string; c2: string; logo?: string | null; logoDark?: boolean; name: string }
let court: CourtTheme | null = null;
const courtSubs = new Set<() => void>();
export const courtTheme = () => court;
export const onCourtTheme = (f: () => void) => { courtSubs.add(f); return () => { courtSubs.delete(f); }; };
const setCourt = (k: CourtTheme | null) => { court = k; courtSubs.forEach((f) => f()); };

const hex = (c: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(c.trim()); return m ? m[1] : null; };
const rgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h: string) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const mix = (h: string, to: number, t: number) => '#' + rgb(h).map((v) => Math.round(v + (to - v) * t).toString(16).padStart(2, '0')).join('');
const dist = (a: string, b: string) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };

/** Couleurs d'un club rendues utilisables : assez foncées pour du texte blanc, seconde couleur distincte. */
export function clubColors(c: Pick<Club, 'c1' | 'c2'>) {
  let a = hex(c.c1) ?? 'f26a1b', b = hex(c.c2) ?? '';
  // couleur trop claire (jaune, blanc…) : on la fonce pour garder le contraste AA avec du texte blanc
  let accent = '#' + a;
  for (let i = 0; i < 8 && lum(accent.slice(1)) > 0.22; i++) accent = mix(accent.slice(1), 0, 0.18);
  let second = b && dist(a, b) > 60 ? '#' + b : mix(a, lum(a) > 0.3 ? 0 : 255, 0.35);
  if (lum(second.slice(1)) > 0.85) second = mix(second.slice(1), 0, 0.25);
  return { accent, second, grad: `linear-gradient(135deg, ${accent} 0%, ${second} 100%)` };
}

export function applyTheme(p: ThemePrefs, clubs: Club[] = []) {
  const r = document.documentElement;
  if (p.mode === 'auto') r.removeAttribute('data-theme'); else r.dataset.theme = p.mode;
  r.dataset.bg = p.bg; r.dataset.rt = p.rt ? '1' : '0'; r.dataset.rm = p.rm ? '1' : '0';
  ['--accent', '--accent-base', '--accent-2', '--accent-grad', '--club-logo'].forEach((k) => r.style.removeProperty(k));
  delete r.dataset.logoDark; delete r.dataset.logo;
  let ct: CourtTheme | null = null;
  if (p.accent.startsWith('club:')) {
    const c = clubs.find((x) => x.id === Number(p.accent.slice(5)));
    r.dataset.accent = 'club';
    const k = c ? { ...clubColors(c), logo: c.logo, c1: c.c1, c2: c.c2, name: c.short || c.name } : store.get<{ accent: string; second: string; grad: string; logo?: string | null; c1?: string; c2?: string; name?: string } | null>('behoop.themeClub', null);
    // --accent-base : la couleur du club ; theme.css en dérive --accent (éclaircie en mode sombre pour rester lisible)
    if (k) { r.style.setProperty('--accent-base', k.accent); r.style.setProperty('--accent-2', k.second); r.style.setProperty('--accent-grad', k.grad); if (k.logo) { r.style.setProperty('--club-logo', `url("${k.logo}")`); r.dataset.logo = '1'; } store.set('behoop.themeClub', k); }
    if (k?.c1) ct = { c1: k.c1, c2: k.c2 && hex(k.c2) ? k.c2 : k.second, logo: k.logo, name: courtName(k.name ?? '') };
  } else r.dataset.accent = p.accent.startsWith('comp:') ? DEFAULT_THEME.accent : p.accent; // ancien thème « compétition » (retiré) → couleur par défaut
  setCourt(p.bg === 'parquet' ? ct : null);
  const meta = document.querySelector('meta[name="theme-color"]:not([media])') ?? Object.assign(document.head.appendChild(document.createElement('meta')), { name: 'theme-color' });
  meta.setAttribute('content', getComputedStyle(r).getPropertyValue('--bg').trim() || '#f4f1ec');
  store.set('behoop.theme', p);
}
/** Nom du club sur le bord du terrain : sans les préfixes BC, BBC, Basket… */
const courtName = (n: string) => n.replace(/^(r\.?\s*)?(k\.?\s*)?(b\.?b\.?c\.?|b\.?c\.?|basket(ball)?( club)?|royal)\s+/i, '').trim() || n;
/** Application immédiate au démarrage (avant le chargement du profil). */
export const bootTheme = () => applyTheme({ ...DEFAULT_THEME, ...store.get<Partial<ThemePrefs>>('behoop.theme', {}) });
