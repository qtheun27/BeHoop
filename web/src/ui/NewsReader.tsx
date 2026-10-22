// Lecteur d'actus intégré : l'article s'ouvre dans BeHoop, on passe au suivant en glissant (mobile) ou avec les flèches
// (ordinateur, clavier ← →). Sa page s'affiche dans un cadre seulement si le média l'autorise (News.frame === true, vérifié par
// ops/news.ts) ; sinon (interdit, ou impossible à vérifier comme Sudinfo, qui finit en page blanche) : aperçu soigné
// (image, titre, extrait) et bouton vers son site. On respecte toujours la protection du média.
import { useEffect, useRef, useState } from 'react';
import type { News } from '../lib/data';
import { t } from '../lib/i18n';
import { ago, haptic } from '../lib/util';
import { Ico } from './icons';
import { BallSvg } from './HoopLoader';
import { SocialBar } from './Social';
import * as D from '../lib/db';

let state: { list: News[]; i: number } | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
/** Ouvre le lecteur sur l'article i d'une liste (celle affichée à l'écran, pour pouvoir passer d'une actu à l'autre) */
export function openReader(list: News[], i: number) { state = { list, i: Math.max(0, i) }; emit(); }
const closeReader = () => { state = null; emit(); };

/** À mettre sur un lien d'actu : ouvre le lecteur au lieu d'un nouvel onglet (Ctrl/⌘-clic garde le comportement normal) */
export const readerClick = (list: News[], n: News) => (e: React.MouseEvent) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault(); openReader(list, list.findIndex((x) => x.id === n.id));
};

export function NewsReader() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  if (!state) return null;
  return <Reader key="reader" />;
}

function Reader() {
  const { list } = state!;
  const [i, setI] = useState(state!.i);
  const [dir, setDir] = useState<0 | 1 | -1>(0);
  const n = list[i];
  const go = (d: 1 | -1) => { const j = i + d; if (j < 0 || j >= list.length) return; haptic(); setDir(d); setI(j); state!.i = j; };
  // Page derrière figée + clavier (Échap, ← →)
  useEffect(() => {
    const b = document.body, y = window.scrollY;
    Object.assign(b.style, { position: 'fixed', top: `-${y}px`, left: '0', right: '0', overflow: 'hidden' });
    return () => { Object.assign(b.style, { position: '', top: '', left: '', right: '', overflow: '' }); window.scrollTo(0, y); };
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') closeReader(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  // Glisser à gauche / à droite (sur l'aperçu et les barres : un cadre de site garde ses propres gestes)
  const sw = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { sw.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = sw.current; sw.current = null; if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  };
  return (
    <div className="reader" role="dialog" aria-modal="true" aria-label={t('Lecteur d’actus')}>
      <div className="reader-panel" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <header className="reader-bar">
          <button className="icon-btn" onClick={closeReader} aria-label={t('Fermer')}><Ico n="close" /></button>
          <div className="reader-src"><span className="pill" style={{ fontWeight: 700 }}>{n.source}</span><span className="muted">{ago(Math.min(Date.parse(n.date), Date.now()))}</span></div>
          <span className="muted reader-count">{i + 1} / {list.length}</span>
          <a className="icon-btn" href={n.url} target="_blank" rel="noopener" aria-label={t('Ouvrir sur le site du média')} title={t('Ouvrir sur le site du média')}><Ico n="external" /></a>
        </header>
        <div key={n.id} className={`reader-body slide-${dir}`}>
          {n.frame === true ? <Framed n={n} /> : <Preview n={n} />}
        </div>
        <footer className="reader-foot">
          <button className="icon-btn" disabled={i === 0} onClick={() => go(-1)} aria-label={t('Actu précédente')}><Ico n="chevLeft" /></button>
          <div className="reader-social"><SocialBar k={D.newsThread(n.id)} title={n.title} /></div>
          <button className="icon-btn" disabled={i === list.length - 1} onClick={() => go(1)} aria-label={t('Actu suivante')}><Ico n="chevRight" /></button>
        </footer>
      </div>
      {/* Ordinateur : grandes flèches de part et d'autre */}
      <button className="reader-side left" disabled={i === 0} onClick={() => go(-1)} aria-label={t('Actu précédente')}><Ico n="chevLeft" /></button>
      <button className="reader-side right" disabled={i === list.length - 1} onClick={() => go(1)} aria-label={t('Actu suivante')}><Ico n="chevRight" /></button>
    </div>
  );
}

/** Page du média dans un cadre (il l'autorise) ; si elle ne s'affiche pas en 10 s, aperçu à la place */
function Framed({ n }: { n: News }) {
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => { const id = setTimeout(() => setSlow(true), 10_000); return () => clearTimeout(id); }, []);
  if (slow && !loaded) return <Preview n={n} />;
  return (
    <div className="reader-frame">
      {!loaded && <div className="reader-loading"><BallSvg /></div>}
      <iframe src={n.url} title={n.title} referrerPolicy="no-referrer" onLoad={() => setLoaded(true)}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms" />
    </div>
  );
}

/** Aperçu dans le style de l'appli + accès à l'article complet sur le site du média */
function Preview({ n }: { n: News }) {
  const [imgOk, setImgOk] = useState(!!n.image);
  return (
    <article className="reader-preview">
      {imgOk && <img src={n.image!} alt="" referrerPolicy="no-referrer" onError={() => setImgOk(false)} />}
      <div className="reader-text">
        <h1>{n.title}</h1>
        {n.excerpt && <p>{n.excerpt}</p>}
        <a className="btn" href={n.url} target="_blank" rel="noopener"><Ico n="external" />{t('Lire l’article sur {s}', { s: n.source })}</a>
        <p className="muted" style={{ fontSize: 12.5 }}>{t('Ce média ne permet pas d’afficher ses articles dans BeHoop : l’article complet s’ouvre sur son site. Glisse pour passer à l’actu suivante.')}</p>
      </div>
    </article>
  );
}
