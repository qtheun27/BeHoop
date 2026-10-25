// Bibliothèque d'exercices d'entraînement collectif (du mini-basket aux seniors)
import { base } from './base';
import { tir } from './tir';
import { jeu } from './jeu';
import { DEMOS } from './demos';
import type { Drill } from '../types';

export const DRILLS: Drill[] = [...base, ...tir, ...jeu].map((d) => (DEMOS[d.id] ? { ...d, demo: DEMOS[d.id] } : d));
export const DRILL_BY_ID = new Map(DRILLS.map((d) => [d.id, d]));
