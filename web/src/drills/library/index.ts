// Bibliothèque d'exercices d'entraînement collectif (du mini-basket aux seniors)
import { base } from './base';
import { tir } from './tir';
import { jeu } from './jeu';
import type { Drill } from '../types';

export const DRILLS: Drill[] = [...base, ...tir, ...jeu];
export const DRILL_BY_ID = new Map(DRILLS.map((d) => [d.id, d]));
