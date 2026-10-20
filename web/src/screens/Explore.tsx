import { useEffect, useMemo, useState } from 'react';
import { loadIndex, loadClub, loadSerie, ranked, loadComps, normalize, teamLabel, trCat, type Competition, isPlayed, teamIndex, loadNews, type Game, type Club, type Team } from '../lib/data';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { Screen, Tabs, Disc, Skeleton, ErrorBox, Empty, Sheet, useAsync } from '../ui/kit';
import { CalendarButton } from '../ui/CalendarButton';
import { StandingsTable } from '../ui/Standings';
import { CompLogo } from '../ui/CompLogo';
import { CompFollowButton } from './CompPage';
import { PostCard } from './Feed';
import { haptic, frDate, mapsUrl } from '../lib/util';
import { LiveBadge } from './Live';
import { NewsCard } from './News';
import { t, tn } from '../lib/i18n';
import { Ico, type IconName } from '../ui/icons';

export function FollowButton({ type, id }: { type: 'club' | 'team'; id: number }) {
  const s = useSession();
  const on = s.follows.some((f) => f.type === type && f.refId === id);
  return (
    <button className={`btn small${on ? ' secondary' : ''}`} aria-pressed={on}
      onClick={() => { if (!s.requireAuth(() => s.toggleFollow(type, id))) return; haptic(); s.toggleFollow(type, id); }}>
      {on ? <><Ico n="check" />{t('Suivi')}</> : t('Suivre')}
    </button>
  );
}

// Régions : 6 filtres simples au lieu des 14 provinces
const WALLONIE = ['Hainaut', 'Liège', 'Namur', 'Luxembourg', 'Bruxelles - Brabant Wallon'];
const FLANDRE = ['Anvers', 'Brabant flamand', 'Flandre-Occidentale', 'Flandre-Orientale', 'Limbourg'];
const REGIONS: { id: string; label: string; ok: (p: string) => boolean }[] = [
  { id: '', label: 'Tous', ok: () => true },
  { id: 'w', label: 'Wallonie-Bxl', ok: (p) => WALLONIE.includes(p) },
  { id: 'f', label: 'Flandre', ok: (p) => FLANDRE.includes(p) },
  { id: 'n', label: 'National', ok: (p) => p === 'National' || p === 'BNXT League' },
  { id: 'i', label: 'International', ok: (p) => p === 'International' },
  { id: 'nba', label: 'NBA', ok: (p) => p === 'NBA' },
];

const COMP_CATS: [string, IconName | null, string][] = [['', null, 'Toutes'], ['national', 'flag', 'Belgique'], ['wallonie', null, 'Wallonie-Bxl'], ['flandre', null, 'Flandre'], ['europe', 'europe', 'Europe'], ['monde', 'globe', 'Monde'], ['nba', 'ball', 'NBA · WNBA']];
function CompRow({ c }: { c: Competition }) {
  return (
    <div className="row"><CompLogo c={c} size={40} />
      <a className="grow" href={`#/competition/${c.id}`} style={{ color: 'inherit', minWidth: 0 }}><div className="ellipsis">{c.name}</div><div className="sub ellipsis">{[c.sub, tn(c.teams, '{n} équipe', '{n} équipes')].join(' · ')}</div></a>
      <CompFollowButton id={c.id} /></div>
  );
}

export function Explore() {
  const { data, error, reload } = useAsync(loadIndex, []);
  const news = useAsync(loadNews, []);
  const comps = useAsync(loadComps, []);
  const [q, setQ] = useState('');
  const [reg, setReg] = useState('');
  const [view, setView] = useState<'clubs' | 'comps'>(() => (location.hash.includes('vue=comps') ? 'comps' : 'clubs'));
  const [cat, setCat] = useState<string>('');
  const [women, setWomen] = useState(false), [youth, setYouth] = useState(false);
  const s = useSession();
  const n = normalize(q.trim());
  const compList = useMemo(() => (comps.data ?? []).filter((c) => (!cat || c.cat === cat) && (!women || c.women) && (youth ? c.youth : !n ? !c.youth : true)
    && (!n || normalize(`${c.name} ${c.sub}`).includes(n))), [comps.data, cat, women, youth, n]);
  const list = useMemo(() => {
    const r = REGIONS.find((x) => x.id === reg)!;
    return (data?.clubs ?? []).filter((c) => r.ok(c.province) && (!n || normalize(`${c.name} ${c.short} ${c.city}`).includes(n)))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [data, n, reg]);
  // La recherche porte aussi sur les actus (titres et accroches)
  const foundNews = useMemo(() => (n.length < 2 ? [] : (news.data?.items ?? []).filter((x) => normalize(`${x.title} ${x.excerpt} ${x.source}`).includes(n)).slice(0, 6)), [news.data, n]);
  return (
    <Screen title={t('Rechercher')}>
      {!s.user && <div className="banner"><Ico n="ball" size={30} style={{ color: 'var(--accent)' }} /><div className="grow" style={{ flex: 1 }}><b>{t('Crée ton compte')}</b><div className="muted" style={{ fontSize: 14 }}>{t('pour suivre tes clubs et recevoir les résultats.')}</div></div><button className="btn small" onClick={() => s.requireAuth()}>{t('Créer')}</button></div>}
      <div className="search"><input className="field" type="search" placeholder={t('Club, compétition, ville ou actu…')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Rechercher')} /></div>
      <div className="seg" role="tablist">
        <button className={view === 'clubs' ? 'on' : ''} onClick={() => setView('clubs')} aria-pressed={view === 'clubs'}><><Ico n="club" />{t('Clubs')}</></button>
        <button className={view === 'comps' ? 'on' : ''} onClick={() => setView('comps')} aria-pressed={view === 'comps'}><><Ico n="trophy" />{t('Compétitions')}</></button>
      </div>
      {view === 'comps' ? <>
        <div className="chips">{COMP_CATS.map(([k, ic, l]) => <button key={k} className={`chip${cat === k ? ' on' : ''}`} onClick={() => setCat(k)} aria-pressed={cat === k}>{ic && <Ico n={ic} />}{t(l)}</button>)}
          <button className={`chip${women ? ' on' : ''}`} onClick={() => setWomen(!women)} aria-pressed={women}><><Ico n="women" />{t('Femmes')}</></button>
          <button className={`chip${youth ? ' on' : ''}`} onClick={() => setYouth(!youth)} aria-pressed={youth}><><Ico n="youth" />{t('Jeunes')}</></button></div>
        {!comps.data ? <Skeleton h={56} n={8} /> : compList.length === 0 ? <Empty ill="trophy" title={t('Aucune compétition trouvée')} /> : (
          <div className="group">{compList.slice(0, 80).map((c) => <CompRow key={c.id} c={c} />)}</div>)}
        {compList.length > 80 && <p className="muted center" style={{ fontSize: 13 }}>{t('Affine ta recherche pour voir les autres compétitions.')}</p>}
      </> : <>
      {n && compList.length > 0 && <><div className="group-title"><><Ico n="trophy" />{t('Compétitions')}</></div><div className="group">{compList.slice(0, 5).map((c) => <CompRow key={c.id} c={c} />)}</div></>}
      <div className="chips">{REGIONS.map((r) => <button key={r.id} className={`chip${reg === r.id ? ' on' : ''}`} onClick={() => setReg(r.id)}>{t(r.label)}</button>)}</div>
      {error && <ErrorBox msg={error} retry={reload} />}
      {n && <div className="group-title">{t('Clubs et équipes')}</div>}
      {!data && !error ? <Skeleton h={56} n={8} /> : list.length === 0 ? (n && foundNews.length ? null : <Empty ill="search" title={t('Aucun club trouvé')} text={t('Essaie un autre nom ou une ville.')} />) : (
        <div className="group">{list.slice(0, n ? 30 : 120).map((c) => (
          <a key={c.id} className="row" href={c.teams.length === 1 ? `#/equipe/${c.teams[0].id}` : `#/club/${c.id}`} style={{ color: 'inherit' }}>
            <Disc src={c.logo} name={c.name} size={40} ring={c.c1} />
            <div className="grow"><div className="ellipsis">{c.name}</div><div className="sub">{[c.city, c.teams.length === 1 ? trCat(c.teams[0].cat) : t('{n} équipes', { n: c.teams.length })].filter(Boolean).join(' · ')}</div></div><span className="chev">›</span>
          </a>))}</div>
      )}
      {foundNews.length > 0 && <><div className="group-title"><><Ico n="news" />{t('Actus')}</></div>{foundNews.map((x) => <NewsCard key={x.id} n={x} wide />)}</>}
      </>}
    </Screen>
  );
}

export function GameRow({ g, teamIds }: { g: Game; teamIds: number[] }) {
  const played = isPlayed(g);
  const home = teamIds.includes(g.h);
  const won = played && (home ? g.hs! > g.as! : g.as! > g.hs!);
  return (
    <a className="row" href={`#/matchs?g=${g.id}`} style={{ color: 'inherit' }}>
      <div style={{ width: 56, fontSize: 13 }} className="muted">{frDate(g.d, { day: 'numeric', month: 'short' })}<br />{played ? '' : g.t}</div>
      <div className="grow"><div className="ellipsis" style={{ fontWeight: home ? 600 : 400 }}>{g.hn}</div><div className="ellipsis" style={{ fontWeight: home ? 400 : 600 }}>{g.an}</div></div>
      {played ? <div style={{ textAlign: 'right', fontWeight: 700 }}><div>{g.hs}</div><div>{g.as}</div></div> : <span className="pill">{g.sn}</span>}
      {played && <span className="pill" style={{ background: won ? 'var(--green)' : 'var(--red)', color: '#fff' }}>{won ? t('V') : t('D')}</span>}
    </a>
  );
}

export function ClubPage({ id }: { id: number }) {
  const { data, error, reload } = useAsync(() => loadClub(id), [id]);
  if (error) return <Screen title={t('Club')} back="explorer"><ErrorBox msg={error} retry={reload} /></Screen>;
  if (!data) return <Screen title={t('Club')} back="explorer"><Skeleton /></Screen>;
  const { club, games } = data;
  const tids = club.teams.map((t) => t.id);
  const today = new Date().toISOString().slice(0, 10);
  const recent = games.filter((g) => isPlayed(g)).slice(-5).reverse();
  const next = games.filter((g) => g.d >= today && !isPlayed(g)).slice(0, 5);
  return (
    <Screen title={club.short} back="explorer" right={<FollowButton type="club" id={id} />}>
      <div className="hstack" style={{ marginBottom: 20 }}><Disc src={club.logo} name={club.name} size={72} ring={club.c1} />
        <div><div style={{ fontWeight: 700, fontSize: 20 }}>{club.name}</div><div className="muted">{club.venue?.name ?? club.city}</div></div></div>
      {club.linked && <LinkedClub id={club.linked} />}
      <TeamList club={club} />
      {next.length > 0 && <><div className="group-title">{t('Prochains matchs')}</div><div className="group">{next.map((g) => <GameRow key={g.id} g={g} teamIds={tids} />)}</div></>}
      {recent.length > 0 && <><div className="group-title">{t('Derniers résultats')}</div><div className="group">{recent.map((g) => <GameRow key={g.id} g={g} teamIds={tids} />)}</div></>}
    </Screen>
  );
}

export function TeamPage({ id }: { id: number }) {
  const s = useSession();
  const { data, error, reload } = useAsync(async () => {
    const idx = await teamIndex(); const e = idx.get(id); if (!e) throw new Error(t('Équipe introuvable'));
    const c = await loadClub(e.club.id);
    return { ...e, games: c.games.filter((g) => g.h === id || g.a === id) };
  }, [id]);
  const member = s.memberships.find((m) => m.teamId === id);
  const accepted = member?.status === 'accepted';
  const posts = useAsync(() => (s.user ? D.postsForTeam(id, accepted) : Promise.resolve([])), [id, s.user?.uid, accepted]);
  const [join, setJoin] = useState(false);
  if (error) return <Screen title={t('Équipe')} back="explorer"><ErrorBox msg={error} retry={reload} /></Screen>;
  if (!data) return <Screen title={t('Équipe')} back="explorer"><Skeleton /></Screen>;
  const { team, club, games } = data;
  return (
    <Screen title={club.teams.length === 1 ? team.name : teamLabel(team)} back={club.teams.length === 1 ? 'explorer' : `club/${club.id}`} right={<FollowButton type="team" id={id} />}>
      <div className="hstack" style={{ marginBottom: 16 }}><Disc src={club.logo} name={club.name} size={56} ring={club.c1} />
        <div className="grow" style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{club.name}</div><div className="muted">{team.ag === 'jeunes' ? t('Jeunes') : t('Seniors')} · {trCat(team.cat)}</div></div><LiveBadge teamId={id} games={games} /></div>
      {(
        <div className="banner"><Ico n={team.ag === 'jeunes' ? 'lock' : 'users'} size={28} style={{ color: 'var(--accent)' }} /><div style={{ flex: 1 }}><b>{t('Tu fais partie de cette équipe ?')}</b>
          <div className="muted" style={{ fontSize: 14 }}>{accepted ? (member!.role === 'responsable' ? t('Tu es responsable : retrouve-la dans l’onglet Équipes.') : t('Tu es membre : retrouve-la dans l’onglet Équipes.')) : member ? t('Demande envoyée, en attente de validation.')
            : team.ag === 'jeunes' ? t('Parent, joueur ou coach : rejoins-la pour ses photos, vidéos et le covoiturage.') : t('Joueur ou coach : rejoins-la pour son espace (covoiturage, membres, vidéos).')}</div></div>
          {!member && <button className="btn small" onClick={() => s.requireAuth(() => setJoin(true)) && setJoin(true)}>{t('Rejoindre')}</button>}
          {accepted && <button className="btn small secondary" onClick={async () => { if (confirm(t('Quitter l’Équipe ?'))) { await D.removeMember(id, s.user!.uid); await s.refresh(); } }}>{t('Quitter')}</button>}
        </div>)}
      {accepted && member!.role === 'responsable' && <TeamAdmin teamId={id} />}
      <TeamTabs team={team} club={club} games={games} />
      <div className="group-title">{t('Publications')}</div>
      {!s.user ? <Empty ill="news" title={t('Connecte-toi pour voir le fil de l\'équipe')} action={<button className="btn small" onClick={() => s.requireAuth()}>{t('Se connecter')}</button>} />
        : posts.loading ? <Skeleton /> : posts.data?.length ? posts.data.map((p) => <PostCard key={p.id} post={p} />) : <Empty ill="ball" title={t('Rien pour l\'instant')} text={t('Les résultats et publications de l\'équipe apparaîtront ici.')} />}
      {join && <JoinSheet teamId={id} name={teamLabel(team)} onClose={() => setJoin(false)} />}
    </Screen>
  );
}

const RELATIONS: [D.Relation, string][] = [['parent', 'Parent'], ['joueur', 'Joueur'], ['coach', 'Coach'], ['autre', 'Autre']];
export function JoinSheet({ teamId, name, onClose }: { teamId: number; name: string; onClose: () => void }) {
  const s = useSession();
  const [m, setM] = useState('');
  const [rel, setRel] = useState<D.Relation | null>(null);
  return (
    <Sheet title={t('Rejoindre l\'équipe')} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>{t('Un responsable de l’équipe {name} validera ta demande.', { name })}</p>
      <div className="label">{t('Je suis…')}</div>
      <div className="seg">{RELATIONS.map(([k, l]) => <button key={k} className={rel === k ? 'on' : ''} onClick={() => setRel(k)}>{t(l)}</button>)}</div>
      <label className="label" htmlFor="jm">{t('Message (optionnel)')}</label>
      <textarea id="jm" className="field" maxLength={200} placeholder={rel === 'parent' ? t('Je suis le papa / la maman de…') : t('Un mot pour le responsable…')} value={m} onChange={(e) => setM(e.target.value)} />
      <button className="btn mt" disabled={!rel} onClick={async () => { await D.requestJoin(s.user!.uid, teamId, s.profile!.displayName, m, rel!); await s.refresh(); s.toast(t('Demande envoyée')); onClose(); }}>{t('Envoyer la demande')}</button>
    </Sheet>
  );
}

export function TeamAdmin({ teamId }: { teamId: number }) {
  const s = useSession();
  const { data, reload } = useAsync(() => D.teamMembersList(teamId), [teamId]);
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const pending = data.filter((m) => m.status === 'pending');
  return (
    <>
      <button className="row group" style={{ marginBottom: 22 }} onClick={() => setOpen(true)}>
        <div className="grow"><Ico n="lock" style={{ marginRight: 6 }} />{t('Gérer l\'Équipe')}</div>{pending.length > 0 && <span className="pill live">{pending.length}</span>}<span className="chev">›</span></button>
      {open && <Sheet title={t('Membres')} onClose={() => setOpen(false)}><MembersList teamId={teamId} members={data} reload={reload} me={s.user!.uid} /></Sheet>}
    </>
  );
}

export const RELATION_FR: Record<string, string> = { parent: 'Parent', joueur: 'Joueur', coach: 'Coach', autre: 'Autre' };
export function MembersList({ teamId, members, reload, me }: { teamId: number; members: D.Membership[]; reload: () => void; me: string }) {
  const act = async (f: () => Promise<unknown>) => { await f(); reload(); };
  const pending = members.filter((m) => m.status === 'pending'), acc = members.filter((m) => m.status === 'accepted');
  return (
    <>
      {pending.length > 0 && <><div className="group-title">{t('Demandes')}</div><div className="group">{pending.map((m) => (
        <div key={m.uid} className="row"><div className="grow"><div>{m.displayName} {m.relation && <span className="muted">· {t(RELATION_FR[m.relation])}</span>}</div>{m.message && <div className="sub">« {m.message} »</div>}</div>
          <button className="btn small" onClick={() => act(() => D.setMember(teamId, m.uid, { status: 'accepted' }))}>{t('Accepter')}</button>
          <button className="btn small danger" onClick={() => act(() => D.removeMember(teamId, m.uid))}>{t('Refuser')}</button></div>))}</div></>}
      <div className="group-title">{t('Membres')} ({acc.length})</div>
      <div className="group">{acc.map((m) => (
        <div key={m.uid} className="row"><div className="grow">{m.displayName} {m.relation && <span className="muted">· {t(RELATION_FR[m.relation])}</span>} {m.role === 'responsable' && <span className="pill">{t('Responsable')}</span>}</div>
          {m.role !== 'responsable' && <button className="btn small secondary" onClick={() => act(() => D.setMember(teamId, m.uid, { role: 'responsable' }))}>{t('Nommer responsable')}</button>}
          {m.uid !== me && <button className="btn small danger" onClick={() => confirm(t('Retirer {name} ?', { name: m.displayName ?? '' })) && act(() => D.removeMember(teamId, m.uid))}>{t('Retirer')}</button>}</div>))}</div>
    </>
  );
}

/* ---------- Fiche Équipe enrichie (V2) ---------- */
function rankHistory(games: Game[], teamId: number) {
  const played = games.filter(isPlayed).sort((a, b) => a.d.localeCompare(b.d));
  const dates = [...new Set(played.map((g) => g.d))];
  const tbl = new Map<number, { w: number; l: number; diff: number }>();
  const out: { d: string; rank: number; n: number }[] = [];
  let i = 0;
  for (const d of dates) {
    for (; i < played.length && played[i].d === d; i++) {
      const g = played[i];
      for (const [t, me, op] of [[g.h, g.hs!, g.as!], [g.a, g.as!, g.hs!]] as const) {
        const r = tbl.get(t) ?? { w: 0, l: 0, diff: 0 }; me > op ? r.w++ : r.l++; r.diff += me - op; tbl.set(t, r);
      }
    }
    const order = [...tbl.entries()].sort((a, b) => b[1].w - a[1].w || a[1].l - b[1].l || b[1].diff - a[1].diff);
    const rank = order.findIndex(([t]) => t === teamId) + 1;
    if (rank > 0) out.push({ d, rank, n: order.length });
  }
  return out;
}

export function TeamStats({ team, games }: { team: Team; club: Club; games: Game[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const played = games.filter(isPlayed).filter((g) => g.ty !== 'amical');
  const last5 = played.slice(-5);
  const next = games.find((g) => g.d >= today && !isPlayed(g));
  const serieId = (next ?? played[played.length - 1])?.s;
  const serie = useAsync(() => (serieId ? loadSerie(serieId) : Promise.resolve(null)), [serieId]);
  const [ptsFor, ptsAg] = played.reduce(([f, a], g) => g.h === team.id ? [f + g.hs!, a + g.as!] : [f + g.as!, a + g.hs!], [0, 0]);
  const hist = useMemo(() => (serie.data ? rankHistory(serie.data.games.filter((g) => g.ty !== 'amical'), team.id) : []), [serie.data, team.id]);
  if (!played.length && !next) return null;
  const opp = next ? (next.h === team.id ? next.a : next.h) : null;
  const st = serie.data?.standings ?? [];
  const official = ranked(st);
  const oppRank = opp ? official.find((r) => r.team === opp)?.rank ?? 0 : 0;
  const myRank = official.find((r) => r.team === team.id);
  const aller = opp ? played.find((g) => g.h === opp || g.a === opp) : undefined;
  if (myRank && hist.length) hist[hist.length - 1] = { ...hist[hist.length - 1], rank: myRank.rank, n: official.length };
  const W = 300, H = 90, n = Math.max(...hist.map((h) => h.n), 2);
  const pts = hist.map((h, i) => `${(i / Math.max(hist.length - 1, 1)) * W},${((h.rank - 1) / (n - 1)) * H}`).join(' ');
  return (
    <>
      <div className="group-title">{t('Forme & statistiques')}</div>
      <div className="group" style={{ padding: 16 }}>
        {last5.length > 0 && <div className="hstack" style={{ justifyContent: 'space-between' }}><span className="muted">{t('5 derniers')}</span>
          <div className="dots">{last5.map((g) => { const w = g.h === team.id ? g.hs! > g.as! : g.as! > g.hs!; return <i key={g.id} style={{ background: w ? 'var(--green)' : 'var(--red)' }} title={`${g.hn} ${g.hs}-${g.as} ${g.an}`}>{w ? t('V') : t('D')}</i>; })}</div></div>}
        {played.length > 0 && <div className="hstack mt" style={{ justifyContent: 'space-around', textAlign: 'center' }}>
          <div><div style={{ fontSize: 26, fontWeight: 700 }}>{(ptsFor / played.length).toFixed(1)}</div><div className="muted" style={{ fontSize: 13 }}>{t('pts marqués / match')}</div></div>
          <div><div style={{ fontSize: 26, fontWeight: 700 }}>{(ptsAg / played.length).toFixed(1)}</div><div className="muted" style={{ fontSize: 13 }}>{t('pts encaissés / match')}</div></div></div>}
        {hist.length > 1 && <div className="mt"><div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>{t('Évolution au classement (actuellement {r}ᵉ / {n})', { r: myRank?.rank ?? hist[hist.length - 1].rank, n: official.length || hist[hist.length - 1].n })}</div>
          <svg viewBox={`-6 -6 ${W + 12} ${H + 12}`} width="100%" role="img" aria-label={t('Évolution au classement')}><polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" />
            {hist.map((h, i) => <circle key={h.d} cx={(i / Math.max(hist.length - 1, 1)) * W} cy={((h.rank - 1) / (n - 1)) * H} r="4" fill="var(--accent)" />)}</svg></div>}
        {next && <div className="mt"><div className="muted" style={{ fontSize: 13 }}>{t('Prochain adversaire')}</div>
          <div style={{ fontWeight: 600 }}>{next.h === team.id ? next.an : next.hn} {oppRank > 0 && <span className="pill">{oppRank}ᵉ</span>}</div>
          <div className="muted" style={{ fontSize: 14 }}>{frDate(next.d)} · {next.t}{aller ? ` · ${t('Match aller')} : ${aller.hs}–${aller.as}` : ''}</div></div>}
      </div>
    </>
  );
}

export function useClubs() { const [c, set] = useState<Club[]>([]); useEffect(() => { loadIndex().then((i) => set(i.clubs)); }, []); return c; }

/* ---------- Fiche Équipe : Matchs, Classement, Infos (visibles sans compte) ---------- */
function TeamTabs({ team, club, games }: { team: Team; club: Club; games: Game[] }) {
  const [tab, setTab] = useState<'matchs' | 'classement' | 'infos'>('matchs');
  const ics = `${location.origin}/calendars/team-${team.id}.ics`;
  return (
    <>
      <Tabs value={tab} onChange={setTab} items={[['matchs', 'calendar', 'Matchs'], ['classement', 'standings', 'Classement'], ['infos', 'stats', 'Infos']] as const} />
      {tab === 'matchs' && <TeamGames team={team} games={games} ics={ics} />}
      {tab === 'classement' && <TeamStandings team={team} games={games} />}
      {tab === 'infos' && <TeamStats team={team} club={club} games={games} />}
    </>
  );
}

export function TeamGames({ team, games, ics }: { team: Team; games: Game[]; ics: string }) {
  const [which, setWhich] = useState<'avenir' | 'joues'>('avenir');
  const today = new Date().toISOString().slice(0, 10);
  const next = games.filter((g) => g.d >= today && !isPlayed(g));
  const past = games.filter(isPlayed).slice().reverse();
  const list = which === 'avenir' ? next : past;
  return (
    <>
      <div className="hstack" style={{ gap: 8, marginBottom: 12 }}>
        <CalendarButton teamId={team.id} primary />
        <button className="btn small secondary" onClick={() => { navigator.clipboard?.writeText(ics); }}>{t('Copier le lien')}</button>
      </div>
      <div className="chips">
        <button className={`chip${which === 'avenir' ? ' on' : ''}`} onClick={() => setWhich('avenir')}>{t('À venir')} ({next.length})</button>
        <button className={`chip${which === 'joues' ? ' on' : ''}`} onClick={() => setWhich('joues')}>{t('Joués')} ({past.length})</button>
      </div>
      {list.length === 0 ? <Empty ill="calendar" title={which === 'avenir' ? t('Aucun match prévu') : t('Aucun match joué')} /> : (
        <div className="group">{list.slice(0, 40).map((g) => (
          <div key={g.id}>
            <GameRow g={g} teamIds={[team.id]} />
            {which === 'avenir' && g.v && <a className="row sub" style={{ paddingTop: 0, minHeight: 34 }} href={mapsUrl(`${g.v} ${g.adr}`, g.lat, g.lng)} target="_blank" rel="noopener"><Ico n="pin" style={{ marginRight: 4 }} />{g.v} · {t('Itinéraire')} ›</a>}
          </div>))}</div>
      )}
    </>
  );
}

export function TeamStandings({ team, games }: { team: Team; games: Game[] }) {
  // Compétitions de l'équipe : on garde celles dont le classement contient l'équipe (ou sans classement, ex. coupe)
  const ids = [...new Set(games.filter((g) => g.ty !== 'amical').map((g) => g.s))];
  const all = useAsync(async () => (await Promise.all(ids.map((i) => loadSerie(i).catch(() => null)))).filter(Boolean)
    .filter((x) => !x!.standings.length || x!.standings.some((r) => r.team === team.id)) as Awaited<ReturnType<typeof loadSerie>>[], [ids.join()]);
  const series = (all.data ?? []).map((x) => [x.serie.id, x.serie.short || x.serie.name] as [number, string]);
  const [pick, setSid] = useState<number | null>(null);
  const sid = pick ?? series[0]?.[0] ?? null;
  const serie = { data: all.data?.find((x) => x.serie.id === sid) ?? null };
  if (all.loading) return <Skeleton h={44} n={6} />;
  if (!series.length) return <Empty ill="standings" title={t('Pas de classement')} text={t('Cette équipe ne joue que des matchs amicaux pour l\'instant.')} />;
  const names = new Map<number, string>();
  serie.data?.games.forEach((g) => { names.set(g.h, g.hn); names.set(g.a, g.an); });
  const rows = serie.data?.standings ?? [];
  return (
    <>
      {series.length > 1 && <div className="chips">{series.map(([id, n]) => <button key={id} className={`chip${sid === id ? ' on' : ''}`} onClick={() => setSid(id)}>{n}</button>)}</div>}
      {!serie.data ? <Skeleton h={44} n={6} /> : rows.length === 0 ? <Empty ill="standings" title={t('Classement pas encore publié')} /> : (
        <StandingsTable rows={rows} names={names} me={team.id} pct={team.cat === 'NBA'} />
      )}
    </>
  );
}

/** Lien vers un club lié (ex. Mons Basketball ↔ CityX Mons : deux matricules, même famille). */
export function LinkedClub({ id }: { id: number }) {
  const { data } = useAsync(loadIndex, []);
  const c = data?.clubs.find((x) => x.id === id);
  if (!c) return null;
  return (
    <a className="row group" href={`#/club/${c.id}`} style={{ color: 'inherit', marginBottom: 22 }}>
      <Disc src={c.logo} name={c.name} size={36} ring={c.c1} />
      <div className="grow"><div className="sub">{t('Club lié')}</div><div style={{ fontWeight: 600 }}>{c.name}</div></div><span className="chev">›</span>
    </a>
  );
}

/** Équipes du club : liste sobre par niveau ; le choix des équipes suivies se fait dans une feuille dédiée. */
export function TeamList({ club }: { club: Club }) {
  const s = useSession();
  const f = s.follows.find((x) => x.type === 'club' && x.refId === club.id);
  const [edit, setEdit] = useState(false);
  const groups: [string, Team[]][] = [
    ['Seniors', club.teams.filter((t) => t.ag === 'seniors')],
    ['Jeunes', club.teams.filter((t) => t.ag !== 'seniors')],
  ];
  const muted = f?.mutedTeams ?? [];
  const toggle = async (tid: number) => {
    if (!f || !s.user) return;
    haptic();
    await D.setMuted(s.user.uid, club.id, muted.includes(tid) ? muted.filter((x) => x !== tid) : [...muted, tid]);
    await s.refresh();
  };
  return (
    <>
      {groups.filter(([, l]) => l.length).map(([g, list]) => (
        <section key={g}>
          <div className="group-title">{t(g)}</div>
          <div className="group">{list.map((tm) => (
            <a key={tm.id} className="row" href={`#/equipe/${tm.id}`} style={{ color: 'inherit' }}>
              <div className="grow">{teamLabel(tm)}</div>
              {f && muted.includes(tm.id) && <span className="muted" style={{ fontSize: 13 }}>{t('non suivie')}</span>}
              <span className="chev">›</span>
            </a>))}</div>
        </section>))}
      {f && club.teams.length > 1 && (
        <button className="btn ghost small" style={{ margin: '-10px auto 22px', display: 'flex' }} onClick={() => setEdit(true)}>
          {t('Équipes suivies')} : {club.teams.length - muted.length}/{club.teams.length} · {t('Modifier')}
        </button>)}
      {edit && (
        <Sheet title={t('Équipes suivies')} onClose={() => setEdit(false)}>
          <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>{t('Les équipes cochées apparaissent dans ton fil et tes matchs.')}</p>
          <div className="group">{club.teams.map((t) => { const on = !muted.includes(t.id); return (
            <button key={t.id} className="row" onClick={() => toggle(t.id)} aria-pressed={on}>
              <div className="grow">{teamLabel(t)}</div>
              <span style={{ width: 24, height: 24, borderRadius: 12, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800,
                background: on ? 'var(--accent)' : 'transparent', color: '#fff', boxShadow: on ? 'none' : 'inset 0 0 0 2px var(--sep)' }}>{on && <Ico n="check" size={16} />}</span>
            </button>); })}</div>
        </Sheet>)}
    </>
  );
}
