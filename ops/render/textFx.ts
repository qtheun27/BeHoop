// Textes animés des Moments (« SWISH ! », « AND ONE », texte libre…) : séquences PNG transparentes rendues par Chromium,
// puis posées sur la vidéo par FFmpeg. Même style que l'appli : Anton (mots basket) / Oswald (texte libre), orange BeHoop.
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Browser } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '../..');
export type TextKind = 'hit' | 'free' | 'tag';
/** Hauteur de la zone de texte (px) et position verticale dans la vidéo 1080×1920 */
export const TEXT_H = 560;
export const TEXT_Y: Record<string, number> = { top: 330, mid: 680, low: 1080 };
/** Durée d'affichage (s) */
export const textLen = (k: TextKind, replay = 0) => (k === 'hit' ? 1.6 : k === 'free' ? 2.6 : Math.max(1, replay));

const font = (pkg: string, file: string) => readFileSync(join(ROOT, 'node_modules/@fontsource', pkg, 'files', file)).toString('base64');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(word: string, kind: TextKind, len: number): string {
  const W = kind === 'tag' ? 420 : 1080, H = kind === 'tag' ? 130 : TEXT_H;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Anton;src:url(data:font/woff2;base64,${font('anton', 'anton-latin-400-normal.woff2')}) format('woff2')}
@font-face{font-family:Oswald;font-weight:700;src:url(data:font/woff2;base64,${font('oswald', 'oswald-latin-700-normal.woff2')}) format('woff2')}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:transparent}
.box{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.hit{font-family:Anton,Impact,sans-serif;font-size:170px;line-height:1;text-transform:uppercase;white-space:nowrap;letter-spacing:.01em;transform:skewX(-9deg);
  background:linear-gradient(180deg,#fff 0 46%,#ffd9b8 47%,#f5a623 70%,#f26a1b 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
  -webkit-text-stroke:0;filter:drop-shadow(0 0 0 #0a0c12) drop-shadow(6px 8px 0 #0a0c12) drop-shadow(0 10px 30px rgba(0,0,0,.55))}
.flash{position:absolute;left:-6%;right:-6%;top:50%;height:170px;margin-top:-85px;background:rgba(10,12,18,.82);border-top:7px solid #f26a1b;border-bottom:7px solid #f5a623;transform:skewX(-20deg) scaleX(0);-webkit-mask-image:linear-gradient(90deg,transparent,#000 18%,#000 82%,transparent);mask-image:linear-gradient(90deg,transparent,#000 18%,#000 82%,transparent)}
.free{font-family:Oswald,sans-serif;font-weight:700;font-size:70px;line-height:1.08;color:#fff;text-align:center;max-width:900px;padding:22px 40px;border-radius:26px;
  background:linear-gradient(120deg,#f26a1b,#f5a623);box-shadow:0 12px 40px rgba(0,0,0,.45);transform:skewX(-6deg);overflow-wrap:anywhere}
.tag{font-family:Anton,Impact,sans-serif;font-size:64px;color:#fff;background:#0a0c12d9;border:4px solid #f26a1b;border-radius:18px;padding:6px 26px 4px;display:flex;align-items:center;gap:16px;letter-spacing:.04em}
.tag i{width:22px;height:22px;border-radius:50%;background:#e8363d}
</style></head><body><div class="box">${kind === 'hit' ? `<div class="flash" id="fl"></div><div class="hit" id="w">${esc(word)}</div>`
    : kind === 'free' ? `<div class="free" id="w">${esc(word)}</div>` : `<div class="tag" id="w"><i id="dot"></i>${esc(word)}</div>`}</div>
<script>
const D=${Math.round(len * 1000)}, o={duration:D,fill:'both'}, at=(s)=>Math.min(1,s*1000/D), w=document.getElementById('w');
// Mot trop large : réduit pour tenir dans la largeur
if('${kind}'==='hit'){let fs=170;while(w.scrollWidth>980&&fs>60){fs-=6;w.style.fontSize=fs+'px';}}
if('${kind}'==='hit'){
  w.animate([{offset:0,opacity:0,transform:'skewX(-9deg) scale(2.6) rotate(-4deg)'},{offset:at(.16),opacity:1,transform:'skewX(-9deg) scale(.9) rotate(1deg)',easing:'ease-out'},
    {offset:at(.26),transform:'skewX(-9deg) scale(1.04)'},{offset:at(.34),transform:'skewX(-9deg) scale(1) translate(-7px,3px)'},{offset:at(.40),transform:'skewX(-9deg) scale(1) translate(6px,-3px)'},
    {offset:at(.46),transform:'skewX(-9deg) scale(1)'},{offset:at(1.25),opacity:1,transform:'skewX(-9deg) scale(1.03)',easing:'ease-in'},{offset:1,opacity:0,transform:'skewX(-9deg) scale(1.25) translateX(40px)'}],o);
  document.getElementById('fl').animate([{offset:0,transform:'skewX(-20deg) scaleX(0)',opacity:1},{offset:at(.14),transform:'skewX(-20deg) scaleX(1)',opacity:.95,easing:'ease-out'},
    {offset:at(.5),transform:'skewX(-20deg) scaleX(1)',opacity:.85},{offset:at(1.2),transform:'skewX(-20deg) scaleX(1)',opacity:.85},{offset:1,transform:'skewX(-20deg) scaleX(1.3)',opacity:0}],o);
} else if('${kind}'==='free'){
  w.animate([{offset:0,opacity:0,transform:'skewX(-6deg) translateX(-700px)'},{offset:at(.28),opacity:1,transform:'skewX(-6deg) translateX(20px)',easing:'cubic-bezier(.2,.8,.2,1)'},
    {offset:at(.4),transform:'skewX(-6deg) translateX(0)'},{offset:at(2.25),opacity:1,transform:'skewX(-6deg) translateX(0)',easing:'ease-in'},{offset:1,opacity:0,transform:'skewX(-6deg) translateX(700px)'}],o);
} else {
  w.animate([{offset:0,opacity:0,transform:'translateX(-60px)'},{offset:at(.25),opacity:1,transform:'none'},{offset:at(Math.max(.3,D/1000-.25)),opacity:1},{offset:1,opacity:0}],o);
  document.getElementById('dot').animate([{opacity:1},{opacity:.15},{opacity:1}],{duration:800,iterations:Infinity});
}
document.getAnimations().forEach((a)=>a.pause());
window.seek=(ms)=>document.getAnimations().forEach((a)=>a.currentTime=ms);
</script></body></html>`;
}

/** Rend un texte animé ; renvoie le motif des images (%04d.png), sa taille et sa durée */
export async function textFrames(browser: Browser, dir: string, word: string, kind: TextKind, len = textLen(kind)): Promise<string> {
  const out = join(dir); rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  const W = kind === 'tag' ? 420 : 1080, H = kind === 'tag' ? 130 : TEXT_H;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  try {
    await p.setContent(page(word.slice(0, 60), kind, len), { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    const n = Math.round(len * 30);
    for (let i = 0; i < n; i++) {
      await p.evaluate((t) => (window as unknown as { seek: (ms: number) => void }).seek(t), (i + 0.5) * 1000 / 30);
      await p.screenshot({ path: join(out, `${String(i).padStart(4, '0')}.png`), omitBackground: true });
    }
  } finally { await ctx.close(); }
  return join(out, '%04d.png');
}
