// Tests des règles Firestore sur l'émulateur : npm run test:rules
import { readFileSync } from 'node:fs';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, getDocs, collection, query, where, writeBatch, increment, deleteDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
const U12 = 51653, SEN = 50741;
const ADMIN = { email: 'q.theuninck@gmail.com', email_verified: true };

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-behoop', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const u of ['alice', 'bob', 'carol', 'resp', 'banned']) await setDoc(doc(db, 'profiles', u), { displayName: u, ageConfirmed: true, banned: u === 'banned' });
    await setDoc(doc(db, 'teamInfo', String(U12)), { ageGroup: 'jeunes', awbbId: U12 });
    await setDoc(doc(db, 'teamInfo', String(SEN)), { ageGroup: 'seniors', awbbId: SEN });
    await setDoc(doc(db, 'teamMembers', String(U12), 'members', 'alice'), { uid: 'alice', teamId: U12, role: 'membre', status: 'accepted' });
    await setDoc(doc(db, 'teamMembers', String(U12), 'members', 'resp'), { uid: 'resp', teamId: U12, role: 'responsable', status: 'accepted' });
    await setDoc(doc(db, 'teamMembers', String(U12), 'members', 'carol'), { uid: 'carol', teamId: U12, role: 'membre', status: 'pending' });
    await setDoc(doc(db, 'posts', 'private1'), { type: 'photo', authorUid: 'alice', teamIds: [U12], targets: [`t:${U12}`], visibility: 'team', teamIdPrivate: U12, hidden: false, reactions: {}, payload: {} });
    await setDoc(doc(db, 'posts', 'score-1'), { type: 'score', authorUid: null, teamIds: [U12], targets: [`t:${U12}`], visibility: 'public', teamIdPrivate: null, hidden: false, reactions: {}, payload: {} });
  });
});
const as = (u: string, extra = {}) => env.authenticatedContext(u, extra).firestore();
const photoPost = (author: string, team: number, visibility: 'team' | 'public') => ({
  type: 'photo', authorUid: author, authorName: 'x', clubId: 1, teamIds: [team], targets: [`t:${team}`], visibility, teamIdPrivate: visibility === 'team' ? team : null,
  hidden: false, reactions: {}, payload: { text: 'Bravo', photos: [{ key: 'k' }] }, createdAt: new Date(),
});

describe('Visibilité Jeunes / Seniors', () => {
  it('un post 🔒 n’est lisible que par les membres acceptés', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'posts', 'private1')));
    await assertFails(getDoc(doc(as('bob'), 'posts', 'private1')));
    await assertFails(getDoc(doc(as('carol'), 'posts', 'private1'))); // demande en attente
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'posts', 'private1')));
    await assertSucceeds(getDoc(doc(as('x', ADMIN), 'posts', 'private1')));
  });
  it('requête du fil privé autorisée seulement pour les membres', async () => {
    const q = (db: ReturnType<typeof as>) => getDocs(query(collection(db, 'posts'), where('visibility', '==', 'team'), where('teamIdPrivate', 'in', [U12])));
    await assertSucceeds(q(as('alice')));
    await assertFails(q(as('bob')));
  });
  it('impossible de publier une photo de jeunes en public', async () => {
    await assertFails(setDoc(doc(as('alice'), 'posts', 'p1'), photoPost('alice', U12, 'public')));
    await assertSucceeds(setDoc(doc(as('alice'), 'posts', 'p2'), photoPost('alice', U12, 'team')));
  });
  it('un non-membre ne peut pas publier dans une Équipe 🔒', async () => {
    await assertFails(setDoc(doc(as('bob'), 'posts', 'p3'), photoPost('bob', U12, 'team')));
  });
  it('photo Seniors publique par tout compte ; équipe inconnue = Jeunes', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'posts', 'p4'), photoPost('bob', SEN, 'public')));
    await assertFails(setDoc(doc(as('bob'), 'posts', 'p5'), photoPost('bob', 99999, 'public')));
  });
  it('un compte banni ne publie pas ; on ne publie pas au nom d’un autre', async () => {
    await assertFails(setDoc(doc(as('banned'), 'posts', 'p6'), photoPost('banned', SEN, 'public')));
    await assertFails(setDoc(doc(as('bob'), 'posts', 'p7'), photoPost('alice', SEN, 'public')));
  });
  it('posts automatiques (score) : écriture interdite aux clients', async () => {
    await assertFails(setDoc(doc(as('bob'), 'posts', 'score-2'), { ...photoPost('bob', SEN, 'public'), type: 'score' }));
    await assertSucceeds(getDoc(doc(as('bob'), 'posts', 'score-1')));
  });
});

describe('Masquage', () => {
  it('retrait parent immédiat par un membre ; pas par un non-membre', async () => {
    const hide = (u: string) => updateDoc(doc(as(u), 'posts', 'private1'), { hidden: true, hiddenReason: 'parent', hiddenBy: u, hiddenAt: new Date() });
    await assertFails(hide('bob'));
    await assertSucceeds(hide('resp'));
  });
  it('seul le super admin réactive', async () => {
    await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), 'posts', 'private1'), { hidden: true }));
    await assertFails(updateDoc(doc(as('alice'), 'posts', 'private1'), { hidden: false }));
    await assertSucceeds(updateDoc(doc(as('x', ADMIN), 'posts', 'private1'), { hidden: false }));
  });
  it('un utilisateur ne masque pas le post d’un autre (public)', async () => {
    await assertFails(updateDoc(doc(as('bob'), 'posts', 'score-1'), { hidden: true, hiddenReason: 'auteur', hiddenBy: 'bob', hiddenAt: new Date() }));
  });
});

describe('Réactions', () => {
  it('réaction + compteur dans la même écriture', async () => {
    const db = as('bob'); const b = writeBatch(db);
    b.set(doc(db, 'posts', 'score-1', 'reactions', 'bob'), { emoji: '🔥' });
    b.update(doc(db, 'posts', 'score-1'), { 'reactions.🔥': increment(1) });
    await assertSucceeds(b.commit());
  });
  it('compteur seul refusé', async () => {
    await assertFails(updateDoc(doc(as('bob'), 'posts', 'score-1'), { 'reactions.🔥': increment(5) }));
  });
});

describe('Équipes 🔒', () => {
  it('demande pour soi uniquement, en attente', async () => {
    const req = (u: string, target: string, status = 'pending') => setDoc(doc(as(u), 'teamMembers', String(U12), 'members', target), { uid: target, teamId: U12, role: 'membre', status, message: 'Je suis le papa de…' });
    await assertSucceeds(req('bob', 'bob'));
    await assertFails(req('bob', 'dave'));
    await assertFails(setDoc(doc(as('bob'), 'teamMembers', String(SEN), 'members', 'bob'), { uid: 'bob', teamId: SEN, role: 'responsable', status: 'accepted' }));
  });
  it('seul un responsable accepte', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'teamMembers', String(U12), 'members', 'carol'), { status: 'accepted' }));
    await assertSucceeds(updateDoc(doc(as('resp'), 'teamMembers', String(U12), 'members', 'carol'), { status: 'accepted' }));
  });
  it('un membre peut quitter, un responsable peut retirer', async () => {
    await assertSucceeds(deleteDoc(doc(as('alice'), 'teamMembers', String(U12), 'members', 'alice')));
    await assertSucceeds(deleteDoc(doc(as('resp'), 'teamMembers', String(U12), 'members', 'carol')));
  });
  it('mes adhésions via collectionGroup', async () => {
    await assertSucceeds(getDocs(query(collection(as('alice'), 'teamMembers', String(U12), 'members'))));
  });
});

describe('Profils, signalements, score en direct', () => {
  it('profil privé ; pas d’auto-débannissement', async () => {
    await assertFails(getDoc(doc(as('bob'), 'profiles', 'alice')));
    await assertFails(updateDoc(doc(as('banned'), 'profiles', 'banned'), { banned: false }));
  });
  it('signalement', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'reports', 'score-1_bob'), { postId: 'score-1', reporterUid: 'bob', reason: 'Spam', status: 'open' }));
    await assertFails(getDocs(collection(as('bob'), 'reports')));
  });
  it('score en direct : valeurs plausibles, auteur = soi', async () => {
    const live = (u: string, home: number) => setDoc(doc(as(u), 'liveScores', '123'), { home, away: 2, quarter: 1, updatedBy: u, history: [], status: 'live' });
    await assertSucceeds(live('bob', 10));
    await assertFails(live('bob', -1));
    await assertFails(setDoc(doc(as('bob'), 'liveScores', '124'), { home: 1, away: 2, quarter: 1, updatedBy: 'alice', history: [] }));
  });
});
