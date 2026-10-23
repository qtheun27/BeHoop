// Programmes Hoop Camp prêts à l'emploi (le coach peut les personnaliser)
import type { Program } from './types';

export const PROGRAMS: Program[] = [
  { id: 'camp-1', name: 'Camp Vacances 1 semaine', emoji: '🏕️', days: 7, perWeek: 6, goals: ['dribble', 'tir', 'finition'],
    desc: 'Une semaine pour tout travailler un peu : dribble, tir, finitions et physique.' },
  { id: 'camp-2', name: 'Camp Vacances 2 semaines', emoji: '⛺', days: 14, perWeek: 5, goals: ['dribble', 'tir', 'finition', 'defense'],
    desc: 'Deux semaines de progrès réguliers, avec des révisions et de nouveaux exercices chaque jour.' },
  { id: 'main-faible', name: 'Main faible', emoji: '🫲', days: 21, perWeek: 5, goals: ['main_faible', 'dribble', 'finition'],
    weights: { maniement: 1.4, dribble: 1.5, finition: 1.3, tir: 0.6, tir_mecanique: 0.6 },
    desc: 'Trois semaines pour que ta main faible devienne une vraie arme.' },
  { id: 'shooteur', name: 'Shooteur', emoji: '🎯', days: 21, perWeek: 5, goals: ['tir'],
    weights: { tir: 2, tir_mecanique: 1.8, finition: 0.8, dribble: 0.6, defense: 0.5 },
    desc: 'Un geste de tir propre et régulier : de la mécanique au mur jusqu’au tir après dribble.' },
  { id: 'sans-panier', name: 'Dribble sans panier', emoji: '🏠', days: 14, perWeek: 6, goals: ['dribble', 'main_faible', 'coordination'], noBasket: true,
    weights: { maniement: 1.5, dribble: 1.6, coordination: 1.2, tir_mecanique: 0.8 },
    desc: 'Pas de panier ? Pas de problème : maniement, dribble et coordination, même dans un petit espace.' },
  { id: 'prepa-saison', name: 'Prépa saison', emoji: '💪', days: 21, perWeek: 4, minAge: 'U12', goals: ['physique', 'defense', 'coordination'],
    weights: { physique: 1.8, coordination: 1.3, defense: 1.3, appuis: 1.2 },
    desc: 'Être prêt dès le premier match : jambes, gainage, appuis et défense.' },
  { id: 'petits', name: 'Spécial petits', emoji: '🧸', days: 14, perWeek: 4, maxAge: 'U10', goals: ['coordination', 'dribble'], games: true,
    weights: { coordination: 1.3, physique: 0.8 },
    desc: 'Pour les U8–U10 : des jeux et des défis courts, pour apprendre en s’amusant.' },
  { id: 'libre', name: 'Mon programme', emoji: '⭐', days: 0, perWeek: 4, goals: [],
    desc: 'Selon tes objectifs, sans date de fin.' },
];
export const program = (id: string) => PROGRAMS.find((p) => p.id === id);
