import type { Age, Drill, Theme } from '../types';
/** Écriture compacte d'un exercice : id, nom, thème, âges, minutes, joueurs, matériel, objectif, mise en place, étapes, points clés, variantes */
export const D = (id: string, name: string, theme: Theme, minAge: Age, maxAge: Age, min: number, players: string, equip: string,
  goal: string, setup: string, steps: string[], points: string[], variants?: string[]): Drill => ({ id, name, theme, minAge, maxAge, min, players, equip, goal, setup, steps, points, ...(variants ? { variants } : {}) });
