import type { MediaItem } from './types';

/**
 * Classe automatiquement les médias par quart-temps.
 * 1. tri par date de prise de vue ;
 * 2. si des photos de tableau d'affichage sont marquées « fin du quart N », elles servent de bornes ;
 * 3. sinon (ou pour compléter), on coupe aux plus grands écarts de temps entre médias consécutifs.
 */
export function assignQuarters<T extends MediaItem>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => a.takenAt - b.takenAt);
  if (sorted.length === 0) return [];
  // bornes : index du dernier média de chaque quart 1..3
  const bounds = new Map<number, number>();
  sorted.forEach((m, i) => {
    if (m.scoreboardOfQuarter && m.scoreboardOfQuarter <= 3) bounds.set(m.scoreboardOfQuarter, i);
  });
  const missing = [1, 2, 3].filter((q) => !bounds.has(q));
  if (missing.length) {
    const gaps = sorted.slice(1).map((m, i) => ({ i, gap: m.takenAt - sorted[i].takenAt }));
    const used = new Set(bounds.values());
    const candidates = gaps
      .filter((g) => !used.has(g.i))
      .sort((a, b) => b.gap - a.gap);
    // On prend autant de coupures que de bornes manquantes, en respectant l'ordre des quarts.
    const chosen: number[] = [];
    for (const c of candidates) {
      if (chosen.length >= missing.length) break;
      chosen.push(c.i);
    }
    const all = [...bounds.entries()];
    const free = chosen.sort((a, b) => a - b);
    // Répartit les coupures libres entre les quarts manquants en restant monotone
    for (const q of missing) {
      const before = all.filter(([k]) => k < q).map(([, v]) => v);
      const after = all.filter(([k]) => k > q).map(([, v]) => v);
      const min = before.length ? Math.max(...before) : -1;
      const max = after.length ? Math.min(...after) : Infinity;
      const idx = free.findIndex((v) => v > min && v < max);
      if (idx >= 0) { all.push([q, free[idx]]); free.splice(idx, 1); }
      else all.push([q, Math.min(max - 1, sorted.length - 1)]);
    }
    all.forEach(([k, v]) => bounds.set(k, v));
  }
  const b1 = bounds.get(1)!, b2 = bounds.get(2)!, b3 = bounds.get(3)!;
  return sorted.map((m, i) => {
    const quarter = (i <= b1 ? 1 : i <= b2 ? 2 : i <= b3 ? 3 : 4) as 1 | 2 | 3 | 4;
    return { ...m, quarter, order: i };
  });
}

/** Médias d'un quart, dans l'ordre, sans les exclus. */
export function quarterItems<T extends MediaItem>(items: T[], q: number): T[] {
  return items.filter((m) => m.quarter === q && !m.excluded).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Photos utilisables pour une mosaïque : vedette d'abord, sans « hors jeu » ni tableau. */
export function mosaicPhotos<T extends MediaItem>(items: T[], q: number, max = 6): T[] {
  const photos = quarterItems(items, q).filter((m) => m.kind === 'photo' && !m.offPlay && !m.scoreboardOfQuarter);
  photos.sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
  return photos.slice(0, max);
}
