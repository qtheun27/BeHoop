// Page club / équipe de l'appli connectée : en-tête aux couleurs du club, sélecteur d'équipe,
// et un fil propre au club (résultats, photos & vidéos, actus qui le citent). Choisir une équipe filtre le fil
// et ouvre ses onglets Matchs / Classement / Infos.
import { useEffect, useMemo, useState } from 'react';
import { loadClub, loadNews, teamIndex, teamLabel, isPlayed, type Club, type Game, type Team, type News } from '../lib/data';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { clubColors } from '../lib/theme';
import { frDate, mapsUrl } from '../lib/util';
import { Screen, Tabs, Disc, Skeleton, ErrorBox, Empty, Sheet, useAsync } from '../ui/kit';
import { t, tn } from '../lib/i18n';
import { CalendarButton } from '../ui/CalendarButton';
import { PostCard, ScoreCard, type ScorePayload } from './Feed';
import { NewsCard } from './News';
import { LiveBadge } from './Live';
import { FollowButton, GameRow, JoinSheet, TeamAdmin, TeamGames, TeamStandings, TeamStats, LinkedClub, TeamList } from './Explore';
import { Ico, type IconName } from '../ui/icons';
import { SocialBar } from '../ui/Social';

const KINDS: { id: string; label: string; ic?: IconName }[] = [
  { id: 'tout', label: 'Tout' }, { id: 'scores', label: 'Résultats' }, { id: 'medias', label: 'Photos & vidéos' }, { id: 'actus', label: 'Actus', ic: 'news' },
];
const isMedia = (p: D.Post) => p.type === 'photo' || p.type === 'video' || p.type === 'moment';
const isScore = (p: D.Post) => p.type === 'score' || p.type === 'live';
const RESULTS_DAYS = 45;

export function ClubHub({ clubId, teamId }: { clubId?: number; teamId?: number }) {
  const base = useAsync(async () => {
    const idx = await teamIndex();
    const cid = clubId ?? idx.get(teamId!)?.club.id;
    if (!cid) throw new Error(t('Équipe introuvable'));
    const [c, all] = await Promise.all([loadClub(cid), loadNews().catch(() => null)]);
    // Actus citant ce club précisément (classées à la récupération, voir ops/news.ts) ; un club lié garde son propre fil
    return { ...c, idx, news: (all?.items ?? []).filter((n) => n.clubs?.includes(c.club.id)) };
  }, [clubId, teamId]);
  const [sel, setSel] = useState<number | null>(teamId ?? null);
  useEffect(() => setSel(teamId ?? null), [teamId, clubId]);
  // Garde l'adresse à jour (partage, retour) sans recharger la page
  const pick = (t: number | null) => {
    setSel(t);
    if (base.data) history.replaceState(null, '', `#/${t ? `equipe/${t}` : `club/${base.data.club.id}`}`);
  };

  if (base.error) return <Screen title={t('Club')} back="explorer"><ErrorBox msg={base.error} retry={base.reload} /></Screen>;
  if (!base.data) return <Screen title={t('Club')} back="explorer"><Skeleton h={180} n={1} /><Skeleton /></Screen>;
  const { club, games, idx, news } = base.data;
  const team = sel ? club.teams.find((t) => t.id === sel) ?? null : null;
  return (
    <Screen title={team ? teamLabel(team) : club.short} back="fil" hideTitle right={<FollowButton type={team ? 'team' : 'club'} id={team ? team.id : club.id} />}>
      <Hero club={club} team={team} games={games} />
      <TeamPicker club={club} sel={sel} onPick={pick} />
      {team ? <TeamSection key={team.id} club={club} team={team} games={games} idx={idx} />
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
          <div style={{ opacity: .9, fontSize: 14, marginTop: 2 }}>{team ? `${teamLabel(team)} · ${team.ag === 'jeunes' ? t('Jeunes') : t('Seniors')}` : [club.venue?.name ?? club.city, tn(club.teams.length, '{n} équipe', '{n} équipes')].filter(Boolean).join(' · ')}</div>
        </div>
        {team && <LiveBadge teamId={team.id} games={mine} />}
      </div>
      <div className="hstack" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap', position: 'relative' }}>
        {played.length > 0 && <span className="pill" style={{ background: 'rgba(0,0,0,.25)', color: '#fff' }}>{wins} {t('V')} · {played.length - wins} {t('D')}</span>}
        {next && <span className="pill" style={{ background: 'rgba(255,255,255,.92)', color: '#111' }}><Ico n="clock" />{frDate(next.d, { weekday: 'short', day: 'numeric', month: 'short' })} {next.t} · {tids.includes(next.h) ? `vs ${next.an}` : `@ ${next.hn}`}</span>}
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
      <div className="chips" role="tablist" aria-label={t('Équipe')}>
        <button className={`chip${sel === null ? ' on' : ''}`} onClick={() => onPick(null)} aria-pressed={sel === null}><><Ico n="club" />{t('Tout le club')}</></button>
        {shown.map((t) => <button key={t.id} className={`chip${sel === t.id ? ' on' : ''}`} onClick={() => onPick(t.id)} aria-pressed={sel === t.id}>{mineIds.has(t.id) && <Ico n="star" />}{teamLabel(t)}</button>)}
        <button className="chip" onClick={() => setOpen(true)}>{t('Équipes ▾')}</button>
      </div>
      {open && (
        <Sheet title={t('Choisir une équipe')} onClose={() => setOpen(false)}>
          {groups.filter(([, l]) => l.length).map(([g, list]) => (
            <section key={g}><div className="group-title">{t(g)}</div>
              <div className="group">{list.map((t) => (
                <button key={t.id} className="row" onClick={() => { onPick(t.id); setOpen(false); }} aria-pressed={sel === t.id}>
                  <div className="grow" style={{ textAlign: 'left' }}>{mineIds.has(t.id) && <Ico n="star" style={{ marginRight: 6, color: 'var(--accent)' }} />}{teamLabel(t)}</div>
                  {sel === t.id ? <Ico n="check" size={20} style={{ color: 'var(--accent)' }} /> : <span className="chev">›</span>}
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
      <Tabs value={tab} onChange={setTab} items={[['fil', 'news', 'Fil du club'], ['matchs', 'calendar', 'Matchs'], ['equipes', 'users', 'Équipes']] as const} />
      {tab === 'fil' && <HubFeed posts={posts.data} error={posts.error} retry={posts.reload} games={games} teamIds={tids} idx={idx} news={news} />}
      {tab === 'matchs' && (() => {
        const next = games.filter((g) => g.d >= today && !isPlayed(g)).slice(0, 12);
        const recent = games.filter(isPlayed).slice(-12).reverse();
        return <>
          {club.linked && <LinkedClub id={club.linked} />}
          {next.length > 0 && <><div className="group-title">{t('Prochains matchs')}</div><div className="group">{next.map((g) => <GameRow key={g.id} g={g} teamIds={tids} />)}</div></>}
          {recent.length > 0 && <><div className="group-title">{t('Derniers résultats')}</div><div className="group">{recent.map((g) => <GameRow key={g.id} g={g} teamIds={tids} />)}</div></>}
          {!next.length && !recent.length && <Empty ill="calendar" title={t('Aucun match pour l\'instant')} />}
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

function TeamSection({ club, team, games, idx }: { club: Club; team: Team; games: Game[]; idx: Map<number, { team: Team; club: Club }> }) {
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
            <span className="group-title" style={{ margin: 0 }}>{t('Prochain match')}</span>
            <span className="pill">{next.h === team.id ? t('Domicile') : t('Extérieur')}</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 18, marginTop: 6 }}>{next.h === team.id ? `vs ${next.an}` : `@ ${next.hn}`}</div>
          <div className="muted" style={{ fontSize: 14 }}>{frDate(next.d)} · {next.t}{next.v && <> · <Ico n="pin" />{next.v}</>}</div>
          <div className="hstack" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {next.v && <a className="btn small secondary" href={mapsUrl(`${next.v} ${next.adr}`, next.lat, next.lng)} target="_blank" rel="noopener">{t('Itinéraire')}</a>}
            <CalendarButton teamId={team.id} compact />
          </div>
        </div>)}
      {!accepted && (
        <div className="banner"><Ico n={team.ag === 'jeunes' ? 'lock' : 'users'} size={26} style={{ color: 'var(--accent)' }} />
          <div style={{ flex: 1, fontSize: 14 }}><b>{t('Tu fais partie de cette équipe ?')}</b><div className="muted">{member ? t('Demande envoyée, en attente de validation.')
            : team.ag === 'jeunes' ? t('Parent, joueur ou coach : photos, vidéos et covoiturage.') : t('Joueur ou coach : covoiturage, membres, vidéos.')}</div></div>
          {!member && <button className="btn small" onClick={() => setJoin(true)}>{t('Rejoindre')}</button>}
        </div>)}
      {accepted && <a className="row group" href={`#/equipes/${team.id}`} style={{ color: 'inherit', marginBottom: 16 }}>
        <Ico n={team.ag === 'jeunes' ? 'lock' : 'users'} size={24} style={{ color: 'var(--accent)' }} /><div className="grow"><b>{t('Espace de l\'équipe')}</b><div className="sub">{t('Covoiturage, galerie, membres')}</div></div><span className="chev">›</span></a>}
      {accepted && member!.role === 'responsable' && <TeamAdmin teamId={team.id} />}
      <Tabs value={tab} onChange={setTab} items={[['fil', 'news', 'Fil'], ['matchs', 'calendar', 'Matchs'], ['classement', 'standings', 'Classement'], ['infos', 'stats', 'Infos']] as const} />
      {/* Fil de l'équipe : uniquement ses résultats et publications (les actus du club restent sur « Tout le club ») */}
      {tab === 'fil' && <HubFeed posts={posts.data} error={posts.error} retry={posts.reload} games={mine} teamIds={[team.id]} idx={idx} news={[]} />}
      {tab === 'matchs' && <TeamGames team={team} games={mine} ics={ics} />}
      {tab === 'classement' && <TeamStandings team={team} games={mine} />}
      {tab === 'infos' && <TeamStats team={team} club={club} games={mine} />}
      {join && <JoinSheet teamId={team.id} name={teamLabel(team)} onClose={() => setJoin(false)} />}
    </>
  );
}

/** Carte de score construite depuis le calendrier quand aucune publication n'existe encore pour ce match. */
export function scoreFromGame(g: Game, idx: Map<number, { team: Team; club: Club }>): ScorePayload {
  const side = (id: number, name: string, score: number) => { const c = idx.get(id)?.club; return { id, name, logo: c?.logo ?? null, color: c ? clubColors(c).accent : undefined, score }; };
  return { gameId: g.id, date: g.d, time: g.t, competition: g.sn, home: side(g.h, g.hn, g.hs!), away: side(g.a, g.an, g.as!), official: true };
}

/** Résultat d'un match (calendrier officiel) présenté comme une publication BeHoop */
export function GameScoreCard({ g, idx, label }: { g: Game; idx: Map<number, { team: Team; club: Club }>; label?: string }) {
  return (
    <article className="card">
      <header className="card-head"><div className="avatar" style={{ background: '#0a0c12', color: '#f26a1b' }}><Ico n="ball" size={22} /></div>
        <div style={{ flex: 1, minWidth: 0 }}><div className="who ellipsis">BeHoop {label && <span className="muted" style={{ fontWeight: 400 }}>· {label}</span>}</div><div className="when">{frDate(g.d)}</div></div></header>
      <ScoreCard p={scoreFromGame(g, idx)} />
      <SocialBar k={`game-${g.id}`} title={`${g.hn} – ${g.an}`} youth={[g.h, g.a].some((x) => { const e = idx.get(x); return !!e && e.team.ag !== 'seniors'; })}
        right={<a className="icon-btn" href={`#/match/${g.s}/${g.id}`} aria-label={t('Fiche du match')}><Ico n="scoreboard" /></a>} />
    </article>
  );
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
        <GameScoreCard key={`g${g.id}`} g={g} idx={idx} label={mine ? teamLabel(mine) : undefined} />) });
    }
    for (const n of news) out.push({ t: Date.parse(n.date), key: `n${n.id}`, kind: 'actus', el: <NewsCard key={`n${n.id}`} n={n} wide list={news} /> });
    return out.sort((a, b) => b.t - a.t);
  }, [posts, games, teamIds.join(), idx, news]);
  const shown = items.filter((x) => kind === 'tout' || x.kind === kind);
  return (
    <>
      <div className="chips">{KINDS.filter((k) => k.id !== 'actus' || news.length).map((k) => <button key={k.id} className={`chip${kind === k.id ? ' on' : ''}`} onClick={() => { setKind(k.id); setMax(15); }} aria-pressed={kind === k.id}>{k.ic && <Ico n={k.ic} />}{t(k.label)}</button>)}</div>
      {error && <ErrorBox msg={error} retry={retry} />}
      {!posts && !error ? <Skeleton h={240} n={2} /> : shown.length ? <>{shown.slice(0, max).map((x) => x.el)}
          {shown.length > max && <button className="btn secondary" onClick={() => setMax((m) => m + 15)}>{t('Voir plus')} ({shown.length - max})</button>}</>
        : <Empty ill={kind === 'actus' ? 'news' : kind === 'medias' ? 'camera' : 'ball'} title={kind === 'actus' ? t('Aucune actu ne parle de ce club pour l’instant') : kind === 'medias' ? t('Pas encore de photo ni de vidéo') : t('Rien pour l’instant')}
          text={kind === 'medias' ? t('Publie la première depuis l’onglet ＋.') : undefined} />}
    </>
  );
}
