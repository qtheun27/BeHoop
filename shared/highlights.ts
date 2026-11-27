// Moments forts d'un match : à partir du bruit de la salle (cris après un panier, un contre…) et du mouvement dans l'image,
// mesurés toutes les 0,25 s pendant les quarts. Aucun score n'est déduit : seulement des instants à proposer pour un Moment.
import type { Chapter } from './chapters';

export const HL_STEP = 0.25; // s entre deux mesures
export interface Highlight { t: number; a: number; b: number; s: number }

const median = (x: number[]) => { const s = [...x].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : 0; };
/** Écart à la normale du moment (médiane glissante sur ±15 s), en « nombre d'écarts typiques » */
function excite(x: number[], half = Math.round(15 / HL_STEP)): number[] {
  const out = new Array(x.length).fill(0);
  for (let i = 0; i < x.length; i += 4) { // médiane recalculée toutes les secondes (suffisant, bien plus rapide)
    const w = x.slice(Math.max(0, i - half), i + half), m = median(w), mad = median(w.map((v) => Math.abs(v - m))) || 1e-6;
    for (let j = i; j < Math.min(x.length, i + 4); j++) out[j] = (x[j] - m) / (1.4826 * mad);
  }
  return out;
}
const smooth = (x: number[], r: number) => x.map((_, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - r); j <= Math.min(x.length - 1, i + r); j++) { s += x[j]; n++; } return s / n; });

/**
 * rmsDb : niveau sonore (dB) par pas de 0,25 s ; motion : différence moyenne entre images par pas ; cuts : instants de coupure
 * (changement de séquence filmée) à éviter. Renvoie les moments forts, du plus fort au plus faible.
 */
export function findHighlights(rmsDb: number[], motion: number[], chapters: Chapter[], cuts: number[] = [], max = 12): Highlight[] {
  const n = Math.min(rmsDb.length, motion.length);
  if (n < 40) return [];
  const qs = chapters.filter((c) => /^Q\d$/.test(c.title));
  const inQ = (t: number) => qs.find((c) => t >= c.start + 2.5 && t <= c.end - 2.5);
  const nearCut = (t: number) => cuts.some((c) => Math.abs(c - t) < 2);
  const za = excite(rmsDb.slice(0, n)), zm = excite(motion.slice(0, n));
  const sc = smooth(za.map((v, i) => 0.75 * Math.max(-2, Math.min(8, v)) + 0.25 * Math.max(-2, Math.min(8, zm[i]))), Math.round(0.75 / HL_STEP));
  // Pics : maximum local, assez marqué, loin des coupures et des limites des quarts, au moins 15 s entre deux
  const cand: { i: number; s: number }[] = [];
  for (let i = 1; i < n - 1; i++) { const t = i * HL_STEP; if (sc[i] >= 1.6 && sc[i] >= sc[i - 1] && sc[i] > sc[i + 1] && inQ(t) && !nearCut(t)) cand.push({ i, s: sc[i] }); }
  cand.sort((p, q) => q.s - p.s);
  const kept: { i: number; s: number }[] = [];
  for (const c of cand) { if (kept.every((k) => Math.abs(k.i - c.i) * HL_STEP >= 15)) kept.push(c); if (kept.length >= max) break; }
  const top = kept[0]?.s ?? 1;
  return kept.map(({ i, s }) => {
    const t = i * HL_STEP, q = inQ(t)!;
    // L'action précède la réaction de la salle : passage de 7 s avant à 2 s après le pic, sans sortir du quart
    const a = Math.max(q.start, t - 7), b = Math.min(q.end, Math.max(a + 5, t + 2));
    return { t: Math.round(t * 10) / 10, a: Math.round(a * 10) / 10, b: Math.round(b * 10) / 10, s: Math.round((s / top) * 100) / 100 };
  });
}

/** Proposition de Moment : les meilleurs moments forts (sans chevauchement), remis dans l'ordre du match, ≤ total s */
export function proposeMoment(h: Highlight[], count = 4, total = 60): { a: number; b: number }[] {
  const out: Highlight[] = []; let sum = 0;
  for (const x of [...h].sort((p, q) => q.s - p.s)) {
    if (out.length >= count) break;
    if (out.some((o) => x.a < o.b && x.b > o.a) || sum + (x.b - x.a) > total) continue;
    out.push(x); sum += x.b - x.a;
  }
  return out.sort((p, q) => p.a - q.a).map(({ a, b }) => ({ a, b }));
}
