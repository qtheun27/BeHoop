// Accès Firestore de la couche sociale. Collections : voir docs/ARCHITECTURE.md
// (profiles = « users » du cahier des charges, teamInfo = « teams », pour ne pas entrer en collision avec l'Espace Club).
import {
  collection, collectionGroup, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, where, orderBy, limit,
  startAfter, serverTimestamp, deleteField, increment, onSnapshot, arrayUnion, Timestamp, type QueryDocumentSnapshot, type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { uid as rid } from './util';
import type { AgeGroup } from '../../../shared/types';

export type Emoji = '🏀' | '🔥' | '👏';
export const EMOJIS: Emoji[] = ['🏀', '🔥', '👏'];
export type PostType = 'score' | 'video' | 'photo' | 'message' | 'moment' | 'live';
export interface Post {
  id: string; type: PostType; authorUid: string | null; authorName?: string; clubId: number | null; teamIds: number[]; targets: string[];
  visibility: 'public' | 'team'; teamIdPrivate: number | null; payload: Record<string, any>; reactions: Partial<Record<Emoji, number>>;
  hidden: boolean; hiddenReason?: string; createdAt: number;
}
export interface Profile {
  displayName: string; avatarUrl?: string; createdAt?: unknown; ageConfirmed: boolean; onboarded?: boolean;
  notifPrefs: Record<string, boolean>; fcmTokens?: string[]; banned?: boolean; theme?: 'auto' | 'light' | 'dark';
  /** Préférences d'affichage (Mon thème) */ ui?: Partial<import('./theme').ThemePrefs>;
  /** Équipes (ou compétitions 'comp-…') dont le calendrier a déjà été ajouté au téléphone */ calendars?: (number | string)[];
  /** Langue de l'appli (notifications envoyées dans cette langue) */ lang?: 'fr' | 'nl' | 'en';
  /** Téléphone (privé : profil lisible par soi seul) ; copié dans une annonce de covoiturage, montré après acceptation */ phone?: string;
}
/** Suivi d'un club, d'une équipe ou d'une compétition (compId : identifiant de competitions.json, refId vaut alors 0) */
export interface Follow { id: string; type: 'club' | 'team' | 'comp'; refId: number; compId?: string; mutedTeams?: number[] }
export type Relation = 'parent' | 'joueur' | 'coach' | 'autre';
export interface Membership { teamId: number; uid: string; role: 'membre' | 'responsable'; status: 'pending' | 'accepted'; relation?: Relation; message?: string; displayName?: string; createdAt?: unknown }

export const NOTIF_TYPES: { key: string; label: string }[] = [
  { key: 'match2h', label: 'Match dans 2 h' }, { key: 'result', label: 'Résultat final' }, { key: 'newVideo', label: 'Nouvelle vidéo d’une équipe' },
  { key: 'videoReady', label: 'Ta vidéo est prête' }, { key: 'joinRequest', label: 'Demande d’accès à l’Équipe' },
  { key: 'joinAccepted', label: 'Ta demande est acceptée' }, { key: 'live', label: 'Score en direct' }, { key: 'carpool', label: 'Covoiturage' },
  { key: 'hoopcamp', label: 'Hoop Camp' }, { key: 'support', label: 'Aide / Contact' },
];
export const defaultPrefs = () => Object.fromEntries(NOTIF_TYPES.map((n) => [n.key, true]));

const toMs = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : Date.now());
const toPost = (d: QueryDocumentSnapshot<DocumentData> | { id: string; data: () => DocumentData }): Post => {
  const x = d.data();
  return { ...(x as Post), id: d.id, createdAt: toMs(x.createdAt), reactions: x.reactions ?? {} };
};

/* ---------- Profil ---------- */
export const profileRef = (uid: string) => doc(db, 'profiles', uid);
export async function getProfile(uid: string) { const s = await getDoc(profileRef(uid)); return s.exists() ? (s.data() as Profile) : null; }
export async function createProfile(uid: string, displayName: string) {
  const p: Profile = { displayName, ageConfirmed: true, notifPrefs: defaultPrefs(), onboarded: false };
  await setDoc(profileRef(uid), { ...p, createdAt: serverTimestamp() });
  await setDoc(doc(db, 'legalAcceptances', uid), { cguVersion: '2026-10', acceptedAt: serverTimestamp() });
  return p;
}
export const updateProfile = (uid: string, p: Partial<Profile>) => updateDoc(profileRef(uid), p as DocumentData);
export const addFcmToken = (uid: string, token: string) => updateDoc(profileRef(uid), { fcmTokens: arrayUnion(token) });

/* ---------- Suivis ---------- */
const followsCol = (uid: string) => collection(db, 'follows', uid, 'items');
export async function listFollows(uid: string): Promise<Follow[]> {
  const s = await getDocs(followsCol(uid));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Follow, 'id'>) }));
}
export const followId = (type: 'club' | 'team', id: number) => `${type}-${id}`;
export const follow = (uid: string, type: 'club' | 'team', refId: number) =>
  setDoc(doc(followsCol(uid), followId(type, refId)), { type, refId, uid, createdAt: serverTimestamp(), mutedTeams: [] });
export const unfollow = (uid: string, type: 'club' | 'team', refId: number) => deleteDoc(doc(followsCol(uid), followId(type, refId)));
export const compFollowId = (compId: string) => `comp-${compId}`;
export const followComp = (uid: string, compId: string) =>
  setDoc(doc(followsCol(uid), compFollowId(compId)), { type: 'comp', refId: 0, compId, uid, createdAt: serverTimestamp() });
export const unfollowComp = (uid: string, compId: string) => deleteDoc(doc(followsCol(uid), compFollowId(compId)));
export const setMuted = (uid: string, clubId: number, muted: number[]) => updateDoc(doc(followsCol(uid), followId('club', clubId)), { mutedTeams: muted });

/* ---------- Équipes 🔒 ---------- */
const membersCol = (teamId: number) => collection(db, 'teamMembers', String(teamId), 'members');
export async function myMemberships(uid: string): Promise<Membership[]> {
  const s = await getDocs(query(collectionGroup(db, 'members'), where('uid', '==', uid)));
  return s.docs.map((d) => d.data() as Membership);
}
/** child : prénom de l'enfant (demande d'un parent) — à l'acceptation, le parent est relié à sa fiche joueur dans le club */
export async function requestJoin(uid: string, teamId: number, displayName: string, message: string, relation: Relation, child = '') {
  await setDoc(doc(membersCol(teamId), uid), { uid, teamId, role: 'membre', status: 'pending', relation, message: message.slice(0, 200), displayName, ...(child.trim() ? { child: child.trim().slice(0, 40) } : {}), createdAt: serverTimestamp() });
  notifyApi('/notify/join-request', { teamId }); // prévient les responsables
}
export async function teamMembersList(teamId: number): Promise<Membership[]> {
  const s = await getDocs(membersCol(teamId));
  return s.docs.map((d) => d.data() as Membership);
}
export async function setMember(teamId: number, uid: string, p: Partial<Membership>) {
  await updateDoc(doc(membersCol(teamId), uid), p as DocumentData);
  if (p.status === 'accepted') notifyApi('/notify/join-accepted', { teamId, uid }); // « Ta demande est acceptée »
}
/** Notification via le Worker, sans bloquer l'action si le Worker est indisponible. */
function notifyApi(path: string, body: unknown) { import('./api').then(({ api }) => api(path, body)).catch(() => {}); }
export const removeMember = (teamId: number, uid: string) => deleteDoc(doc(membersCol(teamId), uid));
export async function pendingForResponsible(teamIds: number[]): Promise<Membership[]> {
  const out: Membership[] = [];
  for (const t of teamIds) {
    const s = await getDocs(query(membersCol(t), where('status', '==', 'pending')));
    s.forEach((d) => out.push(d.data() as Membership));
  }
  return out;
}

/* ---------- Infos équipe (Jeunes/Seniors, personnalisation) ---------- */
export interface TeamInfo { awbbId: number; clubId: number; name: string; category: string; ageGroup: AgeGroup; ageGroupOverride?: AgeGroup | null;
  override?: { displayName?: string; logoUrl?: string; colors?: string[] } }
export async function getTeamInfo(teamId: number) { const s = await getDoc(doc(db, 'teamInfo', String(teamId))); return s.exists() ? (s.data() as TeamInfo) : null; }
export const setTeamOverride = (teamId: number, o: TeamInfo['override']) => setDoc(doc(db, 'teamInfo', String(teamId)), { override: o }, { merge: true });
export const setAgeGroupOverride = (teamId: number, ag: AgeGroup | null) => setDoc(doc(db, 'teamInfo', String(teamId)), { ageGroupOverride: ag }, { merge: true });

/* ---------- Fil ---------- */
export const PAGE = 15;
export interface FeedCursor { pub: (QueryDocumentSnapshot | null)[]; priv: QueryDocumentSnapshot | null; done: boolean }
/**
 * Fil paginé : posts publics des cibles suivies (par paquets de 30 pour array-contains-any)
 * + posts privés des Équipes 🔒 dont je suis membre. Fusion et tri côté client.
 */
export async function feedPage(targets: string[], privTeams: number[], cur?: FeedCursor): Promise<{ posts: Post[]; cursor: FeedCursor }> {
  const chunks: string[][] = [];
  for (let i = 0; i < targets.length; i += 30) chunks.push(targets.slice(i, i + 30));
  const cursor: FeedCursor = cur ?? { pub: chunks.map(() => null), priv: null, done: false };
  const res: Post[] = [];
  await Promise.all(chunks.map(async (c, i) => {
    if (cur && cursor.pub[i] === undefined) return;
    const q = query(collection(db, 'posts'), where('visibility', '==', 'public'), where('targets', 'array-contains-any', c), orderBy('createdAt', 'desc'),
      ...(cursor.pub[i] ? [startAfter(cursor.pub[i])] : []), limit(PAGE));
    const s = await getDocs(q);
    s.docs.forEach((d) => res.push(toPost(d)));
    cursor.pub[i] = s.docs.length < PAGE ? (undefined as unknown as null) : s.docs[s.docs.length - 1];
  }));
  if (privTeams.length && cursor.priv !== undefined) {
    const q = query(collection(db, 'posts'), where('visibility', '==', 'team'), where('teamIdPrivate', 'in', privTeams.slice(0, 30)), orderBy('createdAt', 'desc'),
      ...(cursor.priv ? [startAfter(cursor.priv)] : []), limit(PAGE));
    const s = await getDocs(q);
    s.docs.forEach((d) => res.push(toPost(d)));
    cursor.priv = s.docs.length < PAGE ? (undefined as unknown as null) : s.docs[s.docs.length - 1];
  }
  const seen = new Set<string>();
  const posts = res.filter((p) => !seen.has(p.id) && seen.add(p.id)).sort((a, b) => b.createdAt - a.createdAt);
  cursor.done = cursor.pub.every((x) => x === undefined) && (cursor.priv === undefined || !privTeams.length);
  return { posts, cursor };
}
export async function postsForTeam(teamId: number, member: boolean): Promise<Post[]> {
  const out: Post[] = [];
  const s = await getDocs(query(collection(db, 'posts'), where('visibility', '==', 'public'), where('targets', 'array-contains', `t:${teamId}`), orderBy('createdAt', 'desc'), limit(20)));
  s.forEach((d) => out.push(toPost(d)));
  if (member) {
    const p = await getDocs(query(collection(db, 'posts'), where('visibility', '==', 'team'), where('teamIdPrivate', '==', teamId), orderBy('createdAt', 'desc'), limit(20)));
    p.forEach((d) => out.push(toPost(d)));
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}
export async function myPosts(uid: string): Promise<Post[]> {
  const s = await getDocs(query(collection(db, 'posts'), where('authorUid', '==', uid), orderBy('createdAt', 'desc'), limit(30)));
  return s.docs.map(toPost);
}
export async function getPost(id: string) { const s = await getDoc(doc(db, 'posts', id)); return s.exists() ? toPost(s as any) : null; }
export const newPostId = () => rid(20);
export async function createPost(id: string, p: Omit<Post, 'id' | 'createdAt' | 'reactions' | 'hidden'>) {
  await setDoc(doc(db, 'posts', id), { ...p, reactions: {}, hidden: false, createdAt: serverTimestamp() });
}
export const deletePost = (id: string) => deleteDoc(doc(db, 'posts', id));
export const myReaction = async (postId: string, uid: string) => {
  const s = await getDoc(doc(db, 'posts', postId, 'reactions', uid));
  return s.exists() ? (s.data().emoji as Emoji) : null;
};
/** Réaction (une par personne et par post) : document + compteur dans la même écriture groupée. */
export async function react(postId: string, uid: string, next: Emoji | null, prev: Emoji | null) {
  const b = writeBatch(db);
  const r = doc(db, 'posts', postId, 'reactions', uid);
  const upd: Record<string, unknown> = {};
  if (prev) upd[`reactions.${prev}`] = increment(-1);
  if (next) upd[`reactions.${next}`] = increment(1);
  if (next) b.set(r, { emoji: next }); else b.delete(r);
  b.update(doc(db, 'posts', postId), upd);
  await b.commit();
}
export const hidePost = (id: string, reason: 'parent' | 'auteur' | 'responsable' | 'admin', by: string) =>
  updateDoc(doc(db, 'posts', id), { hidden: true, hiddenReason: reason, hiddenBy: by, hiddenAt: serverTimestamp() });
export const unhidePost = (id: string) => updateDoc(doc(db, 'posts', id), { hidden: false, hiddenReason: null });

/* ---------- Fils de discussion : commentaires et réactions (actus, matchs, publications) ----------
 * threads/{clé} : « news-{id} », « game-{id} » ou « post-{id} » ; compteurs { reactions, comments }. */
export type ThreadKey = `news-${string}` | `game-${number}` | `post-${string}`;
export const newsThread = (id: string): ThreadKey => `news-${id.replace(/[^A-Za-z0-9_]/g, '_')}`;
export interface Thread { reactions: Partial<Record<Emoji, number>>; comments: number }
export interface Comment { id: string; authorUid: string; authorName: string; text: string; createdAt: number; hidden: boolean }
const threadRef = (k: ThreadKey) => doc(db, 'threads', k);
/** Un fil créé par un commentaire n'a pas encore de compteur de réactions (et inversement) */
const toThread = (x?: DocumentData): Thread => ({ reactions: x?.reactions ?? {}, comments: x?.comments ?? 0 });
export async function getThread(k: ThreadKey): Promise<Thread> {
  const s = await getDoc(threadRef(k));
  return toThread(s.exists() ? s.data() : undefined);
}
export const watchThread = (k: ThreadKey, cb: (t: Thread) => void) =>
  onSnapshot(threadRef(k), (s) => cb(toThread(s.exists() ? s.data() : undefined)), () => {});
export async function myThreadReaction(k: ThreadKey, uid: string) {
  const s = await getDoc(doc(db, 'threads', k, 'reactions', uid));
  return s.exists() ? (s.data().emoji as Emoji) : null;
}
/** Réaction : document reactions/{uid} + compteur, dans la même écriture (le fil est créé au premier geste). */
export async function reactThread(k: ThreadKey, uid: string, next: Emoji | null, prev: Emoji | null) {
  const b = writeBatch(db);
  const r: Record<string, unknown> = {};
  if (prev) r[prev] = increment(-1);
  if (next) r[next] = increment(1);
  b.set(threadRef(k), { reactions: r, comments: increment(0) }, { merge: true });
  const mine = doc(db, 'threads', k, 'reactions', uid);
  if (next) b.set(mine, { emoji: next }); else b.delete(mine);
  await b.commit();
}
export async function listComments(k: ThreadKey): Promise<Comment[]> {
  const s = await getDocs(query(collection(db, 'threads', k, 'comments'), orderBy('createdAt', 'asc'), limit(200)));
  return s.docs.map((d) => { const x = d.data(); return { id: d.id, ...x, createdAt: (x.createdAt as Timestamp)?.toMillis?.() ?? Date.now() } as Comment; });
}
export async function addComment(k: ThreadKey, uid: string, authorName: string, text: string) {
  const id = rid(20);
  const b = writeBatch(db);
  b.set(doc(db, 'threads', k, 'comments', id), { authorUid: uid, authorName: authorName.slice(0, 60), text, createdAt: serverTimestamp(), hidden: false });
  b.set(doc(db, 'myComments', uid, 'items', id), { thread: k }); // liste personnelle : effacement à la suppression du compte
  b.set(threadRef(k), { comments: increment(1) }, { merge: true }); // pas de « reactions: {} » : la fusion viderait les compteurs
  await b.commit();
  return id;
}
export async function deleteComment(k: ThreadKey, id: string, uid?: string) {
  const b = writeBatch(db);
  b.delete(doc(db, 'threads', k, 'comments', id));
  if (uid) b.delete(doc(db, 'myComments', uid, 'items', id));
  b.set(threadRef(k), { comments: increment(-1) }, { merge: true });
  await b.commit();
}
export const hideComment = (k: ThreadKey, id: string, hidden = true) => updateDoc(doc(db, 'threads', k, 'comments', id), { hidden });
/** Signalement d'un commentaire : même collection que les publications, clé « c~{fil}~{commentaire} » */
export const commentReportId = (k: ThreadKey, id: string) => `c~${k}~${id}`;

/* ---------- Signalements / modération ---------- */
export const REPORT_REASONS = ['Contenu inapproprié', 'Moquerie envers un joueur', 'Photo d’enfant sans accord', 'Spam', 'Autre'];
export const report = (postId: string, uid: string, reason: string) =>
  setDoc(doc(db, 'reports', `${postId}_${uid}`), { postId, reporterUid: uid, reason, status: 'open', createdAt: serverTimestamp() });
export async function openReports() {
  const s = await getDocs(query(collection(db, 'reports'), where('status', '==', 'open'), orderBy('createdAt', 'desc'), limit(50)));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as { postId: string; reason: string; reporterUid: string }) }));
}
export const closeReport = (id: string) => updateDoc(doc(db, 'reports', id), { status: 'closed' });
export async function hiddenPosts() {
  const s = await getDocs(query(collection(db, 'posts'), where('hidden', '==', true), orderBy('createdAt', 'desc'), limit(50)));
  return s.docs.map(toPost);
}
export const banUser = (uid: string, banned: boolean) => setDoc(profileRef(uid), { banned }, { merge: true });

/* ---------- Temps réel ---------- */
export const watchDoc = <T,>(path: string, cb: (d: T | null) => void) =>
  onSnapshot(doc(db, path), (s) => cb(s.exists() ? (s.data() as T) : null), () => cb(null));
export { deleteField, serverTimestamp, doc, db, setDoc, updateDoc, getDocs, query, collection, collectionGroup, where, orderBy, limit, onSnapshot, deleteDoc, getDoc, arrayUnion };
