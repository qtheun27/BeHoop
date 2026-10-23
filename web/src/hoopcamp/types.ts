// Hoop Camp : programmes d'entraînement individuels (Espace Club).
// Types partagés par la bibliothèque d'exercices, le générateur de séances, l'appli et les tests.
// Aucune dépendance au navigateur ni à Firebase.

/** Catégories d'âge (U21 = U21 et seniors) */
export const AGES = ['U8', 'U10', 'U12', 'U14', 'U16', 'U18', 'U21'] as const;
export type Age = (typeof AGES)[number];

export const FAMILIES = ['echauffement', 'mobilite', 'maniement', 'dribble', 'tir_mecanique', 'tir', 'finition', 'passe', 'appuis', 'defense',
  'physique', 'coordination', 'retour_calme', 'tete'] as const;
export type Family = (typeof FAMILIES)[number];

/** Moments d'une séance, dans l'ordre */
export const PHASES = ['echauffement', 'technique', 'application', 'physique', 'retour'] as const;
export type Phase = (typeof PHASES)[number];

export const EQUIPMENT = ['ballon', 'ballon2', 'mur', 'corde', 'plots', 'tennis', 'echelle', 'elastique', 'banc', 'miroir'] as const;
export type Equip = (typeof EQUIPMENT)[number];

/** aucun panier / panier disponible / terrain complet (panier + place pour courir d'un panier à l'autre) */
export type Basket = 'aucun' | 'panier' | 'terrain';
/** petit : sur place, pas de course ; moyen : ~10 m de course ; grand : playground, salle, terrain */
export type Space = 'petit' | 'moyen' | 'grand';
export type Surface = 'interieur' | 'exterieur' | 'herbe';
export const GOALS = ['main_faible', 'dribble', 'tir', 'finition', 'passe', 'defense', 'physique', 'coordination', 'jeu'] as const;
export type Goal = (typeof GOALS)[number];
/** Niveau d'un exercice : 1 découverte, 2 base, 3 confirmé, 4 expert */
export type Level = 1 | 2 | 3 | 4;

/** Dosage d'un exercice pour une catégorie d'âge.
 *  Durée d'une série = work (secondes) OU reps × secPerRep ; doublée si perSide (main droite puis gauche, côté gauche puis droit).
 *  Durée totale = sets × série + (sets − 1) × rest + mise en place. Jamais estimée « à la louche ». */
export interface Dose {
  sets: number;
  /** Répétitions par série (par main/côté si perSide) */
  reps?: number;
  /** Temps d'effort par série, en secondes (par main/côté si perSide) */
  work?: number;
  /** Repos entre deux séries, en secondes */
  rest: number;
  /** Secondes par répétition (défaut 3) : sert au calcul de durée quand le dosage est en répétitions */
  secPerRep?: number;
  /** Chaque série est faite des deux côtés (main droite / main gauche, jambe gauche / droite…) */
  perSide?: boolean;
}

/** Démonstration animée, rejouée par le moteur du tableau Tactique (SVG).
 *  Repère : zone de 100 × 100 vue de dessus ; y = 0 en haut (côté panier ou mur), x de gauche à droite. */
export interface DemoFrame {
  /** Position du joueur */
  p: [number, number];
  /** Position du ballon (absent : ballon en main, collé au joueur) ; 2e ballon éventuel */
  b?: [number, number]; b2?: [number, number];
  /** Légende courte affichée pendant l'étape */
  t?: string;
  /** Durée de la transition vers cette étape (ms, défaut 900) */
  ms?: number;
}
export interface Demo {
  /** Décor : demi-terrain avec panier, mur en haut, ou espace libre */
  scene: 'panier' | 'mur' | 'libre';
  /** Plots (ou bouteilles) */
  cones?: [number, number][];
  /** Échelle de rythme : coin haut-gauche, nombre de cases (verticale) */
  ladder?: { x: number; y: number; n: number };
  frames: DemoFrame[];
}

export interface Exercise {
  /** Identifiant stable (kebab-case), préfixé par la famille : « dri-crossover-sur-place » */
  id: string;
  name: string;
  family: Family;
  /** Moment de séance (défaut selon la famille ; « application » = forme jouée ou enchaînement proche du match) */
  phase?: Phase;
  /** Compétences travaillées (mots courts) */
  skills: string[];
  /** Objectifs du profil que l'exercice sert (pour l'équilibre selon les objectifs) */
  goals: Goal[];
  minAge: Age; maxAge: Age;
  level: Level;
  needs: {
    /** Panier nécessaire ('panier') ou terrain complet ('terrain') ; absent = sans panier */
    basket?: 'panier' | 'terrain';
    /** Espace minimal (défaut 'petit') */
    space?: Space;
    /** Surfaces possibles (absent = toutes) */
    surfaces?: Surface[];
    /** Matériel indispensable (le ballon compris quand il en faut un) */
    equip?: Equip[];
  };
  /** Dosage par catégorie : la catégorie du joueur, sinon la plus proche en dessous, sinon la plus jeune définie */
  dose: Partial<Record<Age, Dose>>;
  /** Mise en place en secondes (défaut 20) */
  setupSec?: number;
  /** Objectif, en une phrase pour un enfant de 10 ans */
  goal: string;
  /** Mise en place (matériel, position de départ) */
  setup: string;
  steps: string[];
  /** « Le truc du coach » */
  tip: string;
  /** Erreurs fréquentes (« à éviter ») */
  errors: string[];
  safety?: string;
  /** Exercice plus dur (débloqué quand celui-ci est maîtrisé) / plus facile */
  progression?: string;
  regression?: string;
  /** Exercices de remplacement quand le matériel ou le lieu manque (ex. tir au mur au lieu du tir au panier) */
  alternatives?: string[];
  /** Variantes selon le matériel (texte libre) */
  variants?: string[];
  /** Travaille la main faible : le générateur le favorise pour l'objectif « main faible » */
  weakHand?: boolean;
  /** Forme jouée / défi (petits) */
  game?: boolean;
  /** Pas de chrono (ex. analyse vidéo) : la durée vient du dosage en minutes (work) */
  untimed?: boolean;
  demo?: Demo;
}

/** Profil d'entraînement d'un joueur */
export interface TrainingProfile {
  age: Age;
  /** 1 débutant, 2 intermédiaire, 3 avancé */
  level: 1 | 2 | 3;
  hand: 'droite' | 'gauche';
  basket: Basket;
  /** Panier à hauteur réglable */
  adjustable?: boolean;
  space: Space;
  surface: Surface;
  equip: Equip[];
  minutes: 15 | 30 | 45 | 60;
  days: number;
  goals: Goal[];
}

export type Rating = 'revoir' | 'correct' | 'maitrise';

/** Programme Hoop Camp (prêt à l'emploi ou personnalisé par un coach) */
export interface Program {
  id: string;
  name: string;
  /** Pitch court affiché sur la carte */
  desc: string;
  emoji: string;
  /** Durée en jours (0 = sans fin) */
  days: number;
  /** Séances par semaine conseillées */
  perWeek: number;
  minAge?: Age; maxAge?: Age;
  /** Objectifs mis en avant (s'ajoutent à ceux du profil) */
  goals: Goal[];
  /** Poids par famille (multiplie l'intérêt d'une famille) */
  weights?: Partial<Record<Family, number>>;
  /** Familles exclues */
  exclude?: Family[];
  /** Temps par jour imposé (sinon celui du profil) */
  minutes?: TrainingProfile['minutes'];
  /** Formes jouées en priorité (petits) */
  games?: boolean;
  /** Sans panier, même si le joueur en a un */
  noBasket?: boolean;
}

/** Un exercice dans la séance du jour */
export interface SessionItem { ex: string; phase: Phase; dose: Dose; sec: number; /** nouvel exercice / révision due */ kind: 'new' | 'review' | 'keep' }
export interface Session { date: string; program: string; items: SessionItem[]; sec: number; target: number }

/** État de répétition espacée d'un exercice (calculé à partir des validations) */
export interface Card { box: number; due: string; last: string; seen: number; mastered: boolean; lastRating?: Rating }
export type History = Record<string, Card>;
