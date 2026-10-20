// Fiche d'un match (#/match/{série}/{match}) : neutre, sans « équipe à nous » — score ou heure, salle, compétition,
// confrontations de la saison et place des deux équipes au classement officiel.
import { loadSerie, loadComps, teamIndex, isPlayed, ranked, trName, type Game } from '../lib/data';
import { t } from '../lib/i18n';
import { frDate, mapsUrl } from '../lib/util';
import { Screen, Disc, Skeleton, ErrorBox, Empty, useAsync } from '../ui/kit';
import { Ico } from '../ui/icons';
import { CompLogo } from '../ui/CompLogo';
import { CalendarButton } from '../ui/CalendarButton';
import { CompGameRow } from './CompPage';
import { SocialBar } from '../ui/Social';

export function MatchPage({ serie, id }: { serie: number; id: number }) {
  const d = useAsync(async () => {
    const [s, comps, idx] = await Promise.all([loadSerie(serie), loadComps().catch(() => []), teamIndex()]);
    return { s, comp: comps.find((c) => c.series.includes(serie) && c.id !== 'lions' && c.id !== 'cats') ?? comps.find((c) => c.series.includes(serie)) ?? null, idx, g: s.games.find((x) => x.id === id) ?? null };
  }, [serie, id]);
  if (d.error) return <Screen title={t('Match')} back="explorer"><ErrorBox msg={d.error} retry={d.reload} /></Screen>;
  if (!d.data) return <Screen title={t('Match')} back="explorer"><Skeleton h={180} n={1} /><Skeleton /></Screen>;
  const { s, comp, idx, g } = d.data;
  if (!g) return <Screen title={t('Match')} back="explorer"><Empty ill="ball" title={t('Match introuvable')} /></Screen>;
  const played = isPlayed(g);
  const table = ranked(s.standings);
  const pos = (team: number) => table.find((r) => r.team === team);
  const h2h = s.games.filter((x) => x.id !== g.id && ((x.h === g.h && x.a === g.a) || (x.h === g.a && x.a === g.h)));
  const side = (team: number, name: string, score: number | null, win: boolean) => {
    const e = idx.get(team); const p = pos(team);
    return (
      <a href={`#/equipe/${team}`} style={{ color: 'inherit', textAlign: 'center', minWidth: 0, flex: 1 }}>
        <div style={{ display: 'grid', placeItems: 'center' }}><Disc src={e?.club.logo} name={name} size={64} ring={e?.club.c1} /></div>
        <div style={{ fontWeight: 700, marginTop: 8, lineHeight: 1.2, fontSize: 15 }}>{name}</div>
        {p && <div className="sub" style={{ marginTop: 4, fontSize: 13 }}>{t('{r}ᵉ au classement', { r: p.rank })}</div>}
        {played && <div style={{ fontFamily: 'Anton', fontSize: 44, lineHeight: 1.1, marginTop: 6, opacity: win ? 1 : .55 }}>{score}</div>}
      </a>
    );
  };
  return (
    <Screen title={t('Match')} back={comp ? `competition/${comp.id}` : 'explorer'} hideTitle>
      <section className="card" style={{ padding: 18, margin: '4px 0 14px' }}>
        {comp && <a href={`#/competition/${comp.id}`} className="hstack" style={{ gap: 10, color: 'inherit', marginBottom: 14 }}>
          <CompLogo c={comp} size={34} /><div style={{ minWidth: 0 }}><div className="ellipsis" style={{ fontWeight: 600 }}>{comp.name}</div><div className="sub ellipsis">{trName(s.serie.name)}</div></div><span className="chev" style={{ marginLeft: 'auto' }}>›</span></a>}
        <div className="hstack" style={{ alignItems: 'flex-start', gap: 10 }}>
          {side(g.h, g.hn, g.hs, played && g.hs! > g.as!)}
          <div style={{ paddingTop: 22, textAlign: 'center', flex: 'none', width: 70 }}>
            {played ? <span className="pill">{t('Score final')}</span> : <><div style={{ fontFamily: 'Anton', fontSize: 26 }}>{g.t || '–'}</div><div className="sub">{frDate(g.d, { weekday: 'short', day: 'numeric', month: 'short' })}</div></>}
          </div>
          {side(g.a, g.an, g.as, played && g.as! > g.hs!)}
        </div>
        {played && <div className="sub" style={{ textAlign: 'center', marginTop: 10 }}>{frDate(g.d, { weekday: 'long', day: 'numeric', month: 'long', ...(g.d.slice(0, 4) !== new Date().toISOString().slice(0, 4) ? { year: 'numeric' } : {}) })}</div>}
        <div style={{ margin: '12px -8px -10px' }}>
          <SocialBar k={`game-${g.id}`} title={`${g.hn} – ${g.an}`} youth={[g.h, g.a].some((x) => { const e = idx.get(x); return !!e && e.team.ag !== 'seniors'; })} />
        </div>
      </section>
      {g.v && <a className="row card" style={{ color: 'inherit', marginBottom: 14 }} href={mapsUrl(`${g.v} ${g.adr}`, g.lat, g.lng)} target="_blank" rel="noopener">
        <Ico n="pin" size={22} style={{ color: 'var(--accent)' }} /><div className="grow"><b>{g.v}</b>{g.adr && <div className="sub">{g.adr}</div>}</div><span className="sub">{t('Itinéraire')} ›</span></a>}
      {comp && !played && <div className="hstack" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}><CalendarButton comp={comp.id} label={t('Calendrier de la compétition')} /></div>}
      {h2h.length > 0 && <><div className="group-title">{t('Confrontations cette saison')}</div><div className="group">{h2h.map((x: Game) => <CompGameRow key={x.id} g={x} />)}</div></>}
    </Screen>
  );
}
