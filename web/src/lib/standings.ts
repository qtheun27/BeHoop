// Ordre des classements (sans dépendance au navigateur : utilisé aussi par les tests).
import type { Standing } from './data';

/** Classement dans l'ordre officiel : le rang de la fédération (départages compris), jamais recalculé.
 *  Repli (anciennes données sans rang) : l'ordre de la source. */
export function ranked(rows: Standing[]): (Standing & { rank: number })[] {
  return rows.every((r) => r.rank) ? [...rows].sort((a, b) => a.rank! - b.rank!) as (Standing & { rank: number })[] : rows.map((r, i) => ({ ...r, rank: i + 1 }));
}
