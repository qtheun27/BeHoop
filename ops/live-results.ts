// Résultats rapides (lancé toutes les 15 min par .github/workflows/live.yml, fuseau Europe/Brussels) :
// on connaît le calendrier, donc on ne va chercher que les matchs qui viennent de se terminer et dont le score n'est pas
// encore connu — en quelques petites requêtes regroupées (AWBB : une par province ; Flandre : une par club concerné).
// Chaque résultat trouvé est écrit dans Firestore (results/{match}, lu par l'appli qui recalcule le classement provisoire
// avec le moteur web/src/lib/engine.ts) et publié tout de suite (carte score + notification « Résultat final »).
// La mise à jour complète (update.yml, deux fois par jour) reste la référence. Sans compte de service : ne fait rien.
import { readFileSync, existsSync } from 'node:fs';
import { loadAll } from './allData';
import { admin, hasFirebase } from './lib/admin';
import { scoreSync } from './lib/scorePosts';
import { vblId, score as vblScore } from './vbl';
import type { SlimGame } from './appData';

/** Durée d'un match (coup d'envoi → score encodé au plus tôt) : jeunes 1 h 30, seniors 1 h 45 */
const duration = (sn: string) => (/\bU\s?\d|jeun|jeugd|mini|benjamin|pupil|kadet|cadet|junior/i.test(sn) ? 90 : 105) * 60e3;
/** On cherche le score pendant 6 h après la fin estimée (encodage tardif par le club), puis la mise à jour complète prend le relais */
const WINDOW = 6 * 3600e3;
const UA = 'Mozilla/5.0 (compatible; AWBB-Suivi-Bot/6.0; +https://github.com/)';

export function pending(games: SlimGame[], now = Date.now()) {
  return games.filter((g) => {
    if (g.hs != null || !g.h || !g.a || !g.t || g.s >= 20e9) return false; // v1 : AWBB et Flandre (les ligues pros restent à la mise à jour complète)
    const end = new Date(`${g.d}T${g.t}:00`).getTime() + duration(g.sn);
    return now >= end && now <= end + WINDOW;
  });
}

async function awbb(games: SlimGame[]): Promise<Map<number, [number, number]>> {
  const out = new Map<number, [number, number]>();
  if (!games.length || !existsSync('data.json')) return out;
  const raw = JSON.parse(readFileSync('data.json', 'utf8'));
  const compOrg = new Map<number, number>(raw.competitions.map((c: any) => [c.id, c.organization_id]));
  const serieComp = new Map<number, number>(raw.series.map((s: any) => [s.id, s.competition_id]));
  // Province de chaque série (compétition inconnue des provinces → compétitions nationales AWBB, organisation 6)
  const byOrg = new Map<number, Set<number>>();
  for (const g of games) { const c = serieComp.get(g.s); if (c == null) continue; const o = compOrg.get(c) ?? 6; (byOrg.get(o) ?? byOrg.set(o, new Set()).get(o)!).add(c); }
  const home = await fetch('https://www.awbb.be/', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
  if (!home.ok) throw new Error(`AWBB ${home.status}`);
  const nonce = /"rest_nonce":"([a-f0-9]+)"/.exec(await home.text())?.[1];
  if (!nonce) throw new Error('AWBB : jeton introuvable');
  const dates = games.map((g) => g.d).sort();
  for (const [org, comps] of byOrg) {
    const q = new URLSearchParams({ _path: 'game/byMyLeague', organization_id: String(org), season_id: String(raw.season.id), start_date: dates[0], end_date: dates[dates.length - 1],
      with_referees: 'false', no_forfeit: 'true', without_in_preparation: 'true' });
    [...comps].forEach((c, i) => q.set(`competition_id[${i}]`, String(c)));
    const r = await fetch(`https://www.awbb.be/wp-json/bpleagues/v1/proxy?${q}`, { headers: { 'User-Agent': UA, 'X-WP-Nonce': nonce }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) { console.error(`AWBB province ${org} : ${r.status}`); continue; }
    for (const m of (await r.json()).elements ?? []) if (m.home_score != null && m.away_score != null && (m.home_score || m.away_score)) out.set(m.id, [m.home_score, m.away_score]);
  }
  return out;
}

async function flandre(games: SlimGame[]): Promise<Map<number, [number, number]>> {
  const out = new Map<number, [number, number]>();
  if (!games.length || !existsSync('vbl.json')) return out;
  const guids: Record<string, string> = JSON.parse(readFileSync('vbl.json', 'utf8')).guids ?? {};
  // Une requête par club (tous ses matchs) : le GUID d'une équipe commence par celui de son club (« BVBL1004HSE 2 » → « BVBL1004 »)
  const orgs = [...new Set(games.map((g) => /^[A-Z]+\d+/.exec(guids[g.h] ?? guids[g.a] ?? '')?.[0]).filter((x): x is string => !!x))];
  for (const o of orgs) {
    const r = await fetch(`https://vblcb.wisseq.eu/VBLCB_WebService/data/OrgMatchesByGuid?issguid=${encodeURIComponent(o)}`, { headers: { 'User-Agent': 'BeHoop/1.0 (+https://behoop.be)' }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (!r?.ok) continue;
    for (const m of (await r.json()) ?? []) { const sc = m.gespeeld === 'G' ? vblScore(m.uitslag) : null; if (sc) out.set(vblId(m.guid), sc); }
  }
  return out;
}

export async function run() {
  if (!hasFirebase()) { console.log('ℹ️  Pas de compte de service Firebase : résultats rapides ignorés.'); return; }
  const all = loadAll('.');
  let todo = pending(all.games);
  const { db } = admin();
  // Déjà trouvés lors d'un passage précédent
  const known = new Set((await db.collection('results').select().get()).docs.map((d) => +d.id));
  todo = todo.filter((g) => !known.has(g.id));
  console.log(`${todo.length} match(s) terminé(s) sans score (AWBB ${todo.filter((g) => g.s < 1e10).length}, Flandre ${todo.filter((g) => g.s >= 1e10).length})`);
  if (todo.length) {
    const found = new Map([...(await awbb(todo.filter((g) => g.s < 1e10)).catch((e) => { console.error(e.message); return new Map(); })),
      ...(await flandre(todo.filter((g) => g.s >= 1e10)).catch((e) => { console.error(e.message); return new Map(); }))]);
    const teamClub = new Map<number, (typeof all.clubs)[number]>();
    all.clubs.forEach((c) => c.teams.forEach((t) => teamClub.set(t.id, c)));
    const sync = scoreSync(db, teamClub);
    let n = 0;
    for (const g of todo) {
      const sc = found.get(g.id); if (!sc) continue;
      await db.doc(`results/${g.id}`).set({ hs: sc[0], as: sc[1], d: g.d, s: g.s, at: new Date() });
      await sync({ ...g, hs: sc[0], as: sc[1] }).catch((e) => console.error('carte', g.id, e.message));
      n++;
    }
    console.log(`${n} résultat(s) publié(s)`);
  }
  // Ménage : résultats de plus de 3 jours (la mise à jour complète les a repris depuis)
  const old = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  const stale = await db.collection('results').where('d', '<', old).get();
  for (const d of stale.docs) await d.ref.delete();
}
if (import.meta.url === `file://${process.argv[1]}`) run().catch((e) => { console.error(e); process.exit(1); });
