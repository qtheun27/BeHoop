// Page club / équipe de l'appli connectée : en-tête aux couleurs du club, sélecteur d'équipe,
// et un fil propre au club (résultats, photos & vidéos, actus qui le citent). Choisir une équipe filtre le fil
// et ouvre ses onglets Matchs / Classement / Infos.
import { useEffect, useMemo, useState } from 'react';
import { loadClub, loadNews, teamIndex, teamLabel, isPlayed, normalize, type Club, type Game, type Team, type News } from '../lib/data';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { clubColors } from '../lib/theme';
import { frDate, mapsUrl } from '../lib/util';
import { Screen, Disc, Skeleton, ErrorBox, Empty, Sheet, useAsync } from '../ui/kit';
import { CalendarButton } from '../ui/CalendarButton';
import { PostCard, ScoreCard, type ScorePayload } from './Feed';
import { NewsCard } from './News';
import { LiveBadge } from './Live';
import { FollowButton, GameRow, JoinSheet, TeamAdmin, TeamGames, TeamStandings, TeamStats, LinkedClub, TeamList } from './Explore';

const KINDS: { id: string; label: string }[] = [
  { id: 'tout', label: 'Tout' }, { id: 'scores', label: 'Résultats' }, { id: 'medias', label: 'Photos & vidéos' }, { id: 'actus', label: '📰 Actus' },
];
const isMedia = (p: D.Post) => p.type === 'photo' || p.type === 'video' || p.type === 'moment';
const isScore = (p: D.Post) => p.type === 'score' || p.type === 'live';
const RESULTS_DAYS = 45;

/** Actus qui citent le club (ou son club lié, ex. Mons Basketball ↔ CityX Mons). */
function clubNews(items: News[], names: string[]) {
  const keys = [...new Set(names.map((n) => normalize(n).trim()).filter((n) => n.length >= 4))];
  const re = keys.length ? new RegExp(`\\b(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`) : null;
  return re ? items.filter((n) => re.test(normalize(`${n.title} ${n.excerpt}`))) : [];
}

export function ClubHub({ clubId, teamId }: { clubId?: number; teamId?: number }) {
  const base = useAsync(async () => {
    const idx = await teamIndex();
    const cid = clubId ?? idx.get(teamId!)?.club.id;
    if (!cid) throw new Error('Équipe introuvable');
    const [c, all] = await Promise.all([loadClub(cid), loadNews().catch(() => null)]);
    const linked = c.club.linked ? [...idx.values()].find((e) => e.club.id === c.club.linked)?.club : undefined;
    return { ...c, idx, news: clubNews(all?.items ?? [], [c.club.name, c.club.short, ...(linked ? [linked.name, linked.short] : [])]) };
  }, [clubId, teamId]);
  const [sel, setSel] = useState<number | null>(teamId ?? null);
  useEffect(() => setSel(teamId ?? null), [teamId, clubId]);
  // Garde l'adresse à jour (partage, retour) sans recharger la page
  const pick = (t: number | null) => {
    setSel(t);
    if (base.data) history.replaceState(null, '', `#/${t ? `equipe/${t}` : `club/${base.data.club.id}`}`);
  };

  if (base.error) return <Screen title="Club" back="explorer"><ErrorBox msg={base.error} retry={base.reload} /></Screen>;
  if (!base.data) return <Screen title="Club" back="explorer"><Skeleton h={180} n={1} /><Skeleton /></Screen>;
  const { club, games, idx, news } = base.data;
  const team = sel ? club.teams.find((t) => t.id === sel) ?? null : null;
  return (
    <Screen title={team ? teamLabel(team) : club.short} back="fil" hideTitle right={<FollowButton type={team ? 'team' : 'club'} id={team ? team.id : club.id} />}>
      <Hero club={club} team={team} games={games} />
      <TeamPicker club={club} sel={sel} onPick={pick} />
      {team ? <TeamSection key={team.id} club={club} team={team} games={games} idx={idx} news={news} />
        : <ClubSection club={club} games={games} idx={idx} news={news} onPick={pick} />}
    </Screen>
  );
}

function Hero({ club, team, games }: { club: Club; team: Team | null; games: Game[] }) {
  const k = clubColors(club);
  const tids = team ? [team.id] : club.teams.map((t) => t.id);
  const mine = games.filter((g) => tids.includes(g.h) || tids.includes(g.a));
  const played = mine.filter(isPlayed);
  const wins = played.filter((g) => (tids.includes(g.h) ? g.hs! > g.as! : g.as! > g.hs!)).length;
  const today = new Date().toISOString().slice(0, 10);
  const next = mine.find((g) => g.d >= today && !isPlayed(g));
  return (
    <section style={{ background: k.grad, color: '#fff', borderRadius: 22, padding: '18px 18px 16px', margin: '4px 0 14px', position: 'relative', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
      <svg viewBox="0 0 200 120" aria-hidden style={{ position: 'absolute', right: -30, top: -10, width: 220, opacity: .16 }}>
        <g fill="none" stroke="#fff" strokeWidth="3"><circle cx="100" cy="60" r="40" /><line x1="100" y1="0" x2="100" y2="120" /><circle cx="100" cy="60" r="12" /></g>
      </svg>
      <div className="hstack" style={{ gap: 14, position: 'relative' }}>
        <Disc src={club.logo} name={club.name} size={68} ring="#fff" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 24, lineHeight: 1.1, textTransform: 'uppercase', letterSpacing: '.02em' }}>{club.name}</div>
          <div style={{ opacity: .9, fontSize: 14, marginTop: 2 }}>{team ? `${teamLabel(team)} · ${team.ag === 'jeunes' ? 'Jeunes' : 'Seniors'}` : [club.venue?.name ?? club.city, `${club.teams.length} équipe${club.teams.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}</div>
        </div>
        {team && <LiveBadge teamId={team.id} games={mine} />}
      </div>
      <div className="hstack" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap', position: 'relative' }}>
        {played.length > 0 && <span className="pill" style={{ background: 'rgba(0,0,0,.25)', color: '#fff' }}>{wins} V · {played.length - wins} D</span>}
        {next && <span className="pill" style={{ background: 'rgba(255,255,255,.92)', color: '#111' }}>⏱ {frDate(next.d, { weekday: 'short', day: 'numeric', month: 'short' })} {next.t} · {tids.includes(next.h) ? `vs ${next.an}` : `@ ${next.hn}`}</span>}
      </div>
    </section>
  );
}

/** Rangée courte : Tout le club + mes équipes ; le reste dans une feuille, groupé Seniors / Jeunes. */
function TeamPicker({ club, sel, onPick }: { club: Club; sel: number | null; onPick: (t: number | null) => void }) {
  const s = useSession();
  const [open, setOpen] = useState(false);
  if (club.teams.length < 2) return null;
  const mineIds = new Set([...s.memberships.map((m) => m.teamId), ...s.follows.filter((f) => f.type === 'team').map((f) => f.refId)]);
  const mine = club.teams.filter((t) => mineIds.has(t.id));
  const shown = sel && !mine.some((t) => t.id === sel) ? [...mine, club.teams.find((t) => t.id === sel)!] : mine;
  const groups: [string, Team[]][] = [['Seniors', club.teams.filter((t) => t.ag === 'seniors')], ['Jeunes', club.teams.filter((t) => t.ag !== 'seniors')]];
  return (
    <>
      <div className="chips" role="tablist" aria-label="Équipe">
        <button className={`chip${sel === null ? ' on' : ''}`} onClick={() => onPick(null)} aria-pressed={sel === null}>🏟️ Tout le club</button>
        {shown.map((t) => <button key={t.id} className={`chip${sel === t.id ? ' on' : ''}`} onClick={() => onPick(t.id)} aria-pressed={sel === t.id}>{mineIds.has(t.id) ? '★ ' : ''}{teamLabel(t)}</button>)}
        <button className="chip" onClick={() => setOpen(true)}>Équipes ▾</button>
      </div>
      {open && (
        <Sheet title="Choisir une équipe" onClose={() => setOpen(false)}>
          {groups.filter(([, l]) => l.length).map(([g, list]) => (
            <section key={g}><div className="group-title">{g}</div>
              <div className="group">{list.map((t) => (
                <button key={t.id} className="row" onClick={() => { onPick(t.id); setOpen(false); }} aria-pressed={sel === t.id}>
                  <div className="grow" style={{ textAlign: 'left' }}>{mineIds.has(t.id) ? '★ ' : ''}{teamLabel(t)}</div>
                  {sel === t.id ? <span style={{ color: 'var(--accent)', fontWeight: 800 }}>✓</span> : <span className="chev">›</span>}
                </button>))}</div></section>))}
        </Sheet>)}
    </>
  );
}

function ClubSection({ club, games, idx, news, onPick }: { club: Club; games: Game[]; idx: Map<number, { team: Team; club: Club }>; news: News[]; onPick: (t: number) => void }) {
  const s = useSession();
  const [tab, setTab] = useState<'fil' | 'matchs' | 'equipes'>('fil');
  const tids = club.teams.map((t) => t.id);
  const priv = s.privateTeams.filter((t) => tids.includes(t));
  const posts = useAsync(async () => (await D.feedPage([`c:${club.id}`, ...tids.map((t) => `t:${t}`)], priv)).posts, [club.id, priv.join()]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <div className="seg" role="tablist">
        {([['fil', '📰 Fil du club'], ['matchs', '📅 Matchs'], ['equipes', '👥 Équipes']] as const).map(([k, l]) =>
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} aria-pressed={tab === k}>{l}</button>)}
      </div>
      {tab === 'fil' && <HubFeed posts={posts.data} error={posts.error} retry={posts.reload} games={games} teamIds={tids} idx={idx} news={news} />}
      {tab === 'matchs' && (() => {
        const next = games.filter((g) => g.d >= today && !isPlayed(g)).slice(0, 12);
        const recent = games.filter(isPlayed).slice(-12).reverse();
        return <>
          {club.linked && <LinkedClub id={club.linked} />}
          {next.length > 0 && <><div className="group-title">Prochains matchs</div><div className="group">{next.map((g) => <GameRow key={g.id} g={g} teamIds={tids} />)}</div></>}
          {recent.length > 0 && <><div className="group-title">Derniers résultats</div><div className="group">{recent.map((g) => <GameRow key={g.id} g={g} teamIds={tids} />)}</div></>}
          {!next.length && !recent.length && <Empty ill="📅" title="Aucun match pour l'instant" />}
        </>;
      })()}
      {tab === 'equipes' && <div onClickCapture={(e) => {
        // Les liens « équipe » de la liste ouvrent l'équipe ici, sans quitter la page du club
        const a = (e.target as HTMLElement).closest('a[href^="#/equipe/"]'); if (!a) return;
        e.preventDefault(); onPick(+a.getAttribute('href')!.split('/').pop()!); window.scrollTo({ top: 0, behavior: 'smooth' });
      }}><TeamList club={club} /></div>}
    </>
  );
}

function TeamSection({ club, team, games, idx, news }: { club: Club; team: Team; games: Game[]; idx: Map<number, { team: Team; club: Club }>; news: News[] }) {
  const s = useSession();
  const [tab, setTab] = useState<'fil' | 'matchs' | 'classement' | 'infos'>('fil');
  const [join, setJoin] = useState(false);
  const member = s.memberships.find((m) => m.teamId === team.id);
  const accepted = member?.status === 'accepted';
  const posts = useAsync(() => D.postsForTeam(team.id, accepted), [team.id, accepted]);
  const mine = games.filter((g) => g.h === team.id || g.a === team.id);
  const today = new Date().toISOString().slice(0, 10);
  const next = mine.find((g) => g.d >= today && !isPlayed(g));
  const ics = `${location.origin}/calendars/team-${team.id}.ics`;
  return (
    <>
      {next && (
        <div className="card" style={{ padding: 14 }}>
          <div className="hstack" style={{ justifyContent: 'space-between' }}>
            <span className="group-title" style={{ margin: 0 }}>Prochain match</span>
            <span className="pill">{next.h === team.id ? 'Domicile' : 'Extérieur'}</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 18, marginTop: 6 }}>{next.h === team.id ? `vs ${next.an}` : `@ ${next.hn}`}</div>
          <div className="muted" style={{ fontSize: 14 }}>{frDate(next.d)} · {next.t}{next.v ? ` · 📍 ${next.v}` : ''}</div>
          <div className="hstack" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {next.v && <a className="btn small secondary" href={mapsUrl(`${next.v} ${next.adr}`, next.lat, next.lng)} target="_blank" rel="noopener">Itinéraire</a>}
            <CalendarButton teamId={team.id} label="📆 Ajouter au calendrier" compact />
          </div>
        </div>)}
      {!accepted && (
        <div className="banner"><span style={{ fontSize: 24 }}>{team.ag === 'jeunes' ? '🔒' : '👥'}</span>
          <div style={{ flex: 1, fontSize: 14 }}><b>Tu fais partie de cette équipe ?</b><div className="muted">{member ? 'Demande envoyée, en attente de validation.'
            : team.ag === 'jeunes' ? 'Parent, joueur ou coach : photos, vidéos et covoiturage.' : 'Joueur ou coach : covoiturage, membres, vidéos.'}</div></div>
          {!member && <button className="btn small" onClick={() => setJoin(true)}>Rejoindre</button>}
        </div>)}
      {accepted && <a className="row group" href={`#/equipes/${team.id}`} style={{ color: 'inherit', marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>{team.ag === 'jeunes' ? '🔒' : '👥'}</span><div className="grow"><b>Espace de l'équipe</b><div className="sub">Covoiturage, galerie, membres</div></div><span className="chev">›</span></a>}
      {accepted && member!.role === 'responsable' && <TeamAdmin teamId={team.id} />}
      <div className="seg" role="tablist">
        {([['fil', '📰 Fil'], ['matchs', '📅 Matchs'], ['classement', '📊 Classement'], ['infos', '📈 Infos']] as const).map(([k, l]) =>
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} aria-pressed={tab === k}>{l}</button>)}
      </div>
      {tab === 'fil' && <HubFeed posts={posts.data} error={posts.error} retry={posts.reload} games={mine} teamIds={[team.id]} idx={idx} news={news} />}
      {tab === 'matchs' && <TeamGames team={team} games={mine} ics={ics} />}
      {tab === 'classement' && <TeamStandings team={team} games={mine} />}
      {tab === 'infos' && <TeamStats team={team} club={club} games={mine} />}
      {join && <JoinSheet teamId={team.id} name={teamLabel(team)} onClose={() => setJoin(false)} />}
    </>
  );
}

/** Carte de score construite depuis le calendrier quand aucune publication n'existe encore pour ce match. */
function scoreFromGame(g: Game, idx: Map<number, { team: Team; club: Club }>): ScorePayload {
  const side = (id: number, name: string, score: number) => { const c = idx.get(id)?.club; return { id, name, logo: c?.logo ?? null, color: c ? clubColors(c).accent : undefined, score }; };
  return { gameId: g.id, date: g.d, time: g.t, competition: g.sn, home: side(g.h, g.hn, g.hs!), away: side(g.a, g.an, g.as!), official: true };
}

function HubFeed({ posts, error, retry, games, teamIds, idx, news }: {
  posts: D.Post[] | null | undefined; error?: string; retry: () => void; games: Game[]; teamIds: number[]; idx: Map<number, { team: Team; club: Club }>; news: News[];
}) {
  const [kind, setKind] = useState('tout');
  const [max, setMax] = useState(15);
  const items = useMemo(() => {
    const out: { t: number; key: string; kind: 'scores' | 'medias' | 'actus' | 'autre'; el: JSX.Element }[] = [];
    const known = new Set<number>();
    for (const p of posts ?? []) {
      if (isScore(p) && p.payload.gameId) known.add(p.payload.gameId);
      out.push({ t: p.createdAt, key: p.id, kind: isScore(p) ? 'scores' : isMedia(p) ? 'medias' : 'autre', el: <PostCard key={p.id} post={p} /> });
    }
    const since = new Date(Date.now() - RESULTS_DAYS * 864e5).toISOString().slice(0, 10);
    for (const g of games) {
      if (!isPlayed(g) || g.d < since || known.has(g.id) || !(teamIds.includes(g.h) || teamIds.includes(g.a))) continue;
      const mine = idx.get(teamIds.includes(g.h) ? g.h : g.a)?.team;
      out.push({ t: Date.parse(`${g.d}T${g.t || '20:00'}`) + 2 * 3600e3, key: `g${g.id}`, kind: 'scores', el: (
        <article key={`g${g.id}`} className="card">
          <header className="card-head"><div className="avatar" style={{ background: '#0a0c12' }}>🏀</div>
            <div style={{ flex: 1, minWidth: 0 }}><div className="who ellipsis">BeHoop {mine && <span className="muted" style={{ fontWeight: 400 }}>· {teamLabel(mine)}</span>}</div><div className="when">{frDate(g.d)}</div></div></header>
          <ScoreCard p={scoreFromGame(g, idx)} />
        </article>) });
    }
    for (const n of news) out.push({ t: Date.parse(n.date), key: `n${n.id}`, kind: 'actus', el: <NewsCard key={`n${n.id}`} n={n} wide /> });
    return out.sort((a, b) => b.t - a.t);
  }, [posts, games, teamIds.join(), idx, news]);
  const shown = items.filter((x) => kind === 'tout' || x.kind === kind);
  return (
    <>
      <div className="chips">{KINDS.map((k) => <button key={k.id} className={`chip${kind === k.id ? ' on' : ''}`} onClick={() => { setKind(k.id); setMax(15); }} aria-pressed={kind === k.id}>{k.label}</button>)}</div>
      {error && <ErrorBox msg={error} retry={retry} />}
      {!posts && !error ? <Skeleton h={240} n={2} /> : shown.length ? <>{shown.slice(0, max).map((x) => x.el)}
          {shown.length > max && <button className="btn secondary" onClick={() => setMax((m) => m + 15)}>Voir plus ({shown.length - max})</button>}</>
        : <Empty ill={kind === 'actus' ? '📰' : kind === 'medias' ? '📸' : '🏀'} title={kind === 'actus' ? 'Aucune actu ne parle de ce club pour l’instant' : kind === 'medias' ? 'Pas encore de photo ni de vidéo' : 'Rien pour l’instant'}
          text={kind === 'medias' ? 'Publie la première depuis l’onglet ＋.' : undefined} />}
    </>
  );
}
