// Page d'accueil behoop.be : même session, mêmes composants et même style que l'appli (/app/), construite par le même build.
import { createRoot } from 'react-dom/client';
import '@fontsource/anton/400.css';
import '@fontsource/oswald/600.css';
import '@fontsource/oswald/700.css';
import './styles.css';
import './theme.css';
import './landing.css';
import { bootTheme } from './lib/theme';
bootTheme();
import { useEffect, useState } from 'react';
import { SessionProvider } from './lib/session';
import { lang, onLang } from './lib/i18n';
import { Welcome } from './screens/Welcome';

function Root() {
  const [l, setL] = useState(lang());
  useEffect(() => onLang(setL), []);
  return <SessionProvider><Welcome key={l} /></SessionProvider>;
}
createRoot(document.getElementById('root')!).render(<Root />);
