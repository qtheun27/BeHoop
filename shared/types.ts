// Types partagés entre l'appli, le Worker et les scripts de rendu.
export type AgeGroup = 'jeunes' | 'seniors';
export type Visibility = 'public' | 'team';
export type PlancheType = 'pre' | 'q1' | 'q2' | 'q3' | 'fin' | 'wipe';

export interface TeamSide {
  name: string;         // nom affiché (« Union Mons Hainaut »)
  logo: string;         // URL du logo
  color: string;        // couleur principale (liseré, bandes)
  awbbTeamId?: number;
}

/** Scores cumulés : [domicile, visiteurs] en fin de Q1, Q2, Q3, final. */
export type CumulativeScores = [number, number][];

export interface MediaItem {
  id: string;
  r2Key: string;
  kind: 'video' | 'photo';
  name: string;
  takenAt: number;          // ms epoch (date de prise de vue)
  duration?: number;        // s, vidéos
  width?: number; height?: number;
  quarter?: 1 | 2 | 3 | 4;
  order?: number;
  excluded?: boolean;
  offPlay?: boolean;        // hors jeu : exclu des mosaïques
  featured?: boolean;       // photo vedette du quart
  scoreboardOfQuarter?: 1 | 2 | 3 | 4 | null; // photo du tableau « fin du quart N »
  thumb?: string;
}

export interface MatchSettings {
  home: TeamSide;
  away: TeamSide;
  date: string;   // AAAA-MM-JJ
  time: string;   // HH:MM
  venue: string;
  competition: string;
  scores: CumulativeScores; // longueur 4
  title: string;
  /** Photos (URL) utilisées par planche, par ordre d'importance */
  photos: { pre?: string; q1: string[]; q2: string[]; q3: string[]; fin: string[] };
}

/** Firestore n'accepte pas les tableaux imbriqués : les scores y sont stockés en [{ home, away }]. */
export type StoredSettings = Omit<MatchSettings, 'scores'> & { scores: { home: number; away: number }[] };
export const settingsToStore = (s: MatchSettings): StoredSettings => ({ ...s, scores: s.scores.map(([home, away]) => ({ home, away })) });
export const settingsFromStore = (s: StoredSettings | MatchSettings): MatchSettings =>
  ({ ...s, scores: (s.scores as any[]).map((x) => (Array.isArray(x) ? x : [x.home, x.away])) as CumulativeScores });
