// Bibliothèque Hoop Camp : tous les exercices, par famille
import type { Exercise } from '../types';
import { preparation } from './preparation';
import { balle } from './balle';
import { tir } from './tir';
import { jeu } from './jeu';
import { corps } from './corps';

export const EXERCISES: Exercise[] = [...preparation, ...balle, ...tir, ...jeu, ...corps];
export const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));
export const exercise = (id: string) => BY_ID.get(id);
