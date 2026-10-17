import { useEffect, useRef, useState, type ReactNode } from 'react';
import { initials } from '../lib/util';

/** Écran avec grand titre qui se réduit en barre floutée au défilement. */
export function Screen({ title, children, left, right, tabs = true, back }: { title: string; children: ReactNode; left?: ReactNode; right?: ReactNode; tabs?: boolean; back?: string }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 30);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => { document.title = `${title} · BeHoop`; }, [title]);
  return (
    <main className={`screen${tabs ? '' : ' no-tabs'}`}>
      <div className={`navbar${scrolled ? ' scrolled' : ''}`}>
        <div className="nav-side">{back ? <button className="back" onClick={() => history.length > 1 ? history.back() : (location.hash = back)}>‹ Retour</button> : left}</div>
        <div className="small-title">{title}</div>
        <div className="nav-side right">{right}</div>
      </div>
      <h1 className="large-title">{title}</h1>
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
        <div className="sheet-head"><button className="btn ghost small" onClick={onClose}>Fermer</button><h2>{title}</h2><div style={{ minWidth: 72, textAlign: 'right' }}>{right}</div></div>
        {children}
      </div>
    </>
  );
}

export const Empty = ({ ill, title, text, action }: { ill: string; title: string; text?: string; action?: ReactNode }) => (
  <div className="empty"><div className="ill" aria-hidden>{ill}</div><h3>{title}</h3>{text && <p>{text}</p>}{action && <div className="mt">{action}</div>}</div>
);
export const Skeleton = ({ h = 120, n = 3 }: { h?: number; n?: number }) => (
  <div className="stack" aria-busy="true" aria-label="Chargement">{Array.from({ length: n }, (_, i) => <div key={i} className="skel" style={{ height: h }} />)}</div>
);
export const ErrorBox = ({ msg, retry }: { msg: string; retry?: () => void }) => (
  <div className="err" role="alert"><span style={{ flex: 1 }}>{msg}</span>{retry && <button className="btn small" onClick={retry}>Réessayer</button>}</div>
);
export function Disc({ src, name, size = 56, ring = '#fff' }: { src?: string | null; name: string; size?: number; ring?: string }) {
  const [err, setErr] = useState(false);
  return (
    <div className="disc" style={{ '--s': `${size}px`, '--ring': ring } as React.CSSProperties}>
      {src && !err ? <img src={src} alt="" loading="lazy" onError={() => setErr(true)} /> : <span>{initials(name)}</span>}
    </div>
  );
}
export const Avatar = ({ name, src }: { name: string; src?: string }) => <div className="avatar" aria-hidden>{src ? <img src={src} alt="" /> : initials(name || '?')}</div>;

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const n = useRef(0);
  const run = () => {
    const id = ++n.current;
    set((s) => ({ ...s, loading: true, error: undefined }));
    fn().then((data) => id === n.current && set({ data, loading: false }))
      .catch((e) => id === n.current && set({ error: e?.code === 'permission-denied' || /permission/i.test(e?.message ?? '') ? 'Accès refusé.' : 'Impossible de charger. Vérifie ta connexion.', loading: false }));
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
};
