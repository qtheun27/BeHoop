// Contenus des réseaux sociaux intégrés (YouTube, Instagram, TikTok) : lecteurs officiels en iframe, chargés au toucher.
// auto (YouTube) : lecture automatique, son coupé, quand la vidéo est bien à l'écran en faisant défiler (comme un fil de
// réseau social) ; pause quand on la quitte ; une seule à la fois. Jamais avec l'économiseur de données ni « réduire les
// animations ».
import { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';

export interface EmbedInfo { kind: 'youtube' | 'instagram' | 'tiktok'; id: string; src: string; vertical: boolean; thumb?: string }

/** Lien partagé → lecteur officiel ; null si le lien n'est pas reconnu */
export function parseEmbed(raw: string): EmbedInfo | null {
  let u: URL; try { u = new URL(raw.trim()); } catch { return null; }
  const h = u.hostname.replace(/^(www|m)\./, '');
  if (h === 'youtu.be' || h === 'youtube.com') {
    const short = u.pathname.startsWith('/shorts/');
    const id = h === 'youtu.be' ? u.pathname.slice(1) : short ? u.pathname.split('/')[2] : u.searchParams.get('v');
    return id && /^[\w-]{6,20}$/.test(id) ? ytEmbed(id, short) : null;
  }
  const ig = h === 'instagram.com' && /^\/(p|reel|tv)\/([\w-]+)/.exec(u.pathname);
  if (ig) return { kind: 'instagram', id: ig[2], src: `https://www.instagram.com/${ig[1] === 'p' ? 'p' : 'reel'}/${ig[2]}/embed`, vertical: true };
  const tk = h === 'tiktok.com' && /\/video\/(\d+)/.exec(u.pathname);
  if (tk) return { kind: 'tiktok', id: tk[1], src: `https://www.tiktok.com/embed/v2/${tk[1]}`, vertical: true };
  return null;
}
export const ytEmbed = (id: string, short = false): EmbedInfo => ({ kind: 'youtube', id, vertical: short,
  src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`, thumb: `https://i.ytimg.com/vi/${id}/${short ? 'oar2' : 'hqdefault'}.jpg` });

const LABEL = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok' };

/** Vignette (YouTube) ou cadre (Instagram, TikTok) ; le lecteur ne se charge qu'au toucher */
/** Lecture automatique permise sur cet appareil */
const autoOk = () => {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !c?.saveData && !matchMedia('(prefers-reduced-motion: reduce)').matches && document.documentElement.dataset.rm !== '1';
};
/** Vidéo en lecture automatique en ce moment (une seule) */
let current: string | null = null;
const subs = new Set<() => void>();
const setCurrent = (id: string | null) => { current = id; subs.forEach((f) => f()); };
const ytCmd = (f: HTMLIFrameElement | null, func: string) => f?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');

export function Embed({ e, title, auto }: { e: EmbedInfo; title?: string; auto?: boolean }) {
  const [on, setOn] = useState(false);
  // Son coupé si le lecteur a été ouvert par le défilement, actif si on l'a touché ; fixé à l'ouverture (pas de rechargement)
  const [muted, setMuted] = useState(false);
  const onRef = useRef(false);
  const mutedRef = useRef(false);
  const open = (byScroll: boolean) => { if (onRef.current) return; onRef.current = true; mutedRef.current = byScroll; setMuted(byScroll); setOn(true); };
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const key = `${e.kind}:${e.id}`;
  const canAuto = auto && e.kind === 'youtube';
  useEffect(() => {
    if (!canAuto || !box.current || !autoOk()) return;
    let timer = 0;
    const io = new IntersectionObserver(([x]) => {
      clearTimeout(timer);
      // Bien à l'écran un court instant (pas en passant vite) : elle démarre ; sinon elle s'arrête si c'était elle
      if (x.intersectionRatio >= 0.6) timer = window.setTimeout(() => setCurrent(key), 350);
      else if (current === key) setCurrent(null);
    }, { threshold: [0, 0.3, 0.6, 0.9] });
    io.observe(box.current);
    const f = () => {
      if (current === key) { open(true); ytCmd(frame.current, 'playVideo'); }
      // Quittée : lancée par le défilement → redevient une vignette (pas de lecteurs empilés) ; lancée au toucher → en pause
      else if (onRef.current && mutedRef.current) { onRef.current = false; setOn(false); }
      else ytCmd(frame.current, 'pauseVideo');
    };
    subs.add(f);
    return () => { clearTimeout(timer); io.disconnect(); subs.delete(f); if (current === key) current = null; };
  }, [canAuto, key]);
  const ratio = e.vertical ? '9/16' : '16/9';
  const src = canAuto ? `${e.src}&mute=${muted ? 1 : 0}&enablejsapi=1&origin=${encodeURIComponent(location.origin)}` : e.src;
  return (
    <div ref={box}>
      {on ? <div className="embed" style={{ aspectRatio: ratio, maxHeight: e.vertical ? 620 : undefined }}>
        <iframe ref={frame} src={src} title={title ?? LABEL[e.kind]} loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /></div>
      : <button className="embed" style={{ aspectRatio: ratio, maxHeight: e.vertical ? 620 : undefined, backgroundImage: e.thumb ? `url(${e.thumb})` : undefined }} onClick={() => { open(false); if (canAuto) setCurrent(key); }} aria-label={t('Lire la vidéo')}>
      <span className="play">▶</span><span className="src">{LABEL[e.kind]}</span>
    </button>}
    </div>
  );
}
