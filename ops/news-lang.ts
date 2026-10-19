// Langue d'origine des actus (FR · NL · EN) : l'appli montre à chacun les articles écrits dans sa langue.
// Pas de traduction : chaque langue a ses propres sources (voir FEEDS dans news.ts).

export type Lang = 'fr' | 'nl' | 'en';
export const LANGS: Lang[] = ['fr', 'nl', 'en'];

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
