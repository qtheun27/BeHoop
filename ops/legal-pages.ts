// Pages légales en HTML simple (lisibles sans JavaScript, notamment par les contrôles de Google) :
//   /confidentialite/, /conditions/, /charte/ (français) et /privacy/, /terms/ (anglais).
// Même texte que dans l'appli (web/src/legalDocs.ts, traductions web/src/i18n/en.ts). Lancé par « npm run build ».
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DOCS } from '../web/src/legalDocs';
import { EN } from '../web/src/i18n/en';

const ROOT = resolve(import.meta.dirname, '..');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Adresses en clair → liens cliquables
const linkify = (s: string) => esc(s).replace(/\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|be|org)(?:\/[\w./#-]*)?)/g, (m) => `<a href="${m.startsWith('http') ? m : 'https://' + m}">${m}</a>`)
  .replace(/([\w.+-]+@[\w-]+\.[\w.]+)/g, '<a href="mailto:$1">$1</a>');

const pages: { dir: string; doc: string; lang: 'fr' | 'en'; other: string }[] = [
  { dir: 'confidentialite', doc: 'confidentialite', lang: 'fr', other: 'privacy' },
  { dir: 'privacy', doc: 'confidentialite', lang: 'en', other: 'confidentialite' },
  { dir: 'conditions', doc: 'cgu', lang: 'fr', other: 'terms' },
  { dir: 'terms', doc: 'cgu', lang: 'en', other: 'conditions' },
  { dir: 'charte', doc: 'charte', lang: 'fr', other: 'charte' },
];
for (const p of pages) {
  const d = DOCS[p.doc];
  const tr = (s: string) => (p.lang === 'en' ? EN[s] ?? s : s);
  const html = `<!doctype html>
<html lang="${p.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tr(d.title))} — BeHoop</title>
<meta name="description" content="${esc(tr(d.title))} — BeHoop, ${p.lang === 'en' ? 'the free Belgian basketball app' : 'l’appli gratuite du basket belge'}.">
<link rel="icon" href="/icons/favicon-32.png">
<style>body{margin:0;font:17px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#13161c;background:#f4f1ec}main{max-width:760px;margin:0 auto;padding:28px 20px 60px}
header{display:flex;justify-content:space-between;align-items:center;gap:12px}header a{color:#f26a1b;font-weight:700;text-decoration:none}h1{font-size:30px;margin:26px 0 8px}h2{font-size:19px;margin:24px 0 4px}p{margin:0}a{color:#c4500f}.muted{color:#6b6f78;font-size:14px;margin-top:30px}</style>
</head><body><main>
<header><a href="/">BeHoop</a><a href="/${p.other}/">${p.other === p.dir ? '' : p.lang === 'en' ? 'Version française' : 'English version'}</a></header>
<h1>${esc(tr(d.title))}</h1>
${d.body.map(([h, t]) => `<h2>${esc(tr(h))}</h2>\n<p>${linkify(tr(t))}</p>`).join('\n')}
<p class="muted">${p.lang === 'en' ? 'Version' : 'Version'} 2026-11 · <a href="/">behoop.be</a> · <a href="/${p.lang === 'en' ? 'privacy' : 'confidentialite'}/">${p.lang === 'en' ? 'Privacy policy' : 'Confidentialité'}</a> · <a href="/${p.lang === 'en' ? 'terms' : 'conditions'}/">${p.lang === 'en' ? 'Terms of use' : 'Conditions d’utilisation'}</a></p>
</main></body></html>
`;
  mkdirSync(join(ROOT, p.dir), { recursive: true });
  writeFileSync(join(ROOT, p.dir, 'index.html'), html);
}
console.log(`pages légales : ${pages.map((p) => '/' + p.dir + '/').join(' ')}`);
