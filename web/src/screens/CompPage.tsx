// Page compétition (#/competition/{id}) : comme une page équipe, pour toute une compétition —
// actus, classement(s), résultats, calendrier et équipes, avec un bouton Suivre.
import { useMemo, useState } from 'react';
import { getComp, loadSerie, loadNews, teamIndex, isPlayed, compIcon, readable, type Competition, type Game, type Standing } from '../lib/data';
import { useSession } from '../lib/session';
import { t, tn } from '../lib/i18n';
import { frDate, haptic } from '../lib/util';
import { Screen, Disc, Skeleton, ErrorBox, Empty, useAsync } from '../ui/kit';
import { NewsCard } from './News';

export function CompFollowButton({ id }: { id: string }) {
  const s = useSession();
  const on = s.followedComps.includes(id);
  return (
    <button className={`btn small${on ? ' secondary' : ''}`} aria-pressed={on}
      onClick={() => { if (!s.requireAuth(() => s.toggleComp(id))) return; haptic(); s.toggleComp(id); }}>
      {on ? t('Suivi ✓') : t('Suivre')}
    </button>
  );
}

/** Toutes les séries d'une compétition (matchs, classements, noms d'équipes) */
export async function loadCompData(c: Competition) {
  const series = (await Promise.all(c.series.map((id) => loadSerie(id).catch(() => null)))).filter((x): x is NonNullable<typeof x> => !!x);
  const games = [...new Map(series.flatMap((x) => x.games).map((g) => [g.id, g])).values()].sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t));
  const names = new Map<number, string>();
  games.forEach((g) => { names.set(g.h, g.hn); names.set(g.a, g.an); });
  return { series, games, names };
}

/** Une ligne de match neutre (aucune équipe « à nous ») : le vainqueur en gras */
export function CompGameRow({ g }: { g: Game }) {
  const played = isPlayed(g);
  return (
    <a className="row" href={`#/equipe/${g.h}`} style={{ color: 'inherit' }}>
      <div style={{ width: 56, fontSize: 13 }} className="muted">{frDate(g.d, { day: 'numeric', month: 'short' })}<br />{played ? '' : g.t}</div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="ellipsis" style={{ fontWeight: played && g.hs! > g.as! ? 700 : 400 }}>{g.hn}</div>
        <div className="ellipsis" style={{ fontWeight: played && g.as! > g.hs! ? 700 : 400 }}>{g.an}</div>
      </div>
      {played ? <div style={{ textAlign: 'right', fontFamily: 'Anton', fontSize: 18, lineHeight: 1.25 }}><div>{g.hs}</div><div>{g.as}</div></div> : <span className="chev">›</span>}
    </a>
  );
}

export function CompPage({ id }: { id: string }) {
  const comp = useAsync(() => getComp(id), [id]);
  const data = useAsync(async () => (comp.data ? loadCompData(comp.data) : null), [comp.data?.id]);
  const news = useAsync(loadNews, []);
  const idx = useAsync(teamIndex, []);
  const [tab, setTab] = useState<'actus' | 'classement' | 'resultats' | 'calendrier' | 'equipes'>('resultats');
  const [sid, setSid] = useState<number | null>(null);
  const c = comp.data;
  const today = new Date().toISOString().slice(0, 10);
  // Actus : la compétition citée, ou un de ses clubs
  const compNews = useMemo(() => {
    if (!c) return [];
    const clubs = new Set(c.clubs);
    const all = (news.data?.items ?? []).filter((n) => n.comps?.includes(c.id) || n.clubs?.some((x) => clubs.has(x)));
    const mine = all.filter(readable);
    return mine.length ? mine : all;
  }, [news.data, c]);

  if (comp.error || data.error) return <Screen title={t('Compétition')} back="explorer"><ErrorBox msg={comp.error ?? data.error!} retry={comp.reload} /></Screen>;
  if (comp.data === null) return <Screen title={t('Compétition')} back="explorer"><Empty ill="🏀" title={t('Compétition introuvable')} /></Screen>;
  if (!c || !data.data) return <Screen title={t('Compétition')} back="explorer"><Skeleton h={160} n={1} /><Skeleton /></Screen>;
  const { series, games, names } = data.data;
  const played = games.filter(isPlayed).reverse();
  const upcoming = games.filter((g) => !isPlayed(g) && g.d >= today);
  const withTable = series.filter((x) => x.standings.length);
  const cur = withTable.find((x) => x.serie.id === sid) ?? withTable[0];
  const teams = [...names.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  const TABS = [['resultats', '🏀 Résultats'], ['classement', '📊 Classement'], ['calendrier', '📅 Calendrier'], ['actus', '📰 Actus'], ['equipes', '👥 Équipes']] as const;
  return (
    <Screen title={c.name} back="explorer" hideTitle right={<CompFollowButton id={c.id} />}>
      <section style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #0a0c12 100%)', color: '#fff', borderRadius: 22, padding: '18px 18px 16px', margin: '4px 0 14px', boxShadow: 'var(--shadow)' }}>
        <div className="hstack" style={{ gap: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: 'rgba(255,255,255,.15)', display: 'grid', placeItems: 'center', fontSize: 34, flex: 'none' }} aria-hidden>{compIcon(c)}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 24, lineHeight: 1.1, textTransform: 'uppercase', letterSpacing: '.02em' }}>{c.name}</div>
            <div style={{ opacity: .9, fontSize: 14, marginTop: 2 }}>{c.sub}</div>
          </div>
        </div>
        <div className="hstack" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <span className="pill" style={{ background: 'rgba(0,0,0,.25)', color: '#fff' }}>{tn(c.teams, '{n} équipe', '{n} équipes')}</span>
          <span className="pill" style={{ background: 'rgba(0,0,0,.25)', color: '#fff' }}>{tn(played.length, '{n} match joué', '{n} matchs joués')}</span>
          {upcoming[0] && <span className="pill" style={{ background: 'rgba(255,255,255,.92)', color: '#111' }}>⏱ {frDate(upcoming[0].d, { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
        </div>
      </section>
      <div className="chips" role="tablist">{TABS.map(([k, l]) => <button key={k} className={`chip${tab === k ? ' on' : ''}`} onClick={() => setTab(k)} aria-pressed={tab === k}>{t(l)}</button>)}</div>

      {tab === 'resultats' && (played.length ? <div className="group">{played.slice(0, 60).map((g) => <CompGameRow key={g.id} g={g} />)}</div>
        : <Empty ill="🏀" title={t('Pas encore de résultat')} />)}
      {tab === 'calendrier' && (upcoming.length ? <div className="group">{upcoming.slice(0, 60).map((g) => <CompGameRow key={g.id} g={g} />)}</div>
        : <Empty ill="📅" title={t('Aucun match prévu')} />)}
      {tab === 'classement' && (!cur ? <Empty ill="📊" title={t('Pas de classement')} text={t('Cette compétition se joue par élimination directe ou le classement n’est pas encore publié.')} /> : <>
        {withTable.length > 1 && <div className="chips">{withTable.map((x) => <button key={x.serie.id} className={`chip${cur.serie.id === x.serie.id ? ' on' : ''}`} onClick={() => setSid(x.serie.id)}>{x.serie.name.split(' · ')[1] ?? (x.serie.short || x.serie.name)}</button>)}</div>}
        <Table rows={cur.standings} names={names} />
      </>)}
      {tab === 'actus' && (news.data ? (compNews.length ? compNews.slice(0, 30).map((n) => <NewsCard key={n.id} n={n} wide />) : <Empty ill="📰" title={t('Pas d’actualité pour cette compétition pour l’instant')} />) : <Skeleton h={200} n={2} />)}
      {tab === 'equipes' && <div className="group">{teams.map(([tid, name]) => { const e = idx.data?.get(tid); return (
        <a key={tid} className="row" href={`#/equipe/${tid}`} style={{ color: 'inherit' }}>
          <Disc src={e?.club.logo} name={name} size={36} ring={e?.club.c1} /><div className="grow ellipsis">{name}<div className="sub">{e?.club.city}</div></div><span className="chev">›</span>
        </a>); })}</div>}
    </Screen>
  );
}

function Table({ rows, names }: { rows: Standing[]; names: Map<number, string> }) {
  const sorted = [...rows].sort((a, b) => b.pts - a.pts || (b.pf - b.pa) - (a.pf - a.pa));
  return (
    <div className="group" style={{ padding: '6px 0' }}>
      <div className="row sub" style={{ minHeight: 30, fontWeight: 600 }}><span style={{ width: 22 }}>#</span><span className="grow">{t('Équipe')}</span><span style={{ width: 28, textAlign: 'center' }}>{t('J')}</span><span style={{ width: 28, textAlign: 'center' }}>{t('V')}</span><span style={{ width: 34, textAlign: 'right' }}>{t('Pts')}</span></div>
      {sorted.map((r, i) => (
        <a key={r.team} className="row" href={`#/equipe/${r.team}`} style={{ color: 'inherit', minHeight: 44 }}>
          <span style={{ width: 22, fontFamily: 'Anton', color: i < 3 ? 'var(--accent)' : undefined }}>{i + 1}</span>
          <span className="grow ellipsis">{names.get(r.team) ?? `${t('Équipe')} ${r.team}`}</span>
          <span style={{ width: 28, textAlign: 'center' }}>{r.played}</span><span style={{ width: 28, textAlign: 'center' }}>{r.wins}</span>
          <span style={{ width: 34, textAlign: 'right', fontFamily: 'Anton' }}>{r.pts}</span>
        </a>))}
    </div>
  );
}
