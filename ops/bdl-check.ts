// Vérification balldontlie (lancée à la main par .github/workflows/bdl-check.yml, clé BALLDONTLIE_API_KEY) :
// compare ses classements et ses matchs avec nos données officielles actuelles (pro.json) avant de changer de source.
// N'écrit rien ; affiche un rapport. Offre gratuite : 5 requêtes/min → une requête toutes les 13 s.
import { readFileSync } from 'node:fs';

const KEY = process.env.BALLDONTLIE_API_KEY;
if (!KEY) throw new Error('BALLDONTLIE_API_KEY manquante');
const pro = JSON.parse(readFileSync('pro.json', 'utf8'));
const names = new Map<number, string>(pro.clubs.map((c: any) => [c.id, c.name]));
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let last = 0;
async function get(path: string): Promise<any> {
  const d = 13_000 - (Date.now() - last); if (d > 0) await wait(d);
  last = Date.now();
  const r = await fetch(`https://api.balldontlie.io${path}`, { headers: { Authorization: KEY! } });
  if (!r.ok) return { error: r.status, text: (await r.text()).slice(0, 200) };
  return r.json();
}
async function all(path: string, max = 15) {
  const out: any[] = []; let cursor: string | undefined;
  for (let i = 0; i < max; i++) {
    const j = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100${cursor ? `&cursor=${cursor}` : ''}`);
    if (j.error) return j;
    out.push(...(j.data ?? [])); cursor = j.meta?.next_cursor; if (!cursor) break;
  }
  return out;
}
/** Nos lignes officielles pour une base d'identifiants (toutes séries confondues) */
function ours(base: number) {
  const rows: { name: string; w: number; l: number; rank: number; serie: string }[] = [];
  for (const [sid, list] of Object.entries<any[]>(pro.standings)) {
    if (Math.floor(+sid / 1e9) !== base / 1e9) continue;
    for (const r of list) rows.push({ name: names.get(r.team) ?? String(r.team), w: r.wins, l: r.losses, rank: r.rank, serie: pro.series[sid]?.name ?? sid });
  }
  return rows;
}
function compare(label: string, theirs: { name: string; w: number; l: number; rank?: number }[], mine: ReturnType<typeof ours>) {
  let same = 0; const diff: string[] = []; const missing: string[] = [];
  for (const t of theirs) {
    const n = norm(t.name);
    const m = mine.find((x) => norm(x.name) === n) ?? mine.find((x) => norm(x.name).includes(n) || n.includes(norm(x.name)));
    if (!m) { missing.push(t.name); continue; }
    if (m.w === t.w && m.l === t.l && (t.rank == null || m.rank === t.rank)) same++;
    else diff.push(`${t.name}: eux ${t.w}-${t.l}${t.rank != null ? ` (#${t.rank})` : ''} / nous ${m.w}-${m.l} (#${m.rank})`);
  }
  console.log(`\n=== ${label} : ${theirs.length} équipes chez eux, ${mine.length} lignes chez nous → ${same} identiques, ${diff.length} différentes, ${missing.length} non trouvées`);
  diff.slice(0, 20).forEach((x) => console.log('  ≠', x));
  if (missing.length) console.log('  ? non trouvées :', missing.slice(0, 20).join(', '));
}

const SEASON = 2026;
// 1. Classements (offre gratuite) : BNXT, EuroLeague, EuroCup, Champions League
for (const [lg, base, label] of [['bnxt', 20e9, 'BNXT League'], ['euroleague', 24e9, 'EuroLeague'], ['eurocup', 25e9, 'EuroCup'], ['bcl', 27e9, 'Champions League']] as const) {
  const st = await all(`/${lg}/v1/standings?season=${SEASON}`);
  if ((st as any).error) { console.log(`\n=== ${label} : erreur ${(st as any).error} ${(st as any).text}`); continue; }
  console.log(`\n${label} : exemple brut`, JSON.stringify(st[0]).slice(0, 400));
  const pick = (x: any, ...k: string[]) => { for (const a of k) { const v = a.split('.').reduce((o, p) => o?.[p], x); if (v != null) return v; } return undefined; };
  compare(label, st.map((x: any) => ({ name: pick(x, 'team.full_name', 'team.name', 'team_name', 'name') ?? '?', w: +pick(x, 'wins', 'won', 'w'), l: +pick(x, 'losses', 'lost', 'l'),
    rank: pick(x, 'position', 'rank', 'standing') })), ours(base));
}
// 2. NBA / WNBA : matchs (offre gratuite) → bilan victoires-défaites comparé au nôtre
for (const [path, base, label] of [['/v1/games', 22e9, 'NBA'], ['/wnba/v1/games', 26e9, 'WNBA']] as const) {
  const season = label === 'WNBA' ? SEASON : SEASON;
  const g = await all(`${path}?seasons[]=${season}`, 20);
  if ((g as any).error) { console.log(`\n=== ${label} : erreur ${(g as any).error} ${(g as any).text}`); continue; }
  console.log(`\n${label} : ${g.length} matchs ; exemple brut`, JSON.stringify(g[0]).slice(0, 400));
  const rec = new Map<string, { w: number; l: number }>();
  for (const x of g) {
    if (x.postseason) continue;
    const hs = x.home_team_score ?? x.home_score, vs = x.visitor_team_score ?? x.away_team_score ?? x.away_score;
    const final = /final/i.test(String(x.status)) && hs != null && vs != null && hs + vs > 0;
    if (!final) continue;
    const h = x.home_team?.full_name ?? x.home_team?.name, a = (x.visitor_team ?? x.away_team)?.full_name ?? (x.visitor_team ?? x.away_team)?.name;
    for (const [n, win] of [[h, hs > vs], [a, vs > hs]] as const) { const r = rec.get(n) ?? { w: 0, l: 0 }; win ? r.w++ : r.l++; rec.set(n, r); }
  }
  compare(`${label} (bilan calculé depuis leurs matchs)`, [...rec].map(([name, r]) => ({ name, ...r })), ours(base));
}
