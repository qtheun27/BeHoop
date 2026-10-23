import { lazy, Suspense, Component, useEffect, type ReactNode } from 'react';
import { NewsReader } from './ui/NewsReader';
import { hideSplash } from './lib/splash';
import { CourtBg } from './ui/CourtBg';
import { useRoute } from './lib/router';
import { useSession } from './lib/session';
import { Icons, Logo, LangSwitch, Avatar, useWide, Loader } from './ui/kit';
import { Ico } from './ui/icons';
import { t } from './lib/i18n';
import { AuthSheet, Onboarding } from './screens/Auth';
import { Explore, ClubPage, TeamPage } from './screens/Explore';
import { Profile } from './screens/Profile';
import { Legal } from './screens/Legal';
import { Feed, PostPage } from './screens/Feed';
import { Matches } from './screens/Matches';
import { Publish } from './screens/Publish';
import { NewsPage } from './screens/News';
import { MyTeams } from './screens/Teams';
import { ClubHub } from './screens/ClubHub';
import { CompPage } from './screens/CompPage';
import { MatchPage } from './screens/MatchPage';

const Montage = lazy(() => import('./screens/Montage'));
const Moderation = lazy(() => import('./screens/Moderation'));
const Watch = lazy(() => import('./screens/Watch'));
// Espace Club (espace « travail » : Hoop Camp, entraînements, Tactique) : chargé à la demande
const Space = lazy(() => import('./club/Space'));

const tr = t;
const TABS = [
  { id: 'fil', label: 'Fil', icon: Icons.home }, { id: 'explorer', label: 'Rechercher', icon: Icons.search },
  { id: 'publier', label: 'Publier', icon: <span className="plus">{Icons.plus}</span> },
  { id: 'matchs', label: 'Matchs', icon: Icons.cal }, { id: 'equipes', label: 'Équipes', icon: Icons.users },
];

export function App() {
  const s = useSession();
  const wide = useWide();
  const [page, a, b] = useRoute();
  useEffect(() => { if (s.ready) hideSplash(); }, [s.ready]);
  if (!s.ready) return <Loader full />;
  if (s.user && s.profile && !s.profile.onboarded) return <Onboarding />;
  if (s.user && !s.profile && !s.authSheet) return <AuthSheet onClose={() => {}} finishOnly />;

  // Espace Club : sa propre ambiance et sa propre navigation (pas de parquet, pas de barre du bas de l'espace loisir)
  if (page === 'espace') return (
    <>
      <NewsReader />
      <Guard key="espace"><Suspense fallback={<main className="screen"><Loader /></main>}><Space sub={a} arg={b} /></Suspense></Guard>
      {s.authSheet !== undefined && <AuthSheet onClose={s.closeAuth} />}
      {s.toastMsg && <div className="toast" role="status">{s.toastMsg}</div>}
    </>
  );

  let el;
  switch (page) {
    case 'explorer': el = <Explore />; break;
    // Connecté : page club/équipe avec son propre fil ; sinon fiches publiques
    case 'club': el = s.user ? <ClubHub clubId={+a} /> : <ClubPage id={+a} />; break;
    case 'equipe': el = s.user ? <ClubHub teamId={+a} /> : <TeamPage id={+a} />; break;
    case 'competition': el = <CompPage id={a} />; break;
    case 'match': el = <MatchPage serie={+a} id={+b} />; break;
    case 'publier': el = <Publish />; break;
    case 'montage': el = <Montage id={a} />; break;
    case 'matchs': el = <Matches />; break;
    case 'profil': el = <Profile />; break;
    case 'legal': el = <Legal doc={a} />; break;
    case 'moderation': el = <Moderation />; break;
    case 'video': el = <Watch id={a} t={b} />; break;
    case 'post': el = <PostPage id={a} />; break;
    case 'actus': el = <NewsPage />; break;
    case 'equipes': el = <MyTeams id={a ? +a : undefined} />; break;
    default: el = <Feed />;
  }
  const tab = page === 'club' || page === 'equipe' || page === 'actus' || page === 'competition' || page === 'match' ? 'explorer' : page === 'montage' ? 'publier' : page;
  return (
    <>
      <CourtBg />
      <NewsReader />
      <Guard key={location.hash}><Suspense fallback={<main className="screen"><Loader /></main>}>{el}</Suspense></Guard>
      {wide && <SideNav tab={page === 'actus' ? 'actus' : tab} />}
      <nav className="tabbar" aria-label={tr('Navigation principale')}>
        {TABS.map((t) => (
          <a key={t.id} href={`#/${t.id}`} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined}>
            {t.icon}{t.id !== 'publier' && <span>{tr(t.label)}</span>}{t.id === 'publier' && <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>{tr('Publier')}</span>}
          </a>
        ))}
      </nav>
      {s.authSheet !== undefined && <AuthSheet onClose={s.closeAuth} />}
      {s.toastMsg && <div className="toast" role="status">{s.toastMsg}</div>}
    </>
  );
}

/** Ordinateur : navigation à gauche (la barre du bas est masquée), même destinations que sur téléphone, plus les actus */
function SideNav({ tab }: { tab: string }) {
  const s = useSession();
  const items: [string, React.ReactNode, string][] = [
    ['fil', Icons.home, 'Fil'], ['explorer', Icons.search, 'Rechercher'], ['actus', <Ico n="news" />, 'Actus'],
    ['matchs', Icons.cal, 'Matchs'], ['equipes', Icons.users, 'Équipes'],
  ];
  return (
    <nav className="sidenav" aria-label={tr('Navigation principale')}>
      <a className="brand" href={s.user ? '#/fil' : '/'} aria-label={tr('BeHoop, accueil')}><Logo size={40} /></a>
      <div className="side-items">
        {items.map(([id, ic, l]) => <a key={id} href={`#/${id}`} className={tab === id ? 'on' : ''}>{ic}<span>{tr(l)}</span></a>)}
      </div>
      {/* Actions de la barre latérale : toutes en .side-cta (même taille, même forme) ; seule la couleur change */}
      <a className="btn side-cta" href="#/publier"><Ico n="plus" />{tr('Publier')}</a>
      {s.user && <a className="btn side-cta side-club" href="#/espace" title={tr('Hoop Camp, entraînements, tactique')}><Ico n="bolt" />{tr('Espace Club')}</a>}
      <div className="side-foot">
        {s.user ? <a className={`side-me${tab === 'profil' ? ' on' : ''}`} href="#/profil"><Avatar name={s.profile?.displayName ?? '?'} src={s.profile?.avatarUrl} /><span className="ellipsis">{s.profile?.displayName ?? tr('Mon profil')}</span></a>
          : <button className="btn secondary" onClick={() => s.requireAuth()}>{tr('Se connecter')}</button>}
        <LangSwitch seg />
      </div>
    </nav>
  );
}

/** Une erreur dans un écran n'efface pas toute l'appli : message et bouton pour recharger (remis à zéro à chaque navigation) */
class Guard extends Component<{ children: ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  componentDidCatch(e: unknown) { console.error(e); }
  render() {
    if (!this.state.err) return this.props.children;
    return <main className="screen"><div className="err" role="alert" style={{ marginTop: 40 }}><span style={{ flex: 1 }}>{t('Cette page n’a pas pu s’afficher.')}</span>
      <button className="btn small" onClick={() => location.reload()}>{t('Recharger')}</button></div></main>;
  }
}
