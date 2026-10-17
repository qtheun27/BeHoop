// Page de rendu des planches : /app/render/planche.html?type=pre|q1|q2|q3|fin|wipe&t=1.2[&demo=1][&play=1]
// Les réglages du match sont injectés par le pipeline (window.__SETTINGS__) ou passés en base64 (?s=…).
// window.setT(t) rend l'état exact à l'instant t (capture image par image, 30 i/s).
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import '@fontsource/anton/400.css';
import '@fontsource/oswald/600.css';
import '@fontsource/oswald/700.css';
import { Planche } from '../src/planche/Planche';
import { DURATIONS } from '../src/planche/anim';
import { demoSettings } from '../../shared/demo';
import type { MatchSettings, PlancheType } from '../../shared/types';

declare global { interface Window { __SETTINGS__?: MatchSettings; setT: (t: number) => Promise<boolean>; plancheReady: Promise<boolean> } }
const q = new URLSearchParams(location.search);
const type = (q.get('type') ?? 'pre') as PlancheType;
let st: MatchSettings = window.__SETTINGS__ ?? (q.get('s') ? JSON.parse(decodeURIComponent(escape(atob(q.get('s')!)))) : demoSettings());
if (q.has('demo')) st = demoSettings();
if (type === 'wipe') document.body.style.background = 'transparent';
const root = createRoot(document.getElementById('root')!);
const render = (t: number) => flushSync(() => root.render(<Planche type={type} st={st} t={t} />));

async function waitAssets() {
  await document.fonts.ready;
  const urls = [st.home.logo, st.away.logo, st.photos.pre, ...st.photos.q1, ...st.photos.q2, ...st.photos.q3, ...st.photos.fin].filter(Boolean) as string[];
  await Promise.all(urls.map((u) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = u; })));
  return true;
}
window.setT = async (t: number) => { render(t); await new Promise((r) => requestAnimationFrame(() => r(null))); return true; };
render(Number(q.get('t') ?? DURATIONS[type]));
window.plancheReady = waitAssets();
if (q.has('play')) {
  const d = DURATIONS[type] + 1.5; const t0 = performance.now();
  const loop = () => { render(((performance.now() - t0) / 1000) % d); requestAnimationFrame(loop); };
  window.plancheReady.then(() => requestAnimationFrame(loop));
}
