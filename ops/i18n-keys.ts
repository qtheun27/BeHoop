// Textes de l'appli à traduire (clé = texte français), relevés dans le code source :
// - premier argument de t('…'), 2e et 3e de tn(n, '…', '…') ;
// - web/src/hoopcamp (bibliothèque d'exercices et moteur) n'est pas parcouru : contenu en français, hors dictionnaires ;
// - libellés passés à t() par variable : « label: '…' », paires ['id', 'Libellé'], listes et objets déclarés ci-dessous.
// Sert au test de couverture (ops/test/i18n.test.ts) et à repérer les nouvelles clés (npx tsx ops/i18n-keys.ts).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? (f === 'i18n' || f === 'planche' || f === 'hoopcamp' ? [] : files(p)) : /\.tsx?$/.test(f) ? [p] : [];
});
// Chaîne '…' ou "…" (avec échappements)
const S = String.raw`(?:'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")`;
const unq = (lit: string) => lit.slice(1, -1).replace(/\\(.)/g, '$1');
const lits = (src: string) => [...src.matchAll(new RegExp(S, 'g'))].map((m) => unq(m[0]));
// Constantes dont toutes les valeurs texte sont des libellés affichés
const LABEL_CONSTS = ['REPORT_REASONS', 'RELATION_FR', 'DOCS', 'CHAPTER_ORDER', 'ROLE_LABEL', 'FAMILY_LABEL', 'PHASE_LABEL', 'RATING_LABEL', 'EQUIP_LABEL', 'GOAL_LABEL', 'GOAL_FR'];

export function collectKeys(root = '.') {
  // Noms d'icônes (ui/icons.tsx) : jamais des textes à traduire
  const ICONS = new Set([...readFileSync(join(root, 'web/src/ui/icons.tsx'), 'utf8').matchAll(/^\s{2}(\w+): '/gm)].map((m) => m[1]));
  const keys = new Set<string>();
  const add = (x: string) => { if (/\p{L}/u.test(x)) keys.add(x); };
  for (const f of [...files(join(root, 'web/src')), join(root, 'shared/chapters.ts')]) {
    const src = readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    // t('…'), tr('…') ; t(cond ? '…' : '…') ; t(({ a: '…' } as Record<…>)[k])
    for (const m of src.matchAll(new RegExp(String.raw`\bt[r]?\((${S})`, 'g'))) add(unq(m[1]));
    for (const m of src.matchAll(/\bt\(([^()'"]*\?\s*(?:'[^']*'|"[^"]*")\s*:\s*(?:'[^']*'|"[^"]*"))\)/g)) lits(m[1]).forEach(add);
    for (const m of src.matchAll(/\bt\(\(\{([^}]*)\}\s*as Record/g)) for (const v of m[1].matchAll(new RegExp(String.raw`:\s*(${S})`, 'g'))) add(unq(v[1]));
    for (const m of src.matchAll(new RegExp(String.raw`\btn\([^,]+,\s*(${S})\s*,\s*(${S})`, 'g'))) { add(unq(m[1])); add(unq(m[2])); }
    // label: '…' / title: '…'
    for (const m of src.matchAll(new RegExp(String.raw`\b(?:label|title):\s*(${S})`, 'g'))) add(unq(m[1]));
    // Paires ['id', 'Libellé']
    for (const m of src.matchAll(new RegExp(String.raw`\[\s*'([a-z0-9_-]*)'\s*,\s*(${S})\s*\]`, 'g'))) add(unq(m[2]));
    // Triplets d'onglets et de filtres : ['id', 'icône' | null, 'Libellé'] et ['id', 'Libellé', 'icône']
    for (const m of src.matchAll(new RegExp(String.raw`\[\s*'([a-z0-9_-]*)'\s*,\s*('[a-zA-Z]+'|null)\s*,\s*(${S})\s*\]`, 'g'))) if (m[2] === 'null' || ICONS.has(unq(m[2]))) add(unq(m[3]));
    for (const m of src.matchAll(new RegExp(String.raw`\[\s*'([a-z0-9_-]*)'\s*,\s*(${S})\s*,\s*'([a-zA-Z]+)'\s*\]`, 'g'))) if (ICONS.has(m[3]) && !ICONS.has(unq(m[2]))) add(unq(m[2]));
    // ['A', 'B'].map((l) => … t(l) …)
    for (const m of src.matchAll(new RegExp(String.raw`\[((?:\s*${S}\s*,?)+)\]\.map\(\((l|g)\b`, 'g'))) lits(m[1]).forEach(add);
    // Constantes de libellés : valeurs uniquement (pas les clés « 'a': »)
    for (const c of LABEL_CONSTS) {
      const i = src.search(new RegExp(String.raw`\bconst ${c}\b`)); if (i < 0) continue;
      const end = src.indexOf('\n};', i) > -1 && c === 'DOCS' ? src.indexOf('\n};', i) : src.indexOf(';\n', i);
      const body = src.slice(i, end);
      for (const m of body.matchAll(new RegExp(String.raw`(${S})(\s*:)?`, 'g'))) if (!m[2]) add(unq(m[1]));
    }
  }
  return keys;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { NL } = await import('../web/src/i18n/nl');
  const { EN } = await import('../web/src/i18n/en');
  const keys = collectKeys();
  const missing = [...keys].filter((k) => !(k in NL) || !(k in EN));
  console.log(`${keys.size} textes, ${missing.length} sans traduction complète`);
  console.log(JSON.stringify(missing, null, 1));
}
