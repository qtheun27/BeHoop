// Espace Club côté serveur : comptes avec plusieurs « espaces » (un rôle dans un club : admin à Mons, coach ailleurs,
// parent dans un 3e club…), liens avec les Équipes BeHoop, adhésion par QR code, outils du super admin.
// users/{uid} garde l'espace actif à plat (role, club_id, team_ids, children_player_ids : ce que lisent les règles Firestore)
// et tous ses espaces dans `spaces` (clé « club~rôle »), plus club_ids (liste des clubs). Seul ce fichier écrit ces champs.
import type { Firestore } from './firestore';
import { accessToken, type FirebaseUser } from './google';

export interface Space { club_id: string; role: string; club_name?: string; team_ids?: string[]; children_player_ids?: string[] }
const ROLES = ['club_admin', 'coach', 'player', 'parent', 'super_admin'];
export const key = (club: string, role: string) => `${club}~${role}`;

/** Tous les espaces d'un compte (anciens formats compris : un seul rôle à plat, ou `clubs` par club) */
export function spacesOf(u: any): Record<string, Space> {
  const out: Record<string, Space> = {};
  for (const [k, m] of Object.entries<any>(u?.clubs ?? {})) { const club = k.split('~')[0]; out[key(club, m.role)] = { ...m, club_id: club }; }
  for (const [k, m] of Object.entries<any>(u?.spaces ?? {})) out[k] = m;
  if (u?.club_id && u.role) out[key(String(u.club_id), u.role)] = { club_id: String(u.club_id), role: u.role, club_name: u.club_name ?? '', team_ids: u.team_ids ?? [], children_player_ids: u.children_player_ids ?? [] };
  return out;
}

interface Ctx { fs: Firestore; env: { FIREBASE_SERVICE_ACCOUNT: string; FIREBASE_PROJECT_ID: string; SITE_URL: string }; user: FirebaseUser; profile: { displayName?: string } | null; isAdmin: boolean; body: any; json: (d: unknown, s?: number) => Response }

export async function clubApi(path: string, c: Ctx): Promise<Response | null> {
  const { fs, env, user, profile, isAdmin, body, json } = c;

  /** Écrit les espaces d'un compte et active `active` (null : le premier restant ; aucun : plus de compte club) */
  const save = async (uid: string, u: any, spaces: Record<string, Space>, active: string | null, extra: Record<string, unknown> = {}) => {
    const keys = Object.keys(spaces);
    // Plus aucun espace : le compte reste (sans rôle), pour pouvoir lui en redonner un
    if (!keys.length) { await fs.set(`users/${uid}`, { role: '', club_id: '', club_name: '', team_ids: [], children_player_ids: [], spaces: {}, club_ids: [], email: u?.email ?? extra.email ?? '', display_name: u?.display_name || extra.name || '' } as any, false); return; }
    const a = spaces[active && spaces[active] ? active : keys.includes(key(String(u?.club_id), u?.role)) ? key(String(u.club_id), u.role) : keys[0]];
    await fs.set(`users/${uid}`, {
      role: a.role, club_id: a.club_id, club_name: a.club_name ?? '', team_ids: a.team_ids ?? [], children_player_ids: a.children_player_ids ?? [],
      spaces: spaces as any, club_ids: [...new Set(keys.map((k) => spaces[k].club_id))],
      email: u?.email ?? extra.email ?? '', display_name: u?.display_name || extra.name || '', ...(u ? {} : { created_at: new Date() }),
    } as any, false);
  };
  const teamCoach = async (club: string, team: string, uid: string, on: boolean) => {
    const tm = await fs.get<any>(`teams/${team}`);
    const l = new Set<string>(tm?.coach_uids ?? []); if (on) l.add(uid); else l.delete(uid);
    await fs.set(`teams/${team}`, { club_id: club, coach_uids: [...l] } as any);
  };

  /** Liens Espace Club → Équipes BeHoop, pour tous les espaces : coach → responsable ; joueur, parent → membre accepté. Jamais de rétrogradation. */
  const sync = async (uid: string) => {
    const u = await fs.get<any>(`users/${uid}`);
    if (!u) return [];
    const sp = Object.values(spacesOf(u));
    const want = new Map<string, { role: 'responsable' | 'membre'; relation: string }>();
    for (const s of sp) if (s.role === 'coach') for (const t of s.team_ids ?? []) want.set(String(t), { role: 'responsable', relation: 'coach' });
    const add = (t: string | null, relation: string) => { if (t && !want.has(String(t))) want.set(String(t), { role: 'membre', relation }); };
    if (sp.some((s) => s.role === 'player')) for (const p of await fs.query('players', [['account_uid', 'EQUAL', uid]])) add(p.team_id, 'joueur');
    if (sp.some((s) => s.role === 'parent')) for (const p of await fs.query('players', [['parent_uids', 'ARRAY_CONTAINS', uid]])) add(p.team_id, 'parent');
    for (const [t, w] of want) {
      if (!/^\d+$/.test(t)) continue;
      const path = `teamMembers/${t}/members/${uid}`, cur = await fs.get<any>(path);
      if (cur?.status === 'accepted' && (cur.role === 'responsable' || w.role === 'membre')) continue;
      await fs.set(path, { uid, teamId: Number(t), role: w.role, status: 'accepted', relation: w.relation, displayName: profile?.displayName ?? u.display_name ?? '', ...(cur ? {} : { createdAt: new Date() }) } as any);
    }
    return [...want.keys()];
  };
  /** Nouvelle fiche joueur (enfant sans compte, ou le joueur lui-même) */
  const newPlayer = async (club: string, team: string | null, d: { account?: string; parent?: string; prenom: string; nom?: string }) => {
    const id = d.account ? (await fs.get(`players/${d.account}`) ? `${d.account}_${club}` : d.account) : crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    await fs.set(`players/${id}`, { club_id: club, team_id: team, account_uid: d.account ?? '', parent_uids: d.parent ? [d.parent] : [], prenom: d.prenom, nom: d.nom ?? '', created_at: new Date() } as any);
    return id;
  };
  /** Ajoute un espace (rejoindre par QR ou par invitation) et l'active */
  const join = async (club: string, clubName: string, role: string, team: string | null, child?: { prenom: string; nom: string }, name?: string) => {
    const u = await fs.get<any>(`users/${user.uid}`), sp = spacesOf(u), k = key(club, role);
    const s: Space = sp[k] ?? { club_id: club, role, club_name: clubName, team_ids: [], children_player_ids: [] };
    s.club_name = clubName || s.club_name;
    if (role === 'coach' && team) { s.team_ids = [...new Set([...(s.team_ids ?? []), team])]; await teamCoach(club, team, user.uid, true); }
    if (role === 'parent' && child?.prenom) s.children_player_ids = [...(s.children_player_ids ?? []), await newPlayer(club, team, { parent: user.uid, ...child })];
    if (role === 'player' && !(await fs.query('players', [['account_uid', 'EQUAL', user.uid]])).some((p: any) => p.club_id === club))
      await newPlayer(club, team, { account: user.uid, prenom: name || u?.display_name || profile?.displayName || '' });
    sp[k] = s;
    await save(user.uid, u, sp, k, { email: (user.email ?? '').toLowerCase(), name: name || profile?.displayName || '' });
    await sync(user.uid);
  };

  if (path === '/club/sync') return json({ ok: true, teams: await sync(user.uid) });

  if (path === '/club/switch') {
    const u = await fs.get<any>(`users/${user.uid}`), sp = spacesOf(u), k = String(body.key ?? (body.clubId ? Object.keys(sp).find((x) => x.startsWith(`${body.clubId}~`)) : ''));
    if (!sp[k]) return json({ ok: false }, 400);
    await save(user.uid, u, sp, k);
    await sync(user.uid);
    return json({ ok: true });
  }

  if (path === '/club/join') {
    // Rejoindre par le code (QR) d'une équipe : joueur, ou parent qui ajoute un enfant
    const code = String(body.code ?? '').replace(/\W/g, ''), jc = await fs.get<any>(`joinCodes/${code}`);
    if (!jc || (jc.expires && jc.expires < Date.now())) return json({ ok: false, error: 'code' }, 400);
    const asParent = !!body.asParent, prenom = String(body.child?.prenom ?? '').trim().slice(0, 40), nom = String(body.child?.nom ?? '').trim().slice(0, 40);
    if (asParent && !prenom) return json({ ok: false, error: 'child' }, 400);
    await join(String(jc.club_id), jc.club_name ?? '', asParent ? 'parent' : 'player', jc.team_id ?? null, asParent ? { prenom, nom } : undefined, String(body.name ?? '').trim().slice(0, 60));
    return json({ ok: true });
  }

  if (path === '/club/claim') {
    // Invitation e-mail, aussi pour un compte qui a déjà d'autres espaces
    const email = (user.email ?? '').toLowerCase(), inv = email ? await fs.get<any>(`invitations/${email}`) : null;
    if (!inv || inv.status !== 'pending') return json({ ok: false }, 400);
    const asParent = inv.role === 'parent' || (inv.role === 'player' && !!body.asParent);
    const prenom = String(body.child?.prenom ?? '').trim().slice(0, 40), nom = String(body.child?.nom ?? '').trim().slice(0, 40);
    await join(String(inv.club_id), inv.club_name ?? '', asParent ? 'parent' : inv.role, inv.team_id ?? null, prenom ? { prenom, nom } : undefined, String(body.name ?? '').trim().slice(0, 60));
    await fs.set(`invitations/${email}`, { status: 'used' } as any);
    return json({ ok: true });
  }

  if (path === '/support/send') {
    // Aide / contact : message enregistré pour le super admin (console de modération → Messages), réponse par e-mail
    const subject = String(body.subject ?? '').trim().slice(0, 120), message = String(body.message ?? '').trim().slice(0, 3000);
    if (!message) return json({ ok: false }, 400);
    const id = `${Date.now()}-${user.uid.slice(0, 8)}`;
    await fs.set(`support/${id}`, { uid: user.uid, email: user.email ?? '', name: profile?.displayName ?? '', subject, message, page: String(body.page ?? '').slice(0, 200), status: 'open', created_at: new Date() } as any, false);
    return json({ ok: true });
  }

  // ---------- Super admin ----------
  if (!path.startsWith('/admin/') || !['/admin/accounts', '/admin/invite-admin', '/admin/move-club', '/admin/remove-club-user', '/admin/set-role', '/admin/delete-account', '/admin/players', '/admin/link', '/admin/invitations', '/admin/support'].includes(path)) return null;
  if (!isAdmin) throw new Error('FORBIDDEN');

  if (path === '/admin/accounts') {
    // Comptes BeHoop (profiles) et Espace Club (users) réunis
    const [ps, us] = await Promise.all([fs.query('profiles', []), fs.query('users', [])]);
    const out = new Map<string, any>();
    for (const p of ps) { const id = p._path.split('/').pop(); out.set(id, { uid: id, name: p.displayName ?? '?', avatar: p.avatarUrl ?? null, banned: !!p.banned, created: p.createdAt ?? null, profile: true }); }
    for (const u of us) {
      const id = u._path.split('/').pop(), o = out.get(id) ?? { uid: id, name: u.display_name ?? u.email ?? '?', profile: false };
      o.email = u.email ?? null; o.clubs = Object.values(spacesOf(u)).map((s) => ({ club_id: s.club_id, club_name: s.club_name, role: s.role, team_ids: s.team_ids ?? [] }));
      out.set(id, o);
    }
    // Comptes de connexion (Firebase Auth) qui n'ont ni profil BeHoop ni espace club : visibles aussi
    try {
      const tok = await accessToken(env.FIREBASE_SERVICE_ACCOUNT);
      let page = '';
      for (let i = 0; i < 20; i++) {
        const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:batchGet?maxResults=1000${page ? `&nextPageToken=${page}` : ''}`, { headers: { Authorization: `Bearer ${tok}` } });
        if (!r.ok) break;
        const d: any = await r.json();
        for (const a of d.users ?? []) { const o = out.get(a.localId); if (o) { o.email ??= a.email ?? null; continue; }
          out.set(a.localId, { uid: a.localId, name: a.displayName ?? a.email ?? '?', email: a.email ?? null, profile: false, clubs: [], created: a.createdAt ? Number(a.createdAt) : null }); }
        if (!d.nextPageToken) break; page = d.nextPageToken;
      }
    } catch { /* liste des connexions indisponible */ }
    const cards = await fs.query('players', [['account_uid', 'NOT_EQUAL', '']]).catch(() => []);
    for (const o of out.values()) for (const c of o.clubs ?? []) if (c.role === 'player') c.team_id = cards.find((p: any) => p.account_uid === o.uid && String(p.club_id) === String(c.club_id))?.team_id ?? null;
    const me = out.get(user.uid); if (me) me.superAdmin = true;
    return json([...out.values()]);
  }

  if (path === '/admin/set-role') {
    // Ajouter, modifier (old_role → role) ou retirer (role null) un espace d'un compte
    const uid = String(body.uid ?? '').replace(/[^\w-]/g, ''), club = String(body.club_id ?? '').replace(/\D/g, '');
    const role = body.role == null ? null : String(body.role), old = body.old_role ? String(body.old_role) : null;
    if (!uid || !club || (role && !ROLES.includes(role))) return json({ ok: false }, 400);
    const u = await fs.get<any>(`users/${uid}`), sp = spacesOf(u);
    const prev = old ? sp[key(club, old)] : undefined;
    if (old) delete sp[key(club, old)];
    if (prev?.role === 'coach') for (const t of prev.team_ids ?? []) if (role !== 'coach' || (Array.isArray(body.team_ids) && !body.team_ids.includes(t))) await teamCoach(club, t, uid, false);
    let k: string | null = null;
    if (role) {
      k = key(club, role);
      const base = sp[k] ?? (prev && prev.role === role ? prev : { club_id: club, role, team_ids: [], children_player_ids: role === 'parent' ? prev?.children_player_ids ?? [] : [] });
      sp[k] = { ...base, club_id: club, role, club_name: String(body.club_name ?? base.club_name ?? '').slice(0, 80), ...(Array.isArray(body.team_ids) ? { team_ids: body.team_ids.map(String) } : {}) };
      if (role === 'coach') for (const t of sp[k].team_ids ?? []) await teamCoach(club, t, uid, true);
      if (role === 'player') {
        // Joueur : sa fiche dans ce club (créée si besoin), avec son équipe
        const card = (await fs.query('players', [['account_uid', 'EQUAL', uid]])).find((p: any) => String(p.club_id) === club);
        const team = body.team_id === undefined ? undefined : body.team_id ? String(body.team_id) : null;
        if (card) { if (team !== undefined) await fs.set(card._path, { team_id: team } as any); }
        else await newPlayer(club, team ?? null, { account: uid, prenom: String(body.name ?? u?.display_name ?? '').split(' ')[0] || String(body.name ?? '') });
      }
    }
    await save(uid, u, sp, k ?? (u ? key(String(u.club_id), u.role) : null), { email: String(body.email ?? ''), name: String(body.name ?? '') });
    return json({ ok: true });
  }

  if (path === '/admin/players') {
    // Fiches joueurs d'un club (pour relier parents et joueurs)
    const club = String(body.club_id ?? '').replace(/\D/g, '');
    return json((await fs.query('players', [['club_id', 'EQUAL', club]])).map((p: any) => ({ id: p._path.split('/').pop(), prenom: p.prenom, nom: p.nom, team_id: p.team_id, account_uid: p.account_uid, parent_uids: p.parent_uids ?? [] })));
  }

  if (path === '/admin/link') {
    // Relier (on) ou délier un parent et une fiche joueur ; le parent reçoit l'espace « parent » de ce club si besoin
    const pid = String(body.player_id ?? '').replace(/[^\w-]/g, ''), parent = String(body.parent_uid ?? '').replace(/[^\w-]/g, ''), on = !!body.on;
    const p = await fs.get<any>(`players/${pid}`);
    if (!p || !parent) return json({ ok: false }, 400);
    const l = new Set<string>(p.parent_uids ?? []); if (on) l.add(parent); else l.delete(parent);
    await fs.set(`players/${pid}`, { parent_uids: [...l] } as any);
    const u = await fs.get<any>(`users/${parent}`), sp = spacesOf(u), k = key(String(p.club_id), 'parent');
    if (on || sp[k]) {
      const s = sp[k] ?? { club_id: String(p.club_id), role: 'parent', club_name: String(body.club_name ?? ''), team_ids: [], children_player_ids: [] };
      const kids = new Set(s.children_player_ids ?? []); if (on) kids.add(pid); else kids.delete(pid);
      sp[k] = { ...s, children_player_ids: [...kids] };
      await save(parent, u, sp, u ? key(String(u.club_id), u.role) : k, { email: String(body.email ?? ''), name: String(body.name ?? '') });
    }
    return json({ ok: true });
  }

  if (path === '/admin/invitations') {
    if (body.cancel) { await fs.delete(`invitations/${String(body.cancel).toLowerCase().replace(/[^\w@.+-]/g, '')}`); return json({ ok: true }); }
    return json((await fs.query('invitations', [['status', 'EQUAL', 'pending']])).map((d: any) => ({ email: d._path.split('/').pop(), role: d.role, club_id: d.club_id, club_name: d.club_name, status: d.status, created_at: d.created_at ?? null })));
  }

  if (path === '/admin/support') {
    if (body.close) { await fs.set(`support/${String(body.close).replace(/[^\w-]/g, '')}`, { status: 'closed' } as any); return json({ ok: true }); }
    return json((await fs.query('support', [['status', 'EQUAL', 'open']])).map((d: any) => ({ id: d._path.split('/').pop(), ...d, _path: undefined })));
  }

  if (path === '/admin/invite-admin') {
    const email = String(body.email ?? '').trim().toLowerCase(), club = String(body.club_id ?? '').replace(/\D/g, '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !club) return json({ ok: false }, 400);
    await fs.set(`invitations/${email}`, { email, role: 'club_admin', club_id: club, club_name: String(body.club_name ?? '').slice(0, 80), team_id: null, status: 'pending', created_by: user.uid, created_at: new Date() } as any, false);
    await fs.set(`clubs/${club}`, { name: String(body.club_name ?? '').slice(0, 80), active: true } as any);
    return json({ ok: true });
  }

  if (path === '/admin/move-club') {
    // Rattacher tout un ancien club (identifiant périmé, club renommé) à son club actuel
    const from = String(body.from ?? ''), to = String(body.to ?? '').replace(/\D/g, ''), name = String(body.to_name ?? '').slice(0, 80);
    if (!from || !to || from === to) return json({ ok: false }, 400);
    let n = 0;
    for (const u of await fs.query('users', [])) {
      const sp = spacesOf(u);
      if (!Object.values(sp).some((s) => s.club_id === from)) continue;
      const moved = Object.fromEntries(Object.values(sp).map((s) => (s.club_id === from ? { ...s, club_id: to, club_name: name } : s)).map((s) => [key(s.club_id, s.role), s]));
      await save(u._path.split('/').pop(), u, moved, u.club_id === from ? key(to, u.role) : key(String(u.club_id), u.role));
      n++;
    }
    for (const col of ['players', 'teams', 'plays', 'invitations', 'hoopcamp_assign', 'joinCodes'])
      for (const d of await fs.query(col, [['club_id', 'EQUAL', from]])) { await fs.set(d._path, { club_id: to, ...(col === 'invitations' || col === 'joinCodes' ? { club_name: name } : {}) } as any); n++; }
    return json({ ok: true, n });
  }

  if (path === '/admin/remove-club-user') {
    const uid = String(body.uid ?? '').replace(/[^\w-]/g, '');
    if (!uid || uid === user.uid) return json({ ok: false }, 400);
    await fs.delete(`users/${uid}`);
    return json({ ok: true });
  }

  if (path === '/admin/delete-account') {
    // Supprimer complètement un compte (connexion, profil BeHoop, espaces club)
    const uid = String(body.uid ?? '').replace(/[^\w-]/g, '');
    if (!uid || uid === user.uid) return json({ ok: false }, 400);
    await fs.delete(`users/${uid}`).catch(() => {});
    await fs.delete(`profiles/${uid}`).catch(() => {});
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:delete`, {
      method: 'POST', headers: { Authorization: `Bearer ${await accessToken(env.FIREBASE_SERVICE_ACCOUNT)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: uid }) });
    return json({ ok: true, auth: r.ok });
  }
  return null;
}
