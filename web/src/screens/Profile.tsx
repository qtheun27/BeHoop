import { useState } from 'react';
import { deleteUser } from 'firebase/auth';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { api } from '../lib/api';
import { teamLabel } from '../lib/data';
import { Screen, Avatar, Empty, Sheet, useAsync } from '../ui/kit';
import { useClubs, MembersList } from './Explore';
import { PostCard } from './Feed';
import { enableNotifications, needsInstallForPush, pushSupported } from '../lib/push';
import { SHOW_CLUB_SPACE } from '../lib/config';

export function Profile() {
  const s = useSession();
  const clubs = useClubs();
  const [sheet, setSheet] = useState<'' | 'notifs' | 'posts' | 'requests' | 'delete'>('');
  if (!s.user || !s.profile) {
    return <Screen title="Profil"><Empty ill="👤" title="Connecte-toi" text="Suis tes clubs, rejoins l'Équipe de ton enfant, publie tes photos et vidéos de match."
      action={<button className="btn" onClick={() => s.requireAuth()}>Se connecter ou créer un compte</button>} />
      <LegalLinks /></Screen>;
  }
  const teamName = (id: number) => { for (const c of clubs) { const t = c.teams.find((x) => x.id === id); if (t) return `${c.short} · ${teamLabel(t)}`; } return `Équipe ${id}`; };
  const clubName = (id: number) => clubs.find((c) => c.id === id)?.name ?? `Club ${id}`;
  const p = s.profile;
  return (
    <Screen title="Profil">
      <div className="group"><div className="row"><Avatar name={p.displayName} src={p.avatarUrl} /><div className="grow"><div style={{ fontWeight: 600 }}>{p.displayName}</div><div className="sub">{s.user.email}</div></div></div></div>

      <div className="group-title">Je suis</div>
      <div className="group">
        {s.follows.length === 0 && <a className="row" href="#/explorer">Trouver des clubs à suivre <span className="chev">›</span></a>}
        {s.follows.map((f) => (
          <div key={f.id} className="row"><a className="grow ellipsis" style={{ color: 'inherit' }} href={f.type === 'club' ? `#/club/${f.refId}` : `#/equipe/${f.refId}`}>
            {f.type === 'club' ? clubName(f.refId) : teamName(f.refId)}<div className="sub">{f.type === 'club' ? `Club · ${(clubs.find((c) => c.id === f.refId)?.teams.length ?? 0) - (f.mutedTeams?.length ?? 0)} équipes` : 'Équipe'}</div></a>
            <button className="btn small secondary" onClick={() => s.toggleFollow(f.type, f.refId)}>Ne plus suivre</button></div>))}
      </div>

      <div className="group-title">Mes Équipes 🔒</div>
      <div className="group">
        {s.memberships.length === 0 ? <div className="row muted" style={{ fontSize: 15 }}>Demande à rejoindre l'Équipe de ton enfant depuis sa page Équipe.</div>
          : s.memberships.map((m) => <a key={m.teamId} className="row" href={`#/equipe/${m.teamId}`} style={{ color: 'inherit' }}><div className="grow">{teamName(m.teamId)}</div>
            <span className="pill">{m.status === 'pending' ? 'En attente' : m.role === 'responsable' ? 'Responsable' : 'Membre'}</span></a>)}
        {s.responsibleTeams.length > 0 && <button className="row" onClick={() => setSheet('requests')}><div className="grow">Demandes à valider</div><span className="chev">›</span></button>}
      </div>

      <div className="group">
        <button className="row" onClick={() => setSheet('posts')}><div className="grow">Mes publications</div><span className="chev">›</span></button>
        <button className="row" onClick={() => setSheet('notifs')}><div className="grow">Notifications</div><span className="chev">›</span></button>
        <div className="row"><div className="grow">Thème</div>
          <select className="field" style={{ width: 'auto', padding: '6px 10px' }} value={p.theme ?? 'auto'} aria-label="Thème"
            onChange={async (e) => { const theme = e.target.value as 'auto'; s.setProfile({ ...p, theme }); await D.updateProfile(s.user!.uid, { theme }); }}>
            <option value="auto">Automatique</option><option value="light">Clair</option><option value="dark">Sombre</option></select></div>
        {SHOW_CLUB_SPACE && <a className="row" href="/club/">Espace Club <span className="chev">›</span></a>}
        {s.isAdmin && <a className="row" href="#/moderation" style={{ color: 'inherit' }}><div className="grow">Console de modération</div><span className="chev">›</span></a>}
      </div>
      <LegalLinks />
      <div className="group">
        <button className="row" style={{ justifyContent: 'center', color: 'var(--accent)' }} onClick={() => s.logout()}>Se déconnecter</button>
        <button className="row danger" onClick={() => setSheet('delete')}>Supprimer mon compte</button>
      </div>

      {sheet === 'notifs' && <NotifSheet onClose={() => setSheet('')} />}
      {sheet === 'posts' && <Sheet title="Mes publications" onClose={() => setSheet('')}><MyPosts /></Sheet>}
      {sheet === 'requests' && <Sheet title="Demandes à valider" onClose={() => setSheet('')}>{s.responsibleTeams.map((t) => <div key={t}><div className="group-title">{teamName(t)}</div><TeamMembers teamId={t} /></div>)}</Sheet>}
      {sheet === 'delete' && <DeleteSheet onClose={() => setSheet('')} />}
    </Screen>
  );
}

function TeamMembers({ teamId }: { teamId: number }) {
  const s = useSession();
  const { data, reload } = useAsync(() => D.teamMembersList(teamId), [teamId]);
  return data ? <MembersList teamId={teamId} members={data} reload={reload} me={s.user!.uid} /> : null;
}
function MyPosts() {
  const s = useSession();
  const { data } = useAsync(() => D.myPosts(s.user!.uid), []);
  return data?.length ? <>{data.map((p) => <PostCard key={p.id} post={p} />)}</> : <Empty ill="📝" title="Aucune publication" />;
}

function NotifSheet({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const p = s.profile!;
  const [prefs, setPrefs] = useState(p.notifPrefs ?? D.defaultPrefs());
  const granted = pushSupported() && Notification.permission === 'granted' && (p.fcmTokens?.length ?? 0) > 0;
  const toggle = async (k: string) => { const n = { ...prefs, [k]: !prefs[k] }; setPrefs(n); await D.updateProfile(s.user!.uid, { notifPrefs: n }); s.setProfile({ ...p, notifPrefs: n }); };
  return (
    <Sheet title="Notifications" onClose={onClose}>
      {!granted && <div className="banner"><span style={{ fontSize: 26 }}>🔔</span><div style={{ flex: 1, fontSize: 15 }}>
        {needsInstallForPush() ? 'Sur iPhone : touche Partager puis « Sur l’écran d’accueil », ouvre BeHoop depuis l’icône, puis active les notifications.' : 'Les notifications ne sont pas encore activées sur cet appareil.'}</div>
        {!needsInstallForPush() && <button className="btn small" onClick={async () => { const ok = await enableNotifications(s.user!.uid).catch(() => false); s.toast(ok ? 'Notifications activées' : 'Notifications refusées ou indisponibles'); await s.refresh(); }}>Activer</button>}</div>}
      <div className="group">{D.NOTIF_TYPES.map((n) => (
        <label key={n.key} className="row"><div className="grow">{n.label}</div><input type="checkbox" className="switch" checked={prefs[n.key] !== false} onChange={() => toggle(n.key)} /></label>))}</div>
      <p className="group-foot" style={{ marginTop: -12 }}>Au maximum une notification par équipe et par heure (sauf « Ta vidéo est prête »).</p>
    </Sheet>
  );
}

function DeleteSheet({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const [txt, setTxt] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const del = async () => {
    setBusy(true); setErr('');
    try {
      // Le Worker efface les données (profil, suivis, adhésions, publications, médias) puis on supprime le compte.
      await api('/account', undefined, 'DELETE').catch(() => D.deleteDoc(D.profileRef(s.user!.uid)));
      await deleteUser(s.user!); location.hash = '/fil'; location.reload();
    } catch (e: any) {
      setErr(String(e?.code).includes('recent-login') ? 'Par sécurité, déconnecte-toi puis reconnecte-toi avant de supprimer ton compte.' : 'La suppression a échoué. Réessaie.');
    } finally { setBusy(false); }
  };
  return (
    <Sheet title="Supprimer mon compte" onClose={onClose}>
      <p>Ton compte, ton profil, tes suivis, tes adhésions aux Équipes, tes publications et tes médias seront <b>définitivement supprimés</b>.</p>
      <label className="label" htmlFor="del">Tape SUPPRIMER pour confirmer</label>
      <input id="del" className="field" value={txt} onChange={(e) => setTxt(e.target.value)} autoCapitalize="characters" />
      {err && <div className="err mt">{err}</div>}
      <button className="btn danger mt" disabled={txt !== 'SUPPRIMER' || busy} onClick={del}>Supprimer définitivement</button>
    </Sheet>
  );
}

export const LegalLinks = () => (
  <div className="group">
    <a className="row" href="#/legal/cgu" style={{ color: 'inherit' }}><div className="grow">Conditions d'utilisation</div><span className="chev">›</span></a>
    <a className="row" href="#/legal/confidentialite" style={{ color: 'inherit' }}><div className="grow">Politique de confidentialité</div><span className="chev">›</span></a>
    <a className="row" href="#/legal/charte" style={{ color: 'inherit' }}><div className="grow">Charte BeHoop</div><span className="chev">›</span></a>
  </div>
);
