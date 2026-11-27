// Accès enfants : créés et gérés par un parent connecté. L'enfant se connecte sur son appareil avec un code à usage
// unique (15 min), sans e-mail ni mot de passe. Il est membre (lecture) des équipes que le parent choisit parmi les siennes,
// suit ces équipes, et ne peut rien publier (règles Firestore « adult() » et garde-fou du serveur).
import type { Firestore } from './firestore';
import type { FirebaseUser } from './google';

export const KID_CODE_TTL = 15 * 60 * 1000;
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans 0/O, 1/I/L : lisible et facile à taper
/** Code saisi par l'enfant → forme canonique (6 caractères), ou null */
export function kidCode(s: string): string | null {
  const c = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 6 && [...c].every((x) => ALPHA.includes(x)) ? c : null;
}
const newCode = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => ALPHA[b % ALPHA.length]).join('');
const kidId = () => 'kid_' + [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');

interface Ctx { fs: Firestore; env: { FIREBASE_SERVICE_ACCOUNT: string; FIREBASE_PROJECT_ID: string }; user: FirebaseUser; profile: { displayName?: string } | null;
  customToken: unknown; deleteAuthUser: (sa: string, projectId: string, uid: string) => Promise<void>; json: (d: unknown, status?: number) => Response; fail: (m: string, status?: number) => Response }

/** Équipes où le parent est membre accepté en tant que parent, avec le prénom de l'enfant indiqué à l'adhésion */
async function parentTeams(fs: Firestore, uid: string) {
  const ms = await fs.query('members', [['uid', 'EQUAL', uid], ['status', 'EQUAL', 'accepted']], { allDescendants: true });
  return ms.filter((m: any) => m.relation === 'parent').map((m: any) => ({ teamId: Number(m.teamId), child: String(m.child ?? '') }));
}

async function removeKid(c: Ctx, id: string, k: any) {
  const { fs, env } = c;
  for (const t of k.teamIds ?? []) {
    await fs.delete(`teamMembers/${t}/members/${id}`).catch(() => {});
    await fs.delete(`follows/${id}/items/team-${t}`).catch(() => {});
  }
  for (const x of await fs.query('kidCodes', [['kidUid', 'EQUAL', id]]).catch(() => [] as any[])) await fs.delete(x._path).catch(() => {});
  await fs.delete(`profiles/${id}`).catch(() => {});
  await fs.delete(`kids/${id}`).catch(() => {});
  await c.deleteAuthUser(env.FIREBASE_SERVICE_ACCOUNT, env.FIREBASE_PROJECT_ID, id).catch(() => {});
}

/** Équipes de l'enfant : adhésions (lecture) et abonnements ajoutés / retirés pour coller à la liste */
async function syncTeams(fs: Firestore, id: string, name: string, before: number[], after: number[]) {
  for (const t of before.filter((x) => !after.includes(x))) { await fs.delete(`teamMembers/${t}/members/${id}`).catch(() => {}); await fs.delete(`follows/${id}/items/team-${t}`).catch(() => {}); }
  for (const t of after.filter((x) => !before.includes(x))) {
    await fs.set(`teamMembers/${t}/members/${id}`, { uid: id, teamId: t, role: 'membre', status: 'accepted', relation: 'enfant', child: true, displayName: name, createdAt: new Date() } as any, false);
    await fs.set(`follows/${id}/items/team-${t}`, { type: 'team', refId: t, uid: id, mutedTeams: [], createdAt: new Date() } as any, false);
  }
}

export async function kidRoutes(path: string, body: any, c: Ctx): Promise<Response> {
  const { fs, user, json, fail } = c;
  if (user.child) throw new Error('FORBIDDEN');
  if (!c.profile) return fail('Profil introuvable', 403);
  const mine = async () => (await fs.query('kids', [['parentUid', 'EQUAL', user.uid]])).map((k: any) => ({ ...k, id: String(k._path).split('/').pop()! }));
  const own = async (id: string) => { const k = /^kid_[a-f0-9]{24}$/.test(id) ? await fs.get<any>(`kids/${id}`) : null; if (!k || k.parentUid !== user.uid) throw new Error('FORBIDDEN'); return k; };
  const teamsOk = async (ids: unknown) => { const allowed = (await parentTeams(fs, user.uid)).map((x) => x.teamId);
    const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number))].filter((t) => allowed.includes(t)).slice(0, 6); return list; };

  if (path === '/child/list') {
    return json({ kids: (await mine()).map((k) => ({ id: k.id, name: k.name, teamIds: k.teamIds ?? [], createdAt: k.createdAt ?? null })), teams: await parentTeams(fs, user.uid) });
  }
  if (path === '/child/create') {
    const name = String(body.name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30);
    if (!name) return fail('Prénom manquant');
    if ((await mine()).length >= 6) return fail('6 accès enfant au maximum');
    const teamIds = await teamsOk(body.teamIds);
    if (!teamIds.length) return fail('Choisis au moins une équipe où tu es parent');
    const id = kidId();
    await fs.set(`kids/${id}`, { parentUid: user.uid, parentName: c.profile.displayName ?? '', name, teamIds, createdAt: new Date() } as any, false);
    await fs.set(`profiles/${id}`, { displayName: name, child: true, parentUid: user.uid, ageConfirmed: true, onboarded: true, notifPrefs: {}, createdAt: new Date() } as any, false);
    await syncTeams(fs, id, name, [], teamIds);
    return json({ id });
  }
  if (path === '/child/teams') {
    const id = String(body.id ?? ''), k = await own(id), teamIds = await teamsOk(body.teamIds);
    if (!teamIds.length) return fail('Choisis au moins une équipe');
    await syncTeams(fs, id, k.name, k.teamIds ?? [], teamIds);
    await fs.set(`kids/${id}`, { teamIds });
    return json({ ok: true });
  }
  if (path === '/child/code') {
    const id = String(body.id ?? ''); await own(id);
    for (const x of await fs.query('kidCodes', [['kidUid', 'EQUAL', id]]).catch(() => [] as any[])) await fs.delete(x._path).catch(() => {});
    let code = newCode(); for (let i = 0; i < 5 && (await fs.get(`kidCodes/${code}`)); i++) code = newCode();
    const exp = Date.now() + KID_CODE_TTL;
    await fs.set(`kidCodes/${code}`, { kidUid: id, parentUid: user.uid, exp } as any, false);
    return json({ code, exp });
  }
  if (path === '/child/revoke') { const id = String(body.id ?? ''); const k = await own(id); await removeKid(c, id, k); return json({ ok: true }); }
  if (path === '/child/revoke-all') { for (const k of await mine()) await removeKid(c, k.id, k); return json({ ok: true }); }
  return fail('Route inconnue', 404);
}
