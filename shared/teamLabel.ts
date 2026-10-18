// Libellés lisibles des équipes AWBB (partagé et testé).
/**
 * Libellé lisible d'une équipe à partir de sa catégorie AWBB :
 *  R… = régional (AWBB), P… = provincial ; U14 = âge, H/HM = garçons, D = filles, M = mixte ; lettre finale = équipe A/B/C.
 *  « PU14H A » → « U14 A · Provinciale », « RU14H » → « U14 · Régionale », « R1H B » → « R1 Messieurs B », « P3D » → « P3 Dames ».
 */
export function teamLabel(t: { cat: string; name: string }) {
  const c = t.cat.trim().toUpperCase();
  const m = /^([PR])?U(\d{1,2})(HM|H|D|M)?\s*([A-Z])?$/.exec(c);
  if (m) return `U${m[2]}${m[3] === 'D' ? ' Filles' : ''}${m[4] ? ' ' + m[4] : ''}${m[1] ? ` · ${m[1] === 'R' ? 'Régionale' : 'Provinciale'}` : ''}`;
  const td = /^TD([MW])(\d)\s*([A-Z])?$/.exec(c);
  if (td) return `Top Division ${td[1] === 'W' ? 'Dames' : 'Messieurs'} ${td[2]}${td[3] ? ' ' + td[3] : ''}`;
  const s = /^([PR])(\d)\s*(H|D)\s*([A-Z])?$/.exec(c);
  if (s) return `${s[1]}${s[2]} ${s[3] === 'D' ? 'Dames' : 'Messieurs'}${s[4] ? ' ' + s[4] : ''}`;
  return t.cat || t.name;
}
