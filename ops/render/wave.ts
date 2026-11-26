// Transition « vague » des Moments (vertical 1080×1920) : rideau diagonal aux couleurs des deux clubs + orange BeHoop,
// logo au centre. Le rideau couvre tout l'écran au milieu de la transition : c'est là que l'on passe d'un passage à l'autre.
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Browser } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '../..');
/** Durée de la transition (s) et instant de la coupure dans la transition (s) */
export const WAVE_LEN = 0.7, WAVE_CUT = 0.35;

export async function waveFrames(browser: Browser, dir: string, colors: [string, string]): Promise<string> {
  const out = join(dir, 'wave'); rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  const svg = readFileSync(join(ROOT, 'shared/emblem-anim.svg'), 'utf8');
  const safe = (c: string) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : '#0d2a5c');
  const [c1, c2] = colors.map(safe);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:transparent}
.cur{position:absolute;top:0;left:0;height:1920px;width:3000px;display:flex;transform-origin:center}
.cur i{display:block;height:100%}
.em{position:absolute;left:50%;top:50%;width:420px;margin:-243px 0 0 -210px;filter:drop-shadow(0 16px 40px rgba(0,0,0,.45))}
.em svg{width:420px;height:auto;overflow:visible;color:#fff}
</style></head><body>
<div class="cur" id="cur"><i style="width:30%;background:${c1}"></i><i style="width:8%;background:#fff"></i><i style="width:24%;background:#f26a1b"></i><i style="width:8%;background:#fff"></i><i style="width:30%;background:${c2}"></i></div>
<div class="em" id="em">${svg}</div>
<script>
const D=${WAVE_LEN * 1000}, o={duration:D,fill:'both'};
// Rideau de 3000 px : au milieu (-960 px) il déborde largement des deux côtés, inclinaison comprise → l'écran est
// entièrement couvert pendant plusieurs images autour de la coupure
document.getElementById('cur').animate([{transform:'translateX(-3660px) skewX(-18deg)'},{transform:'translateX(1740px) skewX(-18deg)'}],{...o,easing:'cubic-bezier(.6,0,.4,1)'});
document.getElementById('em').animate([{offset:0,opacity:0,transform:'scale(.6)'},{offset:.2,opacity:0,transform:'scale(.6)',easing:'cubic-bezier(.2,.8,.2,1)'},
  {offset:.45,opacity:1,transform:'scale(1)'},{offset:.62,opacity:1,transform:'scale(1.04)'},{offset:.8,opacity:0,transform:'scale(1.18)'},{offset:1,opacity:0,transform:'scale(1.18)'}],o);
document.getAnimations().forEach((a)=>a.pause());
window.seek=(ms)=>document.getAnimations().forEach((a)=>a.currentTime=ms);
</script></body></html>`;
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  try {
    await p.setContent(html, { waitUntil: 'load' });
    const n = Math.round(WAVE_LEN * 30);
    for (let i = 0; i < n; i++) {
      await p.evaluate((t) => (window as unknown as { seek: (ms: number) => void }).seek(t), (i + 0.5) * 1000 / 30);
      await p.screenshot({ path: join(out, `${String(i).padStart(4, '0')}.png`), omitBackground: true });
    }
  } finally { await ctx.close(); }
  return join(out, '%04d.png');
}
