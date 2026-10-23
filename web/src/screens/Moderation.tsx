// Console de modération (super admin) : signalements, contenus masqués, bannissement, responsables, Jeunes/Seniors.
import { useEffect, useState } from 'react';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { teamIndex, teamLabel, loadIndex } from '../lib/data';
import { api } from '../lib/api';
import { Conversation, type SupportThread } from '../ui/Help';
import { Screen, Empty, Skeleton, useAsync, Avatar, Sheet } from '../ui/kit';
import { PostCard } from './Feed';
import { t } from '../lib/i18n';

export default function Moderation() {
  const s = useSession();
  const [tab, setTab] = useState<'requests' | 'reports' | 'hidden' | 'teams' | 'users' | 'clubs' | 'support'>(() => (new URLSearchParams(location.hash.split('?')[1] ?? '').get('tab') === 'support' ? 'support' : 'requests'));
  if (!s.isAdmin) return <Screen title={t('Modération')} back="profil"><Empty ill="ban" title={t('Réservé au super admin')} /></Screen>;
  return (
    <Screen title={t('Modération')} back="profil">
      <div className="seg">{([['requests', 'Demandes'], ['reports', 'Signalements'], ['hidden', 'Masqués'], ['teams', 'Équipes'], ['users', 'Comptes'], ['clubs', 'Clubs'], ['support', 'Messages']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(l)}</button>)}</div>
      {tab === 'requests' && <Requests />}{tab === 'reports' && <Reports />}{tab === 'hidden' && <Hidden />}{tab === 'teams' && <Teams />}{tab === 'users' && <Users />}{tab === 'clubs' && <><Clubs /><AllInvitations /></>}{tab === 'support' && <Support />}
    </Screen>
  );
}
/** Demandes d'accès en attente, toutes équipes confondues (utile tant qu'une équipe n'a pas de responsable). */
function Requests() {
  const idx = useAsync(teamIndex, []);
  const { data, reload } = useAsync(async () => {
    const s = await D.getDocs(D.query(D.collectionGroup(D.db, 'members'), D.where('status', '==', 'pending')));
    return s.docs.map((d) => d.data() as D.Membership);
  }, []);
  if (!data) return <Skeleton />;
  if (!data.length) return <Empty ill="checkCircle" title={t('Aucune demande en attente')} />;
  const act = async (f: () => Promise<unknown>) => { await f(); reload(); };
  return (
    <div className="group">{data.map((m) => { const e = idx.data?.get(m.teamId); return (
      <div key={`${m.teamId}-${m.uid}`} className="row" style={{ flexWrap: 'wrap' }}>
        <div className="grow"><div style={{ fontWeight: 600 }}>{m.displayName}</div>
          <div className="sub">{e ? `${e.club.short} · ${teamLabel(e.team)}` : `${t('Équipe')} ${m.teamId}`}</div>
          {m.message && <div className="sub">« {m.message} »</div>}</div>
        <button className="btn small" onClick={() => act(() => D.setMember(m.teamId, m.uid, { status: 'accepted' }))}>{t('Accepter')}</button>
        <button className="btn small secondary" onClick={() => act(() => D.setMember(m.teamId, m.uid, { status: 'accepted', role: 'responsable' }))}>{t('Responsable')}</button>
        <button className="btn small danger" onClick={() => act(() => D.removeMember(m.teamId, m.uid))}>{t('Refuser')}</button>
      </div>); })}</div>
  );
}

function Reports() {
  const { data, reload } = useAsync(D.openReports, []);
  if (!data) return <Skeleton />;
  if (!data.length) return <Empty ill="checkCircle" title={t('Aucun signalement ouvert')} />;
  return <>{data.map((r) => <Report key={r.id} r={r} done={reload} />)}</>;
}
/** Signalement d'un commentaire : postId = « c~{fil}~{commentaire} » */
function CommentReport({ r, done }: { r: { id: string; postId: string; reason: string }; done: () => void }) {
  const [, key, cid] = r.postId.split('~') as [string, D.ThreadKey, string];
  const c = useAsync(async () => { const x = await D.getDoc(D.doc(D.db, 'threads', key, 'comments', cid)); return x.exists() ? (x.data() as D.Comment) : null; }, [r.postId]);
  return (
    <div className="group" style={{ padding: 12 }}>
      <div className="hstack"><b style={{ flex: 1 }}>« {t(r.reason)} » · {t('Commentaire')}</b>
        <button className="btn small danger" onClick={async () => { await D.hideComment(key, cid).catch(() => {}); await D.closeReport(r.id); done(); }}>{t('Masquer')}</button>
        <button className="btn small secondary" onClick={async () => { await D.closeReport(r.id); done(); }}>{t('Ignorer')}</button></div>
      {c.data === null && <div className="sub mt">{t('Commentaire supprimé')}</div>}
      {c.data && <div className="mt"><div className="sub">{c.data.authorName} · {key}</div><div style={{ whiteSpace: 'pre-wrap' }}>{c.data.text}</div></div>}
      {c.data?.authorUid && <button className="btn small danger mt" onClick={async () => { if (confirm(t('Bannir l’auteur ?'))) { await D.banUser(c.data!.authorUid, true); done(); } }}>{t('Bannir l\'auteur')}</button>}
    </div>
  );
}
function Report({ r, done }: { r: { id: string; postId: string; reason: string }; done: () => void }) {
  if (r.postId.startsWith('c~')) return <CommentReport r={r} done={done} />;
  return <PostReport r={r} done={done} />;
}
function PostReport({ r, done }: { r: { id: string; postId: string; reason: string }; done: () => void }) {
  const post = useAsync(() => D.getPost(r.postId), [r.postId]);
  return (
    <div className="group" style={{ padding: 12 }}>
      <div className="hstack"><b style={{ flex: 1 }}>« {t(r.reason)} »</b>
        <button className="btn small danger" onClick={async () => { await D.hidePost(r.postId, 'admin', 'admin'); await D.closeReport(r.id); done(); }}>{t('Masquer')}</button>
        <button className="btn small secondary" onClick={async () => { await D.closeReport(r.id); done(); }}>{t('Ignorer')}</button></div>
      {post.data && <div className="mt"><PostCard post={post.data} /></div>}
      {post.data?.authorUid && <button className="btn small danger" onClick={async () => { if (confirm(t('Bannir l’auteur ?'))) { await D.banUser(post.data!.authorUid!, true); done(); } }}>{t('Bannir l\'auteur')}</button>}
    </div>
  );
}
function Hidden() {
  const { data } = useAsync(D.hiddenPosts, []);
  if (!data) return <Skeleton />;
  return data.length ? <>{data.map((p) => <div key={p.id}><div className="muted" style={{ fontSize: 13 }}>{t('Motif')} : {p.hiddenReason}</div><PostCard post={p} /></div>)}</> : <Empty ill="eyeOff" title={t('Aucun contenu masqué')} />;
}
function Teams() {
  const s = useSession();
  const [q, setQ] = useState('');
  const idx = useAsync(teamIndex, []);
  const [sel, setSel] = useState<number | null>(null);
  const info = useAsync(() => (sel ? D.getTeamInfo(sel) : Promise.resolve(null)), [sel]);
  const list = idx.data ? [...idx.data.values()].filter((e) => q.length > 1 && `${e.club.name} ${e.team.name}`.toLowerCase().includes(q.toLowerCase())).slice(0, 20) : [];
  return (
    <>
      <div className="search"><input className="field" placeholder={t('Rechercher une équipe')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="group">{list.map((e) => <button key={e.team.id} className="row" onClick={() => setSel(e.team.id)}><div className="grow">{e.club.short} · {teamLabel(e.team)}<div className="sub">{e.team.cat} → {e.team.ag}</div></div></button>)}</div>
      {sel && <div className="group" style={{ padding: 14 }}>
        <b>Équipe {sel}</b>
        <div className="hstack mt">{t('Classement')} :
          {(['jeunes', 'seniors'] as const).map((g) => <button key={g} className={`btn small${(info.data?.ageGroupOverride ?? info.data?.ageGroup ?? idx.data?.get(sel)?.team.ag) === g ? '' : ' secondary'}`}
            onClick={async () => { await D.setAgeGroupOverride(sel, g); info.reload(); }}>{g === 'jeunes' ? t('Jeunes') : t('Seniors')}</button>)}</div>
        <label className="label">{t('Nommer un responsable')}</label>
        <AccountPicker onPick={() => {}} action={(a) => <button className="btn small" onClick={async () => { await D.setDoc(D.doc(D.db, 'teamMembers', String(sel), 'members', a.uid), { uid: a.uid, teamId: sel, role: 'responsable', status: 'accepted', displayName: a.name, createdAt: D.serverTimestamp() }); s.toast(t('{n} est responsable', { n: a.name })); }}>{t('Nommer')}</button>} />
      </div>}
    </>
  );
}
/** Tous les comptes BeHoop (profils) avec leur rôle éventuel dans l'Espace Club : recherche par nom */
interface Account { superAdmin?: boolean; uid: string; name: string; avatar?: string; banned?: boolean; created?: string | number; profile: boolean; email?: string; clubs?: { role: string; club_name?: string; club_id: string; team_ids?: string[]; team_id?: string | null }[] }
/** Liste fusionnée côté serveur (réservée au super admin) : comptes BeHoop et comptes Espace Club */
const loadAccounts = async () => (await api<Account[]>('/admin/accounts')).sort((a, b) => a.name.localeCompare(b.name));
const ROLE_FR: Record<string, string> = { super_admin: 'Super admin', club_admin: 'Admin du club', coach: 'Coach', player: 'Joueur', parent: 'Parent' };
function AccountPicker({ onPick, action }: { onPick: (a: Account) => void; action: (a: Account) => React.ReactNode }) {
  const acc = useAsync(loadAccounts, []);
  const idx = useAsync(loadIndex, []);
  const cname = (c: { club_id: string; club_name?: string }) => idx.data?.clubs.find((x) => String(x.id) === String(c.club_id))?.name ?? (c.club_name || c.club_id || '');
  const [q, setQ] = useState('');
  if (acc.loading) return <Skeleton n={3} />;
  if (acc.error) return <Empty ill="alert" title={acc.error} />;
  const list = (acc.data ?? []).filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()) || (a.clubs ?? []).some((c) => (c.club_name ?? '').toLowerCase().includes(q.toLowerCase())) || (a.email ?? '').toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="search"><input className="field" placeholder={t('Rechercher un compte (nom ou club)')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <p className="muted" style={{ fontSize: 13, margin: '0 4px 8px' }}>{t('{n} comptes', { n: list.length })}</p>
      <div className="group">
        {list.slice(0, 100).map((a) => (
          <div key={a.uid} className="row" style={{ cursor: 'pointer' }} onClick={() => onPick(a)}>
            <Avatar name={a.name} src={a.avatar} />
            <div className="grow">{a.name}{a.banned && <b style={{ color: 'var(--red)' }}> · {t('banni')}</b>}
              <div className="sub">{a.superAdmin ? `${t('Super admin')} · ` : ''}{a.clubs?.length ? a.clubs.map((c) => `${t(ROLE_FR[c.role] ?? c.role)}${cname(c) ? ` · ${cname(c)}` : ''}`).join(' / ') : t('Pas d’Espace Club')}{!a.profile ? ` · ${t('pas de profil BeHoop')}` : ''}{a.email ? ` · ${a.email}` : ''}{a.created ? ` · ${new Date(a.created).toLocaleDateString()}` : ''}</div></div>
            <span onClick={(e) => e.stopPropagation()}>{action(a)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
function Users() {
  const s = useSession();
  const [n, setN] = useState(0);
  const removeClub = async (a: Account) => {
    if (!confirm(t('Retirer {n} de l’Espace Club ? Son compte BeHoop reste actif.', { n: a.name }))) return;
    try { await api('/admin/remove-club-user', { uid: a.uid }); s.toast(t('Retiré de l’Espace Club.')); setN(n + 1); } catch { s.toast(t('Accès refusé.')); }
  };
  const [open, setOpen] = useState<Account | null>(null);
  const [all, setAll] = useState<Account[]>([]);
  useEffect(() => { loadAccounts().then(setAll).catch(() => {}); }, [n]);
  if (open) return <AccountSheet a={open} all={all} onClose={(changed) => { setOpen(null); if (changed) setN(n + 1); }} />;
  return <AccountPicker key={n} onPick={setOpen} action={(a) => !a.profile ? (a.clubs?.length && a.uid !== s.user?.uid ? <button className="btn small danger" onClick={() => removeClub(a)}>{t('Retirer de l’Espace Club')}</button> : null) : (a.banned
    ? <button className="btn small secondary" onClick={async () => { await D.banUser(a.uid, false); s.toast(t('Compte rétabli')); setN(n + 1); }}>{t('Rétablir')}</button>
    : a.profile && a.uid !== s.user?.uid && <button className="btn small danger" onClick={async () => { if (confirm(t('Bannir {n} ?', { n: a.name }))) { await D.banUser(a.uid, true); s.toast(t('Compte banni')); setN(n + 1); } }}>{t('Bannir')}</button>)} />;
}

/** Espace Club des clubs : qui administre quel club ; inviter l'admin d'un club (super admin) */
function Clubs() {
  const s = useSession();
  const idx = useAsync(loadIndex, []);
  const acc = useAsync(loadAccounts, []);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<{ id: number; name: string } | null>(null);
  const [email, setEmail] = useState('');
  const [old, setOld] = useState<{ id: string; name: string } | null>(null);
  const known = new Set((idx.data?.clubs ?? []).map((c) => String(c.id)));
  const unknown = idx.data ? [...new Map((acc.data ?? []).flatMap((a) => a.clubs ?? []).filter((c) => c.club_id && !known.has(String(c.club_id))).map((c) => [String(c.club_id), c.club_name ?? ''] as [string, string])).entries()] : [];
  const admins = (id: number) => (acc.data ?? []).filter((a) => a.clubs?.some((c) => c.club_id === String(id) && c.role === 'club_admin'));
  const active = new Set((acc.data ?? []).flatMap((a) => (a.clubs ?? []).map((c) => c.club_id)));
  const list = (idx.data?.clubs ?? []).filter((c) => (q.length > 1 ? c.name.toLowerCase().includes(q.toLowerCase()) : active.has(String(c.id)))).slice(0, 30);
  return (
    <>
      <div className="search"><input className="field" placeholder={t('Rechercher un club')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {q.length < 2 && <p className="muted" style={{ fontSize: 13, margin: '0 4px 8px' }}>{t('Clubs avec un Espace Club actif')}</p>}
      <div className="group">
        {list.map((c) => <button key={c.id} className="row" onClick={() => setSel({ id: c.id, name: c.name })}><div className="grow">{c.name}
          <div className="sub">{admins(c.id).map((a) => a.name).join(', ') || t('Aucun admin')}</div></div><span className="chev">›</span></button>)}
      </div>
      {unknown.length > 0 && <>
        <p className="muted" style={{ fontSize: 13, margin: '12px 4px 8px' }}>{t('Anciens clubs (identifiant inconnu) : à rattacher à leur club actuel')}</p>
        <div className="group">{unknown.map(([id, nm]) => <button key={id} className="row" onClick={() => setOld({ id, name: nm })}><div className="grow">{nm || id}<div className="sub">{id} · {t('{n} comptes', { n: (acc.data ?? []).filter((a) => a.clubs?.some((c) => c.club_id === id)).length })}</div></div><span className="chev">›</span></button>)}</div>
      </>}
      {old && <div className="group" style={{ padding: 14 }}>
        <b>{t('Rattacher « {n} »', { n: old.name || old.id })}</b>
        <p className="muted" style={{ fontSize: 13 }}>{t('Cherche le club actuel ci-dessus, touche-le, puis confirme ici.')}</p>
        {sel && <button className="btn small" onClick={async () => { if (!confirm(t('Déplacer tous les comptes et fiches vers {n} ?', { n: sel.name }))) return;
          try { const r = await api<{ n: number }>('/admin/move-club', { from: old.id, to: sel.id, to_name: sel.name }); s.toast(t('{n} éléments déplacés', { n: r.n })); setOld(null); acc.reload(); } catch { s.toast(t('Accès refusé.')); } }}>{t('Rattacher à {n}', { n: sel.name })}</button>}
      </div>}
      {sel && !old && <div className="group" style={{ padding: 14 }}>
        <b>{sel.name}</b>
        <p className="muted" style={{ fontSize: 13 }}>{t('Admins : {n}', { n: admins(sel.id).map((a) => `${a.name}${a.email ? ` (${a.email})` : ''}`).join(', ') || '—' })}</p>
        <label className="label">{t('Inviter un admin du club (e-mail)')}</label>
        <div className="hstack"><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@club.be" />
          <button className="btn small" disabled={!email.includes('@')} onClick={async () => {
            try { await api('/admin/invite-admin', { email, club_id: sel.id, club_name: sel.name }); s.toast(t('Invitation créée. La personne se connecte sur BeHoop avec cette adresse.')); setEmail(''); }
            catch { s.toast(t('Accès refusé.')); }
          }}>{t('Inviter')}</button></div>
        <p className="muted" style={{ fontSize: 13 }}>{t('L’admin du club invite ensuite lui-même ses coachs, joueurs et parents (ou partage le QR code des équipes).')}</p>
        <button className="btn small secondary mt" onClick={async () => {
          try { await api('/admin/set-role', { uid: s.user!.uid, club_id: sel.id, club_name: sel.name, role: 'club_admin' }); try { sessionStorage.removeItem(`club-sync-${s.user!.uid}`); } catch { /* */ } location.hash = '/espace'; }
          catch { s.toast(t('Accès refusé.')); }
        }}>{t('Gérer ce club dans l’Espace Club')} ›</button>
      </div>}
    </>
  );
}

const ROLES = ['club_admin', 'coach', 'parent', 'player'] as const;
/** Fiche d'un compte (super admin) : ses clubs et rôles, équipes coachées, retirer d'un club, ajouter à un club, supprimer le compte */
function AccountSheet({ a, all, onClose }: { a: Account; all: Account[]; onClose: (changed: boolean) => void }) {
  const s = useSession();
  const idx = useAsync(loadIndex, []);
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState({ q: '', club: null as null | { id: number; name: string }, role: 'coach' as string, team: '' });
  const club = (id: string) => idx.data?.clubs.find((c) => String(c.id) === String(id));
  const run = async (path: string, body: object, msg: string) => {
    setBusy(true);
    try { await api(path, body); s.toast(msg); onClose(true); } catch { s.toast(t('Accès refusé.')); } finally { setBusy(false); }
  };
  return (
    <Sheet title={a.name} onClose={() => onClose(false)}>
      <div style={{ padding: '0 16px 24px' }}>
        <p className="muted" style={{ fontSize: 13 }}>{a.email ?? ''}{a.superAdmin ? ` · ${t('Super admin')}` : ''}{a.profile ? '' : ` · ${t('pas de profil BeHoop')}`}</p>
        <h3 className="group-title">{t('Espace Club')}</h3>
        {!a.clubs?.length && <p className="muted">{t('Pas d’Espace Club')}</p>}
        {a.clubs?.map((c) => <RoleRow key={`${c.club_id}~${c.role}`} c={c} a={a} all={all} teams={club(c.club_id)?.teams ?? []} clubName={club(c.club_id)?.name ?? c.club_name ?? c.club_id} busy={busy}
          onSave={(role, team_ids, team_id) => run('/admin/set-role', { uid: a.uid, club_id: c.club_id, club_name: club(c.club_id)?.name ?? c.club_name, role, old_role: c.role, team_ids, team_id, name: a.name, email: a.email }, t('Enregistré.'))}
          onRemove={() => confirm(t('Retirer ce rôle ?')) && run('/admin/set-role', { uid: a.uid, club_id: c.club_id, role: null, old_role: c.role }, t('Retiré du club.'))} />)}
        <h3 className="group-title mt">{t('Ajouter à un club')}</h3>
        <input className="field" placeholder={t('Rechercher un club')} value={add.club ? add.club.name : add.q} onChange={(e) => setAdd({ ...add, q: e.target.value, club: null })} />
        {!add.club && add.q.length > 1 && <div className="group">{(idx.data?.clubs ?? []).filter((c) => c.name.toLowerCase().includes(add.q.toLowerCase())).slice(0, 8)
          .map((c) => <button key={c.id} className="row" onClick={() => setAdd({ ...add, club: { id: c.id, name: c.name } })}>{c.name}</button>)}</div>}
        {add.club && <div className="hstack mt">
          <select className="field" value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{t(ROLE_FR[r])}</option>)}</select>
          {(add.role === 'player' || add.role === 'coach') && <select className="field" value={add.team} onChange={(e) => setAdd({ ...add, team: e.target.value })} aria-label={t('Équipe')}>
            <option value="">{t('Équipe (facultatif)')}</option>{(club(String(add.club.id))?.teams ?? []).map((tm) => <option key={tm.id} value={String(tm.id)}>{tm.cat}</option>)}</select>}
          <button className="btn small" disabled={busy} onClick={() => run('/admin/set-role', { uid: a.uid, club_id: add.club!.id, club_name: add.club!.name, role: add.role, email: a.email, name: a.name,
            ...(add.role === 'player' ? { team_id: add.team || null } : add.role === 'coach' && add.team ? { team_ids: [add.team] } : {}) }, t('Club ajouté.'))}>{t('Ajouter')}</button>
        </div>}
        {a.uid !== s.user?.uid && <button className="btn danger mt" style={{ width: '100%' }} disabled={busy}
          onClick={() => confirm(t('Supprimer définitivement le compte de {n} ? Il ne pourra plus se connecter.', { n: a.name })) && run('/admin/delete-account', { uid: a.uid }, t('Compte supprimé.'))}>{t('Supprimer le compte')}</button>}
      </div>
    </Sheet>
  );
}
function RoleRow({ c, a, all, teams, clubName, busy, onSave, onRemove }: { c: { club_id: string; role: string; team_ids?: string[]; team_id?: string | null }; a: Account; all: Account[]; teams: { id: number; cat: string }[]; clubName: string; busy: boolean;
  onSave: (role: string, team_ids?: string[], team_id?: string | null) => void; onRemove: () => void }) {
  const [role, setRole] = useState(c.role);
  const [sel, setSel] = useState<string[]>(c.team_ids ?? []);
  const [team, setTeam] = useState<string>(c.team_id ?? '');
  return (
    <div className="group" style={{ padding: 12, marginBottom: 10 }}>
      <b>{clubName}</b>
      <div className="hstack mt">
        <select className="field" value={role} onChange={(e) => setRole(e.target.value)}>{[...ROLES, ...(c.role === 'super_admin' ? ['super_admin'] : [])].map((r) => <option key={r} value={r}>{t(ROLE_FR[r])}</option>)}</select>
        <button className="btn small" disabled={busy} onClick={() => onSave(role, role === 'coach' ? sel : undefined, role === 'player' ? team || null : undefined)}>{t('Enregistrer')}</button>
      </div>
      {role === 'coach' && <><p className="muted" style={{ fontSize: 13 }}>{t('Équipes coachées')}</p>
        <div className="chips" style={{ flexWrap: 'wrap' }}>{teams.map((tm) => { const id = String(tm.id); return <button key={id} className={`chip${sel.includes(id) ? ' on' : ''}`} onClick={() => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])}>{tm.cat}</button>; })}</div></>}
      {role === 'player' && <select className="field mt" value={team} onChange={(e) => setTeam(e.target.value)} aria-label={t('Équipe')}>
        <option value="">{t('Sans équipe')}</option>{teams.map((tm) => <option key={tm.id} value={String(tm.id)}>{tm.cat}</option>)}</select>}
      {(c.role === 'parent' || c.role === 'player') && <Links c={c} a={a} all={all} clubName={clubName} />}
      <button className="btn small danger mt" disabled={busy} onClick={onRemove}>{t('Retirer ce rôle')}</button>
    </div>
  );
}

interface PlayerCard { id: string; prenom: string; nom?: string; team_id?: string | null; account_uid?: string; parent_uids: string[] }
/** Liens parent ↔ joueur (super admin) : enfants d'un parent, ou parents d'un joueur */
function Links({ c, a, all, clubName }: { c: { club_id: string; role: string }; a: Account; all: Account[]; clubName: string }) {
  const s = useSession();
  const ps = useAsync(() => api<PlayerCard[]>('/admin/players', { club_id: c.club_id }), [c.club_id]);
  const [q, setQ] = useState('');
  if (ps.loading) return <Skeleton n={1} h={40} />;
  const list = ps.data ?? [];
  const link = async (player: string, parent: Account, on: boolean) => {
    try { await api('/admin/link', { player_id: player, parent_uid: parent.uid, on, club_name: clubName, email: parent.email, name: parent.name }); s.toast(on ? t('Relié.') : t('Lien retiré.')); ps.reload(); }
    catch { s.toast(t('Accès refusé.')); }
  };
  const pname = (p: PlayerCard) => `${p.prenom}${p.nom ? ` ${p.nom}` : ''}`;
  if (c.role === 'parent') {
    const kids = list.filter((p) => p.parent_uids.includes(a.uid));
    const cand = list.filter((p) => !p.parent_uids.includes(a.uid) && q.length > 1 && pname(p).toLowerCase().includes(q.toLowerCase())).slice(0, 8);
    return (
      <div className="mt">
        <p className="muted" style={{ fontSize: 13 }}>{t('Enfants')} : {kids.length ? '' : '—'}</p>
        {kids.map((p) => <div key={p.id} className="hstack"><span style={{ flex: 1 }}>{pname(p)}</span><button className="btn small secondary" onClick={() => link(p.id, a, false)}>{t('Délier')}</button></div>)}
        <input className="field mt" placeholder={t('Relier un joueur du club (prénom)')} value={q} onChange={(e) => setQ(e.target.value)} />
        {cand.map((p) => <button key={p.id} className="row" onClick={() => link(p.id, a, true)}>{pname(p)}<span className="sub" style={{ marginLeft: 'auto' }}>{p.account_uid ? t('a son compte') : t('sans compte')}</span></button>)}
      </div>
    );
  }
  // Joueur avec compte : sa fiche dans ce club, et ses parents
  const me = list.find((p) => p.account_uid === a.uid);
  if (!me) return <p className="muted" style={{ fontSize: 13 }}>{t('Pas de fiche joueur dans ce club.')}</p>;
  const parents = all.filter((x) => me.parent_uids.includes(x.uid));
  const cand = all.filter((x) => x.uid !== a.uid && !me.parent_uids.includes(x.uid) && q.length > 1 && `${x.name} ${x.email ?? ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  return (
    <div className="mt">
      <p className="muted" style={{ fontSize: 13 }}>{t('Parents')} : {parents.length ? '' : '—'}</p>
      {parents.map((x) => <div key={x.uid} className="hstack"><span style={{ flex: 1 }}>{x.name}</span><button className="btn small secondary" onClick={() => link(me.id, x, false)}>{t('Délier')}</button></div>)}
      <input className="field mt" placeholder={t('Relier un parent (nom ou e-mail)')} value={q} onChange={(e) => setQ(e.target.value)} />
      {cand.map((x) => <button key={x.uid} className="row" onClick={() => link(me.id, x, true)}>{x.name}<span className="sub" style={{ marginLeft: 'auto' }}>{x.email ?? ''}</span></button>)}
    </div>
  );
}

/** Toutes les invitations (super admin) */
function AllInvitations() {
  const s = useSession();
  const inv = useAsync(() => api<{ email: string; role: string; club_name?: string; status: string }[]>('/admin/invitations', {}), []);
  if (inv.loading) return <Skeleton n={2} />;
  return (
    <>
      <p className="muted" style={{ fontSize: 13, margin: '16px 4px 8px' }}>{t('Invitations en attente')} · {(inv.data ?? []).length}</p>
      <div className="group">
        {(inv.data ?? []).map((i) => (
          <div key={i.email} className="row"><div className="grow">{i.email}<div className="sub">{t(ROLE_FR[i.role] ?? i.role)}{i.club_name ? ` · ${i.club_name}` : ''} · {i.status === 'used' ? t('Utilisée') : t('En attente')}</div></div>
            {i.status !== 'used' && <button className="btn small secondary" onClick={async () => { await api('/admin/invitations', { cancel: i.email }).catch(() => s.toast(t('Accès refusé.'))); inv.reload(); }}>{t('Annuler')}</button>}</div>
        ))}
      </div>
    </>
  );
}

/** Messages « Aide / Contact » : conversations avec les utilisateurs, réponse dans l'appli (notification) */
function Support() {
  const [all, setAll] = useState(false);
  const m = useAsync(() => api<SupportThread[]>('/admin/support', { all }), [all]);
  const [open, setOpen] = useState<string | null>(null);
  const th = m.data?.find((x) => x.id === open);
  useEffect(() => { if (th?.unread_admin) api<SupportThread[]>('/admin/support', { read: th.id, all }).then(m.set).catch(() => {}); }, [th?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (m.loading) return <Skeleton n={2} />;
  if (th) return (
    <div className="group" style={{ padding: 14 }}>
      <button className="btn ghost small" onClick={() => setOpen(null)}>‹ {t('Messages')}</button>
      <b style={{ display: 'block', marginTop: 6 }}>{th.subject || t('Sans sujet')}</b>
      <p className="muted" style={{ fontSize: 13 }}>{th.name} · {th.email}{th.page ? ` · ${th.page}` : ''}</p>
      <Conversation th={th} me="admin" onSend={async (text) => { await api('/admin/support', { reply: th.id, text }); m.set(await api<SupportThread[]>('/admin/support', { all })); }} />
      <div className="hstack mt">
        <a className="btn small secondary" href={`mailto:${th.email}?subject=${encodeURIComponent(`Re: ${th.subject || 'BeHoop'}`)}`}>{t('Répondre par e-mail')}</a>
        <button className="btn small secondary" onClick={async () => { await api('/admin/support', { close: th.id, reopen: th.status === 'closed' }); setOpen(null); m.reload(); }}>{th.status === 'closed' ? t('Rouvrir') : t('Traité')}</button>
      </div>
    </div>
  );
  return (
    <>
      <label className="hstack" style={{ margin: '0 4px 10px', fontSize: 14 }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> {t('Afficher aussi les conversations traitées')}</label>
      {!m.data?.length ? <Empty ill="mail" title={t('Aucun message')} /> : (
        <div className="group">
          {m.data.map((x) => (
            <button key={x.id} className="row" onClick={() => setOpen(x.id)}>
              <div className="grow">{x.unread_admin && <b style={{ color: 'var(--accent)' }}>● </b>}{x.subject || t('Sans sujet')}{x.status === 'closed' && <span className="muted"> · {t('traité')}</span>}
                <div className="sub ellipsis">{x.name || x.email} · {x.messages[x.messages.length - 1]?.text}</div></div><span className="chev">›</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
