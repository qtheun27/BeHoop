// Basket pro et international → pro.json au même format allégé que l'AWBB + calendriers .ics :
//  • BNXT League (API du site officiel bnxtleague.com, lecture seule, 2×/jour) ;
//  • NBA et Belgian Lions / FIBA (données publiques ESPN).
// Lancé par update.yml (étape non bloquante). En cas d'échec d'une source, la précédente version est gardée.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import type { SlimClub, SlimGame } from './appData';
import { ics } from './vbl';

const BNXT = 'https://bnxt.sportpress.info/api/v1';
const BNXT_HEADERS = { 'X-Authorization': 'BWSyE7sgg9QAurh2JX9cpjzjGc652BWLuNUS', 'X-Localization': 'fr', 'Content-Type': 'application/json' }; // clé publique du site officiel
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball';
const UA = { 'User-Agent': 'BeHoop/1.0 (+https://behoop.be)' };
const BELGIUM_FIBA = '106761';
import type { Standing } from './allData';
export interface Pro { clubs: SlimClub[]; games: SlimGame[]; series: Record<number, { id: number; name: string; short: string }>; standings: Record<number, Standing[]>; attach: Record<number, string> }

const id = (base: number, n: string | number) => base + Number(n);
const get = async (url: string, headers: Record<string, string> = {}, ua = true) => {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url, { headers: { ...(ua ? UA : {}), ...headers }, signal: AbortSignal.timeout(30_000) }); if (!r.ok) throw new Error(`${r.status}`); return await r.json(); }
    catch (e) { if (i >= 2) throw e; await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
  }
};
/** Date et heure à Bruxelles à partir d'une date ISO (UTC). */
const bxl = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { d: `${p.year}-${p.month}-${p.day}`, t: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
};
const hex = (c?: string) => (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : '#1a6fe0');

async function bnxt(out: Pro) {
  const seasons = await get(`${BNXT}/phase/season/${new Date().getMonth() >= 6 ? new Date().getFullYear() + 1 : new Date().getFullYear()}`, BNXT_HEADERS);
  const comp = seasons.data?.[0]; if (!comp) return;
  const seen = new Map<number, SlimClub>();
  const team = (ct: any) => {
    const tid = id(20e9, ct.id);
    if (!seen.has(tid)) {
      const c: SlimClub = { id: tid, name: ct.name, short: ct.name, province: 'BNXT League', logo: ct.team_logo?.thumbnails?.medium ?? ct.team_logo?.public_url ?? null, c1: '#f26a1b', c2: '#0a0c12', city: '', venue: null,
        teams: [{ id: tid, name: ct.name, cat: 'BNXT League', ag: 'seniors' }] };
      seen.set(tid, c); out.clubs.push(c); out.attach[tid] = ct.name;
    }
    return tid;
  };
  for (const ph of comp.phases) {
    const sid = id(20e9, ph.id);
    out.series[sid] = { id: sid, name: `${comp.competition.name} · ${ph.name}`, short: 'BNXT League' };
    const st = await get(`${BNXT}/standings/competition/${comp.competition.id}/phase/${ph.id}`, BNXT_HEADERS).catch(() => ({ data: [] }));
    out.standings[sid] = (st.data ?? []).map((r: any) => ({ team: team(r.team), played: r.played, wins: r.win, losses: r.loss, pf: r.score, pa: r.against, pts: r.point, draws: r.even || undefined, rank: r.position })).sort((a: Standing, b: Standing) => a.rank! - b.rank!);
    for (const m of [9, 10, 11, 12, 1, 2, 3, 4, 5, 6]) {
      const r = await get(`${BNXT}/schedule/club/${comp.competition.season}?clubs%5B0%5D=1&clubs%5B1%5D=2&phase_id=${ph.id}&monthCount=1&month=${m}`, BNXT_HEADERS).catch(() => ({ data: [] }));
      for (const g of r.data ?? []) {
        const h = g.competitors.find((c: any) => c.side === 1) ?? g.competitors[0], a = g.competitors.find((c: any) => c.side === 2) ?? g.competitors[1];
        if (!h || !a) continue;
        const [d, t] = g.game_time.split(' ');
        const done = g.status === 'finished';
        out.games.push({ id: id(20e9, g.id), d, t: t.slice(0, 5), s: sid, sn: 'BNXT League', h: team(h.competition_team), a: team(a.competition_team),
          hn: h.competition_team.name, an: a.competition_team.name, hs: done ? h.finalScore : null, as: done ? a.finalScore : null, v: g.arena?.name ?? '', adr: '', ty: 'championnat' });
      }
    }
  }
  console.log(`BNXT : ${seen.size} équipes`);
}

function espnGame(e: any, sid: number, sn: string, teamId: (t: any) => number): SlimGame {
  const c = e.competitions[0];
  const h = c.competitors.find((x: any) => x.homeAway === 'home'), a = c.competitors.find((x: any) => x.homeAway === 'away');
  const done = c.status?.type?.completed;
  const sc = (x: any) => (done ? Number(x.score?.value ?? x.score?.displayValue ?? x.score) : null);
  const { d, t } = bxl(e.date);
  return { id: id(21e9, e.id), d, t, s: sid, sn, h: teamId(h.team), a: teamId(a.team), hn: h.team.displayName, an: a.team.displayName, hs: sc(h), as: sc(a),
    v: c.venue?.fullName ?? '', adr: [c.venue?.address?.city, c.venue?.address?.country].filter(Boolean).join(', '), ty: 'championnat' };
}

async function nba(out: Pro) {
  const teams = (await get(`${ESPN}/nba/teams`, {}, false)).sports[0].leagues[0].teams.map((x: any) => x.team);
  const tid = (t: any) => id(22e9, t.id);
  const conf = new Map<string, number>();
  // Saison régulière seulement (sans seasontype, ESPN renvoie le classement des matchs de préparation en octobre)
  const year = new Date().getMonth() >= 6 ? new Date().getFullYear() + 1 : new Date().getFullYear();
  const st = await get(`https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${year}&seasontype=2`, {}, false);
  if (st.children?.[0]?.standings?.seasonType !== 2) throw new Error('classement NBA : saison régulière introuvable');
  st.children.forEach((ch: any, i: number) => {
    const sid = id(22e9, 900 + i); out.series[sid] = { id: sid, name: `NBA · ${ch.name === 'Eastern Conference' ? 'Conférence Est' : 'Conférence Ouest'}`, short: 'NBA' };
    const v = (e: any, n: string) => Number(e.stats.find((s: any) => s.name === n)?.value ?? 0);
    // Ordre officiel NBA : tête de série (playoffSeed, départages compris), puis nom tant qu'aucun match n'est joué
    const rows = ch.standings.entries.map((e: any) => { conf.set(e.team.id, sid); return { seed: v(e, 'playoffSeed'), name: e.team.displayName as string, team: tid(e.team), played: v(e, 'wins') + v(e, 'losses'), wins: v(e, 'wins'), losses: v(e, 'losses'), pf: v(e, 'pointsFor'), pa: v(e, 'pointsAgainst'), pts: v(e, 'wins') }; });
    rows.sort((a: any, b: any) => a.seed - b.seed || a.name.localeCompare(b.name));
    out.standings[sid] = rows.map(({ seed, name, ...r }: any, i: number) => ({ ...r, rank: i + 1 }));
  });
  for (const t of teams) {
    out.clubs.push({ id: tid(t), name: t.displayName, short: t.shortDisplayName ?? t.displayName, province: 'NBA', logo: t.logos?.[0]?.href ?? null, c1: hex(t.color), c2: hex(t.alternateColor), city: t.location ?? '', venue: null,
      teams: [{ id: tid(t), name: t.displayName, cat: 'NBA', ag: 'seniors' }] });
    const sch = await get(`${ESPN}/nba/teams/${t.id}/schedule`, {}, false).catch(() => ({ events: [] }));
    for (const e of sch.events ?? []) out.games.push(espnGame(e, conf.get(t.id) ?? id(22e9, 900), 'NBA', tid));
  }
  console.log(`NBA : ${teams.length} équipes`);
}

async function fiba(out: Pro) {
  const sch = await get(`${ESPN}/fiba/teams/${BELGIUM_FIBA}/schedule`, {}, false);
  const tid = (t: any) => id(23e9, t.id);
  const be = tid({ id: BELGIUM_FIBA });
  out.clubs.push({ id: be, name: 'Belgian Lions', short: 'Belgian Lions', province: 'International', logo: 'https://a.espncdn.com/i/teamlogos/countries/500/bel.png', c1: '#c8102e', c2: '#f2c14e', city: 'Belgique', venue: null,
    teams: [{ id: be, name: 'Belgian Lions', cat: 'Équipe nationale · Messieurs', ag: 'seniors' }] });
  const sid = id(23e9, 1); out.series[sid] = { id: sid, name: 'FIBA · Belgian Lions', short: 'FIBA' }; out.standings[sid] = [];
  for (const e of sch.events ?? []) {
    const g = espnGame(e, sid, `FIBA ${e.season?.year ?? ''}`.trim(), tid);
    if (g.hn.includes('Belgium')) { g.hn = 'Belgian Lions'; g.h = be; } else g.hn = g.hn.replace(/(\S+) \1$/, '$1');
    if (g.an.includes('Belgium')) { g.an = 'Belgian Lions'; g.a = be; } else g.an = g.an.replace(/(\S+) \1$/, '$1');
    out.games.push(g);
  }
  console.log(`FIBA : ${sch.events?.length ?? 0} matchs des Belgian Lions`);
}

export async function run(outFile = 'pro.json', calDir = 'calendars') {
  const prev: Pro | null = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null;
  const out: Pro = { clubs: [], games: [], series: {}, standings: {}, attach: {} };
  // Chaque source est indépendante : si l'une échoue, on reprend ses données de la version précédente
  for (const [name, f, base] of [['BNXT', bnxt, 20e9], ['NBA', nba, 22e9], ['FIBA', fiba, 23e9]] as const) {
    try { await f(out); }
    catch (e) {
      console.error(`${name} indisponible (${(e as Error).message}) : données précédentes conservées`);
      if (prev) { const mine = (x: number) => x >= base && x < base + 1e9; out.clubs.push(...prev.clubs.filter((c) => mine(c.id))); out.games.push(...prev.games.filter((g) => mine(g.s)));
        for (const [k, v] of Object.entries(prev.series)) if (mine(+k)) { out.series[+k] = v; out.standings[+k] = prev.standings[+k] ?? []; } }
    }
  }
  const uniq = new Map(out.games.map((g) => [g.id, g]));
  out.games = [...uniq.values()].sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t));
  writeFileSync(outFile, JSON.stringify({ generated_at: new Date().toISOString(), ...out }));
  mkdirSync(calDir, { recursive: true });
  for (const c of out.clubs) for (const t of c.teams) writeFileSync(`${calDir}/team-${t.id}.ics`, ics(t.name, out.games.filter((g) => g.h === t.id || g.a === t.id), t.id));
  console.log(`pro.json : ${out.clubs.length} équipes, ${out.games.length} matchs`);
}
if (import.meta.url === `file://${process.argv[1]}`) run().catch((e) => { console.error(e); process.exit(1); });
