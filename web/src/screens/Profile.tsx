import { useState } from 'react';
import { deleteUser } from 'firebase/auth';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { api, mediaUrl } from '../lib/api';
import { uploadSmall } from '../lib/upload';
import { compressImage } from '../lib/media';
import { teamLabel, loadComps } from '../lib/data';
import { Screen, Avatar, Empty, Sheet, useAsync, LangSwitch } from '../ui/kit';
import { useClubs, MembersList } from './Explore';
import { PostCard } from './Feed';
import { enableNotifications, needsInstallForPush, pushSupported } from '../lib/push';
import { SHOW_CLUB_SPACE } from '../lib/config';
import { ACCENTS, DEFAULT_THEME, clubColors, type ThemePrefs } from '../lib/theme';
import { Disc } from '../ui/kit';
import { t } from '../lib/i18n';
import { Ico, type IconName } from '../ui/icons';

export function Profile() {
  const s = useSession();
  const clubs = useClubs();
  const comps = useAsync(loadComps, []).data ?? [];
  const [sheet, setSheet] = useState<'' | 'notifs' | 'posts' | 'requests' | 'delete' | 'theme' | 'phone'>('');
  if (!s.user || !s.profile) {
    return <Screen title={t('Profil')}><Empty ill="user" title={t('Connecte-toi')} text={t('Suis tes clubs, rejoins l\'Équipe de ton enfant, publie tes photos et vidéos de match.')}
      action={<button className="btn" onClick={() => s.requireAuth()}>{t('Se connecter ou créer un compte')}</button>} />
      <LegalLinks /></Screen>;
  }
  const teamName = (id: number) => { for (const c of clubs) { const tm = c.teams.find((x) => x.id === id); if (tm) return `${c.short} · ${teamLabel(tm)}`; } return `${t('Équipe')} ${id}`; };
  const clubName = (id: number) => clubs.find((c) => c.id === id)?.name ?? `Club ${id}`;
  const p = s.profile;
  return (
    <Screen title={t('Profil')}>
      <div className="group"><div className="row"><label style={{ position: 'relative', cursor: 'pointer' }} aria-label={t('Changer ma photo de profil')}>
        <Avatar name={p.displayName} src={p.avatarUrl} /><span style={{ position: 'absolute', right: -4, bottom: -4, fontSize: 13, background: 'var(--bg2)', borderRadius: 10, padding: '2px 3px', display: 'grid' }}><Ico n="camera" size={13} /></span>
        <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return;
          try { const key = await uploadSmall('avatar', await compressImage(f, 400, .85), {}); const url = mediaUrl(key); await D.updateProfile(s.user!.uid, { avatarUrl: url }); s.setProfile({ ...p, avatarUrl: url }); s.toast(t('Photo mise à jour')); }
          catch { s.toast(t('Impossible de changer la photo')); } }} /></label><div className="grow"><div style={{ fontWeight: 600 }}>{p.displayName}</div><div className="sub">{s.user.email}</div></div></div></div>

      <div className="group-title">{t('Je suis')}</div>
      <div className="group">
        {s.follows.length === 0 && <a className="row" href="#/explorer">{t('Trouver des clubs à suivre')} <span className="chev">›</span></a>}
        {s.follows.filter((f) => f.type === 'comp').map((f) => (
          <div key={f.id} className="row"><a className="grow ellipsis" style={{ color: 'inherit' }} href={`#/competition/${f.compId}`}>
            {comps.find((c) => c.id === f.compId)?.name ?? f.compId}<div className="sub">{t('Compétition')}</div></a>
            <button className="btn small secondary" onClick={() => s.toggleComp(f.compId!)}>{t('Ne plus suivre')}</button></div>))}
        {s.follows.filter((f) => f.type !== 'comp').map((f) => (
          <div key={f.id} className="row"><a className="grow ellipsis" style={{ color: 'inherit' }} href={f.type === 'club' ? `#/club/${f.refId}` : `#/equipe/${f.refId}`}>
            {f.type === 'club' ? clubName(f.refId) : teamName(f.refId)}<div className="sub">{f.type === 'club' ? `${t('Club')} · ${t('{n} équipes', { n: (clubs.find((c) => c.id === f.refId)?.teams.length ?? 0) - (f.mutedTeams?.length ?? 0) })}` : t('Équipe')}</div></a>
            <button className="btn small secondary" onClick={() => s.toggleFollow(f.type as 'club' | 'team', f.refId)}>{t('Ne plus suivre')}</button></div>))}
      </div>

      <div className="group-title"><Ico n="lock" />{t('Mes Équipes')}</div>
      <div className="group">
        {s.memberships.length === 0 ? <div className="row muted" style={{ fontSize: 15 }}>{t('Demande à rejoindre l\'Équipe de ton enfant depuis sa page Équipe.')}</div>
          : s.memberships.map((m) => <a key={m.teamId} className="row" href={`#/equipe/${m.teamId}`} style={{ color: 'inherit' }}><div className="grow">{teamName(m.teamId)}</div>
            <span className="pill">{m.status === 'pending' ? t('En attente') : m.role === 'responsable' ? t('Responsable') : t('Membre')}</span></a>)}
        {s.responsibleTeams.length > 0 && <button className="row" onClick={() => setSheet('requests')}><div className="grow">{t('Demandes à valider')}</div><span className="chev">›</span></button>}
      </div>

      <div className="group">
        <button className="row" onClick={() => setSheet('posts')}><div className="grow">{t('Mes publications')}</div><span className="chev">›</span></button>
        <button className="row" onClick={() => setSheet('phone')}><div className="grow">{t('Mon téléphone')}<div className="sub">{s.profile?.phone || t('Pour le covoiturage, jamais public')}</div></div><span className="chev">›</span></button>
        <button className="row" onClick={() => setSheet('notifs')}><div className="grow">{t('Notifications')}</div><span className="chev">›</span></button>
        <label className="row"><div className="grow">{t('Langue')}</div><LangSwitch /></label>
        <button className="row" onClick={() => setSheet('theme')}><div className="grow">{t('Mon thème')}</div><span className="chev">›</span></button>
        {SHOW_CLUB_SPACE && <a className="row" href="/club/">{t('Espace Club')} <span className="chev">›</span></a>}
        {s.isAdmin && <a className="row" href="#/moderation" style={{ color: 'inherit' }}><div className="grow">{t('Console de modération')}</div><span className="chev">›</span></a>}
      </div>
      <LegalLinks />
      <div className="group">
        <button className="row" style={{ justifyContent: 'center', color: 'var(--accent)' }} onClick={() => s.logout()}>{t('Se déconnecter')}</button>
        <button className="row danger" onClick={() => setSheet('delete')}>{t('Supprimer mon compte')}</button>
      </div>

      {sheet === 'notifs' && <NotifSheet onClose={() => setSheet('')} />}
      {sheet === 'phone' && <PhoneSheet onClose={() => setSheet('')} />}
      {sheet === 'posts' && <Sheet title={t('Mes publications')} onClose={() => setSheet('')}><MyPosts /></Sheet>}
      {sheet === 'requests' && <Sheet title={t('Demandes à valider')} onClose={() => setSheet('')}>{s.responsibleTeams.map((tid) => <div key={tid}><div className="group-title">{teamName(tid)}</div><TeamMembers teamId={tid} /></div>)}</Sheet>}
      {sheet === 'delete' && <DeleteSheet onClose={() => setSheet('')} />}
      {sheet === 'theme' && <ThemeSheet onClose={() => setSheet('')} />}
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
  return data?.length ? <>{data.map((p) => <PostCard key={p.id} post={p} />)}</> : <Empty ill="edit" title={t('Aucune publication')} />;
}

/** Téléphone : privé (profil lisible par soi seul), utilisé pour le covoiturage et montré seulement aux personnes acceptées */
function PhoneSheet({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const [v, setV] = useState(s.profile?.phone ?? '');
  const save = async () => {
    const phone = v.trim();
    try { await D.updateProfile(s.user!.uid, { phone }); s.setProfile({ ...s.profile!, phone }); s.toast(t('Enregistré')); onClose(); } catch { s.toast(t('Action impossible. Réessaie.')); }
  };
  return (
    <Sheet title={t('Mon téléphone')} onClose={onClose}>
      <input className="field" type="tel" autoComplete="tel" placeholder="0470 12 34 56" value={v} onChange={(e) => setV(e.target.value)} aria-label={t('Mon téléphone')} style={{ width: '100%' }} />
      <p className="muted" style={{ fontSize: 14 }}><Ico n="lock" /> {t('Jamais affiché sur ton profil. Il sert uniquement au covoiturage : il n’est montré qu’aux personnes que tu acceptes dans ta voiture, ou au conducteur qui t’accepte.')}</p>
      <button className="btn" onClick={save}>{t('Enregistrer')}</button>
    </Sheet>
  );
}

function NotifSheet({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const p = s.profile!;
  const [prefs, setPrefs] = useState(p.notifPrefs ?? D.defaultPrefs());
  const granted = pushSupported() && Notification.permission === 'granted' && (p.fcmTokens?.length ?? 0) > 0;
  const toggle = async (k: string) => { const n = { ...prefs, [k]: !prefs[k] }; setPrefs(n); await D.updateProfile(s.user!.uid, { notifPrefs: n }); s.setProfile({ ...p, notifPrefs: n }); };
  return (
    <Sheet title={t('Notifications')} onClose={onClose}>
      {!granted && <div className="banner"><Ico n="bell" /><div style={{ flex: 1, fontSize: 15 }}>
        {needsInstallForPush() ? t('Sur iPhone : touche Partager puis « Sur l’écran d’accueil », ouvre BeHoop depuis l’icône, puis active les notifications.') : t('Les notifications ne sont pas encore activées sur cet appareil.')}</div>
        {!needsInstallForPush() && <button className="btn small" onClick={async () => { const ok = await enableNotifications(s.user!.uid).catch(() => false); s.toast(ok ? t('Notifications activées') : t('Notifications refusées ou indisponibles')); await s.refresh(); }}>{t('Activer')}</button>}</div>}
      <div className="group">{D.NOTIF_TYPES.map((n) => (
        <label key={n.key} className="row"><div className="grow">{t(n.label)}</div><input type="checkbox" className="switch" checked={prefs[n.key] !== false} onChange={() => toggle(n.key)} /></label>))}</div>
      <p className="group-foot" style={{ marginTop: -12 }}>{t('Au maximum une notification par équipe et par heure (sauf « Ta vidéo est prête »).')}</p>
    </Sheet>
  );
}

function DeleteSheet({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const [txt, setTxt] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const del = async () => {
    setBusy(true); setErr(t(''));
    try {
      // Le Worker efface les données (profil, suivis, adhésions, publications, médias) puis on supprime le compte.
      await api('/account', undefined, 'DELETE').catch(() => D.deleteDoc(D.profileRef(s.user!.uid)));
      await deleteUser(s.user!); location.hash = '/fil'; location.reload();
    } catch (e: any) {
      setErr(String(e?.code).includes('recent-login') ? t('Par sécurité, déconnecte-toi puis reconnecte-toi avant de supprimer ton compte.') : t('La suppression a échoué. Réessaie.'));
    } finally { setBusy(false); }
  };
  return (
    <Sheet title={t('Supprimer mon compte')} onClose={onClose}>
      <p>{t('Ton compte, ton profil, tes suivis, tes adhésions aux Équipes, tes publications et tes médias seront')} <b>{t('définitivement supprimés')}</b>.</p>
      <label className="label" htmlFor="del">{t('Tape SUPPRIMER pour confirmer')}</label>
      <input id="del" className="field" value={txt} onChange={(e) => setTxt(e.target.value)} autoCapitalize="characters" />
      {err && <div className="err mt">{err}</div>}
      <button className="btn danger mt" disabled={txt !== 'SUPPRIMER' || busy} onClick={del}>{t('Supprimer définitivement')}</button>
    </Sheet>
  );
}

export const LegalLinks = () => (
  <div className="group">
    <a className="row" href="#/legal/cgu" style={{ color: 'inherit' }}><div className="grow">{t('Conditions d\'utilisation')}</div><span className="chev">›</span></a>
    <a className="row" href="#/legal/confidentialite" style={{ color: 'inherit' }}><div className="grow">{t('Politique de confidentialité')}</div><span className="chev">›</span></a>
    <a className="row" href="#/legal/charte" style={{ color: 'inherit' }}><div className="grow">{t('Charte BeHoop')}</div><span className="chev">›</span></a>
  </div>
);

/** Mon thème : couleur (palette basket ou couleurs d'un club suivi), mode, fond, accessibilité. Enregistré sur le profil. */
function ThemeSheet({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const clubs = useClubs();
  const p = s.profile!;
  const th: ThemePrefs = { ...DEFAULT_THEME, mode: p.theme ?? 'auto', ...p.ui };
  const save = async (patch: Partial<ThemePrefs>) => {
    const n = { ...th, ...patch };
    s.setProfile({ ...p, theme: n.mode, ui: n });
    await D.updateProfile(s.user!.uid, { theme: n.mode, ui: n }).catch(() => s.toast(t('Thème non enregistré')));
  };
  const myClubs = clubs.filter((c) => s.followedClubs.includes(c.id) || s.follows.some((f) => f.type === 'team' && c.teams.some((x) => x.id === f.refId)));
  const Seg = <K extends string>({ v, opts, on }: { v: K; opts: [K, string, IconName?][]; on: (k: K) => void }) => (
    <div className="seg">{opts.map(([k, l, ic]) => <button key={k} className={v === k ? 'on' : ''} onClick={() => on(k)}>{ic && <Ico n={ic} />}{t(l)}</button>)}</div>);
  return (
    <Sheet title={t('Mon thème')} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>{t('Enregistré sur ton profil : il te suit sur tous tes appareils.')}</p>
      <div className="group-title">{t('Ma couleur')}</div>
      <div className="swatches">{ACCENTS.map((a) => <button key={a.id} className={`swatch${th.accent === a.id ? ' on' : ''}`} style={{ background: a.css }} aria-label={t(a.label)} title={t(a.label)} onClick={() => save({ accent: a.id })} />)}</div>
      {myClubs.length > 0 && <>
        <div className="group-title mt">{t('Aux couleurs de mon club')}</div>
        <div className="group">{myClubs.map((c) => { const k = clubColors(c); const on = th.accent === `club:${c.id}`; return (
          <button key={c.id} className="row" onClick={() => save({ accent: `club:${c.id}` })} aria-pressed={on}>
            <Disc src={c.logo} name={c.name} size={36} ring={k.accent} /><div className="grow ellipsis">{c.name}</div>
            <span style={{ width: 44, height: 22, borderRadius: 11, background: k.grad }} aria-hidden />
            <span style={{ width: 22, color: 'var(--accent)' }}>{on && <Ico n="check" size={20} />}</span>
          </button>); })}</div>
      </>}
      <div className="group-title mt">{t('Mode')}</div>
      <Seg v={th.mode} opts={[['light', 'Clair', 'sun'], ['dark', 'Sombre', 'moon'], ['auto', 'Auto']]} on={(mode) => save({ mode })} />
      <div className="group-title">{t('Fond')}</div>
      <Seg v={th.bg} opts={[['parquet', 'Parquet', 'ball'], ['nuit', 'Nuit de match'], ['uni', 'Uni']]} on={(bg) => save({ bg })} />
      <div className="group">
        <label className="row"><div className="grow">{t('Réduire la transparence')}<div className="sub">{t('Plus lisible et plus fluide sur les téléphones modestes')}</div></div>
          <input type="checkbox" className="switch" checked={th.rt} onChange={(e) => save({ rt: e.target.checked })} /></label>
        <label className="row"><div className="grow">{t('Réduire les animations')}</div>
          <input type="checkbox" className="switch" checked={th.rm} onChange={(e) => save({ rm: e.target.checked })} /></label>
      </div>
    </Sheet>
  );
}
