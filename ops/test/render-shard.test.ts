import { describe, it, expect } from 'vitest';
import { shard } from '../render/norm';
import type { MediaItem } from '../../shared/types';

const v = (id: string, duration: number) => ({ id, kind: 'video', duration, name: id, r2Key: id, takenAt: 0 }) as unknown as MediaItem;
describe('préparation des vidéos en parallèle', () => {
  it('répartit par durée, chaque vidéo une seule fois', () => {
    const vids = [v('a', 300), v('b', 200), v('c', 100), v('d', 100), v('e', 50), v('f', 400)];
    const s = shard(vids, 4);
    expect(s.flat().map((x) => x.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    const load = s.map((x) => x.reduce((t, m) => t + (m.duration ?? 0), 0));
    expect(Math.max(...load)).toBe(400); // la plus longue seule ; les autres réparties autour
  });
  it('même résultat sur chaque machine (ordre stable)', () => {
    const vids = [v('x', 60), v('y', 60), v('z', 60)];
    expect(shard(vids, 2)).toEqual(shard([...vids].reverse(), 2));
  });
});
