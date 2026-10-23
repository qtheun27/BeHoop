// Moteur Hoop Camp : durées calculées, compatibilité avec le profil, répétition espacée, générateur de séances, motivation.
// Fonctions pures et déterministes (même entrée → même séance) ; testées dans ops/test/hoopcamp.test.ts.
import { AGES, type Age, type Card, type Dose, type Exercise, type Family, type History, type Phase, type Program, type Rating,
  type Session, type SessionItem, type Space, type TrainingProfile } from './types';

// ---------- Dates (chaînes AAAA-MM-JJ, sans fuseau) ----------
export const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
export const today = (now = new Date()) => new Date(now.getTime() - now.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

// ---------- Dosage et durée ----------
const ageIdx = (a: Age) => AGES.indexOf(a);
/** Dosage pour l'âge : la catégorie, sinon la plus proche en dessous, sinon la plus jeune définie */
export function doseFor(e: Exercise, age: Age): Dose {
  const defined = AGES.filter((a) => e.dose[a]);
  const below = defined.filter((a) => ageIdx(a) <= ageIdx(age));
  return e.dose[below.length ? below[below.length - 1] : defined[0]]!;
}
/** Durée d'une série (secondes, les deux côtés compris) */
export const setSec = (d: Dose) => (d.work ?? (d.reps ?? 0) * (d.secPerRep ?? 3)) * (d.perSide ? 2 : 1);
/** Durée totale calculée : séries + repos entre séries + mise en place, arrondie aux 5 s */
export const doseSec = (d: Dose, setup = 20) => Math.round((d.sets * setSec(d) + Math.max(0, d.sets - 1) * d.rest + setup) / 5) * 5;
export const exSec = (e: Exercise, d: Dose) => doseSec(d, e.untimed ? 0 : e.setupSec ?? 20);
/** « 4 min 30 », « 45 s » */
export const fmtDur = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${String(s % 60).padStart(2, '0')}` : ''}`);
export function fmtDose(d: Dose) {
  const one = d.work ? fmtDur(d.work) : `${d.reps} rép.`;
  return `${d.sets > 1 ? `${d.sets} × ` : ''}${one}${d.perSide ? ' par côté' : ''}${d.sets > 1 && d.rest ? ` · repos ${fmtDur(d.rest)}` : ''}`;
}

// ---------- Compatibilité ----------
const SPACE: Space[] = ['petit', 'moyen', 'grand'];
export const phaseOf = (e: Exercise): Phase => e.phase ?? (
  e.family === 'echauffement' || e.family === 'mobilite' ? 'echauffement'
    : e.family === 'physique' || e.family === 'coordination' ? 'physique'
      : e.family === 'retour_calme' ? 'retour' : e.family === 'tete' ? 'application' : 'technique');

/** L'exercice est-il faisable avec ce profil (âge, niveau, panier, espace, surface, matériel) et ce programme ? */
export function feasible(e: Exercise, p: TrainingProfile, prog?: Program): boolean {
  const a = ageIdx(p.age);
  if (a < ageIdx(e.minAge) || a > ageIdx(e.maxAge)) return false;
  if (e.level > p.level + 1) return false;
  const basket = prog?.noBasket ? 'aucun' : p.basket;
  if (e.needs.basket === 'panier' && basket === 'aucun') return false;
  if (e.needs.basket === 'terrain' && basket !== 'terrain') return false;
  if (SPACE.indexOf(e.needs.space ?? 'petit') > SPACE.indexOf(p.space)) return false;
  if (e.needs.surfaces && !e.needs.surfaces.includes(p.surface)) return false;
  if (e.needs.equip?.some((q) => !p.equip.includes(q))) return false;
  if (prog?.exclude?.includes(e.family)) return false;
  return true;
}

// ---------- Répétition espacée ----------
/** Intervalles (jours) par boîte 0 à 5 */
export const INTERVALS = [1, 1, 2, 4, 7, 12];
/** Nouvelle carte après une validation : À revoir → boîte 0, Correct → +1, Maîtrisé → +2 */
export function review(c: Card | undefined, r: Rating, date: string): Card {
  const box = r === 'revoir' ? 0 : Math.min(5, (c?.box ?? 0) + (r === 'correct' ? 1 : 2));
  return { box, due: addDays(date, INTERVALS[box]), last: date, seen: (c?.seen ?? 0) + 1, mastered: !!c?.mastered || r === 'maitrise', lastRating: r };
}

/** Journée d'entraînement telle qu'enregistrée (hoopcamp/{joueur}/days/{date}) */
export interface RatingEntry { r: Rating; by?: string; name?: string; msg?: string; at?: number }
export interface DayLog {
  date: string; program?: string; items: SessionItem[];
  /** Exercices cochés (horodatage) */
  checks?: Record<string, number>;
  note?: string;
  /** Validations d'un parent ou du coach */
  ratings?: Record<string, RatingEntry>;
  /** Auto-évaluation (seulement pour un joueur sans parent ni coach lié) */
  selfRatings?: Record<string, RatingEntry>;
}
/** Validation retenue pour un exercice : celle d'un adulte d'abord, sinon l'auto-évaluation */
export const ratingOf = (d: DayLog, ex: string): (RatingEntry & { self?: boolean }) | undefined =>
  d.ratings?.[ex] ?? (d.selfRatings?.[ex] ? { ...d.selfRatings[ex], self: true } : undefined);

/** Historique de répétition espacée reconstruit à partir des journées (ordre chronologique).
 *  Un exercice coché mais pas encore validé revient le lendemain s'il est nouveau ; sa boîte ne bouge pas. */
export function historyFrom(days: DayLog[]): History {
  const h: History = {};
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const it of d.items) {
      const r = ratingOf(d, it.ex);
      if (r) h[it.ex] = review(h[it.ex], r.r, d.date);
      else if (d.checks?.[it.ex]) {
        const c = h[it.ex];
        h[it.ex] = c ? { ...c, last: d.date, seen: c.seen + 1 } : { box: 0, due: addDays(d.date, 1), last: d.date, seen: 1, mastered: false };
      }
    }
  }
  return h;
}

// ---------- Générateur ----------
/** Part du temps par moment de séance */
const SHARE: Record<Phase, number> = { echauffement: 0.16, technique: 0.42, application: 0.16, physique: 0.16, retour: 0.1 };
const ORDER: Phase[] = ['echauffement', 'technique', 'application', 'physique', 'retour'];
/** Exercices au maximum par moment (séances courtes et lisibles : on allonge les séries plutôt que d'empiler les exercices) */
const MAX_N: Record<number, Record<Phase, number>> = {
  15: { echauffement: 2, technique: 2, application: 1, physique: 1, retour: 1 },
  30: { echauffement: 2, technique: 3, application: 1, physique: 2, retour: 1 },
  45: { echauffement: 3, technique: 4, application: 2, physique: 2, retour: 2 },
  60: { echauffement: 3, technique: 5, application: 2, physique: 3, retour: 2 },
};
/** Nouveaux exercices au maximum par séance */
const NEW_MAX: Record<number, number> = { 15: 1, 30: 2, 45: 3, 60: 3 };

/** Petit hachage déterministe (FNV-1a) → [0, 1) */
function rnd(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10007) / 10007; }

export interface GenInput {
  profile: TrainingProfile; program: Program; history: History; date: string;
  /** Exercices de la séance précédente (pas deux séances identiques d'affilée) */
  prev?: string[];
  /** Bibliothèque (injectée pour les tests) */
  library: Exercise[];
  /** Variante (séance bonus) */
  seed?: number;
}

/** Exercices verrouillés : une progression ne se débloque que quand l'exercice qui y mène est maîtrisé */
export function locked(pool: Exercise[], h: History): Set<string> {
  const out = new Set<string>();
  for (const e of pool) if (e.progression && !h[e.id]?.mastered) out.add(e.progression);
  return out;
}

/** Séance du jour : échauffement → technique → application → physique/coordination → retour au calme ; durée à ±10 %. */
export function generate(inp: GenInput): Session {
  const { profile: p, program: prog, history: h, date, prev = [], library, seed = 0 } = inp;
  const minutes = prog.minutes ?? p.minutes;
  const target = minutes * 60;
  const goals = new Set([...p.goals, ...prog.goals]);
  const pool = library.filter((e) => feasible(e, p, prog));
  const lock = locked(pool, h);
  const avail = pool.filter((e) => !lock.has(e.id));
  const small = ageIdx(p.age) <= ageIdx('U10');
  const prevSet = new Set(prev);
  const famUsed = new Map<Family, number>();
  let news = 0;
  const newMax = NEW_MAX[minutes] ?? 2;

  // Plafond de nouveautés (technique et application) : levé seulement quand rien d'autre ne convient (premiers jours)
  const score = (e: Exercise, over: boolean): number => {
    const c = h[e.id];
    let s: number;
    const capped = phaseOf(e) === 'technique' || phaseOf(e) === 'application';
    if (c && c.due <= date) s = 100 + (5 - c.box) * 10 + Math.min(10, daysBetween(c.due, date));
    else if (!c) s = !capped || news < newMax || over ? 45 - e.level * 4 + (e.regression && h[e.regression]?.mastered ? 15 : 0) : -1;
    else s = 12 + Math.min(20, daysBetween(c.last, date)) - c.box * 2;
    if (s < 0) return s;
    let k = 1 + 0.5 * e.goals.filter((g) => goals.has(g)).length + ((prog.weights?.[e.family] ?? 1) - 1);
    if (e.weakHand && goals.has('main_faible')) k += 0.8;
    if (e.game && (prog.games || small)) k += 0.6;
    if (prevSet.has(e.id) && !(c && c.due <= date)) k *= 0.4;
    k *= 0.55 ** (famUsed.get(e.family) ?? 0);
    return s * Math.max(0.1, k) + rnd(`${date}|${seed}|${e.id}`) * 8;
  };

  const items: SessionItem[] = [];
  const take = (e: Exercise, phase: Phase) => {
    const c = h[e.id], dose = doseFor(e, p.age);
    items.push({ ex: e.id, phase, dose, sec: exSec(e, dose), kind: !c ? 'new' : c.due <= date ? 'review' : 'keep' });
    if (!c && (phase === 'technique' || phase === 'application')) news++;
    famUsed.set(e.family, (famUsed.get(e.family) ?? 0) + 1);
  };
  const used = (id: string) => items.some((i) => i.ex === id);
  const best = (phase: Phase, room: number): Exercise | null => {
    for (const over of [false, true]) {
      let top: Exercise | null = null, ts = -Infinity;
      for (const e of avail) {
        if (phaseOf(e) !== phase || used(e.id)) continue;
        if (exSec(e, doseFor(e, p.age)) > room) continue;
        const s = score(e, over);
        if (s >= 0 && s > ts) { ts = s; top = e; }
      }
      if (top) return top;
    }
    return null;
  };

  // Remplissage moment par moment ; un moment sans exercice possible (ex. pas d'application faisable) laisse sa part aux autres
  let carry = 0;
  for (const ph of ORDER) {
    const budget = SHARE[ph] * target + carry;
    let spent = 0;
    const cap = (MAX_N[minutes] ?? MAX_N[30])[ph];
    for (let n = 0; n < cap; n++) {
      const room = budget - spent;
      if (room < 45) break;
      const e = best(ph, room + Math.min(90, budget * 0.25));
      if (!e) break;
      take(e, ph);
      spent += items[items.length - 1].sec;
      if (ph === 'echauffement' || ph === 'retour') { if (spent >= budget * 0.7) break; }
    }
    carry = Math.max(0, budget - spent);
  }

  // Ajustement à ±10 % : d'abord le nombre de séries (exercices plus longs plutôt que plus nombreux), puis des exercices en plus
  const total = () => items.reduce((n, i) => n + i.sec, 0);
  const resize = (it: SessionItem, by: number) => {
    const e = library.find((x) => x.id === it.ex)!;
    const base = doseFor(e, p.age).sets, sets = it.dose.sets + by;
    if (sets < 1 || sets > base + 2) return false;
    it.dose = { ...it.dose, sets }; it.sec = exSec(e, it.dose); return true;
  };
  const adjustable = () => items.filter((i) => (i.phase === 'technique' || i.phase === 'physique' || i.phase === 'application') && !library.find((x) => x.id === i.ex)?.untimed);
  const grow = () => {
    for (let guard = 0; guard < 60 && total() < target * 0.9; guard++) {
      // La série en plus qui dépasse le moins
      const c = adjustable().filter((i) => resize(i, 1) && (resize(i, -1), true)).sort((x, y) => x.dose.sets - y.dose.sets)[0];
      if (!c) return;
      resize(c, 1);
      if (total() > target * 1.1) { resize(c, -1); return; }
    }
  };
  grow();
  for (let guard = 0; guard < 6 && total() < target * 0.9; guard++) {
    const room = target * 1.1 - total();
    const e = best('technique', room) ?? best('application', room) ?? best('physique', room);
    if (!e) break;
    take(e, phaseOf(e));
    grow();
  }
  for (let guard = 0; guard < 40 && total() > target * 1.1; guard++) {
    const it = adjustable().filter((i) => i.dose.sets > 1).sort((a, b) => b.sec - a.sec)[0];
    if (!it) { const last = items.filter((i) => i.phase === 'technique' || i.phase === 'application').pop(); if (!last || items.length <= 3) break; items.splice(items.indexOf(last), 1); continue; }
    resize(it, -1);
  }

  // Pas deux séances identiques d'affilée : on remplace le dernier exercice technique non dû
  const ids = items.map((i) => i.ex);
  if (prev.length && ids.length === prev.length && ids.every((x) => prevSet.has(x))) {
    const cands = items.filter((i) => i.phase === 'technique' || i.phase === 'physique' || i.phase === 'application');
    const swaps = [...cands.filter((i) => i.kind !== 'review'), ...cands.filter((i) => i.kind === 'review')];
    for (const swap of swaps) {
      const alt = avail.filter((e) => phaseOf(e) === swap.phase && !used(e.id))
        .map((e) => ({ e, d: Math.abs(exSec(e, doseFor(e, p.age)) - swap.sec) })).filter((x) => x.d <= target * 0.08).sort((a, b) => a.d - b.d)[0]?.e;
      if (alt) { const dose = doseFor(alt, p.age); Object.assign(swap, { ex: alt.id, dose, sec: exSec(alt, dose), kind: h[alt.id] ? 'keep' : 'new' }); break; }
    }
  }

  items.sort((a, b) => ORDER.indexOf(a.phase) - ORDER.indexOf(b.phase));
  return { date, program: prog.id, items, sec: total(), target };
}

/** Variantes faisables d'un exercice impossible avec ce profil (ex. tir au mur au lieu du tir au panier) */
export function alternativesFor(e: Exercise, p: TrainingProfile, library: Exercise[]): Exercise[] {
  return (e.alternatives ?? []).map((id) => library.find((x) => x.id === id)).filter((x): x is Exercise => !!x && feasible(x, p));
}

// ---------- Motivation ----------
export const LEVELS = [
  { name: 'Rookie', xp: 0 }, { name: 'Remplaçant', xp: 200 }, { name: 'Titulaire', xp: 600 },
  { name: 'Capitaine', xp: 1400 }, { name: 'All-Star', xp: 2800 }, { name: 'MVP', xp: 5000 },
] as const;
/** Points : cocher rapporte peu ; la validation par un adulte rapporte surtout (Maîtrisé > Correct > À revoir). Auto-évaluation : moitié. */
export const XP = { check: 5, revoir: 5, correct: 15, maitrise: 30, fullDay: 10 } as const;

export const BADGES = [
  { id: 'premier', emoji: '🏀', name: 'Premier entraînement', text: 'Tu as fait ta première séance.' },
  { id: 'serie3', emoji: '🔥', name: 'En feu', text: '3 jours d’affilée.' },
  { id: 'serie7', emoji: '⚡', name: 'Une semaine pleine', text: '7 jours d’affilée.' },
  { id: 'serie14', emoji: '🏆', name: 'Inarrêtable', text: '14 jours d’affilée.' },
  { id: 'jours20', emoji: '📅', name: 'Régulier', text: '20 jours d’entraînement.' },
  { id: 'maitre10', emoji: '⭐', name: '10 Maîtrisé', text: '10 exercices notés Maîtrisé.' },
  { id: 'maitre50', emoji: '🌟', name: '50 Maîtrisé', text: '50 exercices notés Maîtrisé.' },
  { id: 'gaucher', emoji: '🫲', name: 'Main faible', text: '15 exercices main faible.' },
  { id: 'shooteur', emoji: '🎯', name: 'Shooteur', text: '30 exercices de tir.' },
  { id: 'complet', emoji: '🧩', name: 'Joueur complet', text: 'Des exercices dans 8 familles.' },
  { id: 'journal', emoji: '✍️', name: 'Carnet de bord', text: '5 notes écrites.' },
] as const;

export interface Stats {
  xp: number; level: number; levelName: string; nextXp: number | null;
  streak: number; best: number; trainedDays: number;
  /** Exercices cochés en attente de validation */
  pending: number;
  badges: string[];
  /** Par famille : exercices faits, maîtrisés */
  families: Partial<Record<Family, { done: number; mastered: number }>>;
  /** 28 derniers jours : 0 rien, 1 entraîné, 2 entraîné et tout validé */
  calendar: { date: string; v: 0 | 1 | 2 }[];
}

export function stats(days: DayLog[], date: string, library: Exercise[]): Stats {
  const fam = new Map(library.map((e) => [e.id, e]));
  let xp = 0, pending = 0, notes = 0, mastered = 0, weak = 0, shots = 0;
  const trained = new Set<string>(), families: Stats['families'] = {}, full = new Set<string>();
  for (const d of days) {
    const checked = d.items.filter((i) => d.checks?.[i.ex]);
    if (checked.length) trained.add(d.date);
    if (d.note?.trim()) notes++;
    if (checked.length && checked.length === d.items.length) xp += XP.fullDay;
    let allRated = checked.length > 0;
    for (const it of checked) {
      xp += XP.check;
      const e = fam.get(it.ex);
      const r = ratingOf(d, it.ex);
      if (r) xp += Math.round(XP[r.r] * (r.self ? 0.5 : 1)); else { pending++; allRated = false; }
      if (r?.r === 'maitrise') mastered++;
      if (!e) continue;
      const f = (families[e.family] ??= { done: 0, mastered: 0 });
      f.done++; if (r?.r === 'maitrise') f.mastered++;
      if (e.weakHand) weak++;
      if (e.family === 'tir' || e.family === 'tir_mecanique') shots++;
    }
    if (allRated) full.add(d.date);
  }
  // Série : jours consécutifs jusqu'à aujourd'hui (ou hier, si la séance du jour n'est pas encore faite)
  let streak = 0;
  for (let d = trained.has(date) ? date : addDays(date, -1); trained.has(d); d = addDays(d, -1)) streak++;
  let best = 0, run = 0, last = '';
  for (const d of [...trained].sort()) { run = last && daysBetween(last, d) === 1 ? run + 1 : 1; best = Math.max(best, run); last = d; }
  const level = LEVELS.reduce((n, l, i) => (xp >= l.xp ? i : n), 0);
  const b: string[] = [];
  if (trained.size) b.push('premier');
  if (best >= 3) b.push('serie3');
  if (best >= 7) b.push('serie7');
  if (best >= 14) b.push('serie14');
  if (trained.size >= 20) b.push('jours20');
  if (mastered >= 10) b.push('maitre10');
  if (mastered >= 50) b.push('maitre50');
  if (weak >= 15) b.push('gaucher');
  if (shots >= 30) b.push('shooteur');
  if (Object.keys(families).length >= 8) b.push('complet');
  if (notes >= 5) b.push('journal');
  const calendar = Array.from({ length: 28 }, (_, i) => { const d = addDays(date, i - 27); return { date: d, v: (full.has(d) ? 2 : trained.has(d) ? 1 : 0) as 0 | 1 | 2 }; });
  return { xp, level, levelName: LEVELS[level].name, nextXp: LEVELS[level + 1]?.xp ?? null, streak, best, trainedDays: trained.size, pending, badges: b, families, calendar };
}
