import { createRoot } from 'react-dom/client';
import '@fontsource/anton/400.css';
import '@fontsource/oswald/600.css';
import '@fontsource/oswald/700.css';
import './styles.css';
import './theme.css';
import { bootTheme } from './lib/theme';
bootTheme();
import { App } from './App';
import { SessionProvider } from './lib/session';
import { useEffect, useState } from 'react';
import { lang, onLang } from './lib/i18n';

// Changement de langue : tout l'arbre est redessiné (clé) pour que chaque t() relise la langue active
function Root() {
  const [l, setL] = useState(lang());
  useEffect(() => onLang(setL), []);
  return <SessionProvider><App key={l} /></SessionProvider>;
}
createRoot(document.getElementById('root')!).render(<Root />);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch(() => {});
