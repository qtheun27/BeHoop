// Espace Club : accès Firestore (mêmes collections et mêmes règles que l'ancien module /club, voir firestore.rules partie 1).
// users/{uid} : rôle et club ; invitations/{email} ; players/{id} : joueur (avec ou sans compte) ; teams/{équipe AWBB} ;
// trainings, plays ; Hoop Camp : hoopcamp/{joueur}(/days/{date}) et hoopcamp_assign/{id}.
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, deleteField,
  type DocumentData,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../lib/firebase';
import type { Program, TrainingProfile, Rating } from '../hoopcamp/types';
import type { DayLog, RatingEntry } from '../hoopcamp/engine';

export type Role = 'super_admin' | 'club_admin' | 'coach' | 'player' | 'parent';
export interface ClubUser { uid: string; role: Role; club_id: string; club_name?: string;
  /** Tous mes espaces, clé « club~rôle » (l'espace actif est aussi à plat en haut du document) */ spaces?: Record<string, Space>; clubs?: Record<string, { role: Role; club_name?: string }>; team_ids?: string[]; children_player_ids?: string[]; display_name?: string; email?: string }
export interface Space { club_id: string; role: Role; club_name?: string; team_ids?: string[] }
/** Tous les espaces d'un compte (anciens formats compris), comme worker/src/club.ts */
export function spacesOf(u: ClubUser | null): Record<string, Space> {
  const out: Record<string, Space> = {};
  for (const [k, m] of Object.entries(u?.clubs ?? {})) { const c = k.split('~')[0]; out[`${c}~${m.role}`] = { ...m, club_id: c }; }
  Object.assign(out, u?.spaces ?? {});
  if (u?.club_id && u.role) out[`${u.club_id}~${u.role}`] = { club_id: u.club_id, role: u.role, club_name: u.club_name, team_ids: u.team_ids };
  return out;
}
export interface Player { id: string; club_id: string; team_id: string | null; account_uid: string; parent_uids: string[]; prenom: string; nom: string }
export interface Invitation { email: string; role: Role; club_id: string; club_name?: string; team_id?: string | null; status: 'pending' | 'used'; created_at?: unknown }
/** Un bloc de la séance préparée : exercice de la bibliothèque (d:), du Hoop Camp (h:), du club (c:) ou libre ; durée choisie par le coach */
export interface PlanItem { key: string; ref?: string; title: string; min: number; note?: string }
export interface Training { id: string; team_id: string; date: string; start_time?: string; end_time?: string; location?: string; notes?: string; created_by?: string;
  /** Objectif de la séance et déroulé préparé */
  focus?: string; plan?: PlanItem[] }
/** Exercice créé par un coach du club, réutilisable dans toutes ses séances */
export interface ClubDrill { id: string; club_id: string; name: string; theme: string; min: number; desc: string; created_by: string }
export interface Token { id: string; type: 'offense' | 'defense' | 'ball'; label: string; x: number; y: number }
export interface Play { id: string; title: string; type: 'tactique' | 'exercice'; team_id?: string | null; notes?: string; courtMode: 'half' | 'full'; steps: { step: number; tokens: Token[] }[]; club_id: string; created_by?: string }
export interface CampProgram { id: string; name: string; start: string; end?: string | null; from: 'coach' | 'player' | 'parent'; by: string; assign?: string; custom?: Program }
export interface Camp { player_id: string; profile?: TrainingProfile; program?: CampProgram }
export interface Assign { id: string; club_id: string; team_id: string; title: string; program: Program; start: string; end: string | null; player_ids: string[]; ranking: boolean;
  board?: { name: string; xp: number }[]; created_by: string }

const list = async <T,>(q: ReturnType<typeof query>) => (await getDocs(q)).docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as T);
const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

// ---------- Compte ----------
export async function getMe(uid: string): Promise<ClubUser | null> {
  const s = await getDoc(doc(db, 'users', uid));
  // Compte sans aucun rôle (tous ses espaces retirés) : comme pas de compte club
  return s.exists() && s.data().role ? ({ uid, ...s.data() } as ClubUser) : null;
}
export async function pendingInvitation(email: string | null): Promise<Invitation | null> {
  if (!email) return null;
  const s = await getDoc(doc(db, 'invitations', email.toLowerCase())).catch(() => null);
  return s?.exists() && s.data().status === 'pending' ? (s.data() as Invitation) : null;
}
/** Accepte l'invitation : crée users/{uid} (rôle et club de l'invitation, rien d'autre) ; joueur → sa fiche players/{uid} ;
 *  parent → la fiche de l'enfant (sans compte), liée au parent. Une invitation « joueur » envoyée à l'adresse d'un parent
 *  (enfant sans e-mail) devient un compte parent (seule bascule permise par la règle users.create). */
export async function claimInvitation(user: User, inv: Invitation, name: string, child?: { prenom: string; nom: string }) {
  const email = user.email!.toLowerCase();
  const role: Role = inv.role === 'player' && child ? 'parent' : inv.role;
  const base = { role, club_id: inv.club_id, email, display_name: name, created_at: serverTimestamp(), ...(inv.club_name ? { club_name: inv.club_name } : {}) };
  await setDoc(doc(db, 'users', user.uid), {
    ...base, ...(role === 'coach' ? { team_ids: inv.team_id ? [inv.team_id] : [] } : {}), ...(role === 'parent' ? { children_player_ids: [] } : {}),
  });
  if (role === 'player') await setDoc(doc(db, 'players', user.uid), { club_id: inv.club_id, team_id: inv.team_id ?? null, account_uid: user.uid, parent_uids: [], prenom: name, nom: '', created_at: serverTimestamp() });
  if (role === 'parent' && child) {
    const c = await addDoc(collection(db, 'players'), { club_id: inv.club_id, team_id: inv.team_id ?? null, account_uid: '', parent_uids: [user.uid], prenom: child.prenom, nom: child.nom, created_at: serverTimestamp() });
    await updateDoc(doc(db, 'users', user.uid), { children_player_ids: arrayUnion(c.id) });
  }
  await updateDoc(doc(db, 'invitations', email), { status: 'used', role: inv.role, club_id: inv.club_id, team_id: inv.team_id ?? null });
}
export const renameMe = (uid: string, display_name: string) => updateDoc(doc(db, 'users', uid), { display_name });

// ---------- Joueurs ----------
export const playersOfTeam = (teamId: string) => list<Player>(query(collection(db, 'players'), where('team_id', '==', teamId)));
export const playersOfClub = (clubId: string) => list<Player>(query(collection(db, 'players'), where('club_id', '==', clubId)));
export const myPlayerCards = (uid: string) => list<Player>(query(collection(db, 'players'), where('account_uid', '==', uid)));
export const childrenOf = (uid: string) => list<Player>(query(collection(db, 'players'), where('parent_uids', 'array-contains', uid)));
export async function getPlayer(id: string): Promise<Player | null> { const s = await getDoc(doc(db, 'players', id)); return s.exists() ? ({ id, ...s.data() } as Player) : null; }
export async function addChild(me: ClubUser, prenom: string, nom: string, teamId: string | null) {
  const c = await addDoc(collection(db, 'players'), { club_id: me.club_id, team_id: teamId, account_uid: '', parent_uids: [me.uid], prenom, nom, created_at: serverTimestamp() });
  await updateDoc(doc(db, 'users', me.uid), { children_player_ids: arrayUnion(c.id) });
  return c.id;
}
export const addPlayer = (clubId: string, teamId: string | null, prenom: string, nom: string) =>
  addDoc(collection(db, 'players'), { club_id: clubId, team_id: teamId, account_uid: '', parent_uids: [], prenom, nom, created_at: serverTimestamp() });
/** Fiche joueur d'un compte joueur (créée par l'admin si elle manque) */
export const addPlayerCard = (clubId: string, teamId: string | null, uid: string, prenom: string) =>
  setDoc(doc(db, 'players', `${uid}_${clubId}`), { club_id: clubId, team_id: teamId, account_uid: uid, parent_uids: [], prenom, nom: '', created_at: serverTimestamp() });
export const movePlayer = (id: string, teamId: string | null) => updateDoc(doc(db, 'players', id), { team_id: teamId });
export const updatePlayer = (id: string, p: Partial<Pick<Player, 'prenom' | 'nom'>>) => updateDoc(doc(db, 'players', id), p);
export const deletePlayer = (id: string) => deleteDoc(doc(db, 'players', id));
/** Lie le parent connecté à la fiche d'un enfant du club qui n'a ni compte ni parent (règle players.update) */
export async function linkChild(me: ClubUser, playerId: string) {
  await updateDoc(doc(db, 'players', playerId), { parent_uids: arrayUnion(me.uid) });
  await updateDoc(doc(db, 'users', me.uid), { children_player_ids: arrayUnion(playerId) });
}

// ---------- Administration du club ----------
export const invitationsOf = (clubId: string) => list<Invitation & { id: string }>(query(collection(db, 'invitations'), where('club_id', '==', clubId)));
export const invite = (inv: Omit<Invitation, 'status'>) =>
  setDoc(doc(db, 'invitations', inv.email.toLowerCase().trim()), clean({ ...inv, email: inv.email.toLowerCase().trim(), status: 'pending', created_at: serverTimestamp() }));
export const cancelInvitation = (email: string) => deleteDoc(doc(db, 'invitations', email));
/** Membres d'un club : un élément par rôle (un compte peut être admin et parent du même club), tous clubs actifs confondus */
export async function usersOf(clubId: string): Promise<(ClubUser & { id: string })[]> {
  const [a, b] = await Promise.all([list<ClubUser & { id: string }>(query(collection(db, 'users'), where('club_id', '==', clubId))),
    list<ClubUser & { id: string }>(query(collection(db, 'users'), where('club_ids', 'array-contains', clubId))).catch(() => [])]);
  const byId = new Map([...a, ...b].map((u) => [u.id, u]));
  return [...byId.values()].flatMap((u) => Object.values(spacesOf({ ...u, uid: u.id })).filter((x) => x.club_id === clubId)
    .map((x) => ({ ...u, uid: u.id, id: `${u.id}~${x.role}`, role: x.role, club_id: clubId, team_ids: x.team_ids ?? [] })));
}
/** Rôle d'un membre de mon club (serveur : admin du club ou super admin) ; role null = retirer ce rôle */
export const setMember = (m: { uid: string; club_id: string; role: Role | null; old_role?: Role; team_ids?: string[] }) => import('../lib/api').then(({ api }) => api('/club/member', m));
/** Équipes d'un coach ; la fiche équipe garde la liste de ses coachs (coach_uids : notifications, auto-évaluation Hoop Camp) */
export async function setCoachTeams(clubId: string, uid: string, before: string[], after: string[]) {
  await updateDoc(doc(db, 'users', uid), { team_ids: after });
  for (const t of after.filter((x) => !before.includes(x))) await setDoc(doc(db, 'teams', t), { club_id: clubId, coach_uids: arrayUnion(uid) }, { merge: true });
  for (const t of before.filter((x) => !after.includes(x))) await setDoc(doc(db, 'teams', t), { club_id: clubId, coach_uids: arrayRemove(uid) }, { merge: true });
}
export const removeMember = (uid: string) => deleteDoc(doc(db, 'users', uid));
export const activateClub = (clubId: string, name: string) => setDoc(doc(db, 'clubs', clubId), { name, active: true }, { merge: true });

// ---------- Entraînements ----------
export async function trainingsOf(teamIds: string[], from: string): Promise<Training[]> {
  const out: Training[] = [];
  for (let i = 0; i < teamIds.length; i += 30) out.push(...await list<Training>(query(collection(db, 'trainings'), where('team_id', 'in', teamIds.slice(i, i + 30)))));
  return out.filter((t) => t.date >= from).sort((a, b) => (a.date + (a.start_time ?? '')).localeCompare(b.date + (b.start_time ?? '')));
}
export const addTraining = (t: Omit<Training, 'id'>) => addDoc(collection(db, 'trainings'), clean({ ...t, created_at: serverTimestamp() }));
export const deleteTraining = (id: string) => deleteDoc(doc(db, 'trainings', id));
export const updateTraining = (id: string, patch: Partial<Omit<Training, 'id'>>) => updateDoc(doc(db, 'trainings', id), clean({ ...patch, updated_at: serverTimestamp() }) as DocumentData);

// ---------- Exercices du club et vidéos épinglées ----------
export const clubDrills = (clubId: string) => list<ClubDrill>(query(collection(db, 'drills'), where('club_id', '==', clubId)));
export const addClubDrill = (d: Omit<ClubDrill, 'id'>) => addDoc(collection(db, 'drills'), { ...d, created_at: serverTimestamp() });
export const deleteClubDrill = (id: string) => deleteDoc(doc(db, 'drills', id));
/** Vidéo d'explication choisie par le club pour un exercice ou une tactique (lien YouTube, Instagram, TikTok) */
const vidId = (clubId: string, ref: string) => `${clubId}_${ref}`.replace(/[^\w-]/g, '_');
export const pinnedVideo = async (clubId: string, ref: string) => ((await getDoc(doc(db, 'exvideos', vidId(clubId, ref)))).data()?.url as string | undefined) ?? null;
export const pinVideo = (clubId: string, ref: string, url: string, by: string) =>
  (url ? setDoc(doc(db, 'exvideos', vidId(clubId, ref)), { club_id: clubId, ref, url, by, at: serverTimestamp() }) : deleteDoc(doc(db, 'exvideos', vidId(clubId, ref))));

// ---------- Tactique ----------
export const playsOf = (clubId: string) => list<Play>(query(collection(db, 'plays'), where('club_id', '==', clubId)));
export async function savePlay(p: Omit<Play, 'id'> & { id?: string }) {
  const { id, ...data } = p;
  if (id) { await setDoc(doc(db, 'plays', id), { ...data, updated_at: serverTimestamp() }); return id; }
  return (await addDoc(collection(db, 'plays'), { ...data, created_at: serverTimestamp() })).id;
}
export const deletePlay = (id: string) => deleteDoc(doc(db, 'plays', id));

// ---------- Hoop Camp ----------
export async function getCamp(pid: string): Promise<Camp | null> { const s = await getDoc(doc(db, 'hoopcamp', pid)); return s.exists() ? (s.data() as Camp) : null; }
export const watchCamp = (pid: string, cb: (c: Camp | null) => void) =>
  onSnapshot(doc(db, 'hoopcamp', pid), (s) => cb(s.exists() ? (s.data() as Camp) : null), () => cb(null));
export const setCamp = (pid: string, c: Partial<Camp>) => setDoc(doc(db, 'hoopcamp', pid), { ...c, player_id: pid, updated: serverTimestamp() }, { merge: true });
/** Le coach envoie un programme à un joueur (sans toucher à son profil) */
export const sendProgram = (pid: string, program: CampProgram) => setDoc(doc(db, 'hoopcamp', pid), { player_id: pid, program, updated: serverTimestamp() }, { merge: true });

const daysCol = (pid: string) => collection(db, 'hoopcamp', pid, 'days');
export const dayRef = (pid: string, date: string) => doc(db, 'hoopcamp', pid, 'days', date);
/** Journées (temps réel, cache hors ligne) */
export const watchDays = (pid: string, from: string, cb: (d: DayLog[]) => void) =>
  onSnapshot(query(daysCol(pid), where('date', '>=', from)), (s) => cb(s.docs.map((d) => d.data() as DayLog)), () => cb([]));
export const daysSince = async (pid: string, from: string) => (await getDocs(query(daysCol(pid), where('date', '>=', from)))).docs.map((d) => d.data() as DayLog);

/** Cocher / décocher (hors ligne : écrit dans le cache et synchronisé au retour du réseau) */
export async function toggleCheck(pid: string, day: DayLog, ex: string, on: boolean, teamId: string | null, exists: boolean) {
  if (!exists) {
    await setDoc(dayRef(pid, day.date), { date: day.date, program: day.program ?? '', items: day.items, checks: on ? { [ex]: Date.now() } : {}, team_id: teamId, updated: serverTimestamp() });
    return;
  }
  await updateDoc(dayRef(pid, day.date), { [`checks.${ex}`]: on ? Date.now() : deleteField(), updated: serverTimestamp() });
}
export async function saveNote(pid: string, day: DayLog, note: string, teamId: string | null, exists: boolean) {
  if (!exists) await setDoc(dayRef(pid, day.date), { date: day.date, program: day.program ?? '', items: day.items, checks: {}, note, team_id: teamId, updated: serverTimestamp() });
  else await updateDoc(dayRef(pid, day.date), { note, updated: serverTimestamp() });
}
/** Validation d'un adulte (parent lié, coach de l'équipe) */
export const rate = (pid: string, date: string, ex: string, r: Rating, by: string, name: string, msg?: string) =>
  updateDoc(dayRef(pid, date), { [`ratings.${ex}`]: clean({ r, by, name, msg: msg || undefined, at: Date.now() }) as RatingEntry as DocumentData, updated: serverTimestamp() });
export const selfRate = (pid: string, date: string, ex: string, r: Rating) =>
  updateDoc(dayRef(pid, date), { [`selfRatings.${ex}`]: { r, at: Date.now() }, updated: serverTimestamp() });

export const assignsOf = (clubId: string, teamId: string) =>
  list<Assign>(query(collection(db, 'hoopcamp_assign'), where('club_id', '==', clubId), where('team_id', '==', teamId)));
export const createAssign = (a: Omit<Assign, 'id'>) => addDoc(collection(db, 'hoopcamp_assign'), { ...a, created_at: serverTimestamp() });
export const updateAssign = (id: string, a: Partial<Assign>) => updateDoc(doc(db, 'hoopcamp_assign', id), a as DocumentData);
export const deleteAssign = (id: string) => deleteDoc(doc(db, 'hoopcamp_assign', id));
/** Le joueur peut-il s'auto-évaluer ? (ni parent lié, ni coach dans son équipe) — même condition que les règles */
export async function canSelfRate(p: Player) {
  if (p.parent_uids.length) return false;
  if (!p.team_id) return true;
  const t = await getDoc(doc(db, 'teams', p.team_id)).catch(() => null);
  return !t?.exists() || !(t.data().coach_uids ?? []).length;
}

// ---------- Code d'équipe (QR) ----------
export interface JoinCode { club_id: string; club_name?: string; team_id: string; created_by: string; expires: number }
export async function createJoinCode(c: Omit<JoinCode, 'expires'>) {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', code = Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => a[n % a.length]).join('');
  await setDoc(doc(db, 'joinCodes', code), { ...c, expires: Date.now() + 60 * 864e5, created_at: serverTimestamp() });
  return code;
}
export async function getJoinCode(code: string) { const s = await getDoc(doc(db, 'joinCodes', code)).catch(() => null); return s?.exists() ? (s.data() as JoinCode) : null; }
