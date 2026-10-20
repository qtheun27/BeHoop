// Actualités basket : Belgique, International, NBA. Visibles sans compte ; on renvoie toujours vers l'article original.
import { useState } from 'react';
import { loadNews, readable, type News } from '../lib/data';
import { Screen, Empty, Skeleton, ErrorBox, useAsync } from '../ui/kit';
import { ago } from '../lib/util';
import { t } from '../lib/i18n';
import { Ico, type IconName } from '../ui/icons';
import { SocialBar } from '../ui/Social';
import * as D from '../lib/db';

const CATS: [string, IconName | null, string][] = [['tout', null, 'Tout'], ['belgique', 'flag', 'Belgique'], ['regional', 'pin', 'Régional'], ['international', 'globe', 'International'], ['nba', 'ball', 'NBA']];
const tint = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return `linear-gradient(135deg, hsl(${h} 55% 32%), hsl(${(h + 40) % 360} 60% 22%))`; };

/** Image de l'article ; si le média n'en fournit pas (ou bloque son affichage), visuel « demi-terrain » aux couleurs de la source. */
function NewsVisual({ n, ratio }: { n: News; ratio: string }) {
  const [broken, setBroken] = useState(false);
  const box = { aspectRatio: ratio, width: '100%', display: 'block' } as const;
  if (n.image && !broken) return <img src={n.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ ...box, objectFit: 'cover', background: '#0a0c12' }} />;
  return (
    <div style={{ ...box, position: 'relative', overflow: 'hidden', background: tint(n.source) }}>
      <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
        <g fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="2.5">
          <rect x="-4" y="-4" width="328" height="168" /><line x1="160" y1="-4" x2="160" y2="164" /><circle cx="160" cy="80" r="34" />
          <rect x="-4" y="48" width="70" height="64" /><circle cx="66" cy="80" r="22" /><path d="M-4 18 H40 A82 82 0 0 1 40 142 H-4" />
          <rect x="254" y="48" width="70" height="64" /><circle cx="254" cy="80" r="22" /><path d="M324 18 H280 A82 82 0 0 0 280 142 H324" />
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', color: '#fff', padding: 12 }}>
        <div><Ico n="ball" size={42} style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,.35))' }} />
          <div style={{ fontFamily: 'Anton', fontSize: 22, letterSpacing: '.04em', marginTop: 8, textShadow: '0 2px 8px rgba(0,0,0,.35)' }}>{n.source.toUpperCase()}</div></div>
      </div>
    </div>
  );
}

export function NewsCard({ n, wide }: { n: News; wide?: boolean }) {
  // Grande carte : réactions et commentaires sous l'article (le lien ouvre l'article chez le média)
  if (wide) return (
    <article className="card news">
      <NewsLink n={n} wide />
      <SocialBar k={D.newsThread(n.id)} title={n.title} />
    </article>
  );
  return <NewsLink n={n} />;
}
function NewsLink({ n, wide }: { n: News; wide?: boolean }) {
  return (
    <a className={wide ? '' : 'card news'} href={n.url} target="_blank" rel="noopener" style={{ display: 'block', color: 'inherit', ...(wide ? {} : { width: 260, flex: 'none', marginBottom: 0 }) }}>
      <NewsVisual n={n} ratio={wide ? '16/8' : '16/9'} />
      <div style={{ padding: '10px 14px 14px' }}>
        <div className="hstack" style={{ gap: 6, fontSize: 12.5 }}><span className="pill" style={{ fontWeight: 700 }}>{n.source}</span><span className="muted">{ago(Date.parse(n.date))}</span></div>
        <div style={{ fontWeight: 700, fontSize: wide ? 18 : 15.5, lineHeight: 1.25, marginTop: 6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.title}</div>
        {wide && n.excerpt && <div className="muted" style={{ fontSize: 14.5, marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.excerpt}</div>}
      </div>
    </a>
  );
}

/** « À la une » : les grandes actus du basket, pour tout le monde, dans sa langue (pas le régional ; 2 par média au plus). */
export function topStories(items: News[], max = 8) {
  const per = new Map<string, number>();
  return items.filter((n) => readable(n) && n.cat !== 'regional' && n.image && Date.parse(n.date) > Date.now() - 4 * 864e5)
    .filter((n) => { const k = per.get(n.source) ?? 0; per.set(n.source, k + 1); return k < 2; }).slice(0, max);
}
export function NewsCarousel() {
  const { data } = useAsync(loadNews, []);
  const list = topStories(data?.items ?? []);
  if (!list.length) return null;
  return (
    <section className="top-carousel" style={{ marginBottom: 18 }}>
      <div className="hstack" style={{ justifyContent: 'space-between', margin: '0 4px 8px' }}>
        <div className="group-title" style={{ margin: 0 }}><><Ico n="news" />{t('À la une')}</></div><a href="#/actus" style={{ fontWeight: 600, fontSize: 15 }}>{t('Toutes les actus ›')}</a>
      </div>
      <div className="stories" style={{ gap: 12, padding: '2px 2px 10px' }}>{list.map((n) => <NewsCard key={n.id} n={n} />)}</div>
    </section>
  );
}

export function NewsPage() {
  const [cat, setCat] = useState('tout');
  const [all, setAll] = useState(false);
  const { data, error, reload } = useAsync(loadNews, []);
  const inCat = (data?.items ?? []).filter((n) => cat === 'tout' || n.cat === cat);
  // Articles d'une autre langue, pas encore traduits : masqués, sauf si on demande à les voir
  const other = inCat.filter((n) => !readable(n)).length;
  const list = all ? inCat : inCat.filter(readable);
  return (
    <Screen title={t('Actus')}>
      <div className="chips">{CATS.map(([k, ic, l]) => <button key={k} className={`chip${cat === k ? ' on' : ''}`} onClick={() => setCat(k)} aria-pressed={cat === k}>{ic && <Ico n={ic} />}{t(l)}</button>)}</div>
      {error && <ErrorBox msg={error} retry={reload} />}
      {!data && !error ? <Skeleton h={240} n={3} /> : list.length === 0 ? <Empty ill="news" title={t('Pas d\'actualité pour le moment')} /> : <div className="news-grid">{list.map((n) => <NewsCard key={n.id} n={n} wide />)}</div>}
      {other > 0 && <button className="btn ghost small" style={{ margin: '0 auto 12px', display: 'flex' }} onClick={() => setAll(!all)}>{all ? t('Masquer les articles dans d’autres langues') : t('Voir aussi {n} articles dans d’autres langues', { n: other })}</button>}
      <p className="muted center" style={{ fontSize: 12.5 }}>{t('Titres et liens vers les articles des médias cités. Mis à jour deux fois par jour.')}</p>
    </Screen>
  );
}
