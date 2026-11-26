// Affiche de partage SANS PHOTO (aperçu WhatsApp / Facebook des équipes Jeunes) : équipes, logos, score, date.
// Style de la page d'accueil (fond nuit, halos), 1200×630.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Browser } from '@playwright/test';
import type { MatchSettings } from '../../shared/types';

const ROOT = resolve(import.meta.dirname, '../..');
const SITE = process.env.SITE_URL ?? 'https://behoop.be';
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const abs = (u: string) => (/^\/[^/]/.test(u ?? '') ? `${SITE}${u}` : u ?? '');

export async function shareCard(browser: Browser, st: MatchSettings, out: string, moment?: string): Promise<string> {
  const em = readFileSync(join(ROOT, 'icons/emblem.svg'), 'utf8').replace('<svg ', '<svg style="height:64px;width:auto;color:#fff" ');
  const [h, a] = st.scores[3] ?? [0, 0];
  const side = (t: MatchSettings['home'], score: number, win: boolean) => `<div class="t"><div class="l" style="box-shadow:0 0 0 6px ${esc(t.color)}">${t.logo ? `<img src="${esc(abs(t.logo))}">` : ''}</div>
    <div class="n">${esc(t.name)}</div><div class="s${win ? ' w' : ''}">${score}</div></div>`;
  const date = st.date ? new Date(st.date).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;700&family=Oswald:wght@700&family=Anton&display=block" rel="stylesheet"><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden;color:#fff;font-family:Sora,sans-serif;background:radial-gradient(120% 90% at 85% 10%,rgba(242,106,27,.35),transparent 55%),radial-gradient(90% 70% at 0% 100%,rgba(61,143,219,.28),transparent 60%),linear-gradient(160deg,#0a0c12 0%,#121a2b 60%,#0a0c12 100%)}
.top{position:absolute;left:56px;top:40px;display:flex;align-items:center;gap:14px;font-size:40px;letter-spacing:-.035em}.top b{font-weight:300}.top i{font-style:normal;font-weight:700;color:#f5a623}
.k{position:absolute;right:56px;top:52px;font:700 24px Oswald;letter-spacing:.25em;text-transform:uppercase;color:#f2c14e}
.m{position:absolute;left:0;right:0;top:150px;display:flex;justify-content:center;align-items:flex-start;gap:70px}
.t{width:380px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center}
.l{width:150px;height:150px;border-radius:50%;background:#fff;display:grid;place-items:center;overflow:hidden}.l img{width:78%;height:78%;object-fit:contain}
.n{font:700 30px Oswald;text-transform:uppercase;line-height:1.1;max-height:68px;overflow:hidden}
.s{font:110px Anton;line-height:1;opacity:.9}.s.w{color:#f2c14e}.vs{font:56px Anton;opacity:.4;margin-top:190px}
.d{position:absolute;left:0;right:0;bottom:34px;text-align:center;font-size:24px;opacity:.75}
</style></head><body><div class="top">${em}<span><b>Be</b><i>Hoop</i></span></div><div class="k">${moment ? `⚡ ${esc(moment)}` : 'Vidéo du match'}</div>
<div class="m">${side(st.home, h, h > a)}<div class="vs">–</div>${side(st.away, a, a > h)}</div><div class="d">${esc(date)}</div></body></html>`;
  const p = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  try { await p.setContent(html, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.screenshot({ path: out, type: 'jpeg', quality: 86 }); }
  finally { await p.close(); }
  return out;
}
