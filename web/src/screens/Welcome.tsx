// Page d'accueil behoop.be (web/landing.html) : vitrine de l'appli + connexion sur place (même formulaire que l'appli).
// Deux mises en page pensées séparément :
//  • ordinateur : écran partagé (accroche + recherche de club à gauche, connexion toujours visible à droite), grilles ;
//  • téléphone : parcours vertical au pouce (accroche, actus et résultats qui glissent) ; la connexion s'ouvre en
//    fenêtre (feuille de l'appli) depuis « Entrer », et une barre « Entrer » reste en bas une fois l'accroche passée.
// Elle garde la fonction de l'ancien site public : chercher un club → ses équipes, calendriers et classements
// (fiches publiques de l'appli). Déjà connecté : redirigé vers l'appli (script dans landing.html, puis ici).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../lib/session';
import { loadIndex, loadNews, loadLanding, normalize, readable, trName, type Club, type News, type Landing } from '../lib/data';
import { hideSplash } from '../lib/splash';
import { takeReturnTo } from '../lib/util';
import { t, tn } from '../lib/i18n';
import { Logo, LangSwitch, Disc, Sheet, useAsync } from '../ui/kit';
import { Ico, type IconName } from '../ui/icons';
import { CompLogo } from '../ui/CompLogo';
import { NewsReader, readerClick } from '../ui/NewsReader';
import { AuthForm } from './Auth';
import { topStories } from './News';

const APP = '/app/';
const enterApp = () => { location.href = APP + (takeReturnTo() ?? '#/fil'); };

function useDesktop() {
  const q = '(min-width: 900px)';
  const [w, setW] = useState(() => matchMedia(q).matches);
  useEffect(() => { const m = matchMedia(q); const f = () => setW(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return w;
}

/** L'écran d'ouverture est-il parti ? (classe booting retirée par lib/splash.ts) */
function useBooted() {
  const el = document.documentElement;
  const [ok, setOk] = useState(() => !el.classList.contains('booting'));
  useEffect(() => {
    if (ok) return;
    const o = new MutationObserver(() => { if (!el.classList.contains('booting')) { setOk(true); o.disconnect(); } });
    o.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => o.disconnect();
  }, [ok, el]);
  return ok;
}

/** Compteur qui monte jusqu'à sa valeur, une fois l'écran d'ouverture parti (sinon on ne le verrait pas monter) */
function Count({ n }: { n: number }) {
  const [v, setV] = useState(0);
  const booted = useBooted();
  useEffect(() => {
    if (!n || !booted) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(n); return; }
    const t0 = performance.now(); let raf = 0;
    const step = (now: number) => { const p = Math.min(1, (now - t0) / 1200); setV(Math.round(n * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [n, booted]);
  return <>{v.toLocaleString('fr-BE')}</>;
}

export function Welcome() {
  const s = useSession();
  const desk = useDesktop();
  // Tout ce qui s'affiche d'emblée tient dans landing.json (3 Ko) et news.json, préchargés par landing.html et chargés
  // pendant l'écran d'ouverture ; la liste des clubs (recherche) n'est chargée qu'au premier usage de la recherche.
  const land = useAsync(loadLanding, []);
  const news = useAsync(loadNews, []);
  const authRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const [ctaSeen, setCtaSeen] = useState(true);
  const [sheet, setSheet] = useState(false);
  const closeSheet = useCallback(() => setSheet(false), []);
  const profileStep = !!s.user && !s.profile;

  // Connecté avec un profil (ou il vient de se connecter ici) : dans l'appli
  useEffect(() => { if (s.ready && s.user && s.profile) enterApp(); }, [s.ready, s.user, s.profile]);
  // Téléphone : la barre « Entrer » apparaît quand le bouton de l'accroche n'est plus à l'écran
  useEffect(() => {
    const el = ctaRef.current; if (!el || desk) return;
    const o = new IntersectionObserver(([e]) => setCtaSeen(e.isIntersecting));
    o.observe(el); return () => o.disconnect();
  }, [desk]);
  // Connecté (Google…) sans profil : la fenêtre s'ouvre pour le créer
  useEffect(() => { if (!desk && profileStep) setSheet(true); }, [desk, profileStep]);
  // Écran d'ouverture : retiré quand la page et ses données sont prêtes (au bout d'un tour d'animation)
  useEffect(() => { hideSplash(() => [loadLanding(), loadNews(), document.fonts?.ready ?? Promise.resolve()]); }, []);

  const L = land.data;
  const top = useMemo(() => {
    const l = topStories((news.data?.items ?? []).filter(readable), 16);
    // Le basket belge d'abord, puis le reste
    return [...l.filter((n) => n.cat === 'belgique'), ...l.filter((n) => n.cat !== 'belgique')].slice(0, desk ? 4 : 6);
  }, [news.data, desk]);
  const goAuth = () => { if (!desk) { setSheet(true); return; } authRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => authRef.current?.querySelector<HTMLInputElement>('input[type=email]')?.focus({ preventScroll: true }), 500); };

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
  // Téléphone : la même connexion, dans la fenêtre de l'appli (pas de bloc sur la page)
  const authSheet = sheet && !desk && (
    <Sheet title={profileStep ? t('Crée ton profil') : t('Entre sur le terrain')} onClose={closeSheet}>
      <div className="lp-sheet-auth">
        {!profileStep && <p className="center muted" style={{ marginTop: 0 }}>{t('Créer un compte ou se connecter : c’est au même endroit. Gratuit.')}</p>}
        <AuthForm intro={false} onDone={enterApp} />
        {!profileStep && <a className="lp-visit" href={`${APP}#/explorer`}>{t('Visiter sans compte')} <Ico n="chevRight" size={16} /></a>}
      </div>
    </Sheet>
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
              <div><b><Count n={L?.clubs ?? 0} /></b><span>{t('clubs')}</span></div>
              <div><b><Count n={L?.teams ?? 0} /></b><span>{t('équipes')}</span></div>
              <div><b>{t('3 langues')}</b><span>FR · NL · EN</span></div>
            </div>
            {desk ? <ClubSearch comps={L?.comps} dark />
              : <div className="lp-cta" ref={ctaRef}><button className="btn" onClick={goAuth}><span className="lp-long">{t('Entrer sur le terrain')}</span><span className="lp-short">{t('Entrer')}</span></button><a className="btn secondary" href={`${APP}#/explorer`}>{t('Explorer')}</a></div>}
          </div>
          {desk && auth}
        </div>
      </section>


      {!(L && !L.ticker.length) && <Ticker items={L?.ticker} />}

      <div className="lp-wrap">
        {!(news.data && !top.length) && <section className="lp-sec">
          <div className="lp-h"><h2>{t('À la une')}</h2><a href={`${APP}#/actus`}>{t('Toutes les actus ›')}</a></div>
          {/* Place réservée (mêmes cartes, vides et animées) tant que les actus ne sont pas là : rien ne bouge à leur arrivée */}
          <div className={desk ? 'lp-news-grid' : 'lp-news-row'}>{top.length
            ? top.map((n, i) => <NewsTile key={n.id} n={n} list={top} big={desk && i === 0} first={i < (desk ? 4 : 2)} i={i} />)
            : Array.from({ length: desk ? 4 : 2 }, (_, i) => <div key={i} className={`lp-news lp-ghost${desk && i === 0 ? ' big' : ''}`}><span className="ph" /><span className="tx"><i /><i /><i /></span></div>)}</div>
        </section>}

        {!desk && <section className="lp-sec">
          <div className="lp-h"><h2>{t('Trouve ton club')}</h2></div>
          <ClubSearch comps={L?.comps} />
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
          <p>{t('Données : AWBB, Basketbal Vlaanderen et ligues officielles.')}{L?.generated_at && <> {t('Mise à jour : {d}', { d: new Date(L.generated_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) })}</>}</p>
        </footer>
      </div>

      {authSheet}
      {!desk && !ctaSeen && !sheet && !(s.user && s.profile) && <div className="lp-dock"><button className="btn" onClick={goAuth}>{t('Entrer sur le terrain')}</button></div>}
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

/** Bandeau des derniers résultats : sa place est toujours réservée ; en attendant, des lignes se tracent comme le terrain,
 *  puis les scores arrivent en cascade et défilent. */
function Ticker({ items }: { items?: Landing['ticker'] }) {
  const side = (x: Landing['ticker'][number]['h']) => <><Disc src={x.l} name={x.n} size={26} ring={x.c} /><span className="nm">{x.n}</span></>;
  const row = (dup: boolean) => (items ?? []).map((g, i) => (
    <a key={g.id} className="lp-tk" href={`${APP}#/match/${g.s}/${g.id}`} style={dup ? undefined : { animationDelay: `${Math.min(i, 8) * 70}ms` }} tabIndex={dup ? -1 : undefined}>
      {side(g.h)}<b className={g.hs > g.as ? 'w' : ''}>{g.hs}</b><i>–</i><b className={g.as > g.hs ? 'w' : ''}>{g.as}</b>
      <span className="nm">{g.a.n}</span><Disc src={g.a.l} name={g.a.n} size={26} ring={g.a.c} />
    </a>
  ));
  return (
    <section className={`lp-ticker${items ? ' in' : ''}`} aria-label={t('Derniers résultats')} aria-busy={!items}>
      <span className="lp-tk-lab" title={t('Résultats')}><Ico n="bolt" size={16} /><span className="lp-tk-word">{t('Résultats')}</span></span>
      <div className="lp-tk-track">
        {items ? <div className="lp-tk-run">{row(false)}<span aria-hidden className="lp-tk-dup">{row(true)}</span></div>
          : <div className="lp-tk-wait" aria-hidden>{Array.from({ length: 6 }, (_, i) => <span key={i} style={{ animationDelay: `${i * 120}ms` }} />)}</div>}
      </div>
    </section>
  );
}

/** first : visible dès l'arrivée → image chargée tout de suite (pas en différé) */
function NewsTile({ n, list, big, first, i = 0 }: { n: News; list: News[]; big?: boolean; first?: boolean; i?: number }) {
  const [img, setImg] = useState(!!n.image);
  const [loaded, setLoaded] = useState(false);
  return (
    <a className={`lp-news lp-in${big ? ' big' : ''}`} style={{ animationDelay: `${Math.min(i, 5) * 80}ms` }} href={n.url} target="_blank" rel="noopener" onClick={readerClick(list, n)}>
      {/* L'image apparaît en fondu une fois chargée, sur un fond qui pulse doucement en attendant */}
      <span className={`ph${loaded ? ' ok' : ''}`}>{img && n.image ? <img src={n.image} alt="" loading={first ? 'eager' : 'lazy'} fetchPriority={first ? 'high' : 'auto'} decoding="async" referrerPolicy="no-referrer" onLoad={() => setLoaded(true)} onError={() => setImg(false)} /> : <span className="fb">{n.source}</span>}</span>
      <span className="tx"><small>{n.source}</small><b>{n.title}</b></span>
    </a>
  );
}

// (objets et non paires : noms propres traduits par trName, pas des textes de l'interface)
const POPULAR = [{ id: 'bnxt', name: 'BNXT League' }, { id: 'tdm1', name: 'Top Division Men 1' }, { id: 'tdw', name: 'Top Division Women' }, { id: 'lions', name: 'Belgian Lions' }, { id: 'cats', name: 'Belgian Cats' }];

/** Recherche de club (fonction de l'ancien site public) : ses équipes, calendriers et classements, sans compte */
function ClubSearch({ comps, dark }: { comps?: Landing['comps']; dark?: boolean }) {
  const [q, setQ] = useState('');
  // Liste des clubs chargée au premier usage de la recherche (pas au chargement de la page)
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const want = () => { if (!clubs) loadIndex().then((i) => setClubs(i.clubs.filter((c) => c.id < 2e10))).catch(() => {}); };
  const qq = normalize(q.trim());
  const found = useMemo(() => (qq.length < 2 || !clubs ? [] : clubs.filter((c) => normalize(`${c.name} ${c.short} ${c.city}`).includes(qq)).slice(0, 6)), [qq, clubs]);
  // Compétitions mises en avant : noms connus d'avance (les puces sont là tout de suite, à leur taille) ; logos dès landing.json
  const popular = POPULAR.map(({ id, name }) => comps?.find((c) => c.id === id) ?? { id, name, cat: 'national' as const, women: false, youth: false });
  return (
    <div className={`lp-search${dark ? ' dark' : ''}`}>
      <label className="lp-field"><Ico n="search" size={20} /><input value={q} onFocus={want} onChange={(e) => { want(); setQ(e.target.value); }} placeholder={t('Cherche ton club ou ta ville…')} aria-label={t('Chercher un club')} /></label>
      {found.length > 0 && <div className="lp-results">{found.map((c) => (
        <a key={c.id} href={`${APP}#/club/${c.id}`}><Disc src={c.logo} name={c.short} size={36} ring={c.c1} /><span className="grow"><b>{c.name}</b><small>{c.city} · {tn(c.teams.length, '{n} équipe', '{n} équipes')}</small></span><Ico n="chevRight" size={18} /></a>
      ))}</div>}
      {qq.length >= 2 && clubs && !found.length && <div className="lp-results"><span className="lp-none">{t('Aucun club trouvé.')}</span></div>}
      {!qq && <div className="lp-pop">{popular.map((c) => <a key={c.id} href={`${APP}#/competition/${c.id}`}><CompLogo c={c} size={22} />{trName(c.name)}</a>)}</div>}
    </div>
  );
}
