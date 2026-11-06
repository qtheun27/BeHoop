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

/** État du lecteur YouTube (événements « onStateChange » / « infoDelivery » renvoyés par l'iframe) : 1 lecture, 2 pause */
type YtMsg = { event?: string; info?: number | { playerState?: number; muted?: boolean } };

export function Reels({ items, onClose }: { items: Reel[]; onClose: () => void }) {
  const [cur, setCur] = useState(0);
  // Son voulu par l'utilisateur ; needTap : l'iPhone a refusé le son sans toucher → la vidéo joue sans le son, une
  // pastille invite à toucher (ce toucher, lui, autorise le son)
  const [sound, setSound] = useState(false);
  const [needTap, setNeedTap] = useState(false);
  const [paused, setPaused] = useState(false);
  const frames = useRef(new Map<number, HTMLIFrameElement>());
  const state = useRef(new Map<number, number>());
  const list = useRef<HTMLDivElement>(null);
  const curRef = useRef(0); curRef.current = cur;
  const soundRef = useRef(false); soundRef.current = sound;
  // Page derrière figée et en noir (rien de clair autour de l'écran, même sous les zones de l'iPhone), Échap pour fermer
  useEffect(() => {
    const b = document.body.style, y = scrollY, html = document.documentElement;
    Object.assign(b, { position: 'fixed', top: `-${y}px`, left: '0', right: '0', overflow: 'hidden' });
    html.classList.add('reels-open');
    const meta = document.querySelector('meta[name="theme-color"]:not([media])'); const was = meta?.getAttribute('content');
    meta?.setAttribute('content', '#000000');
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowDown') go(1); if (e.key === 'ArrowUp') go(-1); };
    addEventListener('keydown', k);
    return () => {
      removeEventListener('keydown', k); html.classList.remove('reels-open'); if (was) meta?.setAttribute('content', was);
      Object.assign(b, { position: '', top: '', left: '', right: '', overflow: '' }); scrollTo(0, y);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // L'élément calé à l'écran devient l'élément courant dès qu'il est majoritairement visible (pendant le glissement)
  useEffect(() => {
    const root = list.current; if (!root) return;
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) setCur(Number((e.target as HTMLElement).dataset.i)); }, { root, threshold: 0.6 });
    root.querySelectorAll('[data-i]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length]);
  // Lecture toujours lancée sans le son (autorisé partout) ; puis le son si on l'a voulu. Si le téléphone met la vidéo en
  // pause à cause du son (iPhone, pas de toucher), on la relance sans le son et on affiche la pastille.
  const start = (i: number) => {
    const f = frames.current.get(i); if (!f) return;
    cmd(f, 'mute'); cmd(f, 'playVideo');
    if (soundRef.current) {
      setTimeout(() => {
        if (curRef.current !== i) return;
        cmd(f, 'unMute');
        setTimeout(() => { if (curRef.current === i && state.current.get(i) !== 1) { cmd(f, 'mute'); cmd(f, 'playVideo'); setNeedTap(true); } }, 900);
      }, 400);
    }
  };
  useEffect(() => {
    setPaused(false);
    frames.current.forEach((f, i) => { if (i !== cur) cmd(f, 'pauseVideo'); });
    start(cur);
  }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps
  // Écoute des lecteurs (état de lecture)
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname)) return;
      let d: YtMsg; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
      const i = [...frames.current].find(([, f]) => f.contentWindow === e.source)?.[0]; if (i === undefined) return;
      const st = typeof d.info === 'number' ? (d.event === 'onStateChange' ? d.info : undefined) : d.info?.playerState;
      if (typeof st === 'number') state.current.set(i, st);
    };
    addEventListener('message', on); return () => removeEventListener('message', on);
  }, []);
  const go = (d: number) => list.current?.scrollBy({ top: d * list.current.clientHeight, behavior: 'smooth' });
  /** Lecteur chargé : on s'abonne à ses événements, puis il démarre s'il est l'élément courant */
  const ready = (i: number) => {
    const f = frames.current.get(i);
    f?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: i, channel: 'widget' }), '*');
    if (i === curRef.current) start(i);
  };
  const toggleSound = () => {
    haptic(); const next = !sound; setSound(next); setNeedTap(false);
    const f = frames.current.get(cur); if (next) { cmd(f, 'unMute'); cmd(f, 'playVideo'); } else cmd(f, 'mute');
  };
  // Toucher la vidéo : le son si l'iPhone l'attendait, sinon pause / lecture
  const tap = () => {
    const f = frames.current.get(cur);
    if (needTap) { setNeedTap(false); cmd(f, 'unMute'); cmd(f, 'playVideo'); return; }
    if (paused) { cmd(f, 'playVideo'); setPaused(false); } else { cmd(f, 'pauseVideo'); setPaused(true); }
  };

  // Directement sur la page (portail) : par-dessus tout l'écran, jamais limité par l'écran de la Tribune qui le contient
  return createPortal(
    <div className="reels" role="dialog" aria-label={t('Highlights')}>
      <div className="reels-top">
        <button className="reels-btn" onClick={onClose} aria-label={t('Fermer')}><Ico n="close" size={22} /></button>
        <b>{t('Highlights')}</b>
        <button className="reels-btn" onClick={toggleSound} aria-label={sound ? t('Couper le son') : t('Activer le son')}>
          <span aria-hidden style={{ fontSize: 18 }}>{sound ? '🔊' : '🔇'}</span>
        </button>
      </div>
      <div className="reels-list" ref={list}>
        {items.map((r, i) => (
          <section key={r.key} className="reel" data-i={i}>
            {/* Fond : l'image de la vidéo, floutée, sur tout l'écran (une vidéo en paysage reste entière au centre) */}
            {r.kind === 'yt' && <div className="reel-bg" style={{ backgroundImage: `url(https://i.ytimg.com/vi/${r.id}/hqdefault.jpg)` }} aria-hidden />}
            <div className="reel-stage">
            {r.kind === 'yt' ? (
              <div className={`reel-media${r.short ? ' short' : ''}`}>
                {/* Lecteurs montés autour de la vidéo courante seulement (la suivante est déjà prête) ; sans les commandes
                    YouTube (toucher = pause, bouton son en haut), comme un fil de vidéos */}
                {Math.abs(i - cur) <= 1 ? (
                  <iframe ref={(f) => { if (f) frames.current.set(i, f); else frames.current.delete(i); }} onLoad={() => ready(i)}
                    src={`${ytEmbed(r.id, r.short, r.subs).src.replace('autoplay=1', `autoplay=${i === cur ? 1 : 0}`)}&mute=1&enablejsapi=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&loop=1&playlist=${r.id}&origin=${encodeURIComponent(location.origin)}`}
                    title={r.title} allow="autoplay; encrypted-media; picture-in-picture" tabIndex={-1} />
                ) : <img src={`https://i.ytimg.com/vi/${r.id}/${r.short ? 'oar2' : 'hqdefault'}.jpg`} alt="" loading="lazy" />}
              </div>
            ) : (
              <a className="reel-media photo" href={r.href}><img src={r.src} alt="" loading="lazy" /></a>
            )}
            </div>
            {/* Couche de toucher par-dessus la vidéo (le glissement reste au fil) */}
            {r.kind === 'yt' && <button className="reel-tap" onClick={tap} aria-label={paused && i === cur ? t('Lire la vidéo') : t('Pause')}>
              {i === cur && needTap && <span className="reel-pill">🔊 {t('Touche pour le son')}</span>}
              {i === cur && paused && !needTap && <span className="reel-play" aria-hidden>▶</span>}
            </button>}
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
