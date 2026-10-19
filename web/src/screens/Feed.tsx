import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { api, mediaUrl, ensureMediaCookie } from '../lib/api';
import { Screen, Empty, Skeleton, ErrorBox, Avatar, Disc, Sheet, Icons, useAsync } from '../ui/kit';
import { ago, haptic, dotted } from '../lib/util';
import { shareScoreImage } from '../lib/shareImage';
import { loadClub, isPlayed, teamIndex, teamLabel, loadNews, readable, type Club } from '../lib/data';
import { clubColors } from '../lib/theme';
import { NewsCard } from './News';
import { t } from '../lib/i18n';

/** Rangée façon « stories » : Créer + clubs/équipes suivis, cerclés à leurs couleurs, badge MATCH le jour J. */
function Stories() {
  const s = useSession();
  const { data } = useAsync(async () => {
    const idx = await teamIndex();
    const clubs = new Map<number, Club>();
    s.followedClubs.forEach((id) => { for (const [, e] of idx) if (e.club.id === id) { clubs.set(id, e.club); break; } });
    const items: { key: string; href: string; name: string; logo: string | null; club: Club; teams: number[] }[] = [];
    clubs.forEach((c) => items.push({ key: `c${c.id}`, href: `#/club/${c.id}`, name: c.short, logo: c.logo, club: c, teams: c.teams.map((t) => t.id) }));
    s.follows.filter((f) => f.type === 'team').forEach((f) => { const e = idx.get(f.refId); if (e && !clubs.has(e.club.id)) items.push({ key: `t${f.refId}`, href: `#/equipe/${f.refId}`, name: teamLabel(e.team), logo: e.club.logo, club: e.club, teams: [f.refId] }); });
    const today = new Date().toISOString().slice(0, 10);
    const games = (await Promise.all([...new Set(items.map((i) => i.club.id))].map((id) => loadClub(id).catch(() => null)))).flatMap((x) => x?.games ?? []).filter((g) => g.d === today && !isPlayed(g));
    return items.map((i) => ({ ...i, match: games.find((g) => (i.teams.includes(g.h) || i.teams.includes(g.a)) && s.followedTeams.some((t) => t === g.h || t === g.a))?.t }));
  }, [s.follows.length, s.followedTeams.join()]);
  return (
    <div className="stories" aria-label={t('Mes clubs')}>
      {data?.map((i) => { const k = clubColors(i.club); return (
        <a key={i.key} className="story" href={i.href}>
          <div className="ring" style={{ '--ring': k.grad } as React.CSSProperties}><div>{i.logo ? <img src={i.logo} alt="" loading="lazy" /> : <b>{i.name.slice(0, 2)}</b>}</div>
            {i.match && <span className="tag match">MATCH {i.match.replace(':', 'H')}</span>}</div>
          <span className="name">{i.name}</span>
        </a>); })}
    </div>
  );
}
// Filtres du fil : une seule rangée ; « Actus » ouvre une petite sous-rangée Belgique / International / NBA.
const FILTERS: { id: string; label: string; ok: (p: D.Post) => boolean }[] = [
  { id: 'tout', label: 'Tout', ok: () => true },
  { id: 'scores', label: 'Résultats', ok: (p) => p.type === 'score' || p.type === 'live' },
  { id: 'medias', label: 'Photos & vidéos', ok: (p) => p.type === 'photo' || p.type === 'video' || p.type === 'moment' },
  { id: 'actus', label: '📰 Actus', ok: () => false },
];
const NEWS_CATS: [string, string][] = [['', 'Toutes'], ['belgique', 'Belgique'], ['regional', 'Régional'], ['international', 'International'], ['nba', 'NBA']];

export interface ScorePayload { gameId: number; date: string; time?: string; competition: string;
  home: { id: number; name: string; logo?: string | null; color?: string; score: number }; away: { id: number; name: string; logo?: string | null; color?: string; score: number }; official?: boolean }

export function ScoreCard({ p, live }: { p: ScorePayload; live?: boolean }) {
  const lead = p.home.score === p.away.score ? 0 : p.home.score > p.away.score ? 1 : 2;
  return (
    <div className="scorecard" style={{ '--h': p.home.color ?? '#3d8fdb', '--a': p.away.color ?? '#8a1e36' } as React.CSSProperties}>
      <div className="kick">{live ? `🔴 ${t('En direct')}` : t('Score final')} · {p.competition} · {dotted(p.date)}</div>
      <div className="teams">
        <div className="t"><Disc src={p.home.logo} name={p.home.name} size={64} ring={p.home.color} />{p.home.name}</div>
        <div className="sc"><span className={lead === 1 ? 'lead' : ''}>{p.home.score}</span><span className="d">–</span><span className={lead === 2 ? 'lead' : ''}>{p.away.score}</span></div>
        <div className="t"><Disc src={p.away.logo} name={p.away.name} size={64} ring={p.away.color} />{p.away.name}</div>
      </div>
    </div>
  );
}

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function PostCard({ post }: { post: D.Post }) {
  const s = useSession();
  const [p, setP] = useState(post);
  const [mine, setMine] = useState<D.Emoji | null>(null);
  const [menu, setMenu] = useState(false);
  useEffect(() => { if (s.user) D.myReaction(post.id, s.user.uid).then(setMine).catch(() => {}); }, [post.id, s.user]);
  useEffect(() => { if (p.visibility === 'team' || p.type === 'photo') ensureMediaCookie(); }, [p.visibility, p.type]);
  const onReact = async (e: D.Emoji) => {
    if (!s.requireAuth()) return;
    haptic();
    const prev = mine, next = mine === e ? null : e;
    const r = { ...p.reactions };
    if (prev) r[prev] = Math.max(0, (r[prev] ?? 1) - 1);
    if (next) r[next] = (r[next] ?? 0) + 1;
    setMine(next); setP({ ...p, reactions: r }); // UI optimiste
    try { await D.react(p.id, s.user!.uid, next, prev); } catch { setMine(prev); setP(p); s.toast(t('Réaction non enregistrée')); }
  };
  if (p.hidden && !(s.isAdmin || p.authorUid === s.user?.uid)) return null;
  const isYouthMedia = p.visibility === 'team';
  const pl = p.payload;
  return (
    <article className="card" style={p.hidden ? { opacity: .5 } : undefined}>
      <header className="card-head">
        {p.authorUid ? <Avatar name={p.authorName ?? '?'} /> : <div className="avatar" style={{ background: '#0a0c12' }}>🏀</div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="who ellipsis">{p.authorUid ? p.authorName : 'BeHoop'} {pl.teamLabel && <span className="muted" style={{ fontWeight: 400 }}>· {pl.teamLabel}</span>}</div>
          <div className="when">{ago(p.createdAt)} {isYouthMedia && <span className="lock">🔒 {t('Équipe')}</span>} {p.hidden && <span className="lock">{t('Masqué')}</span>}</div>
        </div>
        <button className="icon-btn" aria-label={t('Plus d\'options')} onClick={() => setMenu(true)}>{Icons.more}</button>
      </header>
      {(p.type === 'score' || p.type === 'live') && <ScoreCard p={pl as ScorePayload} live={p.type === 'live'} />}
      {p.type === 'live' && pl.updatedByName && <div className="card-body muted" style={{ paddingTop: 8, fontSize: 14 }}>{t('Mis à jour par {name}', { name: pl.updatedByName })}</div>}
      {(p.type === 'message' || p.type === 'photo') && pl.text && <div className="card-body">{pl.text}</div>}
      {p.type === 'photo' && <div className="carousel">{(pl.photos as { key: string }[]).map((ph, i) => <img key={i} src={mediaUrl(ph.key)} alt="" loading="lazy" draggable={false} onContextMenu={isYouthMedia ? (e) => e.preventDefault() : undefined} />)}</div>}
      {(p.type === 'video' || p.type === 'moment') && (
        <a href={p.type === 'video' ? `#/video/${pl.matchVideoId}` : `#/video/${pl.matchVideoId}/m-${pl.momentId}`} style={{ display: 'block', position: 'relative', color: '#fff' }}>
          <div style={{ aspectRatio: p.type === 'moment' ? '9/16' : '16/9', maxHeight: p.type === 'moment' ? 520 : undefined, margin: '0 auto', background: `#0a0c12 center/cover url(${pl.posterKey ? mediaUrl(pl.posterKey) : ''})` }} />
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><span style={{ width: 64, height: 64, borderRadius: 32, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(10px)', display: 'grid', placeItems: 'center', fontSize: 26 }}>▶</span></div>
          <div style={{ position: 'absolute', left: 12, bottom: 10, fontFamily: 'Oswald', fontWeight: 700, textShadow: '0 2px 8px #000' }}>{p.type === 'moment' ? `⚡ ${t('Moment')} · ` : ''}{pl.title} {pl.duration ? `· ${fmtDur(pl.duration)}` : ''}</div>
          {pl.score && <div style={{ position: 'absolute', right: 12, bottom: 8, fontFamily: 'Anton', fontSize: 24 }}>{pl.score}</div>}
        </a>)}
      <div className="card-actions">
        {D.EMOJIS.map((e) => <button key={e} className={`react${mine === e ? ' on' : ''}`} onClick={() => onReact(e)} aria-pressed={mine === e} aria-label={t('Réagir {e}', { e })}>{e}{p.reactions[e] ? <span>{p.reactions[e]}</span> : null}</button>)}
        <span style={{ flex: 1 }} />
        {p.type === 'score' && <button className="icon-btn" aria-label={t('Partager')} onClick={() => shareScoreImage(pl as ScorePayload).catch(() => s.toast(t('Partage indisponible')))}>{Icons.share}</button>}
      </div>
      {menu && <PostMenu post={p} onClose={() => setMenu(false)} onChange={setP} />}
    </article>
  );
}

function PostMenu({ post, onClose, onChange }: { post: D.Post; onClose: () => void; onChange: (p: D.Post) => void }) {
  const s = useSession();
  const [reporting, setReporting] = useState(false);
  const isAuthor = post.authorUid && post.authorUid === s.user?.uid;
  const isResp = post.teamIds.some((t) => s.responsibleTeams.includes(t));
  const youthMedia = post.visibility === 'team';
  const act = async (f: () => Promise<unknown>, m: string) => { try { await f(); s.toast(m); onClose(); } catch { s.toast(t('Action impossible. Réessaie.')); } };
  return (
    <Sheet title={reporting ? t('Signaler') : t('Options')} onClose={onClose}>
      {reporting ? <div className="group">{D.REPORT_REASONS.map((r) => <button key={r} className="row" onClick={() => act(() => D.report(post.id, s.user!.uid, r), t('Merci, on va regarder.'))}>{t(r)}</button>)}</div> : (
        <div className="group">
          {youthMedia && !post.hidden && <button className="row" style={{ color: 'var(--red)' }} onClick={() => s.requireAuth() && confirm(t('Ce contenu sera masqué immédiatement pour tout le monde. Continuer ?')) &&
            act(async () => { await D.hidePost(post.id, 'parent', s.user!.uid); onChange({ ...post, hidden: true }); api('/notify/parent-removal', { postId: post.id }).catch(() => {}); }, t('Contenu retiré.'))}>{t('Je suis parent — retirer ce contenu')}</button>}
          {(isAuthor || isResp || s.isAdmin) && !post.hidden && <button className="row" onClick={() => act(async () => { await D.hidePost(post.id, isAuthor ? 'auteur' : isResp ? 'responsable' : 'admin', s.user!.uid); onChange({ ...post, hidden: true }); }, t('Contenu masqué'))}>{t('Masquer')}</button>}
          {s.isAdmin && post.hidden && <button className="row" onClick={() => act(async () => { await D.unhidePost(post.id); onChange({ ...post, hidden: false }); }, t('Contenu réactivé'))}>{t('Réactiver')}</button>}
          {isAuthor && <button className="row" style={{ color: 'var(--red)' }} onClick={() => confirm(t('Supprimer cette publication ?')) && act(() => D.deletePost(post.id), t('Publication supprimée'))}>{t('Supprimer')}</button>}
          <button className="row" onClick={() => s.requireAuth() && setReporting(true)}>{t('Signaler…')}</button>
          <button className="row" onClick={() => { navigator.clipboard?.writeText(`${location.origin}/app/#/post/${post.id}`); s.toast(t('Lien copié')); onClose(); }}>{t('Copier le lien')}</button>
        </div>)}
    </Sheet>
  );
}

export function Feed() {
  const s = useSession();
  const [posts, setPosts] = useState<D.Post[] | null>(null);
  const [err, setErr] = useState('');
  const [more, setMore] = useState(false);
  const cur = useRef<D.FeedCursor | undefined>(undefined);
  const sentinel = useRef<HTMLDivElement>(null);
  const cursorDone = !!cur.current?.done;
  const [pull, setPull] = useState(0);
  const [filter, setFilter] = useState('tout');
  const [newsCat, setNewsCat] = useState('');
  const news = useAsync(loadNews, []);
  const key = s.targets.join() + '|' + s.privateTeams.join();

  const load = useCallback(async (reset: boolean) => {
    if (!s.user || (!s.targets.length && !s.privateTeams.length)) { setPosts([]); return; }
    setErr(t(''));
    try {
      if (reset) cur.current = undefined;
      else if (cur.current?.done) return;
      setMore(true);
      const r = await D.feedPage(s.targets, s.privateTeams, cur.current);
      cur.current = r.cursor;
      setPosts((p) => (reset ? r.posts : [...(p ?? []), ...r.posts.filter((x) => !p?.some((y) => y.id === x.id))]));
    } catch { setErr(t('Impossible de charger ton fil.')); } finally { setMore(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, s.user]);
  useEffect(() => { load(true); }, [load]);
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && !more && posts?.length && load(false), { rootMargin: '600px' });
    io.observe(el); return () => io.disconnect();
  }, [load, more, posts?.length]);
  // Tirer pour rafraîchir
  useEffect(() => {
    let y0 = 0, d = 0;
    const st = (e: TouchEvent) => { y0 = window.scrollY <= 0 ? e.touches[0].clientY : -1; };
    const mv = (e: TouchEvent) => { if (y0 < 0) return; d = Math.max(0, Math.min(100, e.touches[0].clientY - y0)); setPull(d); };
    const en = () => { if (d > 70) { haptic(); load(true); } d = 0; setPull(0); };
    window.addEventListener('touchstart', st, { passive: true }); window.addEventListener('touchmove', mv, { passive: true }); window.addEventListener('touchend', en);
    return () => { window.removeEventListener('touchstart', st); window.removeEventListener('touchmove', mv); window.removeEventListener('touchend', en); };
  }, [load]);

  if (!s.user) return (
    <Screen title={t('Fil')} home hideTitle><Empty ill="🏀" title={t('Ton fil basket')} text={t('Crée ton compte pour suivre tes clubs : résultats, photos, vidéos de match et scores en direct.')}
      action={<><button className="btn" onClick={() => s.requireAuth()}>{t('Créer mon compte')}</button><a className="btn ghost" href="/?site=1">{t('Voir le site public')}</a></>} /></Screen>
  );
  return (
    <Screen title={t('Fil')} home hideTitle>
      <Stories />
      <div className="chips" role="tablist">{FILTERS.map((f) => <button key={f.id} className={`chip${filter === f.id ? ' on' : ''}`} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}>{t(f.label)}</button>)}</div>
      {filter === 'actus' && <div className="seg" style={{ marginTop: -4 }}>{NEWS_CATS.map(([k, l]) => <button key={k} className={newsCat === k ? 'on' : ''} onClick={() => setNewsCat(k)}>{t(l)}</button>)}</div>}
      <div style={{ height: pull * .6, transition: pull ? 'none' : 'height .3s', display: 'grid', placeItems: 'center', overflow: 'hidden' }} aria-hidden>{pull > 70 ? '↻ Relâche' : pull > 10 ? '↓' : ''}</div>
      {err && <ErrorBox msg={err} retry={() => load(true)} />}
      {posts === null ? <Skeleton h={260} /> : (() => {
          // Publications de tes clubs + actus, mélangées par date. Les actus ne remontent pas plus loin que les posts chargés.
          const allNews = (news.data?.items ?? []).filter((n) => (!newsCat || n.cat === newsCat) && readable(n));
          if (filter === 'actus') return allNews.length ? allNews.map((n) => <NewsCard key={n.id} n={n} wide />) : <Empty ill="📰" title={t('Pas d\'actualité')} />;
          const f = FILTERS.find((x) => x.id === filter)!;
          const shown = posts.filter((p) => f.ok(p));
          const oldest = shown.length ? shown[shown.length - 1].createdAt : 0;
          const mix: { t: number; el: JSX.Element }[] = shown.map((p) => ({ t: p.createdAt, el: <PostCard key={p.id} post={p} /> }));
          if (filter === 'tout') allNews.filter((n) => Date.parse(n.date) >= oldest || cursorDone).forEach((n) => mix.push({ t: Date.parse(n.date), el: <NewsCard key={`n${n.id}`} n={n} wide /> }));
          mix.sort((a, b) => b.t - a.t);
          if (mix.length) return mix.map((x) => x.el);
          return filter === 'tout' ? <Empty ill="🗞️" title={t('Ton fil est vide')} text={t('Suis des clubs ou des équipes pour voir leurs résultats et publications.')}
            action={<a className="btn" href="#/explorer">{t('Trouver des clubs')}</a>} /> : <Empty ill="🏀" title={t('Rien dans ce filtre')} text={t('Essaie « Tout ».')} />;
        })()}
      <div ref={sentinel} />
      {more && posts && <Skeleton h={200} n={1} />}
    </Screen>
  );
}

export function PostPage({ id }: { id: string }) {
  const { data, error, loading } = useAsync(() => D.getPost(id), [id]);
  return <Screen title={t('Publication')} back="fil">{loading ? <Skeleton /> : error ? <ErrorBox msg={error} /> : data ? <PostCard post={data} /> : <Empty ill="🤷" title={t('Publication introuvable')} />}</Screen>;
}
