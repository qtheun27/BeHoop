// Fond « parquet » aux couleurs d'un club ou d'une compétition : le terrain entier, peint comme les parquets NBA.
// Mode clair : sol teinté à la couleur du club, bois visible (proposition B) ; mode sombre : sol nuit, lignes de couleur (C).
// Terrain en portrait sur téléphone, couché sur un écran large. Dessiné en SVG (le logo est une <image>, impossible en fond CSS).
import { useEffect, useMemo, useState } from 'react';
import { courtTheme, onCourtTheme, type CourtTheme } from '../lib/theme';

function rand(seed: number) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

/** wide : le terrain sera couché (rotation de 90°) ; logo et noms sont tournés en sens inverse pour rester droits */
function svg(k: CourtTheme, dark: boolean, wide: boolean) {
  const W = 170, H = 300, o = 10, lw = 1.3, rnd = rand(7);
  const L = dark ? k.c1 : '#fff', floor = dark ? '#151a24' : k.c1, band = dark ? '#0b0e15' : k.c2, ink = dark ? k.c1 : k.c1;
  let wood = '';
  for (let x = 0; x < 150; x += 6) for (let y = -rnd() * 60; y < 280;) {
    const h = 40 + rnd() * 70, l = 1 + (rnd() - 0.5) * (dark ? 0.12 : 0.1);
    wood += `<rect x="${o + x}" y="${o + y}" width="6" height="${h}" fill="${floor}" style="filter:brightness(${l.toFixed(3)})"/><path d="M${o + x} ${o + y}v${h}" stroke="#000" stroke-opacity=".06" stroke-width=".4"/>`;
    y += h;
  }
  const half = (flip: boolean) => `<g ${flip ? `transform="translate(0 ${H}) scale(1 -1)"` : ''}>
    <rect x="${o + 50.5}" y="${o}" width="49" height="58" fill="${dark ? k.c1 : k.c2}" fill-opacity="${dark ? 0.22 : 1}" stroke="${L}" stroke-width="${lw}"/>
    <path d="M${o + 57} ${o + 58}a18 18 0 0 0 36 0" fill="none" stroke="${L}" stroke-width="${lw}"/>
    <path d="M${o + 57} ${o + 58}a18 18 0 0 1 36 0" fill="none" stroke="${L}" stroke-width="${lw}" stroke-dasharray="3 3"/>
    <path d="M${o + 9} ${o}V${o + 29.9}A67.5 67.5 0 0 0 ${o + 141} ${o + 29.9}V${o}" fill="none" stroke="${L}" stroke-width="${lw}"/>
    <path d="M${o + 67} ${o + 12}h16" stroke="${L}" stroke-width="1.6"/><circle cx="${o + 75}" cy="${o + 15.75}" r="2.3" fill="none" stroke="#f26a1b" stroke-width="1"/></g>`;
  const name = esc(k.name.toUpperCase());
  const base = (y: number) => wide ? `<text transform="translate(${y < H / 2 ? o / 2 + 2.5 : W - o / 2 - 2.5} ${H / 2}) rotate(-90)" text-anchor="middle" dominant-baseline="middle" font-family="Anton" font-size="7" letter-spacing="2.5" fill="${ink}">${name}</text>` : `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="Anton" font-size="7" letter-spacing="2.5" fill="${ink}">${name}</text>`;
  const side = (x: number, r: number) => `<text transform="translate(${x} ${H / 2}) rotate(${r})" text-anchor="middle" dominant-baseline="${wide ? 'middle' : 'auto'}" font-family="Anton" font-size="7.5" letter-spacing="3" fill="${ink}" opacity=".9">${name} · BEHOOP</text>`;
  return `<defs><radialGradient id="cg"><stop offset=".55" stop-color="${k.c1}" stop-opacity=".55"/><stop offset="1" stop-color="${k.c1}" stop-opacity="0"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="${band}"/>${wood}
    ${dark ? '' : `<rect x="${o}" y="${o}" width="150" height="280" fill="#000" fill-opacity=".08"/>`}${half(false)}${half(true)}
    <rect x="${o}" y="${o}" width="150" height="280" fill="none" stroke="${L}" stroke-width="${lw}"/><path d="M${o} ${H / 2}h150" stroke="${L}" stroke-width="${lw}"/>
    ${dark ? `<circle cx="${W / 2}" cy="${H / 2}" r="42" fill="url(#cg)"/>` : ''}
    <circle cx="${W / 2}" cy="${H / 2}" r="27" fill="${dark ? k.c1 : k.c2}" stroke="${L}" stroke-width="${lw}"/>
    <circle cx="${W / 2}" cy="${H / 2}" r="22" fill="${k.logoDark ? '#0d1220' : '#fff'}" stroke="${dark ? k.c2 : k.c1}" stroke-width="1"/>
    ${k.logo ? `<image href="${esc(k.logo)}" x="${W / 2 - 17}" y="${H / 2 - 17}" width="34" height="34" preserveAspectRatio="xMidYMid meet"${wide ? ` transform="rotate(-90 ${W / 2} ${H / 2})"` : ''}/>`
      : centerName(k.name, k.c1, wide)}
    ${wide ? `${side(o / 2 + 2.5, -90)}${side(W - o / 2 - 2.5, -90)}` : `${base(o - 2.6)}${base(H - 2.6)}${side(o / 2 + 2.5, -90)}${side(W - o / 2 - 2.5, 90)}`}`;
}
/** Compétition (pas de logo : marque protégée) : son nom en lettres de terrain dans le rond, sur une ou deux lignes */
function centerName(name: string, fill: string, wide: boolean) {
  const words = esc(name.toUpperCase()).split(' ');
  const lines = words.length > 1 && name.length > 9 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [words.join(' ')];
  const longest = Math.max(...lines.map((l) => l.length));
  const fs = Math.min(13, 34 / (longest * 0.48));
  const y0 = 150 - ((lines.length - 1) * fs * 1.05) / 2;
  return `<g${wide ? ' transform="rotate(-90 85 150)"' : ''}>${lines.map((l, i) => `<text x="85" y="${y0 + i * fs * 1.05}" text-anchor="middle" dominant-baseline="central" font-family="Anton" font-size="${fs.toFixed(2)}" letter-spacing=".3" fill="${fill}">${l}</text>`).join('')}</g>`;
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const darkNow = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);

export function CourtBg() {
  const [k, setK] = useState(courtTheme());
  const [dark, setDark] = useState(darkNow);
  const [wide, setWide] = useState(() => innerWidth > innerHeight);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const up = () => { setK(courtTheme()); setDark(darkNow()); setWide(innerWidth > innerHeight); };
    const off = onCourtTheme(up); mq.addEventListener('change', up); addEventListener('resize', up);
    return () => { off(); mq.removeEventListener('change', up); removeEventListener('resize', up); };
  }, []);
  const inner = useMemo(() => (k ? svg(k, dark, wide) : ''), [k, dark, wide]);
  useEffect(() => { document.documentElement.dataset.court = k ? (dark ? 'dark' : 'light') : ''; }, [k, dark]);
  if (!k) return null;
  return (
    <svg className="court-bg" viewBox={wide ? '0 0 300 170' : '0 0 170 300'} preserveAspectRatio="xMidYMid slice" aria-hidden
      dangerouslySetInnerHTML={{ __html: wide ? `<g transform="translate(300 0) rotate(90)">${inner}</g>` : inner }} />
  );
}
