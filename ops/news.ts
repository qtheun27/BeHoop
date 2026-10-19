// Actualités basket → app-data/news.json (lancé par update.yml après build-app-data, étape non bloquante).
// Droits d'auteur : on ne garde que le titre, une courte accroche (≤ 200 caractères), la source, l'image d'aperçu
// fournie par le flux et le lien vers l'article original. Jamais le texte complet.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';

export type Cat = 'belgique' | 'regional' | 'international' | 'nba';
export interface News { id: string; title: string; excerpt: string; url: string; source: string; image: string | null; date: string; cat: Cat; clubs?: number[] }

const GN = 'https://news.google.com/rss/search?';
const gq = (q: string, lang: 'fr' | 'nl') => `${GN}q=${q}+when:14d&hl=${lang}&gl=BE&ceid=BE:${lang}`;
const sites = (l: string[]) => `(${l.map((d) => `site:${d}`).join('+OR+')})`;
const isBasket = (l: string, t: string) => /basket/i.test(l + t);
const FEEDS: { source: string; url: string; cat: Cat | 'auto'; keep?: (link: string, text: string) => boolean; google?: boolean; max?: number; check?: boolean }[] = [
  // Google Actualités (flux public) : basket belge, Belgian Cats et Lions, en français et en néerlandais — la source réelle est indiquée
  { source: 'Google Actualités', google: true, cat: 'belgique', url: `${GN}q=basket+(Belgique+OR+BNXT+OR+%22Belgian+Cats%22+OR+%22Belgian+Lions%22)&hl=fr&gl=BE&ceid=BE:fr` },
  { source: 'Google Actualités', google: true, cat: 'belgique', url: `${GN}q=basketbal+(BNXT+OR+%22Belgian+Cats%22+OR+%22Belgian+Lions%22+OR+Giants+OR+Oostende)&hl=nl&gl=BE&ceid=BE:nl` },
  // Basket provincial et régional : presse régionale et télés locales, Wallonie-Bruxelles et Flandre
  { source: 'Google Actualités', google: true, cat: 'regional', max: 100, check: true, url: gq(`basket+${sites(['sudinfo.be', 'lavenir.net', 'dhnet.be'])}`, 'fr') },
  { source: 'Google Actualités', google: true, cat: 'regional', max: 100, check: true, url: gq(`basket+${sites(['telemb.be', 'antennecentre.tv', 'notele.be', 'tvlux.be', 'rtc.be'])}`, 'fr') },
  { source: 'Google Actualités', google: true, cat: 'regional', max: 100, check: true, url: gq(`basket+${sites(['canalzoom.be', 'matele.be', 'tvcom.be', 'bx1.be', 'canalc.be', 'vedia.be'])}`, 'fr') },
  { source: 'Google Actualités', google: true, cat: 'regional', max: 100, check: true, url: gq(`basketbal+${sites(['hln.be', 'nieuwsblad.be', 'hbvl.be', 'gva.be', 'standaard.be', 'kw.be'])}`, 'nl') },
  { source: 'Google Actualités', google: true, cat: 'regional', max: 100, check: true, url: gq(`basketbal+${sites(['tvl.be', 'focus-wtv.be', 'robtv.be', 'atv.be', 'avs.be', 'tvoost.be', 'ringtv.be', 'bruzz.be', 'rtv.be', 'lokaalnieuws.online'])}`, 'nl') },
  // Flux directs (avec image) — Mediahuis bloque la lecture de ses pages par les robots, mais pas ses flux RSS
  { source: 'Nieuwsblad', url: 'https://www.nieuwsblad.be/sport/zaalsporten/basketbal/rss', cat: 'regional', max: 50 },
  { source: 'HBVL', url: 'https://www.hbvl.be/sport/zaalsporten/basketbal/rss', cat: 'regional', max: 50 },
  { source: 'GVA', url: 'https://www.gva.be/sport/zaalsporten/basketbal/rss', cat: 'regional', max: 50 },
  { source: 'DH Les Sports+', url: 'https://www.dhnet.be/arc/outboundfeeds/rss/section/sports/basket/?outputType=xml', cat: 'auto' },
  { source: "L'Avenir", url: 'https://www.lavenir.net/arc/outboundfeeds/rss/section/sports/basket/?outputType=xml', cat: 'auto' },
  { source: "L'Avenir", url: 'https://www.lavenir.net/arc/outboundfeeds/rss/section/regions/?outputType=xml', cat: 'regional', keep: isBasket, check: true },
  { source: 'RTBF Sport', url: 'https://rss.rtbf.be/article/rss/highlight_rtbf_sport.xml', cat: 'auto', keep: isBasket },
  { source: 'Sporza', url: 'https://sporza.be/nl.rss.xml', cat: 'auto', keep: isBasket },
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
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
  if (/\/(regions?|sportregio|sport-in-de-buurt)\//i.test(text)) return 'regional';
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
    .filter((x) => Date.parse(x.date) > Date.now() - 21 * 864e5).slice(0, f.max ?? 40)
    .map((x) => ({ id: hashId(f.google ? `${x.src}|${x.title}` : x.url), title: x.title, excerpt: x.excerpt, url: x.url, source: x.src || f.source, image: x.image, date: x.date,
      cat: classify(`${x.title} ${x.excerpt} ${x.cats} ${x.url}`, f.cat, f.source) }));
}

async function bnxtNews(): Promise<News[]> {
  const r = await fetch('https://bnxt.sportpress.info/api/v1/article/list?page=1', { headers: { 'X-Authorization': 'BWSyE7sgg9QAurh2JX9cpjzjGc652BWLuNUS', 'X-Localization': 'fr' }, signal: AbortSignal.timeout(20_000) });
  const d = (await r.json()).data ?? [];
  return d.map((a: any) => ({ id: hashId(`bnxt-${a.id}`), title: a.title, excerpt: cut(unxml(a.lead ?? '')), url: `https://bnxtleague.com/fr/newsvideo/${a.slug}`,
    source: 'BNXT League', image: a.cover_image?.thumbnails?.medium ?? a.cover_image?.public_url ?? null, date: new Date(a.publish_date ?? a.created_at).toISOString(), cat: 'belgique' as Cat }));
}

const UA = 'Mozilla/5.0 (compatible; BeHoopBot/1.0; +https://behoop.be)';
const isGoogle = (u: string) => /^https:\/\/news\.google\.com\//.test(u);

/** Lien Google Actualités → lien de l'article chez le média (même procédé que le bouton « Ouvrir » de Google). */
async function resolveGoogle(url: string): Promise<string | null> {
  const page = await (await fetch(url, { headers: { 'User-Agent': UA, Cookie: 'CONSENT=YES+' }, signal: AbortSignal.timeout(15_000) })).text();
  const at = (k: string) => new RegExp(`data-n-a-${k}="([^"]+)"`).exec(page)?.[1];
  const [id, ts, sg] = [at('id'), at('ts'), at('sg')];
  if (!id || !ts || !sg) return null;
  const inner = JSON.stringify(['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, +ts, sg]);
  const r = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': UA },
    body: `f.req=${encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]))}`, signal: AbortSignal.timeout(15_000),
  });
  return /\\"garturlres\\",\\"(https?:[^"\\]+)\\"/.exec(await r.text())?.[1] ?? null;
}

/** Page HTML via curl : plusieurs médias refusent le fetch de Node mais acceptent curl (présent sur les runners GitHub). */
function curl(url: string, accept = 'text/html'): Promise<{ html: string; url: string } | null> {
  return new Promise((res) => execFile('curl', ['-sSL', '--compressed', '-m', '15', '-A', UA, '-H', `Accept: ${accept}`, '-w', '\n%{http_code} %{url_effective}', url],
    { maxBuffer: 16 << 20 }, (err, out) => {
      const i = out?.lastIndexOf('\n') ?? -1;
      const [code, final] = i < 0 ? [] : out.slice(i + 1).split(' ');
      res(err || code !== '200' ? null : { html: out.slice(0, i), url: final });
    }));
}

/** Image d'aperçu de l'article (celle que le média affiche quand on partage le lien). */
export function pageImage(html: string, base: string): string | null {
  for (const key of ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']) {
    for (const [m] of html.matchAll(/<meta\b[^>]*>/gi)) {
      if (!new RegExp(`(?:property|name)=["']${key}["']`, 'i').test(m)) continue;
      const c = /content=["']([^"']+)["']/i.exec(m)?.[1];
      // On écarte les logos génériques des sites (image identique pour tous les articles)
      if (c && !/logo|_opengraph\.|placeholder|\.svg(\?|$)/i.test(c)) {
        try { return new URL(unxml(c), base).href; } catch { /* lien invalide */ }
      }
    }
  }
  return null;
}

/** Complète les articles sans image : vrai lien (Google), puis image d'aperçu de la page. */
async function enrich(items: News[]) {
  const todo = items.filter((n) => !n.image || isGoogle(n.url));
  let found = 0;
  const work = async (n: News) => {
    try {
      if (isGoogle(n.url)) n.url = (await resolveGoogle(n.url)) ?? n.url;
      // Pages Mediahuis protégées (403 pour les robots) : l'image vient de leurs flux RSS, inutile d'insister
      if (n.image || isGoogle(n.url) || /(nieuwsblad|hbvl|gva|standaard)\.be\//.test(n.url)) return;
      const page = await curl(n.url);
      if (page) { n.image = pageImage(page.html, page.url); if (n.image) found++; }
    } catch { /* site lent ou indisponible : la carte garde son visuel de repli */ }
  };
  for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(work));
  console.log(`Images d'aperçu ajoutées : ${found}/${todo.length}`);
}

// Recherches régionales : Google renvoie aussi le foot, le tennis… de ces médias. On garde ce qui parle de basket
// ou cite un club de basket (nom propre à un seul club), sauf si l'article parle visiblement d'un autre sport.
const OTHER_SPORT = /voetbal|football|\bfoot\b|tennis|handbal|handball|volley|wielren|cyclis|hockey|rugby|atletiek|athl[ée]tisme|doelpunt|penalty|rode kaart|carton rouge|croky cup|jupiler|\bgoal|keeper|gardien de but|veldrit|gravel|motocross|judo|zwemmen|natation/i;
const GENERIC = new Set('basket basketball basketbal basketbalclub ball bal club royal royale koninklijke kbbc rbc bbc union united sint saint academy dames heren blue black lions centre ville avenir racing sporting cercle etoile espoir jeunesse olympic team new asbl vzw les des the van den het'.split(' '));
export function clubMatcher(clubs: { name: string; short: string }[]) {
  // Noms de club d'au moins deux mots (« limburg united », « okapi aalst »), avec ou sans les mots génériques :
  // un nom de ville seul est trop ambigu (foot, faits divers…)
  const keys = new Set<string>();
  for (const c of clubs) for (const n of [c.name, c.short]) {
    const all = normalize(n).split(' ').filter((w) => w && !/^\d+$/.test(w));
    const own = all.filter((w) => !GENERIC.has(w));
    if (all.length >= 2 && all.join(' ').length >= 9) keys.add(all.join(' '));
    if (own.length >= 2 && own.join(' ').length >= 9) keys.add(own.join(' '));
  }
  const re = new RegExp(`\\b(${[...keys].join('|')})\\b`);
  return (text: string) => keys.size > 0 && re.test(normalize(text));
}
/**
 * Clubs cités par un article. Clés d'un club : morceaux de son nom (1 à n mots) qu'aucun autre club ne porte —
 * un mot seul doit faire 5 lettres et ne pas être générique (« basket », « royal »…), un nom de ville partagé
 * (« mons » : 3 clubs) ne compte donc pas seul. Si deux clés se chevauchent dans le texte, la plus longue gagne :
 * « BC Mons Capitale » ne compte pas pour CityX Mons ni pour Mons Basketball.
 */
// Mots de noms de club trop courants seuls dans un article (prénoms, « Europe Cup », « Belgian Cats », « Euroleague Women »…)
const SOLO_STOP = new Set('dynamo women ladies europe european belgian belgium pierre louis jean paul marie martin nicolas joseph georges michel andre jacques marc vincent hubert lambert laurent gilles ghislain amand servais remy roch thomas antoine charles francois henri julien pieter peter willem'.split(' '));
export function clubTagger(clubs: { id: number; name: string; short: string; teams?: { id: number }[] }[]) {
  const toks = (x: string) => normalize(x).split(' ').filter(Boolean);
  const owners = new Map<string, Set<number>>();
  const add = (k: string, id: number) => { if (!owners.has(k)) owners.set(k, new Set()); owners.get(k)!.add(id); };
  for (const c of clubs) for (const n of new Set([c.name, c.short])) {
    const w = toks(n);
    for (let i = 0; i < w.length; i++) for (let j = i + 1; j <= w.length; j++) add(w.slice(i, j).join(' '), c.id);
  }
  const keys = new Map<string, number>();
  // Nom partagé par plusieurs clubs : il revient au seul d'entre eux qui joue en BNXT (« Okapi Aalst » = l'équipe pro), sinon à personne
  const pro = new Set(clubs.filter((c) => c.teams?.some((t) => t.id >= 2e10)).map((c) => c.id));
  for (const [k, ids] of owners) {
    if (ids.size > 1) { const p = [...ids].filter((i) => pro.has(i)); if (p.length !== 1) continue; ids.clear(); ids.add(p[0]); }
    const w = k.split(' ');
    const own = w.filter((x) => !GENERIC.has(x) && !/^\d+$/.test(x));
    if (!own.length) continue;
    if (w.length === 1 ? k.length >= 5 && !SOLO_STOP.has(k) : k.length >= 7) keys.set(k, [...ids][0]);
  }
  // Motif tolérant : espaces multiples, « basket-ball » = « basketball » ; un mot seul doit porter une majuscule
  // dans l'article (nom propre) : « Winkel » est un club, « aan de winkel » non.
  const pat = (k: string) => k.split(' ').map((w) => w.replace(/basketball/, 'basket\\s*ball')).join('\\s+');
  const list = [...keys.keys()].sort((a, b) => b.length - a.length).map((k) => ({
    id: keys.get(k)!, first: k.split(' ')[0].slice(0, 5),
    re: k.includes(' ') ? new RegExp(`\\b${pat(k)}\\b`, 'gi') : new RegExp(`\\b(${k[0].toUpperCase()}${k.slice(1)}|${k.toUpperCase()})\\b`, 'g'),
  }));
  return (text: string): number[] => {
    // Même longueur que le texte d'origine (accents retirés, ponctuation → espace) : positions comparables
    const orig = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, ' ');
    const low = orig.toLowerCase();
    const hits: { s: number; e: number; id: number }[] = [];
    for (const { id, first, re } of list) {
      if (!low.includes(first)) continue;
      re.lastIndex = 0; let m;
      while ((m = re.exec(orig))) hits.push({ s: m.index, e: m.index + m[0].length, id });
    }
    const kept = hits.filter((h) => !hits.some((o) => o.id !== h.id && o.s <= h.s && o.e >= h.e && o.e - o.s > h.e - h.s));
    return [...new Set(kept.map((h) => h.id))];
  };
}

export function isBasketNews(n: Pick<News, 'title' | 'excerpt' | 'url'>, clubHit: (t: string) => boolean) {
  const t = `${n.title} ${n.excerpt}`;
  if (/basket/i.test(`${t} ${n.url}`)) return true;
  return !OTHER_SPORT.test(t) && clubHit(t);
}

export async function run(out = 'app-data/news.json') {
  const prev: News[] = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')).items ?? [] : [];
  const all: News[] = [];
  const indexClubs = existsSync('app-data/index.json') ? JSON.parse(readFileSync('app-data/index.json', 'utf8')).clubs : [];
  const clubHit = clubMatcher(indexClubs);
  for (const f of FEEDS) {
    try {
      // fetch d'abord ; curl en secours (Mediahuis refuse le fetch de Node mais sert ses flux à curl)
      const r = await fetch(f.url, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/rss+xml, application/xml' } });
      const xml = r.ok ? await r.text() : (await curl(f.url, 'application/rss+xml, application/xml'))?.html;
      if (!xml) throw new Error(`${r.status}`);
      let items = parseFeed(xml, f);
      if (f.check) items = items.filter((n) => isBasketNews(n, clubHit)); all.push(...items); console.log(`${f.source} : ${items.length}`);
    } catch (e) { console.error(`${f.source} indisponible (${(e as Error).message})`); }
  }
  try { const b = await bnxtNews(); all.push(...b); console.log(`BNXT League : ${b.length}`); } catch (e) { console.error('BNXT indisponible', (e as Error).message); }
  // On garde aussi les articles récents déjà connus (si une source est momentanément en panne)
  const since = Date.now() - 21 * 864e5;
  const byId = new Map<string, News>();
  const known = new Map(prev.map((n) => [n.id, n]));
  for (const n of [...all, ...prev]) {
    if (byId.has(n.id) || Date.parse(n.date) <= since) continue;
    // Déjà traité lors d'un passage précédent : on réutilise le vrai lien et l'image trouvés
    const old = known.get(n.id);
    byId.set(n.id, old ? { ...n, url: isGoogle(old.url) ? n.url : old.url, image: n.image ?? old.image } : n);
  }
  let items = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 700);
  await enrich(items);
  // Un même article arrive par plusieurs chemins (flux direct, Google, Nieuwsblad = GVA = HBVL…) : un seul exemplaire, de préférence avec image
  const seen = new Map<string, News>();
  for (const n of items) {
    const k = normalize(n.title);
    const o = seen.get(k) ?? seen.get(n.url);
    if (!o) { seen.set(k, n); seen.set(n.url, n); } else if (!o.image && n.image) o.image = n.image;
  }
  items = [...new Set(seen.values())].slice(0, 500);
  // Clubs cités (pour le fil de chaque club)
  if (indexClubs.length) { const tag = clubTagger(indexClubs); for (const n of items) { const c = tag(`${n.title} ${n.excerpt}`); if (c.length) n.clubs = c; else delete n.clubs; } }
  mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), items }));
  console.log(`news.json : ${items.length} articles (${['belgique', 'regional', 'international', 'nba'].map((c) => `${c} ${items.filter((i) => i.cat === c).length}`).join(', ')})`);
}
if (import.meta.url === `file://${process.argv[1]}`) run().catch((e) => { console.error(e); process.exit(1); });
