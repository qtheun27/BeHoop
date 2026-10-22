// Basket pro et international → pro.json au même format allégé que l'AWBB + calendriers .ics :
//  • BNXT League (API du site officiel bnxtleague.com, lecture seule, 2×/jour) ;
//  • NBA et WNBA (données publiques ESPN) ;
//  • compétitions FIBA (Champions League, Europe Cup, EuroLeague/EuroCup Women, Coupe du monde, EuroBasket), Lions et Cats ;
//  • EuroLeague et EuroCup (API officielle d'Euroleague Basketball).
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

/** NBA et WNBA (ESPN) : une série par conférence, classement officiel de la saison régulière.
 *  La WNBA se joue sur une année civile (mai → octobre), la NBA d'octobre à juin. */
async function nba(out: Pro, league: 'nba' | 'wnba' = 'nba', base = 22e9) {
  const label = league.toUpperCase();
  const teams = (await get(`${ESPN}/${league}/teams`, {}, false)).sports[0].leagues[0].teams.map((x: any) => x.team);
  const tid = (t: any) => id(base, t.id);
  const conf = new Map<string, number>();
  // Saison régulière seulement (sans seasontype, ESPN renvoie le classement des matchs de préparation en octobre)
  const year = league === 'wnba' ? new Date().getFullYear() : new Date().getMonth() >= 6 ? new Date().getFullYear() + 1 : new Date().getFullYear();
  const st = await get(`https://site.api.espn.com/apis/v2/sports/basketball/${league}/standings?season=${year}&seasontype=2`, {}, false);
  if (st.children?.[0]?.standings?.seasonType !== 2) throw new Error(`classement ${label} : saison régulière introuvable`);
  st.children.forEach((ch: any, i: number) => {
    const sid = id(base, 900 + i); out.series[sid] = { id: sid, name: `${label} · ${/east/i.test(ch.name) ? 'Conférence Est' : 'Conférence Ouest'}`, short: label };
    const v = (e: any, n: string) => Number(e.stats.find((s: any) => s.name === n)?.value ?? 0);
    // Ordre officiel NBA : tête de série (playoffSeed, départages compris), puis nom tant qu'aucun match n'est joué
    const rows = ch.standings.entries.map((e: any) => { conf.set(e.team.id, sid); return { seed: v(e, 'playoffSeed'), name: e.team.displayName as string, team: tid(e.team), played: v(e, 'wins') + v(e, 'losses'), wins: v(e, 'wins'), losses: v(e, 'losses'), pf: v(e, 'pointsFor'), pa: v(e, 'pointsAgainst'), pts: v(e, 'wins') }; });
    rows.sort((a: any, b: any) => a.seed - b.seed || a.name.localeCompare(b.name));
    out.standings[sid] = rows.map(({ seed, name, ...r }: any, i: number) => ({ ...r, rank: i + 1 }));
  });
  for (const t of teams) {
    out.clubs.push({ id: tid(t), name: t.displayName, short: t.shortDisplayName ?? t.displayName, province: label, logo: t.logos?.[0]?.href ?? null, c1: hex(t.color), c2: hex(t.alternateColor), city: t.location ?? '', venue: null,
      teams: [{ id: tid(t), name: t.displayName, cat: label, ag: 'seniors' }] });
    // Saison régulière (2) et playoffs (3) séparément ; jamais les matchs de préparation (1), qui ne comptent pas
    for (const type of [2, 3]) {
      const sch = await get(`${ESPN}/${league}/teams/${t.id}/schedule?season=${year}&seasontype=${type}`, {}, false).catch(() => ({ events: [] }));
      for (const e of sch.events ?? []) {
        if ((e.seasonType?.type ?? type) !== type) continue;
        // Match spécial hors classement (ex. finale de la Commissioner's Cup WNBA, In-Season Tournament NBA)
        const special = type === 2 && e.competitions?.[0]?.type?.abbreviation && e.competitions[0].type.abbreviation !== 'STD';
        const sid = type === 3 ? id(base, 950) : special ? id(base, 960) : conf.get(t.id) ?? id(base, 900);
        if (type === 3) out.series[sid] ??= { id: sid, name: `${label} · Playoffs`, short: label };
        if (special) out.series[sid] ??= { id: sid, name: `${label} · ${(e.competitions[0].notes?.[0]?.headline ?? 'Coupe').replace(new RegExp(`^${label}\\s*`), '')}`, short: label };
        const g = espnGame(e, sid, label, tid); if (special) g.ty = 'coupe';
        out.games.push(g);
      }
    }
  }
  console.log(`${label} : ${teams.length} équipes`);
}

/** EuroLeague (E) et EuroCup (U) : API officielle d'Euroleague Basketball (api-live.euroleague.net), lecture seule.
 *  Classement officiel par groupe (position), matchs et résultats de la saison en cours. */
async function euroleague(out: Pro, code: 'E' | 'U', base: number, label: string) {
  const EL = 'https://api-live.euroleague.net/v2/competitions';
  const now = new Date(); const season = `${code}${now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1}`;
  const games = (await get(`${EL}/${code}/seasons/${season}/games`)).data as any[];
  if (!games?.length) throw new Error(`${label} : aucun match`);
  const tid = (c: string) => id(base, parseInt(c, 36));
  const clubs = new Map<string, any>();
  const sidOf = (grp: any) => id(base, 900 + (grp?.order ?? 0));
  const serieName = (grp: any) => !grp?.rawName || /regular season/i.test(grp.rawName) ? `${label} · Saison régulière` : `${label} · Groupe ${grp.rawName}`;
  for (const g of games) {
    for (const side of [g.local, g.road]) if (side?.club?.code && !side.club.isVirtual) clubs.set(side.club.code, side.club);
    if (!g.local?.club || !g.road?.club || g.local.club.isVirtual || g.road.club.isVirtual) continue; // tour final : adversaire pas encore connu
    const sid = sidOf(g.group);
    out.series[sid] ??= { id: sid, name: serieName(g.group), short: label };
    const { d, t } = bxl(g.utcDate);
    out.games.push({ id: id(base, 5e8 + g.gameCode), d, t, s: sid, sn: label, h: tid(g.local.club.code), a: tid(g.road.club.code), hn: g.local.club.name, an: g.road.club.name,
      hs: g.played ? g.local.score : null, as: g.played ? g.road.score : null, v: g.venue?.name ? g.venue.name.replace(/\b\w+/g, (w: string) => w[0] + w.slice(1).toLowerCase()) : '', adr: g.venue?.address ?? '', ty: 'championnat' });
  }
  for (const [c, club] of clubs) out.clubs.push({ id: tid(c), name: club.name, short: club.abbreviatedName ?? club.name, province: label, logo: club.images?.crest ?? null, c1: '#f26a1b', c2: '#0a0c12', city: '', venue: null,
    teams: [{ id: tid(c), name: club.name, cat: label, ag: 'seniors' }] });
  // Classement officiel à la dernière journée jouée de la saison régulière
  const round = Math.max(1, ...games.filter((g) => g.played && g.phaseType?.code === 'RS').map((g) => g.round));
  const st = await get(`${EL}/${code}/seasons/${season}/rounds/${round}/standings`);
  for (const grp of st as any[]) {
    const sid = sidOf(grp.group);
    out.series[sid] ??= { id: sid, name: serieName(grp.group), short: label };
    out.standings[sid] = grp.standings.map((r: any) => ({ team: tid(r.club.code), played: r.data.gamesPlayed, wins: r.data.gamesWon, losses: r.data.gamesLost, pf: r.data.pointsFavour, pa: r.data.pointsAgainst, pts: r.data.gamesWon, rank: r.data.position }))
      .sort((a: Standing, b: Standing) => a.rank! - b.rank!);
  }
  console.log(`${label} : ${clubs.size} clubs, ${games.length} matchs`);
}

/** Équipes nationales belges : Belgian Lions et Belgian Cats. Leurs matchs viennent des épreuves FIBA (FIBA_EVENTS). */
async function nationalTeams(out: Pro) {
  out.clubs.push({ id: LIONS, name: 'Belgian Lions', short: 'Belgian Lions', province: 'International', logo: '/logos/comps/lions.webp', c1: '#c8102e', c2: '#f2c14e', city: 'Belgique', venue: null,
    teams: [{ id: LIONS, name: 'Belgian Lions', cat: 'Équipe nationale · Messieurs', ag: 'seniors' }] });
  out.clubs.push({ id: CATS, name: 'Belgian Cats', short: 'Belgian Cats', province: 'International', logo: '/logos/comps/cats.webp', c1: '#111111', c2: '#f2c14e', city: 'Belgique', venue: null,
    teams: [{ id: CATS, name: 'Belgian Cats', cat: 'Équipe nationale · Dames', ag: 'seniors' }] });
}

/* ---------- Compétitions FIBA (sites officiels FIBA : données du site, lecture seule) ----------
 * Les pages « standings » des sites FIBA contiennent tous les matchs de l'épreuve et le classement officiel
 * de chaque groupe (rang FIBA, départages compris). On les lit telles quelles. */
const FIBA_UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' };
/** Objets JSON qui commencent par `start` dans le flux de données Next.js de la page */
export function jsonObjects(txt: string, start: string): any[] {
  const out: any[] = [];
  for (let i = txt.indexOf(start); i >= 0; i = txt.indexOf(start, i + 1)) {
    let depth = 0, j = i;
    for (; j < txt.length; j++) {
      const c = txt[j];
      if (c === '"') { for (j++; txt[j] !== '"'; j += txt[j] === '\\' ? 2 : 1); }
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) break;
    }
    try { out.push(JSON.parse(txt.slice(i, j + 1))); } catch { /* objet tronqué */ }
  }
  return out;
}
async function fibaPage(url: string) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: FIBA_UA, signal: AbortSignal.timeout(40_000) }); if (!r.ok) throw new Error(`${r.status}`);
      const html = await r.text();
      return [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map((m) => JSON.parse(`"${m[1]}"`)).join('');
    } catch (e) { if (i >= 2) throw e; await new Promise((r) => setTimeout(r, 3000 * (i + 1))); }
  }
}
/** Équipes nationales : drapeau du pays (logos/flags, dessins libres flag-icons, licence MIT) plutôt que le logo hébergé par la FIBA.
 *  Code FIBA/CIO à 3 lettres → code ISO (ops/ioc-flags.json). */
const FLAGS: Record<string, string> = JSON.parse(readFileSync(new URL('./ioc-flags.json', import.meta.url), 'utf8'));
export const flagLogo = (code?: string) => (code && FLAGS[code] ? `/logos/flags/${FLAGS[code]}.svg` : null);
export const fibaLogo = (organisationId: number) => `https://assets.fiba.basketball/image/upload/w_160,h_160,c_fit/f_png/.logoflag--light--organisation_${organisationId}.webp`;
// Qualifications FIBA : au 2e tour, le classement officiel reprend les résultats du 1er tour contre les équipes encore présentes.
const ROUND_FR: Record<string, string> = { 'Regular Season': 'Saison régulière', 'First Round': '1er tour', '1st Round': '1er tour', 'Second Round': '2e tour', '2nd Round': '2e tour',
  'Round of 16': 'Huitièmes', 'Group Phase': 'Phase de groupes', 'Play-Offs': 'Play-offs', 'Final Four': 'Final Four', 'Final Six': 'Final Six', 'Quarter-Finals': 'Quarts de finale',
  'Semi-Finals': 'Demi-finales', Final: 'Finale', Hosts: 'Pays hôtes', Bracket: 'Phase finale' };
export interface FibaEvent { url: string; base: number; label: string; women?: boolean; national?: boolean }
/** Équipe nationale belge : même fiche que celle déjà connue (Belgian Lions / Belgian Cats) */
const LIONS = 23e9 + Number(BELGIUM_FIBA), CATS = 23e9 + 1e6;
async function fibaEvent(out: Pro, ev: FibaEvent) {
  const txt = await fibaPage(ev.url);
  // Un même match peut apparaître plusieurs fois ; certaines copies renvoient vers une autre (« $62:props:teamA ») :
  // on garde la version complète de chaque match.
  const full = (x: unknown) => x === null || (typeof x === 'object' && x !== null);
  const games = [...new Map(jsonObjects(txt, '{"gameId":').filter((g) => g.round && g.teamA !== undefined && full(g.teamA) && full(g.teamB))
    .map((g) => [g.gameId, g])).values()];
  if (!games.length) throw new Error(`${ev.label} : aucun match sur la page`);
  const seen = new Map<number, SlimClub>();
  const team = (x: any) => {
    if (ev.national && /^belgium$/i.test(x.officialName ?? x.shortName)) return ev.women ? CATS : LIONS;
    const tid = id(ev.base, x.teamId);
    if (!seen.has(tid)) {
      const name = ev.national ? x.shortName ?? x.officialName : x.officialName;
      const c: SlimClub = { id: tid, name, short: x.shortName ?? name, province: ev.label, logo: ev.national ? flagLogo(x.code) : x.organisationId ? fibaLogo(x.organisationId) : null, c1: '#1a6fe0', c2: '#0a0c12', city: '', venue: null,
        teams: [{ id: tid, name, cat: ev.label, ag: 'seniors' }] };
      seen.set(tid, c); out.clubs.push(c); out.attach[tid] = x.officialName;
    }
    return tid;
  };
  // Une série par groupe (ou par tour sans groupe : phase finale)
  const serieOf = (g: any) => {
    // Groupe nommé (A, B…) : une série ; rencontre à élimination directe (code numérique) : une série par tour
    const group = g.groupId && g.groupPairingCode && !/^\d+$/.test(g.groupPairingCode);
    const sid = group ? id(ev.base, 1e8 + Number(g.groupId)) : id(ev.base, 2e8 + Number(g.round.roundId));
    const round = ROUND_FR[g.round.roundName] ?? g.round.roundName;
    out.series[sid] ??= { id: sid, name: group ? `${ev.label} · ${round} · Groupe ${g.groupPairingCode}` : `${ev.label} · ${round}`, short: ev.label };
    return sid;
  };
  const sidByGame = new Map<number, number>();
  for (const g of games) {
    if (!g.teamA || !g.teamB) continue; // adversaire pas encore connu (« vainqueur du match … »)
    const sid = serieOf(g); sidByGame.set(g.gameId, sid);
    const played = g.statusCode === 'VALID' && g.gameResultStatusCode === 'VALID' && (g.teamAScore || g.teamBScore);
    const { d, t } = bxl(`${g.gameDateTimeUTC}Z`);
    out.games.push({ id: id(ev.base, 5e8 + g.gameId), d, t: g.hasTimeGameDateTime === false ? '' : t, s: sid, sn: ev.label, h: team(g.teamA), a: team(g.teamB),
      hn: ev.national && /^belgium$/i.test(g.teamA.officialName) ? (ev.women ? 'Belgian Cats' : 'Belgian Lions') : ev.national ? g.teamA.shortName : g.teamA.officialName,
      an: ev.national && /^belgium$/i.test(g.teamB.officialName) ? (ev.women ? 'Belgian Cats' : 'Belgian Lions') : ev.national ? g.teamB.shortName : g.teamB.officialName,
      hs: played ? g.teamAScore : null, as: played ? g.teamBScore : null, v: g.venueName ?? '', adr: [g.hostCity, g.hostCountry].filter(Boolean).join(', '), ty: 'championnat' });
  }
  // Classements officiels : un tableau par groupe, rattaché à la série de ses matchs
  let tables = 0;
  for (const blk of jsonObjects(txt, '{"type":"groups"')) for (const grp of Array.isArray(blk.data?.groups) ? blk.data.groups : []) {
    if (typeof grp !== 'object' || !Array.isArray(grp.teamsStats)) continue;
    const sid = (grp.gameIds ?? []).map((x: number) => sidByGame.get(x)).find(Boolean);
    if (!sid || !grp.teamsStats?.length) continue;
    const byFiba = new Map<number, number>();
    for (const g of games) for (const x of [g.teamA, g.teamB]) if (x?.teamId) byFiba.set(x.teamId, team(x));
    out.standings[sid] = grp.teamsStats.filter((r: any) => byFiba.has(r.team)).map((r: any) => ({ team: byFiba.get(r.team)!, played: r.gamesPlayed, wins: r.gamesWon, losses: r.gamesLost,
      pf: r.pointsFor, pa: r.pointsAgainst, pts: r.points, rank: r.rank })).sort((a: Standing, b: Standing) => a.rank! - b.rank!);
    tables++;
  }
  console.log(`${ev.label} : ${seen.size} équipes, ${games.length} matchs, ${tables} classements`);
}
// Saison en cours au format FIBA « 26-27 » (les sites Champions League et EuroLeague/EuroCup Women suivent la saison tout seuls).
// Épreuves d'équipes nationales : une adresse par édition, à mettre à jour quand une nouvelle édition commence (EuroBasket 2029, JO 2028…).
const SEASON_YY = (() => { const y = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1; return `${y % 100}-${(y + 1) % 100}`; })();
export const FIBA_EVENTS: FibaEvent[] = [
  { url: 'https://www.championsleague.basketball/en/standings', base: 27e9, label: 'Basketball Champions League' },
  { url: `https://www.fiba.basketball/en/events/fiba-europe-cup-${SEASON_YY}/standings`, base: 28e9, label: 'FIBA Europe Cup' },
  { url: 'https://www.euroleaguewomen.basketball/en/standings', base: 29e9, label: 'EuroLeague Women', women: true },
  { url: 'https://www.eurocupwomen.basketball/en/standings', base: 30e9, label: 'EuroCup Women', women: true },
  { url: 'https://www.fiba.basketball/en/events/fiba-basketball-world-cup-2027-european-qualifiers/standings', base: 31e9, label: 'Coupe du monde 2027 · Qualifications Europe', national: true },
  { url: 'https://www.fiba.basketball/en/events/fiba-womens-basketball-world-cup-2026/standings', base: 32e9, label: 'Coupe du monde féminine 2026', national: true, women: true },
  { url: 'https://www.fiba.basketball/en/events/fiba-womens-eurobasket-2027/standings', base: 33e9, label: 'EuroBasket féminin 2027', national: true, women: true },
  { url: 'https://www.fiba.basketball/en/events/fiba-womens-eurobasket-2027-qualifiers/standings', base: 34e9, label: 'EuroBasket féminin 2027 · Qualifications', national: true, women: true },
];

export async function run(outFile = 'pro.json', calDir = 'calendars') {
  const prev: Pro | null = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null;
  const out: Pro = { clubs: [], games: [], series: {}, standings: {}, attach: {} };
  // Chaque source est indépendante : si l'une échoue, on reprend ses données de la version précédente
  const sources: [string, (o: Pro) => Promise<void>, number][] = [['BNXT', bnxt, 20e9], ['NBA', (o) => nba(o), 22e9], ['Équipes nationales', nationalTeams, 23e9], ['WNBA', (o) => nba(o, 'wnba', 26e9), 26e9],
    ['EuroLeague', (o) => euroleague(o, 'E', 24e9, 'EuroLeague'), 24e9], ['EuroCup', (o) => euroleague(o, 'U', 25e9, 'EuroCup'), 25e9],
    ...FIBA_EVENTS.map((ev): [string, (o: Pro) => Promise<void>, number] => [ev.label, (o) => fibaEvent(o, ev), ev.base])];
  for (const [name, f, base] of sources) {
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
