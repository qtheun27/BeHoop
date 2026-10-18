// Actualités basket : Belgique, International, NBA. Visibles sans compte ; on renvoie toujours vers l'article original.
import { useState } from 'react';
import { loadNews, type News } from '../lib/data';
import { Screen, Empty, Skeleton, ErrorBox, useAsync } from '../ui/kit';
import { ago } from '../lib/util';

const CATS: [string, string][] = [['tout', 'Tout'], ['belgique', '🇧🇪 Belgique'], ['international', '🌍 International'], ['nba', '🏀 NBA']];
const tint = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return `linear-gradient(135deg, hsl(${h} 55% 32%), hsl(${(h + 40) % 360} 60% 22%))`; };

export function NewsCard({ n, wide }: { n: News; wide?: boolean }) {
  return (
    <a className="card news" href={n.url} target="_blank" rel="noopener" style={{ display: 'block', color: 'inherit', ...(wide ? {} : { width: 260, flex: 'none', marginBottom: 0 }) }}>
      <div style={{ aspectRatio: wide ? '16/8' : '16/9', background: n.image ? `#0a0c12 center/cover url("${n.image}")` : tint(n.source), display: 'grid', placeItems: 'center', color: '#fff', fontFamily: 'Anton', fontSize: 26, letterSpacing: '.03em' }}>
        {!n.image && n.source.toUpperCase()}
      </div>
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
