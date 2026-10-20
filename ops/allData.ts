// Données basket fusionnées : AWBB (data.json, Wallonie-Bruxelles) + Basketbal Vlaanderen (vbl.json, Flandre).
// Même format allégé pour tout le monde : l'appli, les cartes de score et les notifications ne font pas la différence.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { slimClub, slimGame, type SlimClub, type SlimGame } from './appData';

export interface Standing { team: number; played: number; wins: number; losses: number; pf: number; pa: number; pts: number; /** Matchs nuls (jeunes en Flandre) */ draws?: number; /** Rang officiel (départages de la fédération compris) */ rank?: number }
/** org / comp : province et compétition AWBB (ex. « Hainaut », « Champ. Provincial Jeunes Hainaut ») */
export interface Serie { id: number; name: string; short: string; org?: string; comp?: string }
export interface AllData { generated_at: string; season: string; clubs: SlimClub[]; games: SlimGame[]; series: Map<number, Serie>; standings: Map<number, Standing[]>; alias: Record<number, number> }

export function loadAll(root = '.'): AllData {
  const d = JSON.parse(readFileSync(join(root, 'data.json'), 'utf8'));
  // L'AWBB liste parfois un club deux fois (ex. Libramont, dans deux provinces) : une seule fiche par identifiant
  const clubs: SlimClub[] = [...new Map<number, SlimClub>(d.clubs.map(slimClub).reverse().map((c: SlimClub) => [c.id, c])).values()].reverse();
  const games: SlimGame[] = d.games.map(slimGame);
  const series = new Map<number, Serie>(d.series.map((s: any) => [s.id, { id: s.id, name: s.division_name ?? s.name, short: s.short_name, org: s.organization_name, comp: s.competition_name }]));
  const standings = new Map<number, Standing[]>();
  for (const [sid, rows] of Object.entries<any[]>(d.classements ?? {}))
    standings.set(+sid, rows.map((r) => ({ team: r.team_id, played: r.played, wins: r.wins, losses: r.losses, pf: r.score_for, pa: r.score_against, pts: r.points, draws: r.draws || undefined, rank: r.position ?? undefined })).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)));
  const vf = join(root, 'vbl.json');
  if (existsSync(vf)) {
    const v = JSON.parse(readFileSync(vf, 'utf8'));
    clubs.push(...v.clubs); games.push(...v.games);
    // Équipes nationales des clubs wallons : rattachées au club AWBB seulement si le matricule correspond exactement
    // (matricule lu dans le nom du fichier logo AWBB) ; sinon club national à part entière (ex. CityX Mons).
    const byStam = new Map<string, SlimClub>();
    for (const c of clubs) { const m = /\/(\d{3,5})-[^/]+$/.exec(c.logo ?? ''); if (m && c.id < 1e10) byStam.set(String(+m[1]), c); }
    for (const n of v.national ?? []) {
      const c = byStam.get(String(+n.stamNr));
      if (c) c.teams.push(...n.teams.filter((t: { id: number }) => !c.teams.some((x) => x.id === t.id)));
      else clubs.push({ id: n.id, name: n.name, short: n.name, province: 'National', logo: n.logo, c1: n.c1, c2: n.c2, city: n.city, venue: null, teams: n.teams });
    }
    for (const [k, s] of Object.entries<any>(v.series)) series.set(+k, s);
    for (const [k, s] of Object.entries<any>(v.standings)) standings.set(+k, s);
  }
  // Corrections BeHoop (nouveau nom d'un club, etc.) : corrections.json
  const cf = join(root, 'corrections.json');
  if (existsSync(cf)) {
    const corr = JSON.parse(readFileSync(cf, 'utf8')).clubs ?? {};
    for (const c of clubs) {
      const k = corr[c.id]; if (!k) continue;
      const old: string[] = k.ancienNom ?? [c.name, c.short];
      // Correction temporaire : appliquée seulement tant que la fédération affiche encore l'ancien nom
      if (k.lie) (c as SlimClub & { linked?: number }).linked = k.lie;
      if (!k.name && !k.short) continue; // correction sans changement de nom (lien seul)
      if (!old.includes(c.name) && !old.includes(c.short)) continue;
      const fix = (n: string) => old.reduce((acc, o) => acc.replace(o, k.short ?? k.name), n);
      const mine = new Set(c.teams.map((t) => t.id));
      c.name = k.name ?? c.name; c.short = k.short ?? c.short;
      c.teams.forEach((t) => { t.name = fix(t.name); });
      for (const g of games) { if (mine.has(g.h)) g.hn = fix(g.hn); if (mine.has(g.a)) g.an = fix(g.an); }
    }
  }
  // Un même club peut arriver deux fois : fiche nationale Basketbal Vlaanderen + fiche AWBB (ex. CityX Mons, créé à l'AWBB
  // en cours de saison). On garde la fiche AWBB, on y ajoute les équipes nationales et on redirige les liens « club lié ».
  const nkey = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const awbb = new Map(clubs.filter((c) => c.id < 1e10).map((c) => [nkey(c.name), c]));
  const alias = new Map<number, number>();
  for (const c of clubs) {
    const h = c.province === 'National' ? awbb.get(nkey(c.name)) : undefined;
    if (!h || h === c) continue;
    h.teams.push(...c.teams.filter((t) => !h.teams.some((x) => x.id === t.id)));
    if (!h.logo) h.logo = c.logo;
    const hl = h as SlimClub & { linked?: number }, cl = c as SlimClub & { linked?: number };
    if (cl.linked && !hl.linked) hl.linked = cl.linked;
    alias.set(c.id, h.id);
  }
  for (let i = clubs.length - 1; i >= 0; i--) if (alias.has(clubs[i].id)) clubs.splice(i, 1);
  for (const c of clubs as (SlimClub & { linked?: number })[]) if (c.linked && alias.has(c.linked)) c.linked = alias.get(c.linked);
  // Basket pro et international (BNXT, NBA, Belgian Lions) : pro.json. Une équipe BNXT dont le nom correspond
  // à un club belge existant (ex. CityX Mons) est ajoutée à ce club ; sinon elle forme son propre club.
  const pf = join(root, 'pro.json');
  if (existsSync(pf)) {
    const p = JSON.parse(readFileSync(pf, 'utf8'));
    const bnxt: Record<number, number> = existsSync(cf) ? JSON.parse(readFileSync(cf, 'utf8')).bnxt ?? {} : {};
    const key = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const c of p.clubs as SlimClub[]) {
      const forced = bnxt[c.id];
      const host = forced ? clubs.find((x) => x.id === forced)
        : p.attach?.[c.id] ? clubs.find((x) => x.id < 20e9 && key(x.name) === key(p.attach[c.id])) : undefined;
      if (host && host.id !== c.id) alias.set(c.id, host.id); // fiche BNXT seule auparavant : les suivis existants suivent
      if (host) { host.teams.push(...c.teams.filter((t) => !host.teams.some((x) => x.id === t.id))); if (c.logo) { host.logo = c.logo; (host as SlimClub & { logoId?: number }).logoId = c.id; } }
      else clubs.push(c);
    }
    games.push(...p.games);
    for (const [k, s] of Object.entries<any>(p.series)) series.set(+k, s);
    for (const [k, s] of Object.entries<any>(p.standings)) standings.set(+k, s);
  }
  // Logos : copie locale servie par behoop.be (voir ops/logos.py), sinon l'adresse d'origine
  for (const c of clubs) {
    const lid = (c as SlimClub & { logoId?: number }).logoId ?? c.id;
    delete (c as SlimClub & { logoId?: number }).logoId;
    if (existsSync(join(root, 'logos', `${lid}.webp`))) c.logo = `/logos/${lid}.webp`;
    else if (c.logo?.includes('vbldataOrgLogo')) c.logo = null; // club flamand sans logo publié : initiales
  }
  return { generated_at: d.generated_at, season: d.season?.name, clubs, games, series, standings, alias: Object.fromEntries(alias) };
}
