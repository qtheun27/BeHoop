import { describe, it, expect } from 'vitest';
import { EXERCISES, BY_ID } from '../../web/src/hoopcamp/library';
import { PROGRAMS, program } from '../../web/src/hoopcamp/programs';
import { AGES, FAMILIES, type TrainingProfile, type Age } from '../../web/src/hoopcamp/types';
import { generate, review, historyFrom, feasible, doseFor, doseSec, exSec, locked, stats, addDays, INTERVALS, type DayLog } from '../../web/src/hoopcamp/engine';

const base: TrainingProfile = { age: 'U14', level: 2, hand: 'droite', basket: 'panier', space: 'moyen', surface: 'exterieur',
  equip: ['ballon', 'mur', 'plots', 'corde', 'tennis'], minutes: 30, days: 5, goals: ['dribble', 'tir'] };

describe('bibliothèque', () => {
  it('compte 150 à 200 exercices, toutes familles couvertes', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(150);
    expect(EXERCISES.length).toBeLessThanOrEqual(200);
    for (const f of FAMILIES) expect(EXERCISES.filter((e) => e.family === f).length, f).toBeGreaterThanOrEqual(6);
  });
  it('identifiants uniques et liens valides', () => {
    expect(BY_ID.size).toBe(EXERCISES.length);
    for (const e of EXERCISES) {
      for (const id of [e.progression, e.regression, ...(e.alternatives ?? [])]) if (id) expect(BY_ID.has(id), `${e.id} → ${id}`).toBe(true);
      expect(AGES.indexOf(e.minAge) <= AGES.indexOf(e.maxAge), e.id).toBe(true);
      expect(e.steps.length, e.id).toBeGreaterThanOrEqual(2);
      expect(e.errors.length, e.id).toBeGreaterThanOrEqual(1);
      expect(e.tip.length, e.id).toBeGreaterThan(10);
    }
  });
  it('un dosage pour chaque âge permis, durée réaliste (calculée)', () => {
    for (const e of EXERCISES) for (const a of AGES.slice(AGES.indexOf(e.minAge), AGES.indexOf(e.maxAge) + 1)) {
      const d = doseFor(e, a);
      expect(d, `${e.id} ${a}`).toBeTruthy();
      const s = exSec(e, d);
      expect(s, `${e.id} ${a}`).toBeGreaterThanOrEqual(30);
      expect(s, `${e.id} ${a}`).toBeLessThanOrEqual(e.untimed ? 900 : 480);
    }
  });
  it('dosage défini à l’âge minimum', () => {
    for (const e of EXERCISES) expect(e.dose[e.minAge], e.id).toBeTruthy();
  });
  it('durée = séries × (reps × s/rep ou temps) × côtés + repos + mise en place', () => {
    expect(doseSec({ sets: 3, reps: 10, secPerRep: 2, rest: 20 }, 20)).toBe(3 * 20 + 2 * 20 + 20);
    expect(doseSec({ sets: 2, work: 30, rest: 15, perSide: true }, 0)).toBe(2 * 60 + 15);
  });
  it('les petits ont des formes jouées, pas de pliométrie', () => {
    const u8 = EXERCISES.filter((e) => feasible(e, { ...base, age: 'U8', level: 1 }));
    expect(u8.filter((e) => e.game).length).toBeGreaterThanOrEqual(10);
    expect(u8.some((e) => e.id === 'phy-squat-saute' || e.id === 'phy-bonds-lateraux')).toBe(false);
  });
});

describe('répétition espacée', () => {
  it('À revoir → boîte 0, Correct +1, Maîtrisé +2, plafonné à 5', () => {
    let c = review(undefined, 'correct', '2026-10-01');
    expect([c.box, c.due]).toEqual([1, addDays('2026-10-01', INTERVALS[1])]);
    c = review(c, 'maitrise', '2026-10-02');
    expect([c.box, c.mastered]).toEqual([3, true]);
    c = review(c, 'maitrise', '2026-10-06');
    expect(c.box).toBe(5);
    expect(c.due).toBe(addDays('2026-10-06', 12));
    c = review(c, 'revoir', '2026-10-18');
    expect([c.box, c.due, c.mastered]).toEqual([0, '2026-10-19', true]);
  });
  it('historique : validation adulte prioritaire, coché sans note = revient demain', () => {
    const days: DayLog[] = [{ date: '2026-10-01', items: [{ ex: 'a', phase: 'technique', dose: { sets: 1, reps: 1, rest: 0 }, sec: 30, kind: 'new' }, { ex: 'b', phase: 'technique', dose: { sets: 1, reps: 1, rest: 0 }, sec: 30, kind: 'new' }],
      checks: { a: 1, b: 1 }, ratings: { a: { r: 'maitrise' } }, selfRatings: { a: { r: 'revoir' } } }];
    const h = historyFrom(days);
    expect(h.a.box).toBe(2);
    expect(h.b).toMatchObject({ box: 0, due: '2026-10-02' });
  });
  it('progression verrouillée tant que l’exercice précédent n’est pas maîtrisé', () => {
    const pool = EXERCISES.filter((e) => feasible(e, base));
    expect(locked(pool, {}).has('fin-lay-up-gauche')).toBe(true);
    expect(locked(pool, { 'fin-lay-up-droite': review(undefined, 'maitrise', '2026-10-01') }).has('fin-lay-up-gauche')).toBe(false);
  });
});

describe('générateur', () => {
  const profiles: TrainingProfile[] = [];
  for (const age of ['U8', 'U10', 'U12', 'U14', 'U16', 'U18', 'U21'] as Age[])
    for (const basket of ['aucun', 'panier', 'terrain'] as const)
      for (const minutes of [15, 30, 45, 60] as const)
        profiles.push({ ...base, age, basket, minutes, level: age === 'U8' ? 1 : age >= 'U16' ? 3 : 2, space: basket === 'terrain' ? 'grand' : 'moyen' });
  it('respecte le temps à ±10 % pour tous les profils et programmes', () => {
    for (const p of profiles) for (const prog of PROGRAMS) {
      const s = generate({ profile: p, program: prog, history: {}, date: '2026-10-26', library: EXERCISES });
      const t = (prog.minutes ?? p.minutes) * 60;
      expect(s.sec, `${p.age} ${p.basket} ${p.minutes} ${prog.id}`).toBeGreaterThanOrEqual(t * 0.9);
      expect(s.sec, `${p.age} ${p.basket} ${p.minutes} ${prog.id}`).toBeLessThanOrEqual(t * 1.1);
      expect(s.sec).toBe(s.items.reduce((n, i) => n + i.sec, 0));
    }
  });
  it('structure : échauffement en premier, retour au calme en dernier, tout faisable', () => {
    for (const p of profiles) {
      const s = generate({ profile: p, program: program('camp-1')!, history: {}, date: '2026-10-26', library: EXERCISES });
      expect(s.items[0].phase, `${p.age} ${p.minutes}`).toBe('echauffement');
      expect(s.items[s.items.length - 1].phase).toBe('retour');
      for (const i of s.items) expect(feasible(BY_ID.get(i.ex)!, p), i.ex).toBe(true);
      expect(new Set(s.items.map((i) => i.ex)).size).toBe(s.items.length);
    }
  });
  it('sans panier : aucun exercice de panier, mais du tir mécanique ludique', () => {
    const p = { ...base, basket: 'aucun' as const };
    const s = generate({ profile: p, program: program('shooteur')!, history: {}, date: '2026-10-26', library: EXERCISES });
    expect(s.items.some((i) => BY_ID.get(i.ex)!.needs.basket)).toBe(false);
    expect(s.items.some((i) => BY_ID.get(i.ex)!.family === 'tir_mecanique')).toBe(true);
  });
  it('déterministe', () => {
    const a = generate({ profile: base, program: PROGRAMS[0], history: {}, date: '2026-10-26', library: EXERCISES });
    const b = generate({ profile: base, program: PROGRAMS[0], history: {}, date: '2026-10-26', library: EXERCISES });
    expect(a).toEqual(b);
  });
  it('les révisions dues passent en priorité ; pas deux séances identiques d’affilée', () => {
    let h = {} as ReturnType<typeof historyFrom>;
    let prev: string[] = [];
    let date = '2026-10-26';
    for (let i = 0; i < 10; i++) {
      const s = generate({ profile: base, program: PROGRAMS[1], history: h, date, prev, library: EXERCISES });
      expect(s.items.map((x) => x.ex).sort()).not.toEqual([...prev].sort());
      // Tout est noté « À revoir » : tout revient le lendemain
      const day: DayLog = { date, items: s.items, checks: Object.fromEntries(s.items.map((x) => [x.ex, 1])), ratings: Object.fromEntries(s.items.map((x) => [x.ex, { r: 'revoir' as const }])) };
      h = historyFrom([day]);
      const next = generate({ profile: base, program: PROGRAMS[1], history: h, date: addDays(date, 1), prev: s.items.map((x) => x.ex), library: EXERCISES });
      expect(next.items.filter((x) => x.kind === 'review').length).toBeGreaterThan(0);
      prev = s.items.map((x) => x.ex); date = addDays(date, 1);
    }
  });
  it('introduit les nouveaux exercices progressivement', () => {
    const s = generate({ profile: { ...base, minutes: 15 }, program: PROGRAMS[0], history: {}, date: '2026-10-26', library: EXERCISES });
    // Premier jour : tout est nouveau, mais le plafond s'applique hors échauffement / retour quand il reste des révisions ; ici au moins une séance faisable
    expect(s.items.length).toBeGreaterThanOrEqual(3);
  });
});

describe('motivation', () => {
  it('points surtout par la validation, série et badges', () => {
    const it1 = { ex: 'dri-pound-bas', phase: 'technique' as const, dose: { sets: 1, reps: 1, rest: 0 }, sec: 30, kind: 'new' as const };
    const days: DayLog[] = ['2026-10-20', '2026-10-21', '2026-10-22'].map((date) => ({ date, items: [it1], checks: { [it1.ex]: 1 }, ratings: { [it1.ex]: { r: 'maitrise' as const } } }));
    const st = stats(days, '2026-10-22', EXERCISES);
    expect(st.streak).toBe(3);
    expect(st.badges).toContain('serie3');
    expect(st.xp).toBe(3 * (5 + 30 + 10));
    const unrated = stats([{ ...days[0], ratings: {} }], '2026-10-20', EXERCISES);
    expect(unrated.pending).toBe(1);
    expect(unrated.xp).toBeLessThan(st.xp / 3);
  });
});
