// Espace Club (#/espace/…) : l'espace « travail » de BeHoop. Même appli, mêmes composants, mais une autre ambiance
// (tableau du coach au lieu du parquet, couleurs d'entraînement) et sa propre navigation, selon le rôle.
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../lib/session';
import { t, tn, locale } from '../lib/i18n';
import { loadClub, loadIndex, type Game } from '../lib/data';
import { Skeleton, Empty, Avatar, Loader, useWide, Logo, LangSwitch, useAsync, Sheet } from '../ui/kit';
import { api } from '../lib/api';
import { HelpSheet } from '../ui/Help';
import { Ico, type IconName } from '../ui/icons';
import { addDays, today } from '../hoopcamp/engine';
import * as A from './api';
import { ClubProvider, useClub, ROLE_LABEL, playerName } from './ctx';
import { HoopCampCard, HoopCampPage } from './HoopCamp';
import { Validate, pendingOf } from './Validate';
import { TeamSpace, Trainings, fmtDay } from './Team';
import { AdminSpace } from './Admin';
import { Tactique } from './Tactique';
import './space.css';

export default function Space({ sub, arg }: { sub?: string; arg?: string }) {
  return <ClubProvider><Shell sub={sub} arg={arg} /></ClubProvider>;
}

function useWorkMode() {
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.space = 'work';
    return () => { delete r.dataset.space; };
  }, []);
}

/** Rideau d'entrée : on change d'espace (une fois par session) */
function Enter() {
  const [on, setOn] = useState(() => { try { return !sessionStorage.getItem('espace-in'); } catch { return false; } });
  useEffect(() => { if (!on) return; try { sessionStorage.setItem('espace-in', '1'); } catch { /* */ } const id = setTimeout(() => setOn(false), 1300); return () => clearTimeout(id); }, [on]);
  if (!on) return null;
  return (
    <div className="work-enter" aria-hidden>
      <svg viewBox="0 0 200 120" className="we-court"><rect x="10" y="10" width="180" height="100" rx="4" /><line x1="100" y1="10" x2="100" y2="110" /><circle cx="100" cy="60" r="18" /><path d="M10 38 h26 v44 h-26 M190 38 h-26 v44 h26" /></svg>
      <div className="we-txt"><small>BeHoop</small><b>{t('Espace Club')}</b><span>{t('On passe à l’entraînement')}</span></div>
    </div>
  );
}

// Retour dans l'Espace Club : « ‹ » ramène à l'écran précédent de l'espace (jamais vers BeHoop par surprise).
// On garde le chemin parcouru dans l'espace ; sur le Banc, « ‹ » sort vers BeHoop.
const TRAIL = 'espace-trail';
const readTrail = (): string[] => { try { return JSON.parse(sessionStorage.getItem(TRAIL) ?? '[]'); } catch { return []; } };
const writeTrail = (l: string[]) => { try { sessionStorage.setItem(TRAIL, JSON.stringify(l)); } catch { /* */ } };
function useTrail(h: string) {
  useEffect(() => {
    const l = readTrail(), i = l.lastIndexOf(h);
    writeTrail(i >= 0 ? l.slice(0, i + 1) : [...l, h].slice(-30));
  }, [h]);
}
function goBack() {
  const l = readTrail(); l.pop();
  const prev = l[l.length - 1] ?? '#/espace';
  writeTrail(l.length ? l : []);
  location.hash = prev.slice(1);
}

interface Tab { id: string; href: string; icon: IconName; label: string }
function tabsFor(k: ReturnType<typeof useClub>): Tab[] {
  // Espace Club = mode gestion (coachs, admins) : Banc · Effectif · Séances · Playbook
  const r = k.me?.role;
  const tabs: Tab[] = [{ id: 'home', href: '#/espace', icon: 'bolt', label: 'Banc' }];
  if (r === 'coach' && k.teamIds.length) tabs.push({ id: 'equipe', href: `#/espace/equipe/${k.teamIds[0]}`, icon: 'users', label: 'Effectif' });
  if (r === 'club_admin' || r === 'super_admin') tabs.push({ id: 'club', href: '#/espace/club', icon: 'users', label: 'Effectif' });
  if (r) tabs.push({ id: 'calendrier', href: '#/espace/calendrier', icon: 'calendar', label: 'Séances' }, { id: 'tactique', href: '#/espace/tactique', icon: 'edit', label: 'Playbook' });
  return tabs;
}

function Shell({ sub, arg }: { sub?: string; arg?: string }) {
  useWorkMode();
  const s = useSession();
  const k = useClub();
  const wide = useWide();
  const [sw, setSw] = useState(false);
  useEffect(() => { document.title = `${t('Espace Club')} · BeHoop`; }, []);
  const tabs = tabsFor(k);
  const cur = !sub ? 'home' : sub === 'valider' ? 'home' : sub;
  useTrail(`#/espace${sub ? `/${sub}` : ''}${arg ? `/${arg}` : ''}`);
  let el: React.ReactNode;
  if (!s.user) el = <Empty ill="lock" title={t('Connecte-toi pour entrer dans l’Espace Club')} action={<button className="btn volt" onClick={() => s.requireAuth()}>{t('Se connecter')}</button>} />;
  else if (k.loading) el = <Loader />;
  else if (sub === 'rejoindre' && arg) el = <JoinCode code={arg} />;
  else if (!k.me) el = <Join />;
  else if (k.me.role === 'super_admin' && !k.me.club_id) el = <PickClub />;
  // Joueurs et parents : tout est dans le Vestiaire ; l'Espace Club est réservé aux coachs et aux admins
  else if (!MANAGE.has(k.me.role)) el = <NotManager />;
  else switch (sub) {
    case 'hoopcamp': el = <HoopCampPage key={arg} pid={arg!} />; break;
    case 'valider': el = <Validate pid={arg!} />; break;
    case 'equipe': el = <TeamSpace key={arg} teamId={arg!} />; break;
    case 'club': el = <AdminSpace />; break;
    case 'calendrier': el = <Agenda />; break;
    case 'tactique': el = <Tactique />; break;
    case 'compte': el = <Account />; break;
    default: el = <Home />;
  }
  return (
    <>
      <Enter />
      {sw && <ClubSwitch onClose={() => setSw(false)} />}
      <main className="screen work">
        <div className="col-main">
          <header className="work-bar">
            {sub ? <button className="work-exit back" onClick={goBack} aria-label={t('Retour')}><span className="ex-arrow">‹</span></button>
              : <a className="work-exit" href="#/fil" aria-label={t('Revenir à BeHoop')}><span className="ex-arrow">‹</span><Logo size={26} /></a>}
            <div className="work-id"><span className="work-badge" title={t('Espace Club')}><Ico n="bolt" /><span className="wb-txt">{t('Espace Club')}</span></span>{k.club && (Object.values(A.spacesOf(k.me)).filter((x) => MANAGE.has(x.role)).length > 1 || k.me?.role === 'super_admin'
              ? <button className="ellipsis club-switch" onClick={() => setSw(true)}>{k.club.short || k.club.name} ▾</button>
              : <span className="ellipsis">{k.club.short || k.club.name}</span>)}</div>
            {s.user && <a className="top-av" href="#/espace/compte" aria-label={t('Mon compte club')}><Avatar name={k.me?.display_name ?? s.profile?.displayName ?? '?'} src={s.profile?.avatarUrl} /></a>}
          </header>
          {el}
        </div>
      </main>
      {wide && (
        <nav className="sidenav work-side" aria-label={t('Espace Club')}>
          <a className="brand" href="#/fil" aria-label={t('Revenir à BeHoop')}><Logo size={40} /></a>
          <div className="work-side-badge">{t('Espace Club')}</div>
          <div className="side-items">{tabs.map((x) => <a key={x.id} href={x.href} className={cur === x.id ? 'on' : ''}><Ico n={x.icon} /><span>{t(x.label)}</span></a>)}</div>
          <a className="btn secondary side-cta" href="#/fil"><Ico n="chevLeft" />BeHoop</a>
          <div className="side-foot"><LangSwitch seg /></div>
        </nav>
      )}
      {!wide && tabs.length > 1 && (
        <nav className="tabbar work-tabs" aria-label={t('Espace Club')}>
          {tabs.map((x) => <a key={x.id} href={x.href} className={cur === x.id ? 'on' : ''} aria-current={cur === x.id ? 'page' : undefined}><Ico n={x.icon} /><span>{t(x.label)}</span></a>)}
        </nav>
      )}
    </>
  );
}

/** Super admin sans club actif : il choisit le club à gérer (aucun rôle n'est ajouté à son compte) */
function PickClub() {
  const k = useClub();
  const [q, setQ] = useState('');
  const idx = useAsync(() => loadIndex(), []);
  const list = (idx.data?.clubs ?? []).filter((c) => q.trim().length > 1 && `${c.name} ${c.short ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30);
  const go = (id: number) => { try { sessionStorage.setItem('espace-gerer', String(id)); } catch { /* */ } k.reload(); };
  return (
    <>
      <section className="hc-hero small"><div className="hc-kick"><Ico n="bolt" />{t('Super admin')}</div><h2>{t('Choisis le club à gérer')}</h2></section>
      <input className="field" placeholder={t('Nom du club')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="group mt">{list.map((c) => <button key={c.id} className="row" onClick={() => go(c.id)}><span className="grow"><span className="nm">{c.name}</span></span><span className="chev">›</span></button>)}</div>
    </>
  );
}

const MANAGE = new Set(['coach', 'club_admin', 'super_admin']);
function NotManager() {
  const k = useClub();
  const s = useSession();
  const mine = Object.entries(A.spacesOf(k.me)).filter(([, x]) => MANAGE.has(x.role));
  const go = async (key: string) => { await api('/club/switch', { key }).catch(() => {}); try { sessionStorage.removeItem(`club-sync-${s.user!.uid}`); } catch { /* */ } await k.reload(); };
  if (mine.length) return (
    <>
      <section className="hc-hero small"><div className="hc-kick"><Ico n="bolt" />{t('Espace Club')}</div><h2>{t('Choisis le club à gérer')}</h2></section>
      <div className="group">{mine.map(([key, x]) => <button key={key} className="row" onClick={() => go(key)}><span className="grow"><span className="nm">{k.clubName(x.club_id)}</span><span className="sub">{t(ROLE_LABEL[x.role])}</span></span><span className="chev">›</span></button>)}</div>
    </>
  );
  return <Empty ill="users" title={t('L’Espace Club est réservé aux coachs et aux admins')} text={t('Ton Hoop Camp, tes entraînements et ton équipe sont dans le Vestiaire.')} action={<a className="btn volt" href="#/equipes">{t('Aller au Vestiaire')}</a>} />;
}

// ---------- Accueil selon le rôle ----------
function Home() {
  const s = useSession();
  const k = useClub();
  const me = k.me!;
  const first = (me.display_name ?? s.profile?.displayName ?? '').split(' ')[0];
  return (
    <>
      <section className="work-hello">
        <div><small>{t(ROLE_LABEL[me.role])}{k.club ? ` · ${k.club.name}` : ''}</small><h1>{t('Salut {n} !', { n: first || '👋' })}</h1></div>
        {k.club?.logo && <img src={k.club.logo} alt="" className="club-logo" />}
      </section>
      {k.inv && <OtherClubInvite />}
      <Upcoming />
      {me.role === 'player' && (k.players[0] ? <HoopCampCard p={k.players[0]} viewer="player" /> : <Empty ill="user" title={t('Ta fiche joueur n’existe pas encore')} text={t('Demande à ton coach ou à l’admin du club de t’ajouter.')} />)}
      {me.role === 'parent' && <ParentHome />}
      {me.role === 'coach' && <CoachHome />}
      {(me.role === 'club_admin' || me.role === 'super_admin') && <AdminHome />}
      <div className="work-links">
        {k.club && <a href={`#/club/${k.club.id}`}><Ico n="club" /><span>{t('Le club sur BeHoop')}</span></a>}
      </div>
    </>
  );
}

/** Prochain rendez-vous : entraînement ou match des équipes qui me concernent */
function Upcoming() {
  const k = useClub();
  const tr = useAsync(() => (k.teamIds.length ? A.trainingsOf(k.teamIds, today()) : Promise.resolve([])), [k.teamIds.join()]);
  const [g, setG] = useState<Game | null>(null);
  useEffect(() => {
    if (!k.club || !k.teamIds.length) return;
    loadClub(k.club.id).then((d) => setG(d.games.filter((x) => (k.teamIds.includes(String(x.h)) || k.teamIds.includes(String(x.a))) && x.d >= today() && x.hs == null)
      .sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t))[0] ?? null)).catch(() => {});
  }, [k.club, k.teamIds.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = tr.data?.[0];
  if (!next && !g) return null;
  return (
    <div className="next-row">
      {next && <div className="next-card"><small>{t('Prochain entraînement')}</small><b>{fmtDay(next.date)} · {next.start_time}</b><span>{next.location || k.team(next.team_id)?.cat}</span></div>}
      {g && <a className="next-card" href={`#/match/${g.s}/${g.id}`}><small>{t('Prochain match')}</small><b>{fmtDay(g.d)} · {g.t}</b><span className="ellipsis">{g.hn} – {g.an}</span></a>}
    </div>
  );
}

function ParentHome() {
  const s = useSession();
  const k = useClub();
  const [add, setAdd] = useState(false);
  return (
    <>
      {!k.players.length && <Empty ill="users" title={t('Ajoute ton enfant')} text={t('Relie ton compte à la fiche de ton enfant pour suivre son Hoop Camp et valider ses séances.')} />}
      {k.players.map((p) => <ChildBlock key={p.id} p={p} />)}
      <button className="btn secondary" onClick={() => setAdd(true)}><Ico n="userAdd" />{t('Ajouter un enfant')}</button>
      {add && <AddChild onClose={() => setAdd(false)} onDone={() => { setAdd(false); k.reload(); s.toast(t('Enfant ajouté.')); }} />}
    </>
  );
}
function ChildBlock({ p }: { p: A.Player }) {
  const k = useClub();
  const [pending, setPending] = useState(0);
  useEffect(() => A.watchDays(p.id, addDays(today(), -21), (d) => setPending(pendingOf(d))), [p.id]);
  return (
    <section className="child">
      <div className="child-head">
        <b>{playerName(p)}</b><span className="sub">{k.team(p.team_id)?.cat ?? t('sans équipe')}</span>
        {pending > 0 && <a className="pill-pend big" href={`#/espace/valider/${p.id}`}>{tn(pending, '{n} exercice à valider', '{n} exercices à valider')} ›</a>}
      </div>
      <HoopCampCard p={p} viewer="parent" />
    </section>
  );
}
function AddChild({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const s = useSession();
  const k = useClub();
  const [f, setF] = useState({ prenom: '', nom: '', team: '' });
  const orphans = useAsync(() => A.playersOfTeam(f.team).then((l) => l.filter((p) => !p.account_uid && !p.parent_uids.length)).catch(() => []), [f.team]);
  return (
    <Sheet title={t('Ajouter un enfant')} onClose={onClose}>
      <div className="form">
        <select className="field" value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })}>
          <option value="">{t('Son équipe')}</option>
          {(k.club?.teams ?? []).map((tm) => <option key={tm.id} value={String(tm.id)}>{tm.cat}{tm.name && tm.name !== tm.cat ? ` · ${tm.name}` : ''}</option>)}
        </select>
        {f.team && !!orphans.data?.length && (
          <>
            <p className="hint">{t('Ton enfant est déjà dans la liste ? Relie-toi à sa fiche :')}</p>
            <div className="chips wrap">{orphans.data.map((p) => <button key={p.id} className="chip" onClick={async () => { try { await A.linkChild(k.me!, p.id); onDone(); } catch { s.toast(t('Accès refusé.')); } }}>{playerName(p)}</button>)}</div>
            <p className="hint">{t('Sinon, crée sa fiche :')}</p>
          </>
        )}
        <input className="field" placeholder={t('Prénom')} value={f.prenom} onChange={(e) => setF({ ...f, prenom: e.target.value })} />
        <input className="field" placeholder={t('Nom (facultatif)')} value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} />
        <button className="btn volt" disabled={!f.prenom.trim()} onClick={async () => { try { await A.addChild(k.me!, f.prenom.trim(), f.nom.trim(), f.team || null); onDone(); } catch { s.toast(t('Accès refusé.')); } }}>{t('Ajouter')}</button>
      </div>
    </Sheet>
  );
}

function CoachHome() {
  const k = useClub();
  if (!k.teamIds.length) return <Empty ill="users" title={t('Aucune équipe pour l’instant')} text={t('L’admin du club t’attribue tes équipes.')} />;
  return (
    <>
      <h3 className="group-title">{t('Mes équipes')}</h3>
      <div className="team-cards">
        {k.teamIds.map((id) => <CoachTeamCard key={id} id={id} />)}
      </div>
    </>
  );
}
function CoachTeamCard({ id }: { id: string }) {
  const k = useClub();
  const tm = k.team(id);
  const data = useAsync(async () => {
    const ps = await A.playersOfTeam(id);
    const days = await Promise.all(ps.map((p) => A.daysSince(p.id, addDays(today(), -7)).catch(() => [])));
    return { n: ps.length, active: days.filter((d) => d.some((x) => x.items.some((i) => x.checks?.[i.ex]))).length, pending: days.reduce((n, d) => n + pendingOf(d), 0) };
  }, [id]);
  return (
    <a className="team-card" href={`#/espace/equipe/${id}`}>
      <b>{tm?.cat ?? id}</b><small>{tm?.name !== tm?.cat ? tm?.name : ''}</small>
      {data.data && <span className="tc-stats">{tn(data.data.n, '{n} joueur', '{n} joueurs')} · {t('{n} actifs cette semaine', { n: data.data.active })}{data.data.pending ? ` · ${t('{n} à valider', { n: data.data.pending })}` : ''}</span>}
    </a>
  );
}

function AdminHome() {
  const k = useClub();
  const inv = useAsync(() => A.invitationsOf(k.me!.club_id), [k.me?.club_id]);
  const us = useAsync(() => A.usersOf(k.me!.club_id), [k.me?.club_id]);
  const n = (r: A.Role) => (us.data ?? []).filter((u) => u.role === r).length;
  return (
    <>
      <a className="admin-card" href="#/espace/club">
        <div className="ac-grid">
          <div><b>{n('coach')}</b><span>{t('coachs')}</span></div><div><b>{n('player')}</b><span>{t('joueurs')}</span></div>
          <div><b>{n('parent')}</b><span>{t('parents')}</span></div><div><b>{(inv.data ?? []).filter((i) => i.status === 'pending').length}</b><span>{t('invitations')}</span></div>
        </div>
        <span className="btn small volt">{t('Gérer le club')} ›</span>
      </a>
      <h3 className="group-title">{t('Équipes')}</h3>
      <div className="team-cards">{(k.club?.teams ?? []).map((tm) => <a key={tm.id} className="team-card" href={`#/espace/equipe/${tm.id}`}><b>{tm.cat}</b><small>{tm.name !== tm.cat ? tm.name : ''}</small></a>)}</div>
    </>
  );
}

// ---------- Rejoindre (invitation) ----------
function Join() {
  const s = useSession();
  const k = useClub();
  const inv = k.inv;
  const [name, setName] = useState(s.profile?.displayName ?? '');
  const [asParent, setAsParent] = useState(false);
  const [child, setChild] = useState({ prenom: '', nom: '' });
  const [busy, setBusy] = useState(false);
  if (!inv) return (
    <>
      <section className="hc-hero">
        <div className="hc-kick"><Ico n="club" />{t('Espace Club')}</div>
        <h2>{t('L’espace d’entraînement de ton club')}</h2>
        <p>{t('Hoop Camp (programmes à la maison validés par un adulte), entraînements, tableau Tactique, suivi par le coach.')}</p>
      </section>
      <div className="group pad">
        <p>{t('L’accès se fait sur invitation de l’admin de ton club. Donne-lui cette adresse :')}</p>
        <p className="mono">{s.user?.email}</p>
        <p className="hint">{t('Ton club n’a pas encore d’Espace Club ? Écris-nous depuis la page Mentions légales.')}</p>
      </div>
    </>
  );
  const role = inv.role === 'player' && asParent ? 'parent' : inv.role;
  const accept = async () => {
    setBusy(true);
    try { await A.claimInvitation(s.user!, inv, name.trim() || s.user!.email!.split('@')[0], role === 'parent' && child.prenom.trim() ? { prenom: child.prenom.trim(), nom: child.nom.trim() } : undefined); await k.reload(); if (role === 'player' || role === 'parent') location.hash = '/equipes'; }
    catch { s.toast(t('Impossible d’accepter l’invitation. Réessaie.')); } finally { setBusy(false); }
  };
  return (
    <>
      <section className="hc-hero">
        <div className="hc-kick">✉️ {t('Invitation')}</div>
        <h2>{k.club?.name ?? inv.club_name ?? t('Ton club')}</h2>
        <p>{t('Tu es invité comme {r}.', { r: t(ROLE_LABEL[inv.role]).toLowerCase() })}{inv.team_id && k.team(inv.team_id) ? ` ${t('Équipe : {e}.', { e: k.team(inv.team_id)!.cat })}` : ''}</p>
      </section>
      <div className="form">
        <label className="lbl">{t('Ton nom (visible par le club)')}<input className="field" value={name} onChange={(e) => setName(e.target.value)} /></label>
        {inv.role === 'player' && (
          <div className="seg work-seg">
            <button className={!asParent ? 'on' : ''} onClick={() => setAsParent(false)}>{t('Je suis le joueur')}</button>
            <button className={asParent ? 'on' : ''} onClick={() => setAsParent(true)}>{t('Je suis son parent')}</button>
          </div>
        )}
        {(role === 'parent') && (
          <>
            <p className="hint">{inv.role === 'player' ? t('Ton enfant n’a pas d’e-mail : tu gères son compte. Il utilisera ton téléphone pour cocher ses exercices.') : t('Ajoute ton enfant maintenant (ou plus tard).')}</p>
            <input className="field" placeholder={t('Prénom de l’enfant')} value={child.prenom} onChange={(e) => setChild({ ...child, prenom: e.target.value })} />
            <input className="field" placeholder={t('Nom (facultatif)')} value={child.nom} onChange={(e) => setChild({ ...child, nom: e.target.value })} />
          </>
        )}
        <button className="btn volt" disabled={busy || (inv.role === 'player' && asParent && !child.prenom.trim())} onClick={accept}>{t('Rejoindre l’Espace Club')}</button>
      </div>
    </>
  );
}

/** Changer de club actif (coach dans plusieurs clubs, parent avec des enfants dans des clubs différents) */
function ClubSwitch({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const k = useClub();
  const [busy, setBusy] = useState(false);
  const go = async (key: string) => {
    setBusy(true);
    try { try { sessionStorage.removeItem('espace-gerer'); } catch { /* */ } await api('/club/switch', { key }); try { sessionStorage.removeItem(`club-sync-${s.user!.uid}`); } catch { /* */ } await k.reload(); onClose(); location.hash = '/espace'; }
    catch { s.toast(t('Impossible de changer de club.')); } finally { setBusy(false); }
  };
  return (
    <Sheet title={t('Mes espaces')} onClose={onClose}>
      <div className="group" style={{ margin: '0 16px 20px' }}>
        {k.me?.role === 'super_admin' && (
          <button className="row" onClick={() => { try { sessionStorage.removeItem('espace-gerer'); } catch { /* */ } k.reload(); onClose(); location.hash = '/espace'; }}>
            <span className="grow"><span className="nm">{k.club?.name}</span><span className="sub">{t('Super admin')} · {t('Quitter la gestion de ce club')}</span></span><Ico n="close" />
          </button>
        )}
        {Object.entries(A.spacesOf(k.me)).filter(([, m]) => MANAGE.has(m.role)).map(([key, m]) => { const on = k.me?.role !== 'super_admin' && key === `${k.me?.club_id}~${k.me?.role}`; return (
          <button key={key} className="row" disabled={busy || on} onClick={() => go(key)}>
            <span className="grow"><span className="nm">{k.clubName(m.club_id)}</span><span className="sub">{t(ROLE_LABEL[m.role])}</span></span>
            {on ? <Ico n="check" /> : <span className="chev">›</span>}
          </button>
        ); })}
      </div>
    </Sheet>
  );
}

/** Invitation d'un autre club pour un compte déjà inscrit : on l'ajoute à ses clubs */
function OtherClubInvite() {
  const s = useSession();
  const k = useClub();
  const inv = k.inv!;
  const [busy, setBusy] = useState(false);
  const claim = async (asParent: boolean) => {
    const prenom = asParent ? prompt(t('Prénom de l’enfant')) ?? '' : '';
    if (asParent && !prenom.trim()) return;
    setBusy(true);
    try { await api('/club/claim', { asParent, child: { prenom } }); try { sessionStorage.removeItem(`club-sync-${s.user!.uid}`); } catch { /* */ } await k.reload(); s.toast(t('Club ajouté.')); }
    catch { s.toast(t('Impossible d’accepter l’invitation. Réessaie.')); } finally { setBusy(false); }
  };
  return (
    <div className="next-card" style={{ marginBottom: 14 }}>
      <small>✉️ {t('Invitation')}</small>
      <b>{k.clubName(inv.club_id) || inv.club_name} · {t(ROLE_LABEL[inv.role])}</b>
      <span>{t('Tu peux avoir plusieurs rôles et plusieurs clubs : tu passes de l’un à l’autre en touchant le nom du club en haut.')}</span>
      <div className="hc-meta" style={{ marginTop: 8 }}>
        {inv.role === 'player' ? <>
          <button className="btn small volt" disabled={busy} onClick={() => claim(false)}>{t('Je suis le joueur')}</button>
          <button className="btn small secondary" disabled={busy} onClick={() => claim(true)}>{t('Je suis son parent')}</button>
        </> : <button className="btn small volt" disabled={busy} onClick={() => claim(inv.role === 'parent')}>{t('Rejoindre')}</button>}
      </div>
    </div>
  );
}

// ---------- Rejoindre avec le code (QR) d'une équipe ----------
function JoinCode({ code }: { code: string }) {
  const s = useSession();
  const k = useClub();
  const c = useAsync(() => A.getJoinCode(code), [code]);
  const [name, setName] = useState(k.me?.display_name ?? s.profile?.displayName ?? '');
  const [asParent, setAsParent] = useState(false);
  const [child, setChild] = useState({ prenom: '', nom: '' });
  const [busy, setBusy] = useState(false);
  if (c.loading) return <Skeleton n={2} />;
  const jc = c.data;
  if (!jc || jc.expires < Date.now()) return <Empty ill="alert" title={t('Code invalide ou expiré')} text={t('Demande un nouveau QR code à ton coach.')} />;
  const teamName = k.team(jc.team_id)?.cat;
  const mine = Object.values(A.spacesOf(k.me)).filter((x) => x.club_id === jc.club_id);
  const inClub = mine.length > 0;
  if (mine.some((x) => x.role === 'player') && mine.some((x) => x.role === 'parent')) return <Empty ill="checkCircle" title={t('Tu fais déjà partie du club')} action={<a className="btn volt" href="#/espace">{t('Espace Club')}</a>} />;
  const go = async () => {
    setBusy(true);
    try { await api('/club/join', { code, asParent, child, name: name.trim() }); try { sessionStorage.removeItem(`club-sync-${s.user!.uid}`); } catch { /* */ } await k.reload(); await s.refresh(); location.hash = '/equipes'; }
    catch { s.toast(t('Impossible de rejoindre. Réessaie.')); } finally { setBusy(false); }
  };
  return (
    <>
      <section className="hc-hero">
        <div className="hc-kick">📲 {t('Rejoindre l’équipe')}</div>
        <h2>{jc.club_name ?? t('Ton club')}{teamName ? ` · ${teamName}` : ''}</h2>
        <p>{t('Ton compte BeHoop sera lié à l’équipe : Hoop Camp, entraînements, et l’Équipe privée (photos, vidéos, covoiturage).')}</p>
      </section>
      <div className="form" style={{ padding: 0 }}>
        {!inClub && <label className="lbl">{t('Ton nom (visible par le club)')}<input className="field" value={name} onChange={(e) => setName(e.target.value)} /></label>}
        {!inClub && (
          <div className="seg work-seg">
            <button className={!asParent ? 'on' : ''} onClick={() => setAsParent(false)}>{t('Je suis le joueur')}</button>
            <button className={asParent ? 'on' : ''} onClick={() => setAsParent(true)}>{t('Je suis son parent')}</button>
          </div>
        )}
        {asParent && (
          <>
            <input className="field" placeholder={t('Prénom de l’enfant')} value={child.prenom} onChange={(e) => setChild({ ...child, prenom: e.target.value })} />
            <input className="field" placeholder={t('Nom (facultatif)')} value={child.nom} onChange={(e) => setChild({ ...child, nom: e.target.value })} />
          </>
        )}
        <button className="btn volt" disabled={busy || (asParent && !child.prenom.trim()) || (!asParent && !name.trim())} onClick={go}>{t('Rejoindre')}</button>
      </div>
    </>
  );
}

// ---------- Agenda ----------
function Agenda() {
  const k = useClub();
  const canEdit = k.me?.role === 'coach' || k.me?.role === 'club_admin' || k.me?.role === 'super_admin';
  const games = useAsync(async () => (k.club ? (await loadClub(k.club.id)).games : []), [k.club?.id]);
  const mine = useMemo(() => (games.data ?? []).filter((g) => (k.teamIds.includes(String(g.h)) || k.teamIds.includes(String(g.a))) && g.d >= today() && g.d <= addDays(today(), 30)), [games.data, k.teamIds]);
  return (
    <>
      <section className="hc-hero small"><div className="hc-kick"><Ico n="calendar" />{t('Séances')}</div><h2>{t('Entraînements et matchs')}</h2></section>
      <h3 className="group-title">{t('Entraînements')}</h3>
      {k.teamIds.length ? <Trainings teamIds={k.teamIds} canEdit={canEdit} /> : <p className="hint">{t('Aucune équipe liée à ton compte.')}</p>}
      <h3 className="group-title mt">{t('Matchs (30 prochains jours)')}</h3>
      {games.loading ? <Skeleton n={2} /> : !mine.length ? <p className="hint">{t('Aucun match prévu.')}</p> : (
        <div className="group">
          {mine.map((g) => (
            <a key={g.id} className="row" href={`#/match/${g.s}/${g.id}`}>
              <span className="date-chip"><b>{+g.d.slice(8)}</b><small>{new Date(`${g.d}T12:00`).toLocaleDateString(locale(), { month: 'short' })}</small></span>
              <span className="grow"><span className="nm ellipsis">{g.hn} – {g.an}</span><span className="sub">{g.t} · {g.sn}</span></span><span className="chev">›</span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}

// ---------- Compte ----------
function Account() {
  const s = useSession();
  const k = useClub();
  const me = k.me!;
  const [name, setName] = useState(me.display_name ?? '');
  const [help, setHelp] = useState(false);
  return (
    <>
      <section className="hc-hero small"><div className="hc-kick"><Ico n="user" />{t('Mon compte club')}</div><h2>{me.display_name ?? s.user?.email}</h2><p>{t(ROLE_LABEL[me.role])} · {k.club?.name ?? me.club_id}</p></section>
      <div className="form">
        <label className="lbl">{t('Nom visible par le club')}<input className="field" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <button className="btn secondary" disabled={!name.trim() || name === me.display_name} onClick={async () => { await A.renameMe(me.uid, name.trim()); await k.reload(); s.toast(t('Enregistré.')); }}>{t('Enregistrer')}</button>
      </div>
      <h3 className="group-title mt">{t('Mes liens')}</h3>
      <div className="group">
        <div className="row"><span className="grow"><span className="nm">{t('Compte BeHoop')}</span><span className="sub">{s.user?.email} · {t('le même compte pour les deux espaces')}</span></span></div>
        {Object.keys(A.spacesOf(me)).length > 1 && <div className="row"><span className="grow"><span className="nm">{t('Mes espaces')}</span><span className="sub">{Object.values(A.spacesOf(me)).map((x) => `${k.clubName(x.club_id)} (${t(ROLE_LABEL[x.role]).toLowerCase()})`).join(', ')}</span></span></div>}
        {me.role === 'coach' && <div className="row"><span className="grow"><span className="nm">{t('Équipes coachées')}</span><span className="sub">{(me.team_ids ?? []).map((id) => k.team(id)?.cat ?? id).join(', ') || '—'}</span></span></div>}
        {(me.role === 'parent' || me.role === 'player') && k.players.map((p) => <a key={p.id} className="row" href={`#/espace/hoopcamp/${p.id}`}><span className="grow"><span className="nm">{playerName(p)}</span><span className="sub">{k.team(p.team_id)?.cat ?? t('sans équipe')}</span></span><span className="chev">›</span></a>)}
      </div>
      <p className="hint">{t('Données des jeunes : seuls le joueur, ses parents liés et le coach de son équipe voient son Hoop Camp.')}</p>
      <a className="btn secondary mt" href="#/profil">{t('Mon profil BeHoop')}</a>
      <a className="btn secondary mt" href="#/fil"><Ico n="chevLeft" />{t('Revenir à BeHoop')}</a>
      <button className="btn secondary mt" onClick={() => setHelp(true)}>{t('Aide / Contact')}</button>
      {help && <HelpSheet onClose={() => setHelp(false)} />}
    </>
  );
}
