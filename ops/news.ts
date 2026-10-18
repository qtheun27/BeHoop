// Actualités basket → app-data/news.json (lancé par update.yml après build-app-data, étape non bloquante).
// Droits d'auteur : on ne garde que le titre, une courte accroche (≤ 200 caractères), la source, l'image d'aperçu
// fournie par le flux et le lien vers l'article original. Jamais le texte complet.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';

export type Cat = 'belgique' | 'international' | 'nba';
export interface News { id: string; title: string; excerpt: string; url: string; source: string; image: string | null; date: string; cat: Cat }

const GN = 'https://news.google.com/rss/search?';
const FEEDS: { source: string; url: string; cat: Cat | 'auto'; keep?: (link: string, text: string) => boolean; google?: boolean }[] = [
  // Google Actualités (flux public) : basket belge, Belgian Cats et Lions, en français et en néerlandais — la source réelle est indiquée
  { source: 'Google Actualités', google: true, cat: 'belgique', url: `${GN}q=basket+(Belgique+OR+BNXT+OR+%22Belgian+Cats%22+OR+%22Belgian+Lions%22)&hl=fr&gl=BE&ceid=BE:fr` },
  { source: 'Google Actualités', google: true, cat: 'belgique', url: `${GN}q=basketbal+(BNXT+OR+%22Belgian+Cats%22+OR+%22Belgian+Lions%22+OR+Giants+OR+Oostende)&hl=nl&gl=BE&ceid=BE:nl` },
  { source: 'DH Les Sports+', url: 'https://www.dhnet.be/arc/outboundfeeds/rss/section/sports/?outputType=xml', cat: 'auto', keep: (l) => /\/sports\/basket\//.test(l) },
  { source: 'RTBF Sport', url: 'https://rss.rtbf.be/article/rss/highlight_rtbf_sport.xml', cat: 'auto', keep: (l, t) => /basket/i.test(l + t) },
  { source: 'Sporza', url: 'https://sporza.be/nl.rss.xml', cat: 'auto', keep: (l, t) => /basket/i.test(l + t) },
  { source: 'BasketUSA', url: 'https://www.basketusa.com/feed/', cat: 'auto' },
  { source: 'Basketsession', url: 'https://www.basketsession.com/feed/', cat: 'auto' },
  { source: 'ESPN', url: 'https://www.espn.com/espn/rss/nba/news', cat: 'nba' },
];
const INTER = /fiba|eurobasket|euroleague|euroligue|eurocup|belgian (cats|lions)|\bcats\b|\blions\b|mondial|coupe du monde|world cup|jeux olympiques|\bjo\b|équipe de france|bleus|bleues/i;
const NBA = /\bnba\b|wnba|lakers|celtics|warriors|knicks|bulls|spurs|wembanyama|lebron|curry|playoffs|draft/i;
const BE = /bnxt|\bbelg|belgique|belgië|pro basketball league|top division|coupe de belgique|beker van belgi|\bawbb\b|basketbal vlaanderen/i;

const unxml = (s = '') => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();
const cut = (s: string, n = 200) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n - 1) > 80 ? s.lastIndexOf(' ', n - 1) : n - 1) + '…');
const tag = (it: string, name: string) => new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(it)?.[1] ?? '';
export function hashId(s: string) { let h = 0x811c9dc5; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }

/** Classe un article : international > NBA > Belgique (le flux d'origine sert de repli). */
export function classify(text: string, fallback: Cat | 'auto', source: string): Cat {
  // « WK »/« EK » (Coupe du monde / Championnat d'Europe en néerlandais) : en majuscules et mot entier seulement
  if (INTER.test(text) || /\b(WK|EK)\b/.test(text)) return 'international';
  if (NBA.test(text)) return 'nba';
  if (BE.test(text)) return 'belgique';
  if (fallback !== 'auto') return fallback;
  return /BasketUSA|Basketsession|ESPN/.test(source) ? 'nba' : 'belgique';
}

export function parseFeed(xml: string, f: (typeof FEEDS)[number]): News[] {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(([it]) => {
    const url = unxml(tag(it, 'link')) || (/<link[^>]+href="([^"]+)"/.exec(it)?.[1] ?? '');
    const title = unxml(tag(it, 'title'));
    const excerpt = cut(unxml(tag(it, 'description')));
    const image = /<media:(?:content|thumbnail)[^>]+url="([^"]+)"/i.exec(it)?.[1] ?? /<enclosure[^>]+url="([^"]+)"[^>]*type="image/i.exec(it)?.[1] ?? null;
    const date = new Date(unxml(tag(it, 'pubDate')) || unxml(tag(it, 'dc:date')) || Date.now()).toISOString();
    const cats = [...it.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map((m) => unxml(m[1])).join(' ');
    // Google Actualités : « Titre - Média » → titre + vraie source ; pas d'accroche (le flux ne contient que des liens)
    const gsrc = f.google ? unxml(tag(it, 'source')) : '';
    const gtitle = f.google && gsrc ? title.replace(new RegExp(`\\s+-\\s+${gsrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '') : title;
    return { url, title: gtitle, excerpt: f.google ? '' : excerpt, image, date, cats, src: gsrc };
  }).filter((x) => x.url && x.title && (!f.keep || f.keep(x.url, `${x.title} ${x.cats}`)))
    .filter((x) => Date.parse(x.date) > Date.now() - 21 * 864e5).slice(0, 40)
    .map((x) => ({ id: hashId(f.google ? `${x.src}|${x.title}` : x.url), title: x.title, excerpt: x.excerpt, url: x.url, source: x.src || f.source, image: x.image, date: x.date,
      cat: classify(`${x.title} ${x.excerpt} ${x.cats} ${x.url}`, f.cat, f.source) }));
}

async function bnxtNews(): Promise<News[]> {
  const r = await fetch('https://bnxt.sportpress.info/api/v1/article/list?page=1', { headers: { 'X-Authorization': 'BWSyE7sgg9QAurh2JX9cpjzjGc652BWLuNUS', 'X-Localization': 'fr' }, signal: AbortSignal.timeout(20_000) });
  const d = (await r.json()).data ?? [];
  return d.map((a: any) => ({ id: hashId(`bnxt-${a.id}`), title: a.title, excerpt: cut(unxml(a.lead ?? '')), url: `https://bnxtleague.com/fr/newsvideo/${a.slug}`,
    source: 'BNXT League', image: a.cover_image?.thumbnails?.medium ?? a.cover_image?.public_url ?? null, date: new Date(a.publish_date ?? a.created_at).toISOString(), cat: 'belgique' as Cat }));
}

export async function run(out = 'app-data/news.json') {
  const prev: News[] = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')).items ?? [] : [];
  const all: News[] = [];
  for (const f of FEEDS) {
    try {
      const r = await fetch(f.url, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/rss+xml, application/xml' } });
      if (!r.ok) throw new Error(`${r.status}`);
      const items = parseFeed(await r.text(), f); all.push(...items); console.log(`${f.source} : ${items.length}`);
    } catch (e) { console.error(`${f.source} indisponible (${(e as Error).message})`); }
  }
  try { const b = await bnxtNews(); all.push(...b); console.log(`BNXT League : ${b.length}`); } catch (e) { console.error('BNXT indisponible', (e as Error).message); }
  // On garde aussi les articles récents déjà connus (si une source est momentanément en panne)
  const since = Date.now() - 21 * 864e5;
  const byId = new Map<string, News>();
  for (const n of [...all, ...prev]) if (!byId.has(n.id) && Date.parse(n.date) > since) byId.set(n.id, n);
  const items = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 150);
  mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), items }));
  console.log(`news.json : ${items.length} articles (${['belgique', 'international', 'nba'].map((c) => `${c} ${items.filter((i) => i.cat === c).length}`).join(', ')})`);
}
if (import.meta.url === `file://${process.argv[1]}`) run().catch((e) => { console.error(e); process.exit(1); });
