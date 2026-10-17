// Génère une image 1080×1350 de la carte de score (style planches) et ouvre le partage (WhatsApp…).
import type { ScorePayload } from '../screens/Feed';
import { dotted } from './util';

const loadImg = (src?: string | null) => new Promise<HTMLImageElement | null>((res) => {
  if (!src) return res(null);
  const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
});

export async function renderScoreCanvas(p: ScorePayload): Promise<HTMLCanvasElement> {
  await document.fonts.load('100px Anton'); await document.fonts.load('700 40px Oswald');
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0a0c12'; g.fillRect(0, 0, 1080, 1350);
  // bandes diagonales 115°
  const band = (x: number, w: number, col: string) => { g.save(); g.translate(x, 0); g.transform(1, 0, Math.tan(-25 * Math.PI / 180), 1, 0, 0); g.fillStyle = col; g.globalAlpha = .75; g.fillRect(0, 0, w, 1350); g.restore(); };
  band(1080 * .78, 70, p.away.color ?? '#8a1e36'); band(1080 * .78 + 86, 22, p.home.color ?? '#3d8fdb');
  g.globalAlpha = .07; g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.arc(540, 675, 180, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
  g.textAlign = 'center'; g.fillStyle = '#f2c14e'; g.font = '600 30px Oswald'; g.letterSpacing = '10px';
  g.fillText(`${p.competition} · ${dotted(p.date)}`.toUpperCase(), 540, 150);
  g.letterSpacing = '0px'; g.fillStyle = '#fff'; g.font = '130px Anton'; g.fillText('SCORE FINAL', 540, 300);
  const [lh, la] = await Promise.all([loadImg(p.home.logo), loadImg(p.away.logo)]);
  const disc = (x: number, y: number, img: HTMLImageElement | null, ring: string, name: string) => {
    g.beginPath(); g.arc(x, y, 150, 0, Math.PI * 2); g.fillStyle = ring; g.fill();
    g.beginPath(); g.arc(x, y, 140, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    if (img) { const s = 220, r = Math.min(s / img.width, s / img.height); g.drawImage(img, x - img.width * r / 2, y - img.height * r / 2, img.width * r, img.height * r); }
    else { g.fillStyle = '#0a0c12'; g.font = '90px Anton'; g.fillText(name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(), x, y + 32); }
  };
  disc(270, 560, lh, p.home.color ?? '#3d8fdb', p.home.name); disc(810, 560, la, p.away.color ?? '#8a1e36', p.away.name);
  g.font = '700 40px Oswald'; g.fillStyle = '#fff';
  const wrap = (t: string, x: number, y: number) => { const w = t.toUpperCase().split(' '); let l = '', yy = y; for (const x2 of w) { if (g.measureText(l + x2).width > 420) { g.fillText(l.trim(), x, yy); l = ''; yy += 46; } l += x2 + ' '; } g.fillText(l.trim(), x, yy); };
  wrap(p.home.name, 270, 770); wrap(p.away.name, 810, 770);
  g.font = '300px Anton';
  const lead = p.home.score === p.away.score ? 0 : p.home.score > p.away.score ? 1 : 2;
  g.fillStyle = lead === 1 ? '#f2c14e' : '#fff'; g.fillText(String(p.home.score), 300, 1150);
  g.fillStyle = lead === 2 ? '#f2c14e' : '#fff'; g.fillText(String(p.away.score), 780, 1150);
  g.globalAlpha = .5; g.fillStyle = '#fff'; g.font = '150px Anton'; g.fillText('–', 540, 1100); g.globalAlpha = 1;
  g.font = '600 26px Oswald'; g.fillStyle = 'rgba(255,255,255,.55)'; g.letterSpacing = '8px'; g.fillText('BEHOOP.BE', 540, 1290);
  return c;
}

export async function shareScoreImage(p: ScorePayload) {
  const c = await renderScoreCanvas(p);
  const blob = await new Promise<Blob | null>((r) => { try { c.toBlob(r, 'image/png'); } catch { r(null); } });
  if (!blob) throw new Error('Image indisponible');
  const file = new File([blob], `score-${p.gameId}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: `${p.home.name} ${p.home.score} – ${p.away.score} ${p.away.name} · behoop.be` });
  else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); }
}
