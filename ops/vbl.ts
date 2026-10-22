// Clubs de Flandre (Basketbal Vlaanderen) → vbl.json au même format allégé que l'AWBB + calendriers .ics.
// Lancé par update.yml après scraper.py (qui n'est pas modifié). En cas d'échec, l'ancien vbl.json est conservé.
import { writeFileSync, mkdirSync } from 'node:fs';
import { classifyCategory } from '../shared/ageGroup';
import type { SlimClub, SlimGame } from './appData';

const API = 'https://vblcb.wisseq.eu/VBLCB_WebService/data';
const FLANDRE = ['Antwerpen', 'Limburg', 'Oost-Vlaanderen', 'West-Vlaanderen', 'Vlaams-Brabant'];
const PROVINCE_FR: Record<string, string> = { Antwerpen: 'Anvers', Limburg: 'Limbourg', 'Oost-Vlaanderen': 'Flandre-Orientale', 'West-Vlaanderen': 'Flandre-Occidentale', 'Vlaams-Brabant': 'Brabant flamand' };

/** Identifiant numérique stable dérivé d'un GUID VBL (les identifiants AWBB restent < 10 milliards). */
export function vblId(guid: string): number {
  let h = 0x811c9dc5;
  for (const ch of guid.trim()) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return 10_000_000_000 + h;
}
/** « Heren Senioren » → « Messieurs Seniors », « Meisjes U14 » → « Filles U14 »… */
export function catFr(categorie: string, naam: string): string {
  const dico: Record<string, string> = { Heren: 'Messieurs', Dames: 'Dames', Jongens: 'Garçons', Meisjes: 'Filles', Gemengd: 'Mixte', Senioren: 'Seniors', Junioren: 'Juniors', Kadetten: 'Cadets', Miniemen: 'Minimes', Pupillen: 'Pupilles', Benjamins: 'Benjamins', Microben: 'Micro', Recreatief: 'Récréatif' };
  // « G12 U12 Gemengd » : on retire le code interne (lettre + 2 chiffres)
  const fr = categorie.split(/\s+/).filter((w) => !/^(?!U)[A-Z]\d{2}$/.test(w)).map((w) => dico[w] ?? w).join(' ');
  const letter = /\s([A-Z])$/.exec(naam.trim())?.[1];
  return letter ? `${fr} ${letter}` : fr;
}
const date = (s: string) => { const [d, m, y] = s.split('-'); return `${y}-${m}-${d}`; };
export const score = (u: string): [number, number] | null => { const m = /(\d+)\s*-\s*(\d+)/.exec(u ?? ''); return m ? [+m[1], +m[2]] : null; };
const color = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) && c.toLowerCase() !== '#ffffff' ? c : null);

async function get<T>(path: string, tries = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(`${API}/${path}`, { headers: { 'User-Agent': 'BeHoop/1.0 (+https://behoop.be)' }, signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`${r.status}`);
      return (await r.json()) as T;
    } catch (e) { if (i >= tries - 1) throw e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
}
async function pool<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await f(items[k]).catch(() => undefined as R); } }));
  return out;
}

/** uid : équipe (identifiant) ou compétition ('comp-bnxt'), pour des UID d'événements propres à chaque calendrier */
export function ics(teamName: string, games: SlimGame[], teamId: number | string) {
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const ev = games.filter((g) => g.t).map((g) => {
    const [h, m] = g.t.split(':'); const start = `${g.d.replace(/-/g, '')}T${h}${m}00`;
    const end = `${g.d.replace(/-/g, '')}T${String(Math.min(23, +h + 2)).padStart(2, '0')}${m}00`;
    const res = g.hs !== null ? ` (${g.hs}-${g.as})` : '';
    return ['BEGIN:VEVENT', `UID:bh-${g.id}-${teamId}@behoop.be`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART;TZID=Europe/Brussels:${start}`, `DTEND;TZID=Europe/Brussels:${end}`, `SUMMARY:${esc(`${g.hn} – ${g.an}${res}`)}`,
      `LOCATION:${esc([g.v, g.adr].filter(Boolean).join(', '))}`, `DESCRIPTION:${esc(g.sn)}`, 'END:VEVENT'].join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BeHoop//Basket//FR', `X-WR-CALNAME:${esc(teamName)}`, 'X-WR-TIMEZONE:Europe/Brussels', ...ev, 'END:VCALENDAR'].join('\r\n');
}

export async function run(outFile = 'vbl.json', calDir = 'calendars') {
  const allOrgs = await get<any[]>('OrgList?p=1');
  const orgs = allOrgs.filter((o) => FLANDRE.includes(o.regioNaam) || o.regioNaam === 'AWBB');
  console.log(`Flandre : ${orgs.length} clubs`);
  const details = await pool(orgs, 6, (o) => get<any[]>(`OrgDetailByGuid?issguid=${encodeURIComponent(o.guid)}`).then((d) => (Array.isArray(d) ? d[0] : d)));
  const clubs: SlimClub[] = []; const teamGuids: { guid: string; name: string; id: number }[] = []; const poules = new Map<string, string>();
  const venues = new Map<string, { name: string; adr: string }>();
  const national: { id: number; stamNr: string; name: string; city: string; logo: string; c1: string; c2: string; teams: SlimClub['teams'] }[] = [];
  details.forEach((d, i) => {
    if (!d || !(d.teams ?? []).length) return; // club sans équipe inscrite cette saison
    const o = orgs[i];
    if (o.regioNaam === 'AWBB') {
      // Club wallon inscrit en national : ses équipes seront rattachées au club AWBB existant (matricule / nom)
      const c1n = color(d.shirtKleur) ?? color(d.shirtReserve) ?? '#1a6fe0';
      national.push({ id: vblId(o.guid), stamNr: String(d.stamNr ?? o.stamNr ?? ''), name: (d.naam ?? o.naam).trim(), city: o.plaats ?? '', logo: `https://vblapi1.wisseq.eu/vbldataOrgLogo/${o.guid.trim()}.jpg`, c1: c1n, c2: color(d.shirtReserve) ?? c1n, teams: (d.teams ?? []).map((t: any) => {
        teamGuids.push({ guid: t.guid, name: t.naam.trim(), id: vblId(t.guid) });
        (t.poules ?? []).forEach((p: any) => poules.set(p.guid, p.naam));
        return { id: vblId(t.guid), name: t.naam.trim(), cat: `${catFr(t.categorie ?? '', t.naam)} · National`, ag: classifyCategory(t.categorie) };
      }) });
      return;
    }
    (d.accomms ?? []).forEach((a: any) => venues.set(a.guid, { name: a.naam?.trim(), adr: [[a.adres?.straat?.trim(), a.adres?.huisNr].filter(Boolean).join(' '), [a.adres?.postcode, a.adres?.plaats].filter(Boolean).join(' ')].filter(Boolean).join(', ') }));
    const v = d.accomms?.[0];
    const c1 = color(d.shirtKleur) ?? color(d.shirtReserve) ?? '#1a6fe0';
    clubs.push({
      id: vblId(o.guid), name: d.naam?.trim() ?? o.naam, short: (d.naam ?? o.naam).trim(), province: PROVINCE_FR[o.regioNaam] ?? o.regioNaam, logo: `https://vblapi1.wisseq.eu/vbldataOrgLogo/${o.guid.trim()}.jpg`,
      c1, c2: color(d.shirtReserve) ?? c1, city: o.plaats ?? '',
      venue: v ? { name: v.naam?.trim(), street: [v.adres?.straat?.trim(), v.adres?.huisNr].filter(Boolean).join(' '), zip: v.adres?.postcode ?? '', city: v.adres?.plaats ?? '' } : null,
      teams: (d.teams ?? []).map((t: any) => {
        teamGuids.push({ guid: t.guid, name: t.naam.trim(), id: vblId(t.guid) });
        (t.poules ?? []).forEach((p: any) => poules.set(p.guid, p.naam));
        return { id: vblId(t.guid), name: t.naam.trim(), cat: catFr(t.categorie ?? '', t.naam), ag: classifyCategory(t.categorie) };
      }),
    });
  });
  console.log(`Flandre : ${teamGuids.length} équipes, ${poules.size} compétitions`);
  const matchLists = await pool(teamGuids, 6, (t) => get<any[]>(`TeamMatchesByGuid?teamguid=${encodeURIComponent(t.guid)}`));
  const games = new Map<number, SlimGame>();
  matchLists.forEach((l) => (l ?? []).forEach((m: any) => {
    const id = vblId(m.guid); if (games.has(id) || !m.datumString || !m.tTGUID || !m.tUGUID) return; // match pas encore programmé
    const sc = m.gespeeld === 'G' ? score(m.uitslag) : null;
    const v = venues.get(m.accGUID);
    games.set(id, { id, d: date(m.datumString), t: (m.beginTijd ?? '').replace('.', ':'), s: vblId(m.pouleGUID), sn: m.pouleNaam ?? '',
      h: vblId(m.tTGUID), a: vblId(m.tUGUID), hn: m.tTNaam?.trim() ?? '', an: m.tUNaam?.trim() ?? '', hs: sc?.[0] ?? null, as: sc?.[1] ?? null,
      v: v?.name ?? m.accNaam?.trim() ?? '', adr: v?.adr ?? '', ty: /beker|coupe/i.test(m.pouleNaam ?? '') ? 'coupe' : /vriend|oefen|amical/i.test(m.pouleNaam ?? '') ? 'amical' : 'championnat' });
  }));
  const pouleGuids = [...poules.keys()];
  const standingsRaw = await pool(pouleGuids, 6, (g) => get<any[]>(`pouleByGuid?pouleguid=${encodeURIComponent(g)}`).then((d) => (Array.isArray(d) ? d[0] : d)));
  const standings: Record<number, unknown[]> = {}; const series: Record<number, { id: number; name: string; short: string }> = {};
  pouleGuids.forEach((g, i) => {
    const sid = vblId(g); series[sid] = { id: sid, name: poules.get(g)!, short: poules.get(g)! };
    standings[sid] = (standingsRaw[i]?.teams ?? []).map((t: any) => ({ team: vblId(t.guid), played: +t.wedAant || 0, wins: +t.wedWinst || 0, losses: +t.wedVerloren || 0, pf: +t.ptVoor || 0, pa: +t.ptTegen || 0, pts: +t.wedPunt || 0, draws: +t.wedGelijk || undefined, rank: +t.rangNr || undefined })).sort((a: any, b: any) => (a.rank ?? 999) - (b.rank ?? 999));
  });
  const all = [...games.values()].sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t));
  // guids : identifiant d'équipe → GUID Basketbal Vlaanderen (pour les résultats rapides, ops/live-results.ts)
  const guids = Object.fromEntries(teamGuids.map((t) => [t.id, t.guid]));
  writeFileSync(outFile, JSON.stringify({ generated_at: new Date().toISOString(), source: 'Basketbal Vlaanderen', clubs, national, games: all, series, standings, guids }));
  mkdirSync(calDir, { recursive: true });
  for (const t of teamGuids) writeFileSync(`${calDir}/team-${t.id}.ics`, ics(t.name, all.filter((g) => g.h === t.id || g.a === t.id), t.id));
  console.log(`vbl.json : ${clubs.length} clubs flamands, ${national.length} clubs wallons en national, ${all.length} matchs, ${pouleGuids.length} classements`);
}

if (import.meta.url === `file://${process.argv[1]}`) run().catch((e) => { console.error('Flandre indisponible :', e.message); process.exit(1); });
