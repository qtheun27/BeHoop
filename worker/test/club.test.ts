// Fonctions serveur de l'Espace Club (worker/src/club.ts) exécutées sur une base Firestore simulée en mémoire.
import { describe, it, expect, beforeEach } from 'vitest';
import { clubApi, spacesOf } from '../src/club';

class FakeFs {
  docs = new Map<string, any>();
  async get(p: string) { const d = this.docs.get(p); return d ? structuredClone(d) : null; }
  async set(p: string, data: any, merge = true) { this.docs.set(p, merge ? { ...(this.docs.get(p) ?? {}), ...structuredClone(data) } : structuredClone(data)); }
  async delete(p: string) { this.docs.delete(p); }
  async query(col: string, where: [string, string, any][]) {
    return [...this.docs].filter(([p]) => p.split('/').length === 2 && p.startsWith(`${col}/`)).filter(([, d]) => where.every(([f, op, v]) =>
      op === 'EQUAL' ? d[f] === v : op === 'NOT_EQUAL' ? d[f] !== v && d[f] !== undefined : op === 'ARRAY_CONTAINS' ? (d[f] ?? []).includes(v) : false))
      .map(([p, d]) => ({ ...structuredClone(d), _path: p }));
  }
}
let fs: FakeFs;
const env = { FIREBASE_SERVICE_ACCOUNT: '{}', FIREBASE_PROJECT_ID: 'demo', SITE_URL: 'http://x' };
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s });
const call = async (uid: string, path: string, body: any, isAdmin = false, email = `${uid}@x.be`) => {
  const r = await clubApi(path, { fs: fs as any, env, user: { uid, email, email_verified: true } as any, profile: { displayName: uid }, isAdmin, body, json });
  return { status: r!.status, data: await r!.json() };
};
const user = (uid: string) => fs.docs.get(`users/${uid}`);
beforeEach(() => { fs = new FakeFs(); });

describe('plusieurs rôles par compte', () => {
  it('admin à Mons, coach ailleurs, parent dans un 3e club, et on passe de l’un à l’autre', async () => {
    await call('sa', '/admin/set-role', { uid: 'q', club_id: '1312', club_name: 'Mons', role: 'club_admin', name: 'Quentin' }, true);
    await call('sa', '/admin/set-role', { uid: 'q', club_id: '1374', club_name: 'AMLL', role: 'coach', team_ids: ['51656'] }, true);
    await call('sa', '/admin/set-role', { uid: 'q', club_id: '1312', club_name: 'Mons', role: 'parent' }, true);
    const sp = spacesOf(user('q'));
    expect(Object.keys(sp).sort()).toEqual(['1312~club_admin', '1312~parent', '1374~coach']);
    expect(user('q').club_ids.sort()).toEqual(['1312', '1374']);
    expect(fs.docs.get('teams/51656').coach_uids).toEqual(['q']);
    await call('q', '/club/switch', { key: '1374~coach' });
    expect([user('q').club_id, user('q').role, user('q').team_ids]).toEqual(['1374', 'coach', ['51656']]);
    await call('q', '/club/switch', { key: '1312~club_admin' });
    expect([user('q').club_id, user('q').role]).toEqual(['1312', 'club_admin']);
    expect(Object.keys(spacesOf(user('q'))).length).toBe(3);
  });
  it('retirer le dernier rôle garde le compte (sans rôle) pour pouvoir lui en redonner un', async () => {
    await call('sa', '/admin/set-role', { uid: 'm', club_id: '1312', role: 'parent', name: 'Marie', email: 'm@x.be' }, true);
    await call('sa', '/admin/set-role', { uid: 'm', club_id: '1312', role: null, old_role: 'parent' }, true);
    expect(user('m')).toMatchObject({ role: '', email: 'm@x.be' });
    await call('sa', '/admin/set-role', { uid: 'm', club_id: '1405', club_name: 'Capitale', role: 'parent' }, true);
    expect([user('m').role, user('m').club_id]).toEqual(['parent', '1405']);
  });
  it('changer un rôle (old_role → role) sans perdre les autres', async () => {
    await call('sa', '/admin/set-role', { uid: 'c', club_id: '1', role: 'coach', team_ids: ['10'] }, true);
    await call('sa', '/admin/set-role', { uid: 'c', club_id: '2', role: 'parent' }, true);
    await call('sa', '/admin/set-role', { uid: 'c', club_id: '1', role: 'club_admin', old_role: 'coach' }, true);
    expect(Object.keys(spacesOf(user('c'))).sort()).toEqual(['1~club_admin', '2~parent']);
    expect(fs.docs.get('teams/10').coach_uids).toEqual([]);
  });
});

describe('joueurs, équipes, parents', () => {
  it('un compte nommé joueur reçoit sa fiche, avec son équipe', async () => {
    await call('sa', '/admin/set-role', { uid: 'h', club_id: '9', role: 'player', team_id: '77', name: 'Hugo T.' }, true);
    const card = (await fs.query('players', [['account_uid', 'EQUAL', 'h']]))[0];
    expect(card).toMatchObject({ club_id: '9', team_id: '77', prenom: 'Hugo' });
    await call('sa', '/admin/set-role', { uid: 'h', club_id: '9', role: 'player', old_role: 'player', team_id: '78' }, true);
    expect((await fs.query('players', [['account_uid', 'EQUAL', 'h']])).map((p) => p.team_id)).toEqual(['78']);
  });
  it('relier et délier un parent et un joueur ; le parent reçoit son espace parent', async () => {
    await fs.set('players/leo', { club_id: '9', team_id: '77', account_uid: '', parent_uids: [], prenom: 'Léo' });
    await call('sa', '/admin/link', { player_id: 'leo', parent_uid: 'p', on: true, club_name: 'Club 9', name: 'Papa' }, true);
    expect(fs.docs.get('players/leo').parent_uids).toEqual(['p']);
    expect(spacesOf(user('p'))['9~parent'].children_player_ids).toEqual(['leo']);
    await call('sa', '/admin/link', { player_id: 'leo', parent_uid: 'p', on: false }, true);
    expect(fs.docs.get('players/leo').parent_uids).toEqual([]);
    expect(spacesOf(user('p'))['9~parent'].children_player_ids).toEqual([]);
  });
  it('QR code : un parent déjà admin ailleurs ajoute un enfant dans un autre club', async () => {
    await call('sa', '/admin/set-role', { uid: 'q', club_id: '1312', role: 'club_admin' }, true);
    await fs.set('joinCodes/ABC', { club_id: '1405', club_name: 'Capitale', team_id: '55', expires: Date.now() + 1e6 });
    const r = await call('q', '/club/join', { code: 'ABC', asParent: true, child: { prenom: 'Lina' } });
    expect(r.status).toBe(200);
    expect(Object.keys(spacesOf(user('q'))).sort()).toEqual(['1312~club_admin', '1405~parent']);
    const kid = (await fs.query('players', [['parent_uids', 'ARRAY_CONTAINS', 'q']]))[0];
    expect(kid).toMatchObject({ prenom: 'Lina', club_id: '1405', team_id: '55' });
    expect(fs.docs.get('teamMembers/55/members/q')).toMatchObject({ status: 'accepted', role: 'membre' });
  });
  it('invitation d’un autre club pour un compte existant : ajoutée sans perdre l’ancien', async () => {
    await call('sa', '/admin/set-role', { uid: 'k', club_id: '1', role: 'coach', team_ids: ['10'] }, true);
    await fs.set('invitations/k@x.be', { role: 'coach', club_id: '2', club_name: 'B', team_id: '20', status: 'pending' });
    await call('k', '/club/claim', {});
    expect(Object.keys(spacesOf(user('k'))).sort()).toEqual(['1~coach', '2~coach']);
    expect(fs.docs.get('invitations/k@x.be').status).toBe('used');
    expect(fs.docs.get('teamMembers/20/members/k')).toMatchObject({ role: 'responsable' });
  });
});

describe('super admin seulement', () => {
  it('les outils /admin refusent les autres comptes', async () => {
    await expect(call('x', '/admin/set-role', { uid: 'y', club_id: '1', role: 'club_admin' })).rejects.toThrow('FORBIDDEN');
  });
  it('invitations : seulement celles en attente ; annulation', async () => {
    await fs.set('invitations/a@x.be', { role: 'coach', club_id: '1', status: 'pending' });
    await fs.set('invitations/b@x.be', { role: 'coach', club_id: '1', status: 'used' });
    expect((await call('sa', '/admin/invitations', {}, true)).data.map((i: any) => i.email)).toEqual(['a@x.be']);
    await call('sa', '/admin/invitations', { cancel: 'a@x.be' }, true);
    expect(fs.docs.has('invitations/a@x.be')).toBe(false);
  });
  it('messagerie Aide / Contact : fil, réponse, notifications, non-lus', async () => {
    const sent: string[][] = [];
    const notify = async (uids: string[]) => { sent.push(uids); };
    const run = async (uid: string, path: string, body: any, isAdmin = false) => {
      const r = await clubApi(path, { fs: fs as any, env, user: { uid, email: `${uid}@x.be` } as any, profile: { displayName: uid }, isAdmin, body, json, notify });
      return r!.json();
    };
    await run('sa', '/admin/support', {}, true); // le super admin s'enregistre pour les notifications
    const { id } = await run('u1', '/support/send', { subject: 'Souci', message: 'Je ne vois pas mon équipe' });
    expect(sent).toEqual([['sa']]);
    let l = await run('sa', '/admin/support', {}, true);
    expect(l[0]).toMatchObject({ id, subject: 'Souci', unread_admin: true, status: 'open' });
    await run('sa', '/admin/support', { reply: id, text: 'Regarde dans Équipes' }, true);
    expect(sent[1]).toEqual(['u1']);
    let mine = await run('u1', '/support/mine', {});
    expect(mine[0].messages.map((m: any) => m.from)).toEqual(['user', 'admin']);
    expect(mine[0].unread_user).toBe(true);
    await run('u1', '/support/mine', { read: id });
    mine = await run('u1', '/support/mine', {});
    expect(mine[0].unread_user).toBe(false);
    await run('u1', '/support/send', { thread: id, message: 'Merci !' });
    expect((await run('u2', '/support/send', { thread: id, message: 'intrus' }))).toMatchObject({ ok: false });
    await run('sa', '/admin/support', { close: id }, true);
    expect(await run('sa', '/admin/support', {}, true)).toEqual([]);
    l = await run('sa', '/admin/support', { all: true }, true);
    expect(l[0].messages).toHaveLength(3);
  });
});
