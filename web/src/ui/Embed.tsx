// Contenus des réseaux sociaux intégrés (YouTube, Instagram, TikTok) : lecteurs officiels en iframe, chargés au toucher.
import { useState } from 'react';
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
export function Embed({ e, title }: { e: EmbedInfo; title?: string }) {
  const [on, setOn] = useState(false);
  const ratio = e.vertical ? '9/16' : '16/9';
  if (on) return <div className="embed" style={{ aspectRatio: ratio, maxHeight: e.vertical ? 620 : undefined }}>
    <iframe src={e.src} title={title ?? LABEL[e.kind]} loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /></div>;
  return (
    <button className="embed" style={{ aspectRatio: ratio, maxHeight: e.vertical ? 620 : undefined, backgroundImage: e.thumb ? `url(${e.thumb})` : undefined }} onClick={() => setOn(true)} aria-label={t('Lire la vidéo')}>
      <span className="play">▶</span><span className="src">{LABEL[e.kind]}</span>
    </button>
  );
}
