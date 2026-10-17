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
