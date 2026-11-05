// Page d'accueil behoop.be (web/landing.html) : vitrine de l'appli + connexion sur place (même formulaire que l'appli).
// Deux mises en page pensées séparément :
//  • ordinateur : écran partagé (accroche + recherche de club à gauche, connexion toujours visible à droite), grilles ;
//  • téléphone : parcours vertical au pouce (accroche, connexion juste dessous, actus et résultats qui glissent),
//    barre « Entrer » collée en bas tant que le formulaire n'est pas à l'écran.
// Elle garde la fonction de l'ancien site public : chercher un club → ses équipes, calendriers et classements
// (fiches publiques de l'appli). Déjà connecté : redirigé vers l'appli (script dans landing.html, puis ici).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../lib/session';
import { loadIndex, loadNews, loadComps, loadSerie, teamIndex, isPlayed, normalize, readable, type Club, type Game, type News, type Competition } from '../lib/data';
import { takeReturnTo } from '../lib/util';
import { t, tn } from '../lib/i18n';
import { Logo, LangSwitch, Disc, useAsync } from '../ui/kit';
import { Ico, type IconName } from '../ui/icons';
import { CompLogo } from '../ui/CompLogo';
import { NewsReader, readerClick } from '../ui/NewsReader';
import { AuthForm } from './Auth';
import { topStories } from './News';
import { isMini } from '../../../shared/mini';

const APP = '/app/';
const enterApp = () => { location.href = APP + (takeReturnTo() ?? '#/fil'); };

function useDesktop() {
  const q = '(min-width: 900px)';
  const [w, setW] = useState(() => matchMedia(q).matches);
  useEffect(() => { const m = matchMedia(q); const f = () => setW(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return w;
}

/** Compteur qui monte jusqu'à sa valeur (une fois, à l'affichage) */
function Count({ n }: { n: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!n) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(n); return; }
    const t0 = performance.now(); let raf = 0;
    const step = (now: number) => { const p = Math.min(1, (now - t0) / 1200); setV(Math.round(n * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [n]);
  return <>{v.toLocaleString('fr-BE')}</>;
}

/** Derniers résultats du basket belge de haut niveau (bandeau défilant) */
const TICKER_COMPS = ['bnxt', 'tdm1', 'tdw', 'tdm2a', 'tdm2b', 'lions', 'cats'];
async function loadTicker() {
  const [comps, idx] = await Promise.all([loadComps(), teamIndex()]);
  const series = comps.filter((c) => TICKER_COMPS.includes(c.id)).flatMap((c) => c.series);
  const all = (await Promise.all(series.map((s) => loadSerie(s).catch(() => null)))).flatMap((x) => x?.games ?? []);
  const since = new Date(Date.now() - 12 * 864e5).toISOString().slice(0, 10);
  const games = [...new Map(all.filter((g) => isPlayed(g) && g.d >= since && !isMini(g.sn)).map((g) => [g.id, g])).values()]
    .sort((a, b) => b.d.localeCompare(a.d)).slice(0, 14);
  return games.map((g) => ({ g, h: idx.get(g.h)?.club, a: idx.get(g.a)?.club }));
}

export function Welcome() {
  const s = useSession();
  const desk = useDesktop();
  const idx = useAsync(loadIndex, []);
  const news = useAsync(loadNews, []);
  const comps = useAsync(loadComps, []);
  const ticker = useAsync(loadTicker, []);
  const authRef = useRef<HTMLDivElement>(null);
  const [authSeen, setAuthSeen] = useState(false);

  // Connecté avec un profil (ou il vient de se connecter ici) : dans l'appli
  useEffect(() => { if (s.ready && s.user && s.profile) enterApp(); }, [s.ready, s.user, s.profile]);
  // Téléphone : la barre « Entrer » disparaît quand le formulaire est à l'écran
  useEffect(() => {
    const el = authRef.current; if (!el || desk) return;
    const o = new IntersectionObserver(([e]) => setAuthSeen(e.isIntersecting), { threshold: .25 });
    o.observe(el); return () => o.disconnect();
  }, [desk, s.ready]);

  const be = useMemo(() => (idx.data?.clubs ?? []).filter((c) => c.id < 2e10), [idx.data]);
  const teams = useMemo(() => be.reduce((n, c) => n + c.teams.length, 0), [be]);
  const top = useMemo(() => {
    const l = topStories((news.data?.items ?? []).filter(readable), 16);
    // Le basket belge d'abord, puis le reste
    return [...l.filter((n) => n.cat === 'belgique'), ...l.filter((n) => n.cat !== 'belgique')].slice(0, desk ? 4 : 6);
  }, [news.data, desk]);
  const goAuth = () => { authRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => authRef.current?.querySelector<HTMLInputElement>('input[type=email]')?.focus({ preventScroll: true }), 500); };

  const auth = (
    <div className="lp-auth" ref={authRef} id="entrer">
      <div className="lp-auth-head">
        <h2>{s.user && !s.profile ? t('Crée ton profil') : t('Entre sur le terrain')}</h2>
        {!(s.user && !s.profile) && <p>{t('Créer un compte ou se connecter : c’est au même endroit. Gratuit.')}</p>}
      </div>
      {s.ready ? <AuthForm intro={false} onDone={enterApp} /> : <div className="lp-auth-wait" />}
      <a className="lp-visit" href={`${APP}#/explorer`}>{t('Visiter sans compte')} <Ico n="chevRight" size={16} /></a>
    </div>
  );

  return (
    <div className={`lp ${desk ? 'lp-desk' : 'lp-mob'}`}>
      <NewsReader />
      <header className="lp-top">
        <a href="/" aria-label={t('BeHoop, accueil')}><Logo size={desk ? 44 : 36} /></a>
        <div className="hstack" style={{ gap: 10 }}>
          <LangSwitch />
          {desk && <button className="btn small" onClick={goAuth}>{t('Se connecter')}</button>}
        </div>
      </header>

      <section className="lp-hero">
        <Court />
        <div className="lp-hero-in">
          <div className="lp-pitch">
            <div className="lp-kick">{t('Tout le basket belge · Gratuit')}</div>
            <h1>{t('Du premier dribble au buzzer')}</h1>
            <p className="lp-sub">{t('Résultats, classements et calendriers de tous les clubs de Belgique, la vidéo de ton match montée automatiquement et la vie de ton équipe. Pour les joueurs, les parents et les coachs.')}</p>
            <div className="lp-stats">
              <div><b><Count n={be.length} /></b><span>{t('clubs')}</span></div>
              <div><b><Count n={teams} /></b><span>{t('équipes')}</span></div>
              <div><b>{t('3 langues')}</b><span>FR · NL · EN</span></div>
            </div>
            {desk ? <ClubSearch clubs={be} comps={comps.data ?? []} dark />
              : <div className="lp-cta"><button className="btn" onClick={goAuth}>{t('Entrer sur le terrain')}</button><a className="btn secondary" href={`${APP}#/explorer`}>{t('Explorer')}</a></div>}
          </div>
          {desk && auth}
        </div>
      </section>

      {!desk && <div className="lp-wrap">{auth}</div>}

      {(ticker.data?.length ?? 0) > 0 && <Ticker items={ticker.data!} />}

      <div className="lp-wrap">
        {top.length > 0 && <section className="lp-sec">
          <div className="lp-h"><h2>{t('À la une')}</h2><a href={`${APP}#/actus`}>{t('Toutes les actus ›')}</a></div>
          <div className={desk ? 'lp-news-grid' : 'lp-news-row'}>{top.map((n, i) => <NewsTile key={n.id} n={n} list={top} big={desk && i === 0} />)}</div>
        </section>}

        {!desk && <section className="lp-sec">
          <div className="lp-h"><h2>{t('Trouve ton club')}</h2></div>
          <ClubSearch clubs={be} comps={comps.data ?? []} />
        </section>}

        <section className="lp-sec">
          <div className="lp-h"><h2>{t('Tout ton basket, une seule appli')}</h2></div>
          <div className={desk ? 'lp-feat-grid' : 'lp-feat-list'}>
            {FEATURES.map(([ic, title, text]) => (
              <div key={title} className="lp-feat"><span className="lp-feat-ic"><Ico n={ic} size={desk ? 28 : 24} /></span><div><b>{t(title)}</b><p>{t(text)}</p></div></div>
            ))}
          </div>
        </section>

        <section className="lp-final">
          <h2>{t('Ton prochain match commence ici')}</h2>
          <button className="btn" onClick={goAuth}>{t('Entrer sur le terrain')}</button>
        </section>

        <footer className="lp-foot">
          <Logo size={30} />
          <nav>
            <a href={`${APP}#/legal/cgu`}>{t('Conditions d’utilisation')}</a>
            <a href={`${APP}#/legal/confidentialite`}>{t('Confidentialité')}</a>
            <a href={`${APP}#/legal/charte`}>{t('Charte')}</a>
          </nav>
          <p>{t('Données : AWBB, Basketbal Vlaanderen et ligues officielles.')}{idx.data?.generated_at && <> {t('Mise à jour : {d}', { d: new Date(idx.data.generated_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) })}</>}</p>
        </footer>
      </div>

      {!desk && !authSeen && !(s.user && s.profile) && <div className="lp-dock"><button className="btn" onClick={goAuth}>{t('Entrer sur le terrain')}</button></div>}
    </div>
  );
}

const FEATURES: [IconName, string, string][] = [
  ['news', 'Tribune', 'Le fil de tes clubs : résultats dès qu’ils tombent, photos et réactions.'],
  ['calendar', 'Saison', 'Ton calendrier, un rappel avant chaque match et le covoiturage entre parents.'],
  ['video', 'Vidéo de match', 'Filme, envoie : la vidéo est montée automatiquement, avec le score et les affiches.'],
  ['trophy', 'Arena', 'Tous les clubs, compétitions et classements de Belgique, des provinciales à la BNXT.'],
  ['lock', 'Vestiaire', 'L’espace de ton équipe : les photos des jeunes restent entre membres.'],
  ['club', 'Espace Club', 'Pour les coachs : séances, exercices animés, tactiques et Hoop Camp.'],
];

/** Terrain dessiné en fond de l'accroche (lignes qui se tracent) */
function Court() {
  return (
    <svg className="lp-court" viewBox="0 0 940 500" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g fill="none" strokeWidth="3">
        <rect x="20" y="20" width="900" height="460" rx="6" /><line x1="470" y1="20" x2="470" y2="480" /><circle cx="470" cy="250" r="60" />
        <path d="M20 90 H150 A160 160 0 0 1 150 410 H20" /><path d="M920 90 H790 A160 160 0 0 0 790 410 H920" />
        <rect x="20" y="180" width="190" height="140" /><rect x="730" y="180" width="190" height="140" />
      </g>
    </svg>
  );
}

function Ticker({ items }: { items: { g: Game; h?: Club; a?: Club }[] }) {
  const row = items.map(({ g, h, a }) => (
    <a key={g.id} className="lp-tk" href={`${APP}#/match/${g.s}/${g.id}`}>
      <Disc src={h?.logo} name={h?.short ?? g.hn} size={26} ring={h?.c1} /><span className="nm">{h?.short ?? g.hn}</span>
      <b className={g.hs! > g.as! ? 'w' : ''}>{g.hs}</b><i>–</i><b className={g.as! > g.hs! ? 'w' : ''}>{g.as}</b>
      <span className="nm">{a?.short ?? g.an}</span><Disc src={a?.logo} name={a?.short ?? g.an} size={26} ring={a?.c1} />
    </a>
  ));
  return (
    <section className="lp-ticker" aria-label={t('Derniers résultats')}>
      <span className="lp-tk-lab"><Ico n="bolt" size={16} />{t('Résultats')}</span>
      <div className="lp-tk-track"><div className="lp-tk-run">{row}<span aria-hidden className="lp-tk-dup">{row}</span></div></div>
    </section>
  );
}

function NewsTile({ n, list, big }: { n: News; list: News[]; big?: boolean }) {
  const [img, setImg] = useState(!!n.image);
  return (
    <a className={`lp-news${big ? ' big' : ''}`} href={n.url} target="_blank" rel="noopener" onClick={readerClick(list, n)}>
      <span className="ph">{img && n.image ? <img src={n.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImg(false)} /> : <span className="fb">{n.source}</span>}</span>
      <span className="tx"><small>{n.source}</small><b>{n.title}</b></span>
    </a>
  );
}

/** Recherche de club (fonction de l'ancien site public) : ses équipes, calendriers et classements, sans compte */
function ClubSearch({ clubs, comps, dark }: { clubs: Club[]; comps: Competition[]; dark?: boolean }) {
  const [q, setQ] = useState('');
  const qq = normalize(q.trim());
  const found = useMemo(() => (qq.length < 2 ? [] : clubs.filter((c) => normalize(`${c.name} ${c.short} ${c.city}`).includes(qq)).slice(0, 6)), [qq, clubs]);
  const popular = comps.filter((c) => ['bnxt', 'tdm1', 'tdw', 'lions', 'cats'].includes(c.id));
  return (
    <div className={`lp-search${dark ? ' dark' : ''}`}>
      <label className="lp-field"><Ico n="search" size={20} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Cherche ton club ou ta ville…')} aria-label={t('Chercher un club')} /></label>
      {found.length > 0 && <div className="lp-results">{found.map((c) => (
        <a key={c.id} href={`${APP}#/club/${c.id}`}><Disc src={c.logo} name={c.short} size={36} ring={c.c1} /><span className="grow"><b>{c.name}</b><small>{c.city} · {tn(c.teams.length, '{n} équipe', '{n} équipes')}</small></span><Ico n="chevRight" size={18} /></a>
      ))}</div>}
      {qq.length >= 2 && !found.length && <div className="lp-results"><span className="lp-none">{t('Aucun club trouvé.')}</span></div>}
      {!qq && popular.length > 0 && <div className="lp-pop">{popular.map((c) => <a key={c.id} href={`${APP}#/competition/${c.id}`}><CompLogo c={c} size={22} />{c.name}</a>)}</div>}
    </div>
  );
}
