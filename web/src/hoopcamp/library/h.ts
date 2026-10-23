// Raccourcis d'écriture de la bibliothèque (dosages et démos)
import type { Dose, Demo, DemoFrame, Exercise } from '../types';

/** Dosage en répétitions : séries × répétitions, repos (s) ; o.sp = secondes par répétition, o.side = des deux côtés */
export const R = (sets: number, reps: number, rest: number, o: { sp?: number; side?: boolean } = {}): Dose =>
  ({ sets, reps, rest, ...(o.sp ? { secPerRep: o.sp } : {}), ...(o.side ? { perSide: true } : {}) });
/** Dosage minuté : séries × secondes d'effort, repos (s) */
export const W = (sets: number, work: number, rest: number, o: { side?: boolean } = {}): Dose =>
  ({ sets, work, rest, ...(o.side ? { perSide: true } : {}) });
/** Étape de démo : position du joueur, ballon éventuel, légende */
export const f = (x: number, y: number, t?: string, b?: [number, number], ms?: number): DemoFrame =>
  ({ p: [x, y], ...(b ? { b } : {}), ...(t ? { t } : {}), ...(ms ? { ms } : {}) });
export const demo = (scene: Demo['scene'], frames: DemoFrame[], extra: Omit<Demo, 'scene' | 'frames'> = {}): Demo => ({ scene, frames, ...extra });
/** Aller-retour sur place (dribble, maniement) : le ballon monte et descend à côté du joueur */
export const bounce = (scene: Demo['scene'], x: number, y: number, side: 1 | -1, ...t: string[]): Demo =>
  demo(scene, (t.length ? t : ['']).flatMap((l, i) => [f(x, y, l || undefined, [x + 6 * side * (i % 2 ? -1 : 1), y + 4], 500), f(x, y, undefined, [x + 4 * side * (i % 2 ? -1 : 1), y - 2], 350)]));
export const list = (...e: Exercise[]) => e;
