import { useEffect, useRef, useState, type ReactNode } from 'react';
import { initials } from '../lib/util';
import { useSession } from '../lib/session';
import { t, lang, setLang, LANGS, type Lang } from '../lib/i18n';
import { Ico, type IconName } from './icons';

/** Choix de la langue (en-tête) : FR · NL · EN */
export function LangSwitch() {
  return (
    <label className="lang-switch" title={t('Langue')}>
      <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>{t('Langue')}</span>
      <select value={lang()} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t('Langue')}>
        {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>
    </label>
  );
}

/**
 * Écran avec barre du haut flottante (verre dépoli) :
 *  - écrans principaux : logo BEHOOP + avatar (Profil) ;
 *  - sous-écrans : bouton Retour + titre. Le grand titre en lettres de match suit en dessous.
 */
export function Screen({ title, children, left, right, tabs = true, back, home, hideTitle }: { title: string; children: ReactNode; left?: ReactNode; right?: ReactNode; tabs?: boolean; back?: string; home?: boolean; hideTitle?: boolean }) {
  const s = useSession();
  useEffect(() => { document.title = `${title} · BeHoop`; }, [title]);
  return (
    <main className={`screen${tabs ? '' : ' no-tabs'}`}>
      <div className="navbar">
        <div className="bar">
          {back ? <button className="back" onClick={() => (history.length > 1 ? history.back() : (location.hash = back))} aria-label={t('Retour')}>‹ {t('Retour')}</button> : left}
          {home || !back ? <a className="brand" href={s.user ? '#/fil' : '/'} aria-label={t('BeHoop, accueil')}><img src="/icons/icon-192.png" alt="" /><span>BeHoop</span></a> : <div className="small-title ellipsis">{title}</div>}
          {right}
          {!back && <LangSwitch />}
          {/* Profil (et la modération, dans Profil) : avatar en haut à droite ; le reste est dans la barre du bas. */}
          {!back && (s.user ? <a className="top-av" href="#/profil" aria-label={t('Mon profil')}><Avatar name={s.profile?.displayName ?? '?'} src={s.profile?.avatarUrl} /></a>
            : <a className="btn small secondary" href="/" style={{ width: 'auto' }}>‹ {t('Accueil')}</a>)}
        </div>
      </div>
      {!hideTitle && <h1 className="large-title">{title}</h1>}
      {children}
    </main>
  );
}

export function Sheet({ title, onClose, children, right }: { title: string; onClose: () => void; children: ReactNode; right?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <>
      <div className="sheet-back" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grab" />
        <div className="sheet-head"><button className="btn ghost small" onClick={onClose}>{t('Fermer')}</button><h2>{title}</h2><div style={{ minWidth: 72, textAlign: 'right' }}>{right}</div></div>
        {children}
      </div>
    </>
  );
}

/** Onglets d'une page (club, équipe, compétition) : même composant partout, icône au-dessus du libellé */
export function Tabs<K extends string>({ value, onChange, items }: { value: K; onChange: (k: K) => void; items: readonly (readonly [K, IconName, string])[] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map(([k, ic, l]) => <button key={k} role="tab" className={value === k ? 'on' : ''} aria-selected={value === k} onClick={() => onChange(k)}><Ico n={ic} /><span>{t(l)}</span></button>)}
    </div>
  );
}

export const Empty = ({ ill, title, text, action }: { ill: IconName; title: string; text?: string; action?: ReactNode }) => (
  <div className="empty"><div className="ill" aria-hidden><Ico n={ill} /></div><h3>{title}</h3>{text && <p>{text}</p>}{action && <div className="mt">{action}</div>}</div>
);
export const Skeleton = ({ h = 120, n = 3 }: { h?: number; n?: number }) => (
  <div className="stack" aria-busy="true" aria-label={t('Chargement')}>{Array.from({ length: n }, (_, i) => <div key={i} className="skel" style={{ height: h }} />)}</div>
);
export const ErrorBox = ({ msg, retry }: { msg: string; retry?: () => void }) => (
  <div className="err" role="alert"><span style={{ flex: 1 }}>{msg}</span>{retry && <button className="btn small" onClick={retry}>{t('Réessayer')}</button>}</div>
);
export function Disc({ src, name, size = 56, ring = '#fff' }: { src?: string | null; name: string; size?: number; ring?: string }) {
  const [err, setErr] = useState(false);
  return (
    <div className="disc" style={{ '--s': `${size}px`, '--ring': ring } as React.CSSProperties}>
      {src && !err ? <img src={src} alt="" loading="lazy" onError={() => setErr(true)} style={src.startsWith('/logos/') ? { width: '100%', height: '100%' } : undefined} /> : <span>{initials(name)}</span>}
    </div>
  );
}
export const Avatar = ({ name, src }: { name: string; src?: string }) => <div className="avatar" aria-hidden>{src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : initials(name || '?')}</div>;

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const n = useRef(0);
  const run = () => {
    const id = ++n.current;
    set((s) => ({ ...s, loading: true, error: undefined }));
    fn().then((data) => id === n.current && set({ data, loading: false }))
      .catch((e) => id === n.current && set({ error: e?.code === 'permission-denied' || /permission/i.test(e?.message ?? '') ? t('Accès refusé.') : t('Impossible de charger. Vérifie ta connexion.'), loading: false }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(run, deps);
  return { ...state, reload: run, set: (data: T) => set({ data, loading: false }) };
}

const I = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
export const Icons = {
  home: I('M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'),
  search: I('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3'),
  plus: <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>,
  cal: I('M4 6h16v14H4zM4 10h16M8 3v4M16 3v4'),
  user: I('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0'),
  more: I('M5 12h.01M12 12h.01M19 12h.01'),
  share: I('M12 3v12M7 8l5-5 5 5M5 13v7h14v-7'),
  bell: I('M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0'),
  users: I('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'),
  shield: I('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'),
  camera: I('M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'),
};
