// Non-régression : l'Espace Club fonctionne toujours avec le fichier de règles fusionné.
import { readFileSync } from 'node:fs';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-behoop-club', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } }); });
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'invitations', 'nouveau@club.be'), { status: 'pending', role: 'coach', club_id: 'c1', team_id: 't1' });
    await setDoc(doc(db, 'users', 'coach'), { role: 'coach', club_id: 'c1', team_ids: ['t1'] });
    await setDoc(doc(db, 'users', 'admin'), { role: 'club_admin', club_id: 'c1' });
    await setDoc(doc(db, 'teams', 't1'), { club_id: 'c1' });
  });
});
const as = (u: string, email = `${u}@club.be`) => env.authenticatedContext(u, { email }).firestore();

describe('Espace Club inchangé', () => {
  it('inscription par invitation uniquement', async () => {
    await assertSucceeds(setDoc(doc(as('n1', 'nouveau@club.be'), 'users', 'n1'), { role: 'coach', club_id: 'c1' }));
    await assertFails(setDoc(doc(as('n2', 'intrus@x.be'), 'users', 'n2'), { role: 'coach', club_id: 'c1' }));
  });
  it('pas d’auto-promotion', async () => {
    await assertFails(updateDoc(doc(as('coach'), 'users', 'coach'), { role: 'super_admin' }));
  });
  it('coach : entraînements de son équipe', async () => {
    await assertSucceeds(setDoc(doc(as('coach'), 'trainings', 'tr1'), { team_id: 't1', created_by: 'coach' }));
    await assertFails(setDoc(doc(as('coach'), 'trainings', 'tr2'), { team_id: 'autre', created_by: 'coach' }));
  });
  it('admin du club : équipes', async () => {
    await assertSucceeds(updateDoc(doc(as('admin'), 'teams', 't1'), { name: 'U14' }));
    await assertSucceeds(getDoc(doc(as('admin'), 'users', 'coach')));
  });
});

describe('Hoop Camp', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await setDoc(doc(db, 'users', 'joueur'), { role: 'player', club_id: 'c1' });
      await setDoc(doc(db, 'users', 'parent'), { role: 'parent', club_id: 'c1', children_player_ids: ['enfant'] });
      await setDoc(doc(db, 'users', 'coach2'), { role: 'coach', club_id: 'c1', team_ids: ['t2'] });
      await setDoc(doc(db, 'users', 'solo'), { role: 'player', club_id: 'c1' });
      await setDoc(doc(db, 'teams', 't1'), { club_id: 'c1', coach_uids: ['coach'] });
      await setDoc(doc(db, 'teams', 't9'), { club_id: 'c1' });
      // Joueur avec compte, un parent lié, équipe t1 (coach « coach »)
      await setDoc(doc(db, 'players', 'joueur'), { club_id: 'c1', team_id: 't1', account_uid: 'joueur', parent_uids: ['parent'] });
      // Enfant sans compte, géré par le parent
      await setDoc(doc(db, 'players', 'enfant'), { club_id: 'c1', team_id: 't1', account_uid: '', parent_uids: ['parent'] });
      // Joueur seul : ni parent ni coach (équipe sans coach)
      await setDoc(doc(db, 'players', 'solo'), { club_id: 'c1', team_id: 't9', account_uid: 'solo', parent_uids: [] });
      await setDoc(doc(db, 'hoopcamp', 'joueur', 'days', '2026-10-26'), { date: '2026-10-26', items: [], checks: { a: 1 }, team_id: 't1' });
    });
  });
  const day = (u: string, pid: string, date = '2026-10-27') => doc(as(u), 'hoopcamp', pid, 'days', date);

  it('le joueur coche et écrit sa note, mais ne se valide jamais', async () => {
    await assertSucceeds(setDoc(day('joueur', 'joueur'), { date: '2026-10-27', items: [], checks: { a: 1 }, note: 'crossover ok', team_id: 't1' }));
    await assertSucceeds(updateDoc(day('joueur', 'joueur', '2026-10-26'), { checks: { a: 1, b: 2 } }));
    await assertFails(updateDoc(day('joueur', 'joueur', '2026-10-26'), { ratings: { a: { r: 'maitrise' } } }));
    await assertFails(setDoc(day('joueur', 'joueur'), { date: '2026-10-27', items: [], team_id: 't1', ratings: { a: { r: 'maitrise' } } }));
    // Auto-évaluation refusée : il a un parent et un coach
    await assertFails(updateDoc(day('joueur', 'joueur', '2026-10-26'), { selfRatings: { a: { r: 'maitrise' } } }));
  });
  it('équipe recopiée telle quelle (pas de fuite vers un autre coach)', async () => {
    await assertFails(setDoc(day('joueur', 'joueur'), { date: '2026-10-27', items: [], team_id: 't2' }));
  });
  it('parent lié et coach de l’équipe valident ; personne d’autre', async () => {
    await assertSucceeds(updateDoc(day('parent', 'joueur', '2026-10-26'), { ratings: { a: { r: 'correct', by: 'parent' } } }));
    await assertSucceeds(updateDoc(day('coach', 'joueur', '2026-10-26'), { ratings: { a: { r: 'maitrise', by: 'coach' } } }));
    await assertFails(updateDoc(day('coach2', 'joueur', '2026-10-26'), { ratings: { a: { r: 'maitrise' } } }));
    await assertFails(updateDoc(day('admin', 'joueur', '2026-10-26'), { ratings: { a: { r: 'maitrise' } } }));
    // Le valideur ne touche pas aux cases cochées
    await assertFails(updateDoc(day('coach', 'joueur', '2026-10-26'), { checks: {} }));
  });
  it('le coach ne lit que son équipe', async () => {
    await assertSucceeds(getDoc(day('coach', 'joueur', '2026-10-26')));
    await assertFails(getDoc(day('coach2', 'joueur', '2026-10-26')));
    await assertFails(getDoc(day('solo', 'joueur', '2026-10-26')));
    await assertFails(getDoc(day('admin', 'joueur', '2026-10-26')));
  });
  it('enfant sans compte : le parent coche et valide', async () => {
    await assertSucceeds(setDoc(day('parent', 'enfant'), { date: '2026-10-27', items: [], checks: { a: 1 }, team_id: 't1' }));
    await assertSucceeds(updateDoc(day('parent', 'enfant'), { ratings: { a: { r: 'correct' } } }));
  });
  it('auto-évaluation seulement sans parent ni coach', async () => {
    await assertSucceeds(setDoc(day('solo', 'solo'), { date: '2026-10-27', items: [], checks: { a: 1 }, team_id: 't9', selfRatings: { a: { r: 'correct' } } }));
    await assertFails(updateDoc(day('solo', 'solo'), { ratings: { a: { r: 'maitrise' } } }));
  });
  it('programme et profil : le joueur, ses parents ou son coach', async () => {
    await assertSucceeds(setDoc(doc(as('coach'), 'hoopcamp', 'enfant'), { player_id: 'enfant', program: { id: 'camp-1' } }));
    await assertSucceeds(setDoc(doc(as('coach'), 'hoopcamp', 'joueur'), { player_id: 'joueur', program: { id: 'camp-1' }, profile: { age: 'U14' } }));
    await assertSucceeds(setDoc(doc(as('joueur'), 'hoopcamp', 'joueur'), { player_id: 'joueur', profile: { age: 'U14' }, program: { id: 'shooteur' } }));
    await assertFails(setDoc(doc(as('coach2'), 'hoopcamp', 'joueur'), { player_id: 'joueur', program: { id: 'camp-1' } }));
  });
  it('envoi d’équipe : le coach de l’équipe seulement, lisible par le club', async () => {
    await assertSucceeds(setDoc(doc(as('coach'), 'hoopcamp_assign', 'a1'), { club_id: 'c1', team_id: 't1', program: { id: 'camp-1' } }));
    await assertFails(setDoc(doc(as('coach2'), 'hoopcamp_assign', 'a2'), { club_id: 'c1', team_id: 't1', program: { id: 'camp-1' } }));
    await assertSucceeds(getDoc(doc(as('joueur'), 'hoopcamp_assign', 'a1')));
  });
});

describe('Invitation joueur acceptée par un parent', () => {
  it('rôle parent permis, jamais coach ou admin', async () => {
    await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'invitations', 'maman@club.be'), { status: 'pending', role: 'player', club_id: 'c1', team_id: 't1' }); });
    await assertFails(setDoc(doc(as('m1', 'maman@club.be'), 'users', 'm1'), { role: 'coach', club_id: 'c1' }));
    await assertSucceeds(setDoc(doc(as('m1', 'maman@club.be'), 'users', 'm1'), { role: 'parent', club_id: 'c1' }));
  });
});

describe('Code d’équipe (QR)', () => {
  it('créé par le coach de l’équipe, pas par un autre ; lisible avec le code', async () => {
    await assertSucceeds(setDoc(doc(as('coach'), 'joinCodes', 'ABCD2345'), { club_id: 'c1', team_id: 't1', created_by: 'coach', expires: Date.now() + 1e9 }));
    await assertFails(setDoc(doc(as('n1', 'x@y.be'), 'joinCodes', 'ZZZZ2345'), { club_id: 'c1', team_id: 't1', created_by: 'n1', expires: 0 }));
    await assertSucceeds(getDoc(doc(as('n1', 'x@y.be'), 'joinCodes', 'ABCD2345')));
  });
});

describe('Super admin BeHoop', () => {
  it('le compte de modération gère tous les clubs', async () => {
    const db = env.authenticatedContext('sa', { email: 'q.theuninck@gmail.com', email_verified: true }).firestore();
    await assertSucceeds(updateDoc(doc(db, 'teams', 't1'), { name: 'U14' }));
    await assertFails(updateDoc(doc(env.authenticatedContext('x', { email: 'q.theuninck@gmail.com', email_verified: false }).firestore(), 'teams', 't1'), { name: 'U14' }));
  });
});

describe('Compte avec plusieurs clubs', () => {
  it('visible par l’admin de chacun de ses clubs, pas par un autre', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'users', 'multi'), { role: 'coach', club_id: 'c2', club_ids: ['c2', 'c1'], team_ids: [] });
      await setDoc(doc(c.firestore(), 'users', 'admin9'), { role: 'club_admin', club_id: 'c9' });
    });
    await assertSucceeds(getDoc(doc(as('admin'), 'users', 'multi')));
    await assertFails(getDoc(doc(as('admin9'), 'users', 'multi')));
  });
});

describe('Préparation des séances', () => {
  it('le coach prépare la séance de son équipe (plan)', async () => {
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'trainings', 'tr1'), { team_id: 't1', date: '2026-11-03' }));
    await assertSucceeds(updateDoc(doc(as('coach'), 'trainings', 'tr1'), { plan: [{ key: 'a', ref: 'd:fin-mikan', title: 'Mikan', min: 7 }], focus: 'Finitions' }));
    await assertFails(updateDoc(doc(as('joueur'), 'trainings', 'tr1'), { plan: [] }));
  });
  it('exercices du club : créés par un coach du club, lus par le club seulement', async () => {
    const d = { club_id: 'c1', name: 'Mon 3c3', theme: 'collectif', min: 12, desc: 'Règles…', created_by: 'coach' };
    await assertSucceeds(setDoc(doc(as('coach'), 'drills', 'x1'), d));
    await assertFails(setDoc(doc(as('coach'), 'drills', 'x2'), { ...d, club_id: 'c2' }));
    await assertFails(setDoc(doc(as('intrus'), 'drills', 'x3'), { ...d, created_by: 'intrus' }));
    await assertSucceeds(getDoc(doc(as('admin'), 'drills', 'x1')));
    await assertFails(getDoc(doc(as('intrus'), 'drills', 'x1')));
  });
  it('vidéo épinglée : coach du club, liens YouTube / Instagram / TikTok seulement', async () => {
    await assertSucceeds(setDoc(doc(as('coach'), 'exvideos', 'c1_h-x'), { club_id: 'c1', ref: 'h-x', url: 'https://www.youtube.com/watch?v=abc', by: 'coach' }));
    await assertFails(setDoc(doc(as('coach'), 'exvideos', 'c1_h-y'), { club_id: 'c1', ref: 'h-y', url: 'https://evil.example/x', by: 'coach' }));
    await assertFails(setDoc(doc(as('coach'), 'exvideos', 'c2_h-x'), { club_id: 'c2', ref: 'h-x', url: 'https://youtu.be/abc', by: 'coach' }));
    await assertSucceeds(getDoc(doc(as('joueur'), 'exvideos', 'c1_h-x')));
  });
});
