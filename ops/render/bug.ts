// Logo BeHoop dans le coin des vidéos : piste transparente d'une minute, répétée en boucle sur chaque séquence filmée.
// 0 → ~5,2 s : le ballon tourne et « déroule » le nom, puis le nom rentre pile quand le ballon passe dans l'arceau (swish) ;
// ensuite le logo reste fixe jusqu'à la minute suivante. Rendu par Chromium (même dessin que l'appli : shared/emblem-anim.svg).
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Browser } from '@playwright/test';
import { ff } from './run';

const ROOT = resolve(import.meta.dirname, '../..');
/** Durée de l'animation (s) et de la piste complète (s) */
export const BUG_ANIM = 5.3, BUG_PERIOD = 60;
/** Taille de la piste (px, vidéo 1080p) et marges dans le coin haut droit */
export const BUG_W = 720, BUG_H = 150;

function page(scale: number): string {
  const svg = readFileSync(join(ROOT, 'shared/emblem-anim.svg'), 'utf8');
  const h = Math.round(100 * scale);
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;700&display=block" rel="stylesheet">
<style>html,body{margin:0;background:transparent;width:${BUG_W * scale}px;height:${BUG_H * scale}px;overflow:hidden}
.bug{position:absolute;right:${12 * scale}px;top:${14 * scale}px;height:${h}px;display:flex;align-items:center;filter:drop-shadow(0 ${2 * scale}px ${6 * scale}px rgba(0,0,0,.55))}
.bug svg{height:${h}px;width:auto;display:block;overflow:visible;color:#fff;position:relative;z-index:2}
.clip{overflow:hidden;height:${h}px;display:flex;align-items:center;margin-right:${8 * scale}px}
.name{font-family:Sora,sans-serif;font-size:${50 * scale}px;letter-spacing:-.035em;line-height:1;padding:0 ${4 * scale}px;white-space:nowrap}
.name b{font-weight:300;color:#fff}.name i{font-style:normal;font-weight:700;background:linear-gradient(120deg,#f26a1b 10%,#f5a623 90%);-webkit-background-clip:text;background-clip:text;color:transparent}
</style></head><body><div class="bug"><div class="clip" id="clip"><div class="name" id="name"><b>Be</b><i>Hoop</i></div></div>${svg}</div>
<script>
window.setup = () => {
  const D = ${BUG_ANIM * 1000}, $ = (i) => document.getElementById(i), at = (s) => s * 1000 / D;
  const name = $('name'), clip = $('clip'), W = name.getBoundingClientRect().width;
  const ball = document.querySelector('.bh-ball'), net = document.querySelector('.bh-net');
  // Chorégraphie (s) : TOUR (le ballon roule vers la gauche et déroule le nom) puis SWISH (le nom rentre et disparaît
  // pile quand le ballon passe l'arceau, le filet s'étire, le ballon revient à sa place).
  const T = { spin0: .3, spin1: 1.25, rise0: 3.7, rise1: 4.0, rim: 4.32, drop1: 4.45, back0: 4.55, back1: 4.95 };
  const roll = 'cubic-bezier(.45,.05,.25,1)', o = { duration: D, fill: 'both' };
  clip.animate([{ offset: 0, width: '0px' }, { offset: at(T.spin0), width: '0px', easing: roll }, { offset: at(T.spin1), width: W + 'px' },
    { offset: at(T.rise0), width: W + 'px', easing: 'cubic-bezier(.55,0,.85,.35)' }, { offset: at(T.rim), width: '0px' }, { offset: 1, width: '0px' }], o);
  name.animate([{ offset: 0, opacity: 1 }, { offset: at(T.rim - .08), opacity: 1 }, { offset: at(T.rim), opacity: .3 }, { offset: 1, opacity: .3 }], o);
  ball.animate([
    { offset: 0, transform: 'none', opacity: 1 },
    { offset: at(T.spin0), transform: 'none', opacity: 1, easing: roll },
    { offset: at(T.spin1), transform: 'rotate(-360deg)', opacity: 1 },
    { offset: at(T.rise0), transform: 'rotate(-360deg)', opacity: 1, easing: 'cubic-bezier(.2,.7,.4,1)' },
    { offset: at(T.rise1), transform: 'translateY(-30px) rotate(-390deg)', opacity: 1, easing: 'cubic-bezier(.55,0,.9,.45)' },
    { offset: at(T.rim), transform: 'translateY(55px) rotate(-300deg) scale(.95)', opacity: 1, easing: 'linear' },
    { offset: at(T.drop1), transform: 'translateY(105px) rotate(-280deg) scale(.92)', opacity: 0 },
    { offset: at(T.back0), transform: 'translateY(-70px) rotate(-380deg) scale(.9)', opacity: 0, easing: 'cubic-bezier(.3,.6,.4,1)' },
    { offset: at(T.back1), transform: 'translateY(4px) rotate(-360deg)', opacity: 1, easing: 'ease-out' },
    { offset: at(T.back1 + .15), transform: 'rotate(-360deg)', opacity: 1 }, { offset: 1, transform: 'rotate(-360deg)', opacity: 1 }], o);
  net.animate([{ offset: 0, transform: 'none' }, { offset: at(T.rim - .05), transform: 'none', easing: 'ease-out' }, { offset: at(T.rim + .13), transform: 'scaleY(1.22)', easing: 'ease-in-out' },
    { offset: at(T.rim + .33), transform: 'scaleY(.96)' }, { offset: at(T.rim + .5), transform: 'none' }, { offset: 1, transform: 'none' }], o);
  document.getAnimations().forEach((a) => a.pause());
};
window.seek = (ms) => document.getAnimations().forEach((a) => (a.currentTime = ms));
</script></body></html>`;
}

/**
 * Piste du logo (MOV transparent, QuickTime Animation : seules les lignes qui changent sont stockées → très léger), à superposer en boucle.
 * scale : 1 pour une vidéo 1920×1080 (les Moments 1080×1920 utilisent la même échelle).
 */
export async function bugTrack(browser: Browser, dir: string, scale = 1): Promise<string> {
  const frames = join(dir, 'bug_frames'); rmSync(frames, { recursive: true, force: true }); mkdirSync(frames, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: BUG_W * scale, height: BUG_H * scale }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  try {
    await p.setContent(page(scale), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready.then(() => (window as unknown as { setup: () => void }).setup()));
    const n = Math.round(BUG_ANIM * 30);
    for (let i = 0; i <= n; i++) {
      await p.evaluate((t) => (window as unknown as { seek: (ms: number) => void }).seek(t), Math.min(i * 1000 / 30, BUG_ANIM * 1000 - 1));
      await p.screenshot({ path: join(frames, `${String(i).padStart(4, '0')}.png`), omitBackground: true });
    }
  } finally { await ctx.close(); }
  // Animation puis logo fixe (dernière image) jusqu'à la fin de la minute
  const out = join(dir, 'bug.mov');
  const n = Math.round(BUG_ANIM * 30);
  await ff(['-y', '-framerate', '30', '-i', join(frames, '%04d.png'), '-filter_complex',
    `[0:v]tpad=stop_mode=clone:stop_duration=${(BUG_PERIOD - (n + 1) / 30).toFixed(3)},format=argb[v]`, '-map', '[v]',
    '-t', String(BUG_PERIOD), '-c:v', 'qtrle', '-r', '30', out]);
  rmSync(frames, { recursive: true, force: true });
  return out;
}
