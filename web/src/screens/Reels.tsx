// « Highlights » : les vidéos en plein écran, une par écran, façon TikTok. On glisse vers le haut pour la suivante : elle
// se cale et démarre tout de suite (pas d'attente de fin de défilement). Le lecteur de la suivante est préparé à l'avance.
// Son coupé au départ (règle des navigateurs) ; le bouton son vaut pour toutes les vidéos suivantes.
// Vidéos des chaînes (news.json) et vidéos YouTube partagées dans les publications ; photos des équipes en plein écran.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t, lang } from '../lib/i18n';
import { ago, haptic } from '../lib/util';
import { Ico } from '../ui/icons';
import { ytEmbed } from '../ui/Embed';
import type { Video } from '../lib/data';

export type Reel =
  | { kind: 'yt'; key: string; id: string; short: boolean; title: string; by: string; date: number; subs?: string }
  | { kind: 'photo'; key: string; src: string; title: string; by: string; date: number; href: string };

/** Vidéo d'une chaîne → élément du fil plein écran (titre dans la langue de l'appli, sous-titres si autre langue) */
export function reelOfVideo(v: Video): Reel {
  const l = lang();
  return { kind: 'yt', key: `v${v.id}`, id: v.id, short: v.short, by: v.channel, date: Date.parse(v.date),
    title: ((l === 'fr' || l === 'nl') && v.titles?.[l]) || v.title, subs: v.lang && v.lang !== l ? l : undefined };
}

const cmd = (f: HTMLIFrameElement | null | undefined, func: string, args: unknown[] = []) =>
  f?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');

export function Reels({ items, onClose }: { items: Reel[]; onClose: () => void }) {
  const [cur, setCur] = useState(0);
  const [muted, setMuted] = useState(true);
  const frames = useRef(new Map<number, HTMLIFrameElement>());
  const list = useRef<HTMLDivElement>(null);
  // Page derrière figée, Échap pour fermer
  useEffect(() => {
    const b = document.body.style, y = scrollY;
    Object.assign(b, { position: 'fixed', top: `-${y}px`, left: '0', right: '0', overflow: 'hidden' });
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowDown') go(1); if (e.key === 'ArrowUp') go(-1); };
    addEventListener('keydown', k);
    return () => { removeEventListener('keydown', k); Object.assign(b, { position: '', top: '', left: '', right: '', overflow: '' }); scrollTo(0, y); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // L'élément calé à l'écran devient l'élément courant dès qu'il est majoritairement visible (pendant le glissement)
  useEffect(() => {
    const root = list.current; if (!root) return;
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) setCur(Number((e.target as HTMLElement).dataset.i)); }, { root, threshold: 0.6 });
    root.querySelectorAll('[data-i]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length]);
  // Lecture : la vidéo courante joue (avec le son si on l'a activé), les autres sont en pause
  useEffect(() => {
    frames.current.forEach((f, i) => {
      if (i === cur) { cmd(f, muted ? 'mute' : 'unMute'); cmd(f, 'playVideo'); } else cmd(f, 'pauseVideo');
    });
  }, [cur, muted]);
  const go = (d: number) => list.current?.scrollBy({ top: d * list.current.clientHeight, behavior: 'smooth' });
  const ready = (i: number) => { const f = frames.current.get(i); if (i === cur) { cmd(f, muted ? 'mute' : 'unMute'); cmd(f, 'playVideo'); } };

  // Directement sur la page (portail) : par-dessus tout l'écran, jamais limité par l'écran de la Tribune qui le contient
  return createPortal(
    <div className="reels" role="dialog" aria-label={t('Highlights')}>
      <div className="reels-top">
        <button className="reels-btn" onClick={onClose} aria-label={t('Fermer')}><Ico n="close" size={22} /></button>
        <b>{t('Highlights')}</b>
        <button className="reels-btn" onClick={() => { haptic(); setMuted(!muted); }} aria-label={muted ? t('Activer le son') : t('Couper le son')}>
          <span aria-hidden style={{ fontSize: 18 }}>{muted ? '🔇' : '🔊'}</span>
        </button>
      </div>
      <div className="reels-list" ref={list}>
        {items.map((r, i) => (
          <section key={r.key} className="reel" data-i={i}>
            <div className="reel-stage">
            {r.kind === 'yt' ? (
              <div className={`reel-media${r.short ? ' short' : ''}`}>
                {/* Lecteurs montés autour de la vidéo courante seulement (la suivante est déjà prête) */}
                {Math.abs(i - cur) <= 1 ? (
                  <iframe ref={(f) => { if (f) frames.current.set(i, f); else frames.current.delete(i); }} onLoad={() => ready(i)}
                    src={`${ytEmbed(r.id, r.short, r.subs).src.replace('autoplay=1', `autoplay=${i === cur ? 1 : 0}`)}&mute=1&enablejsapi=1&controls=1&origin=${encodeURIComponent(location.origin)}`}
                    title={r.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
                ) : <img src={`https://i.ytimg.com/vi/${r.id}/${r.short ? 'oar2' : 'hqdefault'}.jpg`} alt="" loading="lazy" />}
              </div>
            ) : (
              <a className="reel-media photo" href={r.href}><img src={r.src} alt="" loading="lazy" /></a>
            )}
            </div>
            <div className="reel-info">
              <b>{r.by}</b><span> · {ago(r.date)}</span>
              <p>{r.title}</p>
            </div>
          </section>
        ))}
        {!items.length && <section className="reel"><p className="reel-empty">{t('Pas encore de vidéo ici.')}</p></section>}
      </div>
    </div>,
    document.body,
  );
}
