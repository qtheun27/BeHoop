// Bibliothèques du coach (Espace Club) : exercices d'entraînement collectif et tactiques animées.
// Données pures (aucune dépendance au navigateur) : servent au Playbook, à la préparation des séances et aux tests.
import { AGES, type Age } from '../hoopcamp/types';
export { AGES, type Age };

export const THEMES = ['echauffement', 'motricite', 'dribble', 'passe', 'tir', 'finition', 'un_contre_un', 'defense', 'rebond', 'transition', 'collectif', 'jeu', 'physique', 'retour'] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_LABEL: Record<Theme, string> = {
  echauffement: 'Échauffement', motricite: 'Motricité', dribble: 'Dribble', passe: 'Passes', tir: 'Tir', finition: 'Finitions', un_contre_un: '1 contre 1',
  defense: 'Défense', rebond: 'Rebond', transition: 'Transition', collectif: 'Jeu collectif', jeu: 'Jeux', physique: 'Physique', retour: 'Retour au calme',
};

/** Exercice d'entraînement collectif */
export interface Drill {
  id: string; name: string; theme: Theme;
  minAge: Age; maxAge: Age;
  /** Durée conseillée en minutes (le coach la change dans sa séance) */
  min: number;
  /** Nombre de joueurs conseillé (« 6+ », « 2 par panier »…) */
  players: string;
  equip: string;
  goal: string; setup: string; steps: string[];
  /** Points clés du coach */
  points: string[];
  variants?: string[];
}

export const CATS = ['principes', 'attaque', 'zone', 'remise', 'defense', 'presse', 'transition', 'fin'] as const;
export type PlayCat = (typeof CATS)[number];
export const CAT_LABEL: Record<PlayCat, string> = {
  principes: 'Principes de jeu', attaque: 'Attaque placée', zone: 'Attaque de zone', remise: 'Remises en jeu', defense: 'Défenses',
  presse: 'Presses', transition: 'Transition', fin: 'Fin de match',
};
export interface Tok { id: string; type: 'offense' | 'defense' | 'ball'; label: string; x: number; y: number }
export interface Frame { tokens: Tok[]; t: string }
/** Tactique animée (même moteur que le Playbook : étapes de jetons sur le terrain) */
export interface Tactic {
  id: string; name: string; cat: PlayCat; minAge: Age;
  mode: 'half' | 'full';
  /** À quoi ça sert, en une ou deux phrases */
  desc: string;
  /** Points clés */
  keys: string[];
  frames: Frame[];
}

export const ageLabel = (a: Age) => (a === 'U21' ? 'Seniors' : a);
export const ageRange = (a: Age, b: Age) => (a === b ? ageLabel(a) : `${ageLabel(a)}–${ageLabel(b)}`);
export const fitsAge = (x: { minAge: Age; maxAge?: Age }, a: Age | null) => !a || (AGES.indexOf(x.minAge) <= AGES.indexOf(a) && AGES.indexOf(a) <= AGES.indexOf(x.maxAge ?? 'U21'));
