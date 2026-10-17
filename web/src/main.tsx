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

createRoot(document.getElementById('root')!).render(<SessionProvider><App /></SessionProvider>);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch(() => {});
