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

/** Thème aux couleurs d'une compétition suivie : couleurs officielles et logo (dark : logo blanc) */
export const COMP_THEME: Record<string, { c1: string; c2: string; logo: string; dark?: boolean }> = {
  bnxt: { c1: '#e8501d', c2: '#1d1d1b', logo: '/logos/comps/bnxt.webp' }, nba: { c1: '#1d428a', c2: '#c8102e', logo: '/logos/comps/nba.webp' },
  wnba: { c1: '#ff6f20', c2: '#0c2340', logo: '/logos/comps/wnba.webp' }, euroleague: { c1: '#ff6c00', c2: '#0f2a4a', logo: '/logos/comps/euroleague.webp' },
  eurocup: { c1: '#0068b3', c2: '#78be20', logo: '/logos/comps/eurocup.webp' }, bcl: { c1: '#0a1f44', c2: '#00b3e3', logo: '/logos/comps/bcl.webp', dark: true },
  fec: { c1: '#0077c8', c2: '#00b2a9', logo: '/logos/comps/fec.webp' }, elw: { c1: '#3c3c3c', c2: '#b48a3c', logo: '/logos/comps/elw.webp' },
  ecw: { c1: '#00427a', c2: '#e5194a', logo: '/logos/comps/ecw.webp' }, lions: { c1: '#c8102e', c2: '#f2c14e', logo: '/logos/comps/lions.webp' },
  cats: { c1: '#111111', c2: '#f2c14e', logo: '/logos/comps/cats.webp' }, wcq: { c1: '#7b1e1e', c2: '#d4a636', logo: '/logos/comps/wc.webp', dark: true },
  wwc: { c1: '#7b1e1e', c2: '#d4a636', logo: '/logos/comps/wwc.webp', dark: true }, 'eurobasket-w': { c1: '#0057b8', c2: '#ffd100', logo: '/logos/comps/eurobasket-w.webp', dark: true },
  ebwq: { c1: '#0057b8', c2: '#ffd100', logo: '/logos/comps/eurobasket-w.webp', dark: true },
};

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
  delete r.dataset.logoDark;
  const comp = p.accent.startsWith('comp:') ? COMP_THEME[p.accent.slice(5)] : undefined;
  if (comp) {
    // Compétition : mêmes effets qu'un club (parquet teinté, logo dans le rond central)
    const k = clubColors(comp);
    r.dataset.accent = 'club';
    r.style.setProperty('--accent-base', k.accent); r.style.setProperty('--accent-2', k.second); r.style.setProperty('--accent-grad', k.grad);
    r.style.setProperty('--club-logo', `url("${comp.logo}")`); if (comp.dark) r.dataset.logoDark = '1';
  } else if (p.accent.startsWith('club:')) {
    const c = clubs.find((x) => x.id === Number(p.accent.slice(5)));
    r.dataset.accent = 'club';
    const k = c ? { ...clubColors(c), logo: c.logo } : store.get<{ accent: string; second: string; grad: string; logo?: string | null } | null>('behoop.themeClub', null);
    // --accent-base : la couleur du club ; theme.css en dérive --accent (éclaircie en mode sombre pour rester lisible)
    if (k) { r.style.setProperty('--accent-base', k.accent); r.style.setProperty('--accent-2', k.second); r.style.setProperty('--accent-grad', k.grad); if (k.logo) r.style.setProperty('--club-logo', `url("${k.logo}")`); store.set('behoop.themeClub', k); }
  } else r.dataset.accent = p.accent;
  const meta = document.querySelector('meta[name="theme-color"]:not([media])') ?? Object.assign(document.head.appendChild(document.createElement('meta')), { name: 'theme-color' });
  meta.setAttribute('content', getComputedStyle(r).getPropertyValue('--bg').trim() || '#f4f1ec');
  store.set('behoop.theme', p);
}
/** Application immédiate au démarrage (avant le chargement du profil). */
export const bootTheme = () => applyTheme({ ...DEFAULT_THEME, ...store.get<Partial<ThemePrefs>>('behoop.theme', {}) });
