// npm run seed:demo — remplit l'émulateur Firebase avec le match test (BC AMLL – Union Mons Hainaut, 10/10/2026, 11–94).
// Usage : firebase emulators:exec --only auth,firestore "npm run seed:demo && …"  (ou émulateurs déjà lancés)
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { demoSettings } from '../shared/demo';
import { settingsToStore } from '../shared/types';
import { chaptersToVtt } from '../shared/chapters';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('⛔ seed:demo ne tourne que sur l’émulateur (FIRESTORE_EMULATOR_HOST).'); process.exit(1); }
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
initializeApp({ projectId: 'demo-behoop' });
const auth = getAuth(), db = getFirestore();
const users = JSON.parse(readFileSync('ops/fixtures/demo-users.json', 'utf8'));
const st = demoSettings('/docs/test');
const GAME = 465476, AMLL = 51656, MONS = 50757, CLUB_AMLL = 1374, CLUB_MONS = 1312;

const uid: Record<string, string> = {};
for (const k of ['responsable', 'parent', 'visiteur', 'joueur', 'admin']) {
  const u = users[k];
  const rec = await auth.getUserByEmail(u.email).catch(() => auth.createUser({ email: u.email, password: u.password, displayName: u.name, emailVerified: true }));
  uid[k] = rec.uid;
  await db.doc(`profiles/${rec.uid}`).set({ displayName: u.name, ageConfirmed: true, onboarded: true, notifPrefs: {}, createdAt: new Date() });
  for (const c of [CLUB_AMLL, CLUB_MONS]) await db.doc(`follows/${rec.uid}/items/club-${c}`).set({ type: 'club', refId: c, uid: rec.uid, mutedTeams: [], createdAt: new Date() });
}
for (const [t, c, n, cat] of [[AMLL, CLUB_AMLL, 'PU14H BC AMLL A', 'PU14H A'], [MONS, CLUB_MONS, 'PU14H Union Mons-Hainaut', 'PU14H']] as const)
  await db.doc(`teamInfo/${t}`).set({ awbbId: t, clubId: c, name: n, category: cat, ageGroup: 'jeunes' });
await db.doc(`teamMembers/${AMLL}/members/${uid.responsable}`).set({ uid: uid.responsable, teamId: AMLL, role: 'responsable', status: 'accepted', displayName: users.responsable.name, createdAt: new Date() });
await db.doc(`teamMembers/${AMLL}/members/${uid.parent}`).set({ uid: uid.parent, teamId: AMLL, role: 'membre', status: 'accepted', displayName: users.parent.name, message: 'Je suis la maman de Léo', createdAt: new Date() });

const base = { clubId: CLUB_AMLL, teamIds: [AMLL, MONS], targets: [`t:${AMLL}`, `t:${MONS}`, `c:${CLUB_AMLL}`, `c:${CLUB_MONS}`], hidden: false, reactions: {} };
await db.doc(`posts/score-${GAME}`).set({ ...base, type: 'score', authorUid: null, authorName: 'BeHoop', visibility: 'public', teamIdPrivate: null, createdAt: new Date('2026-10-10T15:00:00+02:00'),
  payload: { gameId: GAME, date: st.date, time: st.time, competition: st.competition, official: true,
    home: { id: AMLL, name: st.home.name, logo: st.home.logo, color: st.home.color, score: 11 }, away: { id: MONS, name: st.away.name, logo: st.away.logo, color: st.away.color, score: 94 } } });
await db.doc('posts/demo-photos').set({ ...base, teamIds: [AMLL], targets: [`t:${AMLL}`, `c:${CLUB_AMLL}`], type: 'photo', authorUid: uid.responsable, authorName: users.responsable.name,
  visibility: 'team', teamIdPrivate: AMLL, createdAt: new Date('2026-10-10T15:30:00+02:00'),
  payload: { text: 'Quelques photos du match de samedi 💪', teamLabel: 'BC AMLL · U14 A', photos: ['q1_1', 'q2_1', 'q3_1'].map((p) => ({ key: `/docs/test/photos/${p}.jpg` })) } });
await db.doc('posts/demo-message').set({ ...base, teamIds: [], targets: [`c:${CLUB_AMLL}`], type: 'message', authorUid: uid.responsable, authorName: users.responsable.name,
  visibility: 'public', teamIdPrivate: null, createdAt: new Date('2026-10-11T10:00:00+02:00'), payload: { text: 'Entraînement déplacé à 18 h mercredi.', teamLabel: 'BC AMLL (club)' } });
// Vidéo de match prête (fichiers HLS produits par « npm run render:local -- out/demo-job », servis en local)
const chapters = [{ title: 'Avant-match', start: 0, end: 6 }, { title: 'Q1', start: 6, end: 18.8 }, { title: 'Q2', start: 18.8, end: 31.6 }, { title: 'Q3', start: 31.6, end: 44.4 }, { title: 'Q4', start: 44.4, end: 52.2 }, { title: 'Fin', start: 52.2, end: 60.2 }];
void chaptersToVtt;
await db.doc('matchVideos/demo').set({ matchAwbbId: GAME, authorUid: uid.responsable, authorName: users.responsable.name, teamIds: [AMLL, MONS], visibility: 'team', teamIdPrivate: AMLL,
  status: 'ready', version: 1, title: st.title, settings: settingsToStore(st), media: [], voteUntil: new Date(Date.now() + 48 * 3600e3),
  hls: { masterKey: '/out/render/demo/hls/master.m3u8', posterKey: '/out/render/demo/hls/poster.jpg', duration: 60, chapters } });
await db.doc('renderJobs/demo').set({ matchVideoId: 'demo', authorUid: uid.responsable, status: 'done', progress: 100, step: 'Vidéo prête' });
await db.doc('posts/video-demo').set({ ...base, type: 'video', authorUid: uid.responsable, authorName: users.responsable.name, visibility: 'team', teamIdPrivate: AMLL,
  createdAt: new Date('2026-10-10T18:00:00+02:00'), payload: { matchVideoId: 'demo', title: st.title, duration: 60, posterKey: '/out/render/demo/hls/poster.jpg', score: '11 – 94' } });
// Espace Club (BC AMLL) : coach = responsable, parent de Léo (sans compte), joueur avec compte (Noah), admin du club
const T = String(AMLL), C = String(CLUB_AMLL);
await db.doc(`users/${uid.responsable}`).set({ role: 'coach', club_id: C, team_ids: [T], display_name: users.responsable.name, email: users.responsable.email });
await db.doc(`users/${uid.parent}`).set({ role: 'parent', club_id: C, children_player_ids: ['leo'], display_name: users.parent.name, email: users.parent.email });
await db.doc(`users/${uid.joueur}`).set({ role: 'player', club_id: C, display_name: users.joueur.name, email: users.joueur.email });
await db.doc(`users/${uid.admin}`).set({ role: 'club_admin', club_id: C, display_name: users.admin.name, email: users.admin.email });
await db.doc(`teams/${T}`).set({ club_id: C, coach_uids: [uid.responsable] });
await db.doc('players/leo').set({ club_id: C, team_id: T, account_uid: '', parent_uids: [uid.parent], prenom: 'Léo', nom: 'D.' });
await db.doc(`players/${uid.joueur}`).set({ club_id: C, team_id: T, account_uid: uid.joueur, parent_uids: [], prenom: 'Noah', nom: 'B.' });
await db.doc(`invitations/${users.visiteur.email}`).set({ email: users.visiteur.email, role: 'player', club_id: C, club_name: 'BC AMLL', team_id: T, status: 'pending' });
const day0 = new Date(); const iso = (n: number) => new Date(day0.getTime() - n * 864e5).toISOString().slice(0, 10);
await db.doc(`hoopcamp/${uid.joueur}`).set({ player_id: uid.joueur, profile: { age: 'U14', level: 2, hand: 'droite', basket: 'panier', space: 'moyen', surface: 'exterieur', equip: ['ballon', 'mur', 'plots'], minutes: 30, days: 5, goals: ['dribble', 'tir'] },
  program: { id: 'camp-1', name: 'Camp Vacances 1 semaine', start: iso(2), end: null, from: 'player', by: uid.joueur } });
// Deux jours d'entraînement : un validé par le coach, un en attente
const it = (ex: string, phase: string) => ({ ex, phase, dose: { sets: 2, reps: 10, rest: 15 }, sec: 90, kind: 'new' });
await db.doc(`hoopcamp/${uid.joueur}/days/${iso(2)}`).set({ date: iso(2), program: 'camp-1', team_id: T, items: [it('ech-montees-genoux', 'echauffement'), it('dri-pound-bas', 'technique'), it('tir-mikan-tir', 'technique'), it('ret-quadriceps', 'retour')],
  checks: { 'ech-montees-genoux': 1, 'dri-pound-bas': 1, 'tir-mikan-tir': 1, 'ret-quadriceps': 1 }, note: 'Mon pound main gauche est encore trop haut.',
  ratings: { 'dri-pound-bas': { r: 'correct', by: uid.responsable, name: users.responsable.name, msg: 'Plus bas !' }, 'tir-mikan-tir': { r: 'maitrise', by: uid.responsable, name: users.responsable.name } } });
await db.doc(`hoopcamp/${uid.joueur}/days/${iso(1)}`).set({ date: iso(1), program: 'camp-1', team_id: T, items: [it('ech-talons-fesses', 'echauffement'), it('dri-crossover-sur-place', 'technique'), it('fin-mikan', 'technique'), it('ret-ischios', 'retour')],
  checks: { 'ech-talons-fesses': 1, 'dri-crossover-sur-place': 1, 'fin-mikan': 1 } });
await db.collection('trainings').doc('demo-tr').set({ team_id: T, date: iso(-2), start_time: '18:00', end_time: '19:30', location: 'Salle de Loncin', created_by: uid.responsable });
console.log('✅ Démo chargée :', Object.entries(users).filter(([k]) => k !== '_note').map(([k, u]: any) => `${k} = ${u.email}`).join(' · '));
