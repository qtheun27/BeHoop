import { describe, it, expect } from 'vitest';
import { classifyCategory, ageGroupOf } from './ageGroup';
import { quarterScores, validateScores, resultLabel } from './scores';
import { assignQuarters, mosaicPhotos } from './quarters';
import { buildChapters, chaptersToVtt, parseVtt } from './chapters';
import { normalizeArgs, hlsArgs, xfadeChainArgs, wipeJoinArgs, segmentArgs } from './ffmpeg';
import type { MediaItem } from './types';

describe('Jeunes / Seniors', () => {
  it.each([
    ['PU12HM A', 'jeunes'], ['PU8', 'jeunes'], ['RU21H', 'jeunes'], ['PU19D A', 'jeunes'], ['Benjamins', 'jeunes'],
    ['Cadets', 'jeunes'], ['P3H B', 'seniors'], ['R2H A', 'seniors'], ['P1D A', 'seniors'], ['Seniors', 'seniors'],
    ['Dames', 'seniors'], ['Régionale 1', 'seniors'], ['TDW1 A', 'seniors'], ['TDM2 B', 'seniors'], ['', 'jeunes'], ['XYZ', 'jeunes'], [null, 'jeunes'],
  ])('%s → %s', (c, g) => expect(classifyCategory(c as string)).toBe(g));
  it('correction du super admin prioritaire', () => expect(ageGroupOf('PU12HM', 'seniors')).toBe('seniors'));
});

describe('scores par quart', () => {
  const cum: [number, number][] = [[0, 17], [1, 45], [3, 73], [11, 94]];
  it('match test', () => expect(quarterScores(cum)).toEqual([[0, 17], [1, 28], [2, 28], [8, 21]]));
  it('validation', () => {
    expect(validateScores(cum)).toBeNull();
    expect(validateScores([[5, 5], [3, 9]])).toMatch(/Q2/);
  });
  it('libellé', () => {
    expect(resultLabel('BC AMLL', 'Union Mons Hainaut', 11, 94)).toBe("Victoire de l'Union Mons Hainaut");
    expect(resultLabel('BC AMLL', 'X', 50, 40)).toBe('Victoire du BC AMLL');
    expect(resultLabel('A', 'B', 2, 2)).toBe('Match nul');
  });
});

const m = (id: string, min: number, extra: Partial<MediaItem> = {}): MediaItem =>
  ({ id, r2Key: id, kind: 'photo', name: id, takenAt: Date.UTC(2026, 9, 10, 13, 0) + min * 60000, ...extra });

describe('découpage par quart', () => {
  it('3 plus grands écarts', () => {
    const items = [m('a', 0), m('b', 2), m('c', 15), m('d', 16), m('e', 35), m('f', 36), m('g', 50), m('h', 52)];
    const r = assignQuarters(items.reverse());
    expect(r.map((x) => x.quarter)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it('bornes tableau prioritaires', () => {
    const items = [m('a', 0), m('b', 1, { scoreboardOfQuarter: 1 }), m('c', 2), m('d', 30), m('e', 31, { scoreboardOfQuarter: 2 }), m('f', 32), m('g', 33, { scoreboardOfQuarter: 3 }), m('h', 34)];
    expect(assignQuarters(items).map((x) => x.quarter)).toEqual([1, 1, 2, 2, 2, 3, 3, 4]);
  });
  it('mosaïque : vedette d\'abord, sans hors-jeu', () => {
    const r = assignQuarters([m('a', 0), m('b', 1, { featured: true }), m('c', 2, { offPlay: true }), m('d', 20), m('e', 40), m('f', 60)]);
    expect(mosaicPhotos(r, 1).map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('liste vide', () => expect(assignQuarters([])).toEqual([]));
});

describe('chapitres', () => {
  it('durées cumulées → VTT', () => {
    const ch = buildChapters([
      { label: 'pre', chapter: 'Avant-match', duration: 6 }, { label: 'v1', chapter: 'Q1', duration: 100 }, { label: 'v2', chapter: 'Q1', duration: 50 },
      { label: 'p1', chapter: 'Q1', duration: 5 }, { label: 'v3', chapter: 'Q2', duration: 60 }, { label: 'fin', chapter: 'Fin', duration: 8 },
    ]);
    expect(ch).toEqual([{ title: 'Avant-match', start: 0, end: 6 }, { title: 'Q1', start: 6, end: 161 }, { title: 'Q2', start: 161, end: 221 }, { title: 'Fin', start: 221, end: 229 }]);
    const vtt = chaptersToVtt(ch);
    expect(vtt).toContain('00:00:06.000 --> 00:02:41.000\nQ1');
    expect(parseVtt(vtt)).toEqual(ch);
  });
});

describe('commandes FFmpeg', () => {
  it('normalisation standard', () => {
    const a = normalizeArgs('in.mov', 'out.mp4', { width: 1920, height: 1080, rotation: 0, hasAudio: true, duration: 10 });
    expect(a.join(' ')).toContain('force_original_aspect_ratio=decrease,pad=1920:1080');
    expect(a).toContain('libx264'); expect(a).toContain('0:a:0');
  });
  it('vidéo verticale (rotation) + sans audio', () => {
    const a = normalizeArgs('in.mov', 'out.mp4', { width: 1920, height: 1080, rotation: -90, hasAudio: false, duration: 10 }).join(' ');
    expect(a).toContain('boxblur'); expect(a).toContain('anullsrc'); expect(a).toContain('-shortest');
  });
  it('xfade offsets', () => {
    const a = xfadeChainArgs([{ path: 'a', duration: 10 }, { path: 'b', duration: 5 }, { path: 'c', duration: 4 }], 'o').join(' ');
    expect(a).toContain('offset=9.750'); expect(a).toContain('offset=14.500');
  });
  it('vague centrée sur la coupe', () => {
    expect(wipeJoinArgs('a', 6, 'b', 'w/%04d.png', 'o', 'whoosh.mp3').join(' ')).toContain('PTS-STARTPTS+5.700/TB');
  });
  it('HLS deux qualités, 1080p sans réencodage', () => {
    const a = hlsArgs('in', 'out').join(' ');
    expect(a).toContain('name:1080p'); expect(a).toContain('-hls_time 6'); expect(a).toContain('master.m3u8'); expect(a).toContain('-c:v:0 copy');
  });
  it('segment : fondus + vague en tête/queue + whoosh', () => {
    const { args, duration } = segmentArgs([{ path: 'a', duration: 10 }, { path: 'b', duration: 5 }], 'o', { head: 'h/%03d.png', tail: 't/%03d.png', whoosh: 'w.mp3' });
    const s = args.join(' ');
    expect(duration).toBeCloseTo(14.75);
    expect(s).toContain('xfade=transition=fade:duration=0.25:offset=9.750');
    expect(s).toContain('PTS-STARTPTS+14.417/TB');
    expect(s).toContain('adelay=14417|14417');
    expect(s).toContain('-g 60');
  });
});

import { settingsToStore, settingsFromStore } from './types';
import { demoSettings } from './demo';
describe('stockage Firestore des réglages', () => {
  it('aller-retour sans tableau imbriqué', () => {
    const st = demoSettings();
    const s = settingsToStore(st);
    expect(s.scores[3]).toEqual({ home: 11, away: 94 });
    expect(JSON.stringify(s)).not.toMatch(/\[\[/);
    expect(settingsFromStore(s)).toEqual(st);
  });
});
