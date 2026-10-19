// Actus en 3 langues : langue d'origine détectée, titre et accroche traduits par Claude (FR · NL · EN).
// Les traductions déjà faites sont réutilisées d'un passage à l'autre (même id) : seuls les nouveaux articles coûtent.
// Sans ANTHROPIC_API_KEY (secret GitHub), on ne traduit pas : l'appli montre alors les articles dans la langue de l'utilisateur.
import Anthropic from '@anthropic-ai/sdk';
import type { News } from './news';

export type Lang = 'fr' | 'nl' | 'en';
export const LANGS: Lang[] = ['fr', 'nl', 'en'];
const MODEL = process.env.NEWS_MODEL || 'claude-opus-5-5';
const BATCH = 25;

const WORDS: Record<Lang, string[]> = {
  fr: ['le', 'la', 'les', 'des', 'du', 'une', 'un', 'est', 'pour', 'avec', 'dans', 'sur', 'et', 'au', 'aux', 'qui', 'que', 'pas', 'son', 'sa', 'ses', 'face', 'après', 'contre', 'victoire', 'défaite'],
  // « de » et « en » existent aussi en français : pas comptés
  nl: ['het', 'een', 'van', 'op', 'met', 'voor', 'is', 'niet', 'zijn', 'naar', 'bij', 'ook', 'die', 'dat', 'wint', 'tegen', 'nog', 'tot', 'uit', 'wordt', 'werd', 'geen', 'maar', 'dan', 'als', 'hun', 'door', 'om', 'te', 'zich', 'haar', 'wil', 'heeft', 'naar', 'over', 'zege', 'nederlaag', 'ploeg'],
  en: ['the', 'of', 'and', 'on', 'with', 'for', 'is', 'to', 'at', 'by', 'from', 'that', 'his', 'after', 'against', 'win', 'wins', 'game', 'season', 'as', 'be'],
};
// Médias néerlandophones / anglophones (indice quand le titre ne contient aucun mot courant)
const NL_SITES = /(hln|nieuwsblad|hbvl|gva|standaard|sporza|tvl|robtv|focus-wtv|tvoost|ringtv|bruzz|kw|lokaalnieuws|atv|avs|rtv|basketbal)\./;
const EN_SITES = /(espn|nba|eurohoops|fiba)\./;
/** Langue d'un article d'après ses mots les plus courants (titre + accroche), sinon d'après le site. */
export function detectLang(text: string, url = ''): Lang {
  const w = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z']+/);
  const score = (l: Lang) => w.filter((x) => WORDS[l].includes(x)).length;
  const s = LANGS.map((l) => [l, score(l)] as const).sort((a, b) => b[1] - a[1]);
  if (s[0][1] > 0 && s[0][1] > s[1][1]) return s[0][0];
  return NL_SITES.test(url) ? 'nl' : EN_SITES.test(url) ? 'en' : s[0][1] > 0 ? s[0][0] : 'fr';
}

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'fr_title', 'fr_excerpt', 'nl_title', 'nl_excerpt', 'en_title', 'en_excerpt'],
        properties: Object.fromEntries(['id', 'fr_title', 'fr_excerpt', 'nl_title', 'nl_excerpt', 'en_title', 'en_excerpt'].map((k) => [k, { type: 'string' }])),
      },
    },
  },
};
const SYSTEM = `You translate basketball news headlines and short teasers for BeHoop, a Belgian basketball app, into French, Dutch and English.
- French: natural Belgian French. Dutch: natural Flemish (Belgian Dutch) as written by Flemish sports media. English: British English.
- Keep names of people, clubs, leagues and competitions exactly as written (BNXT League, Belgian Cats, Kangoeroes Mechelen, Spirou Charleroi…); keep scores and numbers unchanged.
- Translate faithfully and concisely, like a sports journalist would; never add information.
- For the article's own language, return the original text unchanged. An empty teaser stays empty in every language.`;

type Tr = NonNullable<News['tr']>;

async function translateBatch(client: Anthropic, batch: News[]): Promise<Map<string, Tr>> {
  const input = batch.map((n) => ({ id: n.id, lang: n.lang, title: n.title, excerpt: n.excerpt }));
  const r = await client.beta.messages.create({
    model: MODEL, max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: `Translate each item (its source language is given in "lang"):\n${JSON.stringify(input)}` }],
  });
  const out = new Map<string, Tr>();
  if (r.stop_reason === 'refusal' || r.stop_reason === 'max_tokens') { console.error(`Traduction : lot ignoré (${r.stop_reason})`); return out; }
  const text = r.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') return out;
  try {
    const data = JSON.parse(text.text) as { items: Record<string, string>[] };
    for (const x of data.items) out.set(x.id, Object.fromEntries(LANGS.map((l) => [l, { t: x[`${l}_title`] ?? '', e: x[`${l}_excerpt`] ?? '' }])) as Tr);
  } catch { console.error('Traduction : réponse illisible, lot ignoré'); }
  return out;
}

/** Ajoute lang (toujours) et tr (si la clé API est disponible) ; réutilise les traductions connues. */
export async function translateNews(items: News[], known: Map<string, News>) {
  for (const n of items) {
    n.lang ??= known.get(n.id)?.lang ?? detectLang(`${n.title} ${n.excerpt}`, n.url);
    const k = known.get(n.id);
    // Traduction déjà faite pour ce même titre : on la garde
    if (!n.tr && k?.tr && k.title === n.title) n.tr = k.tr;
  }
  if (!process.env.ANTHROPIC_API_KEY) { console.log('Traduction des actus : ANTHROPIC_API_KEY absent, articles laissés dans leur langue'); return; }
  const todo = items.filter((n) => !n.tr);
  if (!todo.length) return;
  const client = new Anthropic();
  let done = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    try {
      const tr = await translateBatch(client, batch);
      for (const n of batch) { const x = tr.get(n.id); if (x) { n.tr = x; done++; } }
    } catch (e) {
      // Erreur API (quota, réseau…) : on garde ce qui est fait, le reste sera traduit au prochain passage
      console.error(`Traduction interrompue : ${e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : (e as Error).message}`);
      break;
    }
  }
  console.log(`Actus traduites : ${done}/${todo.length} (${MODEL})`);
}
