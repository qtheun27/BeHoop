// Animations des planches, pilotées uniquement par t (secondes) : aucune dépendance à l'horloge réelle,
// ce qui permet la capture image par image (30 i/s) et l'aperçu en boucle avec exactement le même rendu.
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const prog = (t: number, start: number, dur: number) => clamp((t - start) / dur);
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOutBack = (x: number, s = 1.7) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
export const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
export const DURATIONS = { pre: 6, q1: 5, q2: 5, q3: 5, fin: 8, wipe: 0.6 } as const;
/** Compteur de score : 0 → valeur réelle en 0,8 s avec easing. */
export const count = (t: number, start: number, value: number) => Math.round(value * easeOut(prog(t, start, 0.8)));
export const fadeUp = (t: number, start: number, dur = 0.4, dist = 30) => {
  const p = easeOut(prog(t, start, dur));
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)` };
};
/** Éclaircit une couleur en gardant sa saturation (#8a1e36 → ≈ #c2304f, comme la référence). */
export function lighten(hex: string, dl = 0.14) {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = d === 0 ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${Math.min(90, (l + dl) * 100).toFixed(0)}%)`;
}
