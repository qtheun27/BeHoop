// Console de modération (super admin) : signalements, contenus masqués, bannissement, responsables, Jeunes/Seniors.
import { useState } from 'react';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { teamIndex, teamLabel } from '../lib/data';
import { Screen, Empty, Skeleton, useAsync } from '../ui/kit';
import { PostCard } from './Feed';

export default function Moderation() {
  const s = useSession();
  const [tab, setTab] = useState<'requests' | 'reports' | 'hidden' | 'teams' | 'users'>('requests');
  if (!s.isAdmin) return <Screen title="Modération" back="profil"><Empty ill="⛔" title="Réservé au super admin" /></Screen>;
  return (
    <Screen title="Modération" back="profil">
      <div className="seg">{([['requests', 'Demandes'], ['reports', 'Signalements'], ['hidden', 'Masqués'], ['teams', 'Équipes'], ['users', 'Comptes']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'requests' && <Requests />}{tab === 'reports' && <Reports />}{tab === 'hidden' && <Hidden />}{tab === 'teams' && <Teams />}{tab === 'users' && <Users />}
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
  if (!data.length) return <Empty ill="✅" title="Aucune demande en attente" />;
  const act = async (f: () => Promise<unknown>) => { await f(); reload(); };
  return (
    <div className="group">{data.map((m) => { const e = idx.data?.get(m.teamId); return (
      <div key={`${m.teamId}-${m.uid}`} className="row" style={{ flexWrap: 'wrap' }}>
        <div className="grow"><div style={{ fontWeight: 600 }}>{m.displayName}</div>
          <div className="sub">{e ? `${e.club.short} · ${teamLabel(e.team)}` : `Équipe ${m.teamId}`}</div>
          {m.message && <div className="sub">« {m.message} »</div>}</div>
        <button className="btn small" onClick={() => act(() => D.setMember(m.teamId, m.uid, { status: 'accepted' }))}>Accepter</button>
        <button className="btn small secondary" onClick={() => act(() => D.setMember(m.teamId, m.uid, { status: 'accepted', role: 'responsable' }))}>Responsable</button>
        <button className="btn small danger" onClick={() => act(() => D.removeMember(m.teamId, m.uid))}>Refuser</button>
      </div>); })}</div>
  );
}

function Reports() {
  const { data, reload } = useAsync(D.openReports, []);
  if (!data) return <Skeleton />;
  if (!data.length) return <Empty ill="✅" title="Aucun signalement ouvert" />;
  return <>{data.map((r) => <Report key={r.id} r={r} done={reload} />)}</>;
}
function Report({ r, done }: { r: { id: string; postId: string; reason: string }; done: () => void }) {
  const post = useAsync(() => D.getPost(r.postId), [r.postId]);
  return (
    <div className="group" style={{ padding: 12 }}>
      <div className="hstack"><b style={{ flex: 1 }}>« {r.reason} »</b>
        <button className="btn small danger" onClick={async () => { await D.hidePost(r.postId, 'admin', 'admin'); await D.closeReport(r.id); done(); }}>Masquer</button>
        <button className="btn small secondary" onClick={async () => { await D.closeReport(r.id); done(); }}>Ignorer</button></div>
      {post.data && <div className="mt"><PostCard post={post.data} /></div>}
      {post.data?.authorUid && <button className="btn small danger" onClick={async () => { if (confirm('Bannir l’auteur ?')) { await D.banUser(post.data!.authorUid!, true); done(); } }}>Bannir l'auteur</button>}
    </div>
  );
}
function Hidden() {
  const { data } = useAsync(D.hiddenPosts, []);
  if (!data) return <Skeleton />;
  return data.length ? <>{data.map((p) => <div key={p.id}><div className="muted" style={{ fontSize: 13 }}>Motif : {p.hiddenReason}</div><PostCard post={p} /></div>)}</> : <Empty ill="🙈" title="Aucun contenu masqué" />;
}
function Teams() {
  const [q, setQ] = useState('');
  const idx = useAsync(teamIndex, []);
  const [sel, setSel] = useState<number | null>(null);
  const [uid, setUid] = useState('');
  const info = useAsync(() => (sel ? D.getTeamInfo(sel) : Promise.resolve(null)), [sel]);
  const list = idx.data ? [...idx.data.values()].filter((e) => q.length > 1 && `${e.club.name} ${e.team.name}`.toLowerCase().includes(q.toLowerCase())).slice(0, 20) : [];
  return (
    <>
      <div className="search"><input className="field" placeholder="Rechercher une équipe" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="group">{list.map((e) => <button key={e.team.id} className="row" onClick={() => setSel(e.team.id)}><div className="grow">{e.club.short} · {teamLabel(e.team)}<div className="sub">{e.team.cat} → {e.team.ag}</div></div></button>)}</div>
      {sel && <div className="group" style={{ padding: 14 }}>
        <b>Équipe {sel}</b>
        <div className="hstack mt">Classement :
          {(['jeunes', 'seniors'] as const).map((g) => <button key={g} className={`btn small${(info.data?.ageGroupOverride ?? info.data?.ageGroup ?? idx.data?.get(sel)?.team.ag) === g ? '' : ' secondary'}`}
            onClick={async () => { await D.setAgeGroupOverride(sel, g); info.reload(); }}>{g === 'jeunes' ? 'Jeunes' : 'Seniors'}</button>)}</div>
        <label className="label">Nommer un responsable (identifiant du compte)</label>
        <div className="hstack"><input className="field" value={uid} onChange={(e) => setUid(e.target.value)} placeholder="uid Firebase" />
          <button className="btn small" onClick={async () => { await D.setDoc(D.doc(D.db, 'teamMembers', String(sel), 'members', uid), { uid, teamId: sel, role: 'responsable', status: 'accepted', displayName: 'Responsable', createdAt: D.serverTimestamp() }); setUid(''); }}>Nommer</button></div>
        <p className="muted" style={{ fontSize: 13 }}>Astuce : l'uid apparaît dans la liste des demandes d'accès (Profil → Demandes) ou dans la console Firebase.</p>
      </div>}
    </>
  );
}
function Users() {
  const [uid, setUid] = useState('');
  const s = useSession();
  return (
    <div className="group" style={{ padding: 14 }}>
      <label className="label">Identifiant du compte (uid)</label>
      <input className="field" value={uid} onChange={(e) => setUid(e.target.value)} />
      <div className="hstack mt"><button className="btn small danger" onClick={async () => { await D.banUser(uid, true); s.toast('Compte banni'); }}>Bannir</button>
        <button className="btn small secondary" onClick={async () => { await D.banUser(uid, false); s.toast('Compte rétabli'); }}>Rétablir</button></div>
    </div>
  );
}
