import { lazy, Suspense } from 'react';
import { useRoute } from './lib/router';
import { useSession } from './lib/session';
import { Icons, Skeleton } from './ui/kit';
import { AuthSheet, Onboarding } from './screens/Auth';
import { Explore, ClubPage, TeamPage } from './screens/Explore';
import { Profile } from './screens/Profile';
import { Legal } from './screens/Legal';
import { Feed, PostPage } from './screens/Feed';
import { Matches } from './screens/Matches';
import { Publish } from './screens/Publish';
import { NewsPage } from './screens/News';
import { MyTeams } from './screens/Teams';

const Montage = lazy(() => import('./screens/Montage'));
const Moderation = lazy(() => import('./screens/Moderation'));
const Watch = lazy(() => import('./screens/Watch'));

const TABS = [
  { id: 'fil', label: 'Fil', icon: Icons.home }, { id: 'explorer', label: 'Rechercher', icon: Icons.search },
  { id: 'publier', label: 'Publier', icon: <span className="plus">{Icons.plus}</span> },
  { id: 'matchs', label: 'Matchs', icon: Icons.cal }, { id: 'equipes', label: 'Équipes', icon: Icons.users },
];

export function App() {
  const s = useSession();
  const [page, a, b] = useRoute();
  if (!s.ready) return <main className="screen"><div style={{ height: 80 }} /><Skeleton n={4} /></main>;
  if (s.user && s.profile && !s.profile.onboarded) return <Onboarding />;
  if (s.user && !s.profile && !s.authSheet) return <AuthSheet onClose={() => {}} finishOnly />;

  let el;
  switch (page) {
    case 'explorer': el = <Explore />; break;
    case 'club': el = <ClubPage id={+a} />; break;
    case 'equipe': el = <TeamPage id={+a} />; break;
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
  const tab = page === 'club' || page === 'equipe' || page === 'actus' ? 'explorer' : page === 'montage' ? 'publier' : page;
  return (
    <>
      <Suspense fallback={<main className="screen"><Skeleton /></main>}>{el}</Suspense>
      <nav className="tabbar" aria-label="Navigation principale">
        {TABS.map((t) => (
          <a key={t.id} href={`#/${t.id}`} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined}>
            {t.icon}{t.id !== 'publier' && <span>{t.label}</span>}{t.id === 'publier' && <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Publier</span>}
          </a>
        ))}
      </nav>
      {s.authSheet !== undefined && <AuthSheet onClose={s.closeAuth} />}
      {s.toastMsg && <div className="toast" role="status">{s.toastMsg}</div>}
    </>
  );
}
