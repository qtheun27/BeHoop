// Actualités basket : Belgique, International, NBA. Visibles sans compte ; on renvoie toujours vers l'article original.
import { useState } from 'react';
import { loadNews, type News } from '../lib/data';
import { Screen, Empty, Skeleton, ErrorBox, useAsync } from '../ui/kit';
import { ago } from '../lib/util';

const CATS: [string, string][] = [['tout', 'Tout'], ['belgique', '🇧🇪 Belgique'], ['international', '🌍 International'], ['nba', '🏀 NBA']];
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
        <div><div style={{ fontSize: 40, lineHeight: 1, filter: 'drop-shadow(0 4px 10px rgba(0,0,0,.35))' }}>🏀</div>
          <div style={{ fontFamily: 'Anton', fontSize: 22, letterSpacing: '.04em', marginTop: 8, textShadow: '0 2px 8px rgba(0,0,0,.35)' }}>{n.source.toUpperCase()}</div></div>
      </div>
    </div>
  );
}

export function NewsCard({ n, wide }: { n: News; wide?: boolean }) {
  return (
    <a className="card news" href={n.url} target="_blank" rel="noopener" style={{ display: 'block', color: 'inherit', ...(wide ? {} : { width: 260, flex: 'none', marginBottom: 0 }) }}>
      <NewsVisual n={n} ratio={wide ? '16/8' : '16/9'} />
      <div style={{ padding: '10px 14px 14px' }}>
        <div className="hstack" style={{ gap: 6, fontSize: 12.5 }}><span className="pill" style={{ fontWeight: 700 }}>{n.source}</span><span className="muted">{ago(Date.parse(n.date))}</span></div>
        <div style={{ fontWeight: 700, fontSize: wide ? 18 : 15.5, lineHeight: 1.25, marginTop: 6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.title}</div>
        {wide && n.excerpt && <div className="muted" style={{ fontSize: 14.5, marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.excerpt}</div>}
      </div>
    </a>
  );
}

/** Carrousel « À la une » (Explorer, Fil). */
export function NewsCarousel({ cat }: { cat?: News['cat'] }) {
  const { data } = useAsync(loadNews, []);
  const list = (data?.items ?? []).filter((n) => !cat || n.cat === cat).slice(0, 8);
  if (!list.length) return null;
  return (
    <section style={{ marginBottom: 18 }}>
      <div className="hstack" style={{ justifyContent: 'space-between', margin: '0 4px 8px' }}>
        <div className="group-title" style={{ margin: 0 }}>📰 À la une</div><a href="#/actus" style={{ fontWeight: 600, fontSize: 15 }}>Toutes les actus ›</a>
      </div>
      <div className="stories" style={{ gap: 12, padding: '2px 2px 10px' }}>{list.map((n) => <NewsCard key={n.id} n={n} />)}</div>
    </section>
  );
}

export function NewsPage() {
  const [cat, setCat] = useState('tout');
  const { data, error, reload } = useAsync(loadNews, []);
  const list = (data?.items ?? []).filter((n) => cat === 'tout' || n.cat === cat);
  return (
    <Screen title="Actus">
      <div className="chips">{CATS.map(([k, l]) => <button key={k} className={`chip${cat === k ? ' on' : ''}`} onClick={() => setCat(k)} aria-pressed={cat === k}>{l}</button>)}</div>
      {error && <ErrorBox msg={error} retry={reload} />}
      {!data && !error ? <Skeleton h={240} n={3} /> : list.length === 0 ? <Empty ill="📰" title="Pas d'actualité pour le moment" /> : list.map((n) => <NewsCard key={n.id} n={n} wide />)}
      <p className="muted center" style={{ fontSize: 12.5 }}>Titres et liens vers les articles des médias cités. Mis à jour deux fois par jour.</p>
    </Screen>
  );
}
