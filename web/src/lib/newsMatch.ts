// Actus d'un club et suivi réel : si je ne suis que certaines équipes d'un club (ex. les U14), une actu qui vise
// clairement une autre équipe du club (« Provinciale 3 ») ne s'affiche pas ; une actu générale du club (aucune
// catégorie citée) s'affiche toujours. Qui suit tout le club voit tout (voir Feed.tsx).

/** Catégorie lue dans le libellé d'une équipe : AWBB « PU14H », « P3H C », « R2D », « TDM2 A » ; Flandre « U14 Mixte A », « Messieurs Seniors B » */
export function teamKind(cat: string) {
  const c = cat.trim();
  const u = /U\s?0?(\d{1,2})/i.exec(c);
  if (u) return { youth: +u[1] };
  const lv = /^P\s?([1-5])/i.exec(c) ? `P${/^P\s?([1-5])/i.exec(c)![1]}` : /^R\s?([1-3])/i.exec(c) ? `R${/^R\s?([1-3])/i.exec(c)![1]}` : /^TD|national/i.test(c) ? 'TD' : /BNXT/i.test(c) ? 'BNXT' : undefined;
  return { senior: true, level: lv };
}

/** Catégories citées dans un texte d'actu */
export function textKinds(text: string) {
  const out: { youth?: number; level?: string }[] = [];
  for (const m of text.matchAll(/\bU\s?-?0?(\d{1,2})\b/gi)) out.push({ youth: +m[1] });
  for (const m of text.matchAll(/\bP\s?([1-5])\b|\bprovinciale?\s*([1-5])\b|\b([1-5])(?:e|è|ème|de|ste)?\s*prov(?:inciale)?\b/gi)) out.push({ level: `P${m[1] ?? m[2] ?? m[3]}` });
  for (const m of text.matchAll(/\bR\s?([1-3])\b|\br[ée]gionale?\s*([1-3])\b|\b([1-3])(?:e|è|ème|de)?\s*(?:r[ée]gionale|gewestelijke)\b/gi)) out.push({ level: `R${m[1] ?? m[2] ?? m[3]}` });
  if (/top\s*division|\bTD[MW]\s?\d/i.test(text)) out.push({ level: 'TD' });
  return out;
}

/** L'actu concerne-t-elle l'une de mes équipes de ce club ? (générale → oui) */
export function newsForTeams(text: string, teamCats: string[]) {
  const said = textKinds(text);
  if (!said.length) return true;
  const mine = teamCats.map(teamKind);
  return said.some((s) => mine.some((t) => (s.youth != null ? t.youth === s.youth : !!t.senior && (!t.level || t.level === s.level))));
}
