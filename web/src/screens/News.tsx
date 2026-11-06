// Actualités basket : Belgique, International, NBA. Visibles sans compte ; on renvoie toujours vers l'article original.
import { readerClick } from '../ui/NewsReader';
import { useState } from 'react';
import { loadNews, readable, type News } from '../lib/data';
import { Screen, Empty, Skeleton, ErrorBox, useAsync } from '../ui/kit';
import { ago } from '../lib/util';
import { t } from '../lib/i18n';
import { Ico, type IconName } from '../ui/icons';
import { SocialBar } from '../ui/Social';
import * as D from '../lib/db';
import { courtTheme } from '../lib/theme';

const CATS: [string, IconName | null, string][] = [['tout', null, 'Tout'], ['belgique', 'flag', 'Belgique'], ['regional', 'pin', 'Régional'], ['international', 'globe', 'International'], ['nba', 'ball', 'NBA']];

/** Image de l'article : affichée directement depuis le média (jamais copiée chez nous, sans référent pour éviter
 *  les blocages) ; si elle ne s'affiche pas, la carte passe en version texte. */
function useNewsImage(n: News) {
  const [failed, setFailed] = useState(false);
  return { src: n.image && !failed ? n.image : null, fail: () => setFailed(true) };
}
/** Visuel de repli (article sans image, ex. médias flamands qui refusent les robots) : terrain aux couleurs du média et son nom */
function CourtVisual({ n, ratio }: { n: News; ratio: string }) {
  // Même terrain que le fond de l'appli : parquet clair aux couleurs du club choisi (raquettes et rond central peints,
  // lignes blanches), parquet nuit en mode sombre ; sans club, bois naturel et raquettes à la couleur de l'appli
  const k = courtTheme();
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const floor = dark ? '#151a24' : k?.c1 ?? '#e2c38e', paint = dark ? 'rgba(255,255,255,.06)' : k?.c2 ?? 'color-mix(in srgb, var(--accent) 55%, #e2c38e)';
  const line = dark ? (k?.c1 ?? 'rgba(255,255,255,.35)') : '#fff';
  return (
    <div style={{ aspectRatio: ratio, width: '100%', display: 'block', position: 'relative', overflow: 'hidden', backgroundColor: floor,
      backgroundImage: 'repeating-linear-gradient(90deg, rgba(0,0,0,.035) 0 1px, transparent 1px 26px), repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 13px, transparent 13px 26px)' }}>
      {/* Terrain réglementaire vu de haut, jamais déformé */}
      <svg viewBox="0 0 940 500" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
        <g style={{ fill: paint }} stroke="none"><rect x="20" y="180" width="190" height="140" /><rect x="730" y="180" width="190" height="140" /><circle cx="470" cy="250" r="60" /></g>
        <g fill="none" stroke={line} strokeWidth="5">
          <rect x="20" y="20" width="900" height="460" rx="6" /><line x1="470" y1="20" x2="470" y2="480" /><circle cx="470" cy="250" r="60" />
          <path d="M20 90 H150 A160 160 0 0 1 150 410 H20" /><path d="M920 90 H790 A160 160 0 0 0 790 410 H920" />
          <rect x="20" y="180" width="190" height="140" /><rect x="730" y="180" width="190" height="140" />
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 6, color: '#fff', textAlign: 'center', padding: '0 16px' }}>
        <Ico n="ball" size={26} style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.35))' }} />
        <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 'clamp(20px, 6vw, 30px)', lineHeight: 1.05, textTransform: 'uppercase', letterSpacing: '.02em', textShadow: '0 2px 12px rgba(0,0,0,.45)' }}>{n.source}</span>
      </div>
    </div>
  );
}

/** list : les actus affichées autour (le lecteur intégré permet de passer de l'une à l'autre) */
export function NewsCard({ n, wide, list }: { n: News; wide?: boolean; list?: News[] }) {
  // Grande carte : réactions et commentaires sous l'article (le lien ouvre l'article chez le média)
  if (wide) return (
    <article className="card news">
      <NewsLink n={n} wide list={list} />
      <SocialBar k={D.newsThread(n.id)} title={n.title} />
    </article>
  );
  return <NewsLink n={n} list={list} />;
}
function NewsLink({ n, wide, list }: { n: News; wide?: boolean; list?: News[] }) {
  const onClick = readerClick(list ?? [n], n);
  const img = useNewsImage(n);
  const meta = <div className="hstack" style={{ gap: 6, fontSize: 12.5 }}><span className="pill" style={{ fontWeight: 700 }}>{n.source}</span><span className="muted">{ago(Math.min(Date.parse(n.date), Date.now()))}</span></div>;
  // Pas d'image : même carte que les autres, avec le visuel de repli (jamais de grand cadre vide)
  return (
    <a className={wide ? '' : 'card news'} href={n.url} target="_blank" rel="noopener" onClick={onClick} style={{ display: 'block', color: 'inherit', ...(wide ? {} : { width: 260, flex: 'none', marginBottom: 0 }) }}>
      {img.src ? <img src={img.src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={img.fail} style={{ aspectRatio: wide ? '16/8' : '16/9', width: '100%', display: 'block', objectFit: 'cover', background: '#0a0c12' }} />
        : <CourtVisual n={n} ratio={wide ? '16/8' : '16/9'} />}
      <div style={{ padding: '10px 14px 14px' }}>
        {meta}
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
      <div className="stories" style={{ gap: 12, padding: '2px 2px 10px' }}>{list.map((n) => <NewsCard key={n.id} n={n} list={list} />)}</div>
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
      {!data && !error ? <Skeleton h={240} n={3} /> : list.length === 0 ? <Empty ill="news" title={t('Pas d\'actualité pour le moment')} /> : <div className="news-grid">{list.map((n) => <NewsCard key={n.id} n={n} wide list={list} />)}</div>}
      {other > 0 && <button className="btn ghost small" style={{ margin: '0 auto 12px', display: 'flex' }} onClick={() => setAll(!all)}>{all ? t('Masquer les articles dans d’autres langues') : t('Voir aussi {n} articles dans d’autres langues', { n: other })}</button>}
      <p className="muted center" style={{ fontSize: 12.5 }}>{t('Titres et liens vers les articles des médias cités. Mis à jour deux fois par jour.')}</p>
    </Screen>
  );
}
