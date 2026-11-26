import { describe, it, expect } from 'vitest';
import { classifyCategory, ageGroupOf } from './ageGroup';
import { quarterScores, validateScores, resultLabel } from './scores';
import { assignQuarters, mosaicPhotos } from './quarters';
import { buildChapters, chaptersToVtt, parseVtt } from './chapters';
import { normalizeArgs, hlsArgs, xfadeChainArgs, wipeJoinArgs, segmentArgs, momentClipArgs, momentJoinArgs } from './ffmpeg';
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
  it('vidéos datées du jour de l’envoi (préparées par l’iPhone) : pas de décalage des photos, une vidéo par quart', () => {
    const photos = [m('p1', 0), m('p2', 3), m('p3', 20), m('p4', 22), m('p5', 45), m('p6', 47), m('p7', 65), m('p8', 66)];
    const later = Date.UTC(2026, 9, 11, 16, 0); // le lendemain, au moment de la sélection
    const vids = [3, 1, 4, 2].map((n) => m(`IMG_10${n}.MOV`, 0, { kind: 'video', name: `IMG_10${n}.MOV`, duration: 780, takenAt: later + n * 1000 }));
    const r = assignQuarters([...vids, ...photos]);
    const q = Object.fromEntries(r.map((x) => [x.name, x.quarter]));
    expect([q.p1, q.p2, q.p3, q.p4, q.p5, q.p6, q.p7, q.p8]).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect([q['IMG_101.MOV'], q['IMG_102.MOV'], q['IMG_103.MOV'], q['IMG_104.MOV']]).toEqual([1, 2, 3, 4]);
  });
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
    const j = a.join(' ');
    expect(j).toContain('force_original_aspect_ratio=decrease:flags=lanczos,hqdn3d'); expect(j).toContain('pad=1920:1080');
    expect(a).toContain('libx264'); expect(a).toContain('0:a:0');
    expect(j).not.toContain('tonemap'); expect(j).not.toContain('scale=1920:1080:flags'); // HD : pas de réduction préalable
  });
  it('4K HDR (iPhone) : réduite d’abord en 1080p, puis convertie en SDR', () => {
    const j = normalizeArgs('in.mov', 'out.mp4', { width: 3840, height: 2160, rotation: 0, hasAudio: true, duration: 10, hdr: true }).join(' ');
    expect(j).toContain('[0:v]scale=1920:1080:flags=lanczos,zscale=t=linear');
    expect(j).toContain('tonemap=tonemap=hable'); expect(j).toContain('-color_primaries bt709');
  });
  it('4K verticale (Android, tournée) : réduite à 1920 px de haut', () => {
    const j = normalizeArgs('in.mp4', 'out.mp4', { width: 3840, height: 2160, rotation: 90, hasAudio: true, duration: 10 }).join(' ');
    expect(j).toContain('[0:v]scale=1080:1920:flags=lanczos,split=2'); expect(j).toContain('boxblur');
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
    expect(s).toContain('-g 60'); expect(s).toContain('-preset medium'); expect(s).toContain('-maxrate 8000k');
  });
  it('logo BeHoop : piste en boucle, posée sous les vagues, absente sans option', () => {
    const { args } = segmentArgs([{ path: 'a', duration: 10 }], 'o', { head: 'h/%03d.png', tail: 't/%03d.png', bug: 'bug.mov' });
    const s = args.join(' ');
    expect(s).toContain('-stream_loop -1 -i bug.mov');
    expect(s).toContain('[3:v]setpts=PTS-STARTPTS+0.8/TB[bug]');
    // le logo est superposé avant la vague d'entrée (la vague le recouvre)
    expect(s.indexOf('overlay=W-w-36:20:shortest=1')).toBeLessThan(s.indexOf('[1:v]overlay=0:0'));
    expect(segmentArgs([{ path: 'a', duration: 10 }], 'o').args.join(' ')).not.toContain('stream_loop');
  });
  it('Moment : passage plein écran recadré (position choisie) ou image entière sur fond flou', () => {
    const full = momentClipArgs('in.m3u8', 10, 18, 'full', 0.25, 'c.mp4').join(' ');
    expect(full).toContain('scale=-2:1920:flags=lanczos,crop=1080:1920:(iw-1080)*0.250:0');
    expect(momentClipArgs('in.m3u8', 10, 18, 'fit', 0.5, 'c.mp4').join(' ')).toContain('boxblur=40:2');
  });
  it('Moment : passages enchaînés, vague sur chaque coupure, logo sous le bandeau, whoosh', () => {
    const { args, duration } = momentJoinArgs({ clips: [{ path: 'a', duration: 8 }, { path: 'b', duration: 6 }, { path: 'c', duration: 10 }], banner: 'b.png', output: 'o.mp4', bug: 'bug.mov', wave: 'w/%04d.png', waveCut: 0.35, whoosh: 'wh.m4a' });
    const s = args.join(' ');
    expect(duration).toBe(24);
    expect(s).toContain('[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[v0][a0]');
    expect(s).toContain('PTS-STARTPTS+7.650/TB[w0]'); expect(s).toContain('PTS-STARTPTS+13.650/TB[w1]');
    expect(s).toContain('overlay=W-w-24:300:shortest=1');
    expect(s).toContain('adelay=7700|7700'); expect(s).toContain('amix=inputs=3');
    const one = momentJoinArgs({ clips: [{ path: 'a', duration: 8 }], banner: 'b.png', output: 'o.mp4' }).args.join(' ');
    expect(one).toContain('concat=n=1:v=1:a=1[v0][a]'); expect(one).not.toContain('amix');
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

import { isMini } from './mini';
describe('isMini (mini-basket U6–U13)', () => {
  it('reconnaît les noms AWBB, Flandre et abrégés', () => {
    for (const n of ['U12 Mixte A', 'Provincial U10 - Série A', 'U12HM G', 'PU12HM', 'CDU12', 'Jongens U12', 'U7M B', 'Amicaux U8 / U6', 'Benjamins']) expect(isMini(n), n).toBe(true);
  });
  it('pas les U14 et plus, ni les seniors', () => {
    for (const n of ['U14 Mixte A', 'PU16H', 'RU14H', 'U21', 'P1H', 'EuroBasket féminin 2027', 'Top Division Men 1', 'U19 Niveau 2']) expect(isMini(n), n).toBe(false);
  });
});
