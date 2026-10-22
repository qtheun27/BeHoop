// Contrôle du moteur de classement (web/src/lib/engine.ts) : pour chaque série qui a un classement officiel, on cherche la
// règle qui le reproduit exactement à partir des matchs (corrections officielles comprises : points retirés, forfaits,
// résultats annulés ou reportés). Rapport par famille de compétitions ; détail dans le fichier JSON passé en argument.
// Ne modifie aucune donnée de l'appli (build-app-data.ts enregistre la règle trouvée dans chaque série).
import { writeFileSync } from 'node:fs';
import { loadAll } from './allData';
import { pickRule, type PointsSystem } from '../web/src/lib/engine';

export const family = (id: number) =>
  id < 1e10 ? 'AWBB' : id < 20e9 ? 'VBL' : id < 21e9 ? 'BNXT' : id < 23e9 ? 'NBA' : id < 24e9 ? 'Sélections' : id < 25e9 ? 'EuroLeague' : id < 26e9 ? 'EuroCup'
    : id < 27e9 ? 'WNBA' : id < 28e9 ? 'Champions League' : id < 29e9 ? 'FIBA Europe Cup' : id < 31e9 ? 'Coupes d’Europe féminines' : 'Sélections';

/** Système de points de chaque famille */
export const pointsOf = (fam: string): PointsSystem => (fam === 'AWBB' || fam === 'VBL' ? 'be' : ['EuroLeague', 'EuroCup', 'BNXT'].includes(fam) ? 'pct' : 'fiba');

export function run(root = '.', out?: string) {
  const d = loadAll(root);
  const bySerie = new Map<number, typeof d.games>();
  for (const g of d.games) { const l = bySerie.get(g.s) ?? []; l.push(g); bySerie.set(g.s, l); }
  const stats = new Map<string, { series: number; ok: number; rules: Record<string, number> }>();
  const missed: { serie: number; name?: string; fam: string }[] = [];
  for (const [sid, off] of d.standings) {
    const games = bySerie.get(sid) ?? [];
    if (!off.length || !off.every((r) => r.rank) || !games.some((g) => g.hs != null)) continue;
    const fam = family(sid);
    if (fam === 'NBA' || fam === 'WNBA') continue; // déjà calculés par ops/pro.ts
    const st = stats.get(fam) ?? { series: 0, ok: 0, rules: {} }; stats.set(fam, st);
    st.series++;
    const rule = pickRule(off, games, pointsOf(fam));
    if (rule) { st.ok++; st.rules[rule] = (st.rules[rule] ?? 0) + 1; } else missed.push({ serie: sid, name: d.series.get(sid)?.name, fam });
  }
  console.log('Moteur de classement — séries reproduites exactement (rangs officiels) :');
  for (const [fam, s] of stats) console.log(`  ${fam} : ${s.ok}/${s.series} (${Math.round((100 * s.ok) / s.series)} %) — ${Object.entries(s.rules).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  if (out) writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), stats: Object.fromEntries(stats), missed }, null, 1));
}
if (import.meta.url === `file://${process.argv[1]}`) run('.', process.argv[2]);
