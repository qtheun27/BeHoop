// Console de modération (super admin) : signalements, contenus masqués, bannissement, responsables, Jeunes/Seniors.
import { useState } from 'react';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { teamIndex, teamLabel, loadIndex } from '../lib/data';
import { api } from '../lib/api';
import { Screen, Empty, Skeleton, useAsync, Avatar } from '../ui/kit';
import { PostCard } from './Feed';
import { t } from '../lib/i18n';

export default function Moderation() {
  const s = useSession();
  const [tab, setTab] = useState<'requests' | 'reports' | 'hidden' | 'teams' | 'users' | 'clubs'>('requests');
  if (!s.isAdmin) return <Screen title={t('Modération')} back="profil"><Empty ill="ban" title={t('Réservé au super admin')} /></Screen>;
  return (
    <Screen title={t('Modération')} back="profil">
      <div className="seg">{([['requests', 'Demandes'], ['reports', 'Signalements'], ['hidden', 'Masqués'], ['teams', 'Équipes'], ['users', 'Comptes'], ['clubs', 'Clubs']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(l)}</button>)}</div>
      {tab === 'requests' && <Requests />}{tab === 'reports' && <Reports />}{tab === 'hidden' && <Hidden />}{tab === 'teams' && <Teams />}{tab === 'users' && <Users />}{tab === 'clubs' && <Clubs />}
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
interface Account { uid: string; name: string; avatar?: string; banned?: boolean; created?: string | number; profile: boolean; email?: string; clubs?: { role: string; club_name?: string; club_id: string }[] }
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
          <div key={a.uid} className="row" onClick={() => onPick(a)}>
            <Avatar name={a.name} src={a.avatar} />
            <div className="grow">{a.name}{a.banned && <b style={{ color: 'var(--red)' }}> · {t('banni')}</b>}
              <div className="sub">{a.clubs?.length ? a.clubs.map((c) => `${t(ROLE_FR[c.role] ?? c.role)}${cname(c) ? ` · ${cname(c)}` : ''}`).join(' / ') : t('Pas d’Espace Club')}{!a.profile ? ` · ${t('pas de profil BeHoop')}` : ''}{a.email ? ` · ${a.email}` : ''}{a.created ? ` · ${new Date(a.created).toLocaleDateString()}` : ''}</div></div>
            {action(a)}
          </div>
        ))}
      </div>
    </>
  );
}
function Users() {
  const s = useSession();
  const [n, setN] = useState(0);
  return <AccountPicker key={n} onPick={() => {}} action={(a) => (a.banned
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
      {sel && <div className="group" style={{ padding: 14 }}>
        <b>{sel.name}</b>
        <p className="muted" style={{ fontSize: 13 }}>{t('Admins : {n}', { n: admins(sel.id).map((a) => `${a.name}${a.email ? ` (${a.email})` : ''}`).join(', ') || '—' })}</p>
        <label className="label">{t('Inviter un admin du club (e-mail)')}</label>
        <div className="hstack"><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@club.be" />
          <button className="btn small" disabled={!email.includes('@')} onClick={async () => {
            try { await api('/admin/invite-admin', { email, club_id: sel.id, club_name: sel.name }); s.toast(t('Invitation créée. La personne se connecte sur BeHoop avec cette adresse.')); setEmail(''); }
            catch { s.toast(t('Accès refusé.')); }
          }}>{t('Inviter')}</button></div>
        <p className="muted" style={{ fontSize: 13 }}>{t('L’admin du club invite ensuite lui-même ses coachs, joueurs et parents (ou partage le QR code des équipes).')}</p>
      </div>}
    </>
  );
}
