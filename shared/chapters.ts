export interface Segment { label: string; chapter?: string; duration: number }
export interface Chapter { title: string; start: number; end: number }

export const CHAPTER_ORDER = ['Avant-match', 'Q1', 'Q2', 'Q3', 'Q4', 'Fin'] as const;

/** Construit les chapitres à partir des durées cumulées des segments (dans l'ordre de l'assemblage). */
export function buildChapters(segments: Segment[]): Chapter[] {
  const out: Chapter[] = [];
  let t = 0;
  for (const s of segments) {
    const title = s.chapter;
    if (title && (!out.length || out[out.length - 1].title !== title)) out.push({ title, start: t, end: t + s.duration });
    else if (out.length) out[out.length - 1].end = t + s.duration;
    t += s.duration;
  }
  return out;
}

function ts(sec: number): string {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)}.${p(ms % 1000, 3)}`;
}

export function chaptersToVtt(ch: Chapter[]): string {
  return 'WEBVTT\n\n' + ch.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.title}\n`).join('\n');
}

export function parseVtt(vtt: string): Chapter[] {
  const re = /(\d+):(\d+):(\d+)\.(\d+) --> (\d+):(\d+):(\d+)\.(\d+)\n(.+)/g;
  const out: Chapter[] = [];
  const sec = (h: string, m: string, s: string, ms: string) => +h * 3600 + +m * 60 + +s + +ms / 1000;
  for (const x of vtt.matchAll(re)) out.push({ start: sec(x[1], x[2], x[3], x[4]), end: sec(x[5], x[6], x[7], x[8]), title: x[9].trim() });
  return out;
}
