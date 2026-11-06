// « Highlights » : les vidéos en plein écran, une par écran, façon TikTok. On glisse vers le haut pour la suivante : elle
// se cale et démarre tout de suite (pas d'attente de fin de défilement).
// Un seul lecteur YouTube, déplacé d'une vidéo à l'autre : l'iPhone accorde le son à un lecteur (après un toucher), pas à
// l'appli — un lecteur par vidéo redemanderait le son à chaque fois. Pendant le chargement on voit l'image de la vidéo,
// la vidéo apparaît en fondu dès qu'elle joue (pas d'écran noir ni de bouton de lecture YouTube).
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
  // pastille invite à toucher (ce toucher, lui, autorise le son, et pour toutes les vidéos suivantes)
  const [sound, setSound] = useState(false);
  const [needTap, setNeedTap] = useState(false);
  const [paused, setPaused] = useState(false);
  const [shown, setShown] = useState(false); // la vidéo courante joue → le lecteur apparaît par-dessus son image
  const frame = useRef<HTMLIFrameElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const ok = useRef(false); // lecteur prêt à recevoir des commandes
  const loaded = useRef(''); // vidéo dans le lecteur
  const fresh = useRef(false); // vidéo qui vient d'être chargée : on attend qu'elle démarre vraiment avant de la montrer
  const st = useRef(-1);
  const curRef = useRef(0); curRef.current = cur;
  const soundRef = useRef(false); soundRef.current = sound;
  const first = items.find((r) => r.kind === 'yt') as Extract<Reel, { kind: 'yt' }> | undefined;
  const item = items[cur];
  const yt = item?.kind === 'yt' ? item : undefined;
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
  const c = (func: string, args: unknown[] = []) => cmd(frame.current, func, args);
  /** Joue la vidéo courante dans le lecteur unique (chargée si besoin), avec le son si on l'a voulu */
  const play = () => {
    const r = items[curRef.current]; if (!ok.current) return;
    if (r?.kind !== 'yt') { c('pauseVideo'); return; }
    if (loaded.current !== r.id) {
      loaded.current = r.id; fresh.current = true; setShown(false);
      c('loadVideoById', [{ videoId: r.id, startSeconds: 0 }]);
      if (r.subs) { c('loadModule', ['captions']); c('setOption', ['captions', 'track', { languageCode: r.subs }]); } else c('unloadModule', ['captions']);
    } else c('playVideo');
    if (soundRef.current) {
      c('unMute');
      // L'iPhone a refusé le son (lecteur pas encore touché) : la vidéo reste arrêtée → on la relance sans le son et on
      // le demande. Une vidéo qui charge encore (3) n'est pas un refus : on revérifie un peu plus tard.
      const id = r.id; let n = 0;
      const check = () => {
        if (loaded.current !== id || curRef.current !== items.indexOf(r) || st.current === 1) return;
        if (st.current === 3 && ++n < 4) { setTimeout(check, 800); return; }
        c('mute'); c('playVideo'); setNeedTap(true);
      };
      setTimeout(check, 1200);
    } else c('mute');
  };
  useEffect(() => { setPaused(false); play(); }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps
  // Écoute du lecteur : il apparaît quand la nouvelle vidéo joue vraiment ; fin de vidéo → elle reprend (boucle)
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      let d: YtMsg; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
      const s = typeof d.info === 'number' ? (d.event === 'onStateChange' ? d.info : undefined) : d.info?.playerState;
      if (d.event === 'onReady' && !ok.current) { ok.current = true; play(); return; }
      if (typeof s !== 'number' || s === st.current) return;
      st.current = s;
      if (s !== 1) fresh.current = false; // l'état « lecture » d'avant le chargement ne compte pas
      if (s === 1 && !fresh.current) setShown(true);
      if (s === 0) { c('seekTo', [0, true]); c('playVideo'); }
    };
    addEventListener('message', on); return () => removeEventListener('message', on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (d: number) => list.current?.scrollBy({ top: d * list.current.clientHeight, behavior: 'smooth' });
  /** Page du lecteur chargée : on s'abonne à ses événements (répété jusqu'à ce qu'il réponde) ; la vidéo courante
   *  démarre à son signal « prêt » (une commande envoyée avant serait perdue) */
  const ready = () => {
    const hi = () => { if (ok.current) return; frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); setTimeout(hi, 250); };
    hi();
  };
  const toggleSound = () => {
    haptic(); const next = !sound; setSound(next); setNeedTap(false);
    if (next) { c('unMute'); c('playVideo'); } else c('mute');
  };
  // Toucher la vidéo : le son si l'iPhone l'attendait, sinon pause / lecture
  const tap = () => {
    if (needTap) { setNeedTap(false); setSound(true); c('unMute'); c('playVideo'); return; }
    if (paused) { c('playVideo'); setPaused(false); } else { c('pauseVideo'); setPaused(true); }
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
        {/* Le lecteur unique, posé sur l'élément courant (il défile avec lui) ; sans les commandes YouTube (toucher =
            pause, bouton son en haut) */}
        {first && (
          <div className={`reel-player${shown && yt ? ' on' : ''}`} style={{ top: `${cur * 100}%` }} aria-hidden={!yt}>
            <div className="reel-stage">
              <div className={`reel-media${(yt ?? first).short ? ' short' : ''}`}>
                <iframe ref={frame} onLoad={ready} title={(yt ?? first).title} tabIndex={-1} allow="autoplay; encrypted-media; picture-in-picture"
                  src={`${ytEmbed(first.id, first.short).src.replace('autoplay=1', 'autoplay=0')}&mute=1&playsinline=1&enablejsapi=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&origin=${encodeURIComponent(location.origin)}`} />
              </div>
            </div>
          </div>
        )}
        {items.map((r, i) => (
          <section key={r.key} className="reel" data-i={i}>
            {/* Fond : l'image de la vidéo, floutée, sur tout l'écran (une vidéo en paysage reste entière au centre) */}
            {r.kind === 'yt' && <div className="reel-bg" style={{ backgroundImage: `url(https://i.ytimg.com/vi/${r.id}/hqdefault.jpg)` }} aria-hidden />}
            <div className="reel-stage">
            {r.kind === 'yt' ? (
              // L'image de la vidéo, visible tant que le lecteur ne joue pas encore cette vidéo
              <div className={`reel-media${r.short ? ' short' : ''}`}>
                <img src={`https://i.ytimg.com/vi/${r.id}/${r.short ? 'oar2' : 'hqdefault'}.jpg`} alt="" loading={Math.abs(i - cur) <= 2 ? 'eager' : 'lazy'} />
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
