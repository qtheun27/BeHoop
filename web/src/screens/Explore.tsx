import { useEffect, useMemo, useState } from 'react';
import { loadIndex, loadClub, loadSerie, normalize, teamLabel, isPlayed, teamIndex, type Game, type Club, type Team } from '../lib/data';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { Screen, Disc, Skeleton, ErrorBox, Empty, Sheet, useAsync } from '../ui/kit';
import { PostCard } from './Feed';
import { haptic, frDate, mapsUrl } from '../lib/util';
import { LiveBadge } from './Live';
import { NewsCarousel } from './News';

export function FollowButton({ type, id }: { type: 'club' | 'team'; id: number }) {
  const s = useSession();
  const on = s.follows.some((f) => f.type === type && f.refId === id);
  return (
    <button className={`btn small${on ? ' secondary' : ''}`} aria-pressed={on}
      onClick={() => { if (!s.requireAuth(() => s.toggleFollow(type, id))) return; haptic(); s.toggleFollow(type, id); }}>
      {on ? 'Suivi ✓' : 'Suivre'}
    </button>
  );
}

export function Explore() {
  const { data, error, reload } = useAsync(loadIndex, []);
  const [q, setQ] = useState('');
  const [prov, setProv] = useState('');
  const s = useSession();
  // Wallonie-Bruxelles, Flandre, puis National, BNXT League, International, NBA
  const ORDER = ['Hainaut', 'Liège', 'Namur', 'Luxembourg', 'Bruxelles - Brabant Wallon', 'Anvers', 'Brabant flamand', 'Flandre-Occidentale', 'Flandre-Orientale', 'Limbourg', 'National', 'BNXT League', 'International', 'NBA'];
  const provinces = useMemo(() => [...new Set(data?.clubs.map((c) => c.province))].sort((a, b) => ((ORDER.indexOf(a) + 1) || 99) - ((ORDER.indexOf(b) + 1) || 99) || a.localeCompare(b)), [data]);
  const list = useMemo(() => {
    const n = normalize(q);
    return (data?.clubs ?? []).filter((c) => (!prov || c.province === prov) && (!n || normalize(`${c.name} ${c.short} ${c.city}`).includes(n)))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [data, q, prov]);
  return (
    <Screen title="Explorer">
      {!s.user && <div className="banner"><span style={{ fontSize: 28 }}>🏀</span><div className="grow" style={{ flex: 1 }}><b>Crée ton compte</b><div className="muted" style={{ fontSize: 14 }}>pour suivre tes clubs et recevoir les résultats.</div></div><button className="btn small" onClick={() => s.requireAuth()}>Créer</button></div>}
      <div className="search"><input className="field" type="search" placeholder="Club, ville…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un club" /></div>
      <div className="chips">{['', ...provinces].map((p) => <button key={p} className={`chip${prov === p ? ' on' : ''}`} onClick={() => setProv(p)}>{p || 'Toutes'}</button>)}</div>
      {!q && !prov && <NewsCarousel />}
      {error && <ErrorBox msg={error} retry={reload} />}
      {!data && !error ? <Skeleton h={56} n={8} /> : list.length === 0 ? <Empty ill="🔎" title="Aucun club trouvé" text="Essaie un autre nom ou une ville." /> : (
        <div className="group">{list.slice(0, 120).map((c) => (
          <a key={c.id} className="row" href={c.teams.length === 1 ? `#/equipe/${c.teams[0].id}` : `#/club/${c.id}`} style={{ color: 'inherit' }}>
            <Disc src={c.logo} name={c.name} size={40} ring={c.c1} />
            <div className="grow"><div className="ellipsis">{c.name}</div><div className="sub">{[c.city, c.teams.length === 1 ? c.teams[0].cat : `${c.teams.length} équipes`].filter(Boolean).join(' · ')}</div></div><span className="chev">›</span>
          </a>))}</div>
      )}
      <p className="muted center" style={{ fontSize: 13 }}>Classements et calendriers complets : <a href="/">site BeHoop</a></p>
    </Screen>
  );
}

function GameRow({ g, teamIds }: { g: Game; teamIds: number[] }) {
  const played = isPlayed(g);
  const home = teamIds.includes(g.h);
  const won = played && (home ? g.hs! > g.as! : g.as! > g.hs!);
  return (
    <a className="row" href={`#/matchs?g=${g.id}`} style={{ color: 'inherit' }}>
      <div style={{ width: 56, fontSize: 13 }} className="muted">{frDate(g.d, { day: 'numeric', month: 'short' })}<br />{played ? '' : g.t}</div>
      <div className="grow"><div className="ellipsis" style={{ fontWeight: home ? 600 : 400 }}>{g.hn}</div><div className="ellipsis" style={{ fontWeight: home ? 400 : 600 }}>{g.an}</div></div>
      {played ? <div style={{ textAlign: 'right', fontWeight: 700 }}><div>{g.hs}</div><div>{g.as}</div></div> : <span className="pill">{g.sn}</span>}
      {played && <span className="pill" style={{ background: won ? 'var(--green)' : 'var(--red)', color: '#fff' }}>{won ? 'V' : 'D'}</span>}
    </a>
  );
}

export function ClubPage({ id }: { id: number }) {
  const { data, error, reload } = useAsync(() => loadClub(id), [id]);
  if (error) return <Screen title="Club" back="explorer"><ErrorBox msg={error} retry={reload} /></Screen>;
  if (!data) return <Screen title="Club" back="explorer"><Skeleton /></Screen>;
  const { club, games } = data;
  const tids = club.teams.map((t) => t.id);
  const today = new Date().toISOString().slice(0, 10);
  const recent = games.filter((g) => isPlayed(g)).slice(-5).reverse();
  const next = games.filter((g) => g.d >= today && !isPlayed(g)).slice(0, 5);
  return (
    <Screen title={club.short} back="explorer" right={<FollowButton type="club" id={id} />}>
      <div className="hstack" style={{ marginBottom: 20 }}><Disc src={club.logo} name={club.name} size={72} ring={club.c1} />
        <div><div style={{ fontWeight: 700, fontSize: 20 }}>{club.name}</div><div className="muted">{club.venue?.name ?? club.city}</div></div></div>
      {club.linked && <LinkedClub id={club.linked} />}
      <TeamList club={club} />
      {next.length > 0 && <><div className="group-title">Prochains matchs</div><div className="group">{next.map((g) => <GameRow key={g.id} g={g} teamIds={tids} />)}</div></>}
      {recent.length > 0 && <><div className="group-title">Derniers résultats</div><div className="group">{recent.map((g) => <GameRow key={g.id} g={g} teamIds={tids} />)}</div></>}
    </Screen>
  );
}

export function TeamPage({ id }: { id: number }) {
  const s = useSession();
  const { data, error, reload } = useAsync(async () => {
    const idx = await teamIndex(); const e = idx.get(id); if (!e) throw new Error('Équipe introuvable');
    const c = await loadClub(e.club.id);
    return { ...e, games: c.games.filter((g) => g.h === id || g.a === id) };
  }, [id]);
  const member = s.memberships.find((m) => m.teamId === id);
  const accepted = member?.status === 'accepted';
  const posts = useAsync(() => (s.user ? D.postsForTeam(id, accepted) : Promise.resolve([])), [id, s.user?.uid, accepted]);
  const [join, setJoin] = useState(false);
  if (error) return <Screen title="Équipe" back="explorer"><ErrorBox msg={error} retry={reload} /></Screen>;
  if (!data) return <Screen title="Équipe" back="explorer"><Skeleton /></Screen>;
  const { team, club, games } = data;
  return (
    <Screen title={club.teams.length === 1 ? team.name : teamLabel(team)} back={club.teams.length === 1 ? 'explorer' : `club/${club.id}`} right={<FollowButton type="team" id={id} />}>
      <div className="hstack" style={{ marginBottom: 16 }}><Disc src={club.logo} name={club.name} size={56} ring={club.c1} />
        <div className="grow" style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{club.name}</div><div className="muted">{team.ag === 'jeunes' ? 'Jeunes' : 'Seniors'} · {team.cat}</div></div><LiveBadge teamId={id} games={games} /></div>
      {team.ag === 'jeunes' && (
        <div className="banner"><span style={{ fontSize: 26 }}>🔒</span><div style={{ flex: 1 }}><b>Équipe {teamLabel(team)}</b>
          <div className="muted" style={{ fontSize: 14 }}>{accepted ? `Tu es ${member!.role === 'responsable' ? 'responsable' : 'membre'} : tu vois les photos et vidéos de l'équipe.` : member ? 'Demande envoyée, en attente de validation.' : 'Photos et vidéos réservées aux membres (joueurs, parents, coachs).'}</div></div>
          {!member && <button className="btn small" onClick={() => s.requireAuth(() => setJoin(true)) && setJoin(true)}>Rejoindre</button>}
          {accepted && <button className="btn small secondary" onClick={async () => { if (confirm('Quitter l’Équipe ?')) { await D.removeMember(id, s.user!.uid); await s.refresh(); } }}>Quitter</button>}
        </div>)}
      {accepted && member!.role === 'responsable' && <TeamAdmin teamId={id} />}
      <TeamTabs team={team} club={club} games={games} />
      <div className="group-title">Publications</div>
      {!s.user ? <Empty ill="📰" title="Connecte-toi pour voir le fil de l'équipe" action={<button className="btn small" onClick={() => s.requireAuth()}>Se connecter</button>} />
        : posts.loading ? <Skeleton /> : posts.data?.length ? posts.data.map((p) => <PostCard key={p.id} post={p} />) : <Empty ill="🏀" title="Rien pour l'instant" text="Les résultats et publications de l'équipe apparaîtront ici." />}
      {join && <JoinSheet teamId={id} name={teamLabel(team)} onClose={() => setJoin(false)} />}
    </Screen>
  );
}

function JoinSheet({ teamId, name, onClose }: { teamId: number; name: string; onClose: () => void }) {
  const s = useSession();
  const [m, setM] = useState('');
  return (
    <Sheet title="Demander à rejoindre" onClose={onClose}>
      <p className="muted">Un responsable de l'équipe <b>{name}</b> validera ta demande.</p>
      <label className="label" htmlFor="jm">Message (optionnel)</label>
      <textarea id="jm" className="field" maxLength={200} placeholder="Je suis le papa de…" value={m} onChange={(e) => setM(e.target.value)} />
      <button className="btn mt" onClick={async () => { await D.requestJoin(s.user!.uid, teamId, s.profile!.displayName, m); await s.refresh(); s.toast('Demande envoyée'); onClose(); }}>Envoyer la demande</button>
    </Sheet>
  );
}

function TeamAdmin({ teamId }: { teamId: number }) {
  const s = useSession();
  const { data, reload } = useAsync(() => D.teamMembersList(teamId), [teamId]);
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const pending = data.filter((m) => m.status === 'pending');
  return (
    <>
      <button className="row group" style={{ marginBottom: 22 }} onClick={() => setOpen(true)}>
        <div className="grow">Gérer l'Équipe 🔒</div>{pending.length > 0 && <span className="pill live">{pending.length}</span>}<span className="chev">›</span></button>
      {open && <Sheet title="Membres" onClose={() => setOpen(false)}><MembersList teamId={teamId} members={data} reload={reload} me={s.user!.uid} /></Sheet>}
    </>
  );
}

export function MembersList({ teamId, members, reload, me }: { teamId: number; members: D.Membership[]; reload: () => void; me: string }) {
  const act = async (f: () => Promise<unknown>) => { await f(); reload(); };
  const pending = members.filter((m) => m.status === 'pending'), acc = members.filter((m) => m.status === 'accepted');
  return (
    <>
      {pending.length > 0 && <><div className="group-title">Demandes</div><div className="group">{pending.map((m) => (
        <div key={m.uid} className="row"><div className="grow"><div>{m.displayName}</div>{m.message && <div className="sub">« {m.message} »</div>}</div>
          <button className="btn small" onClick={() => act(() => D.setMember(teamId, m.uid, { status: 'accepted' }))}>Accepter</button>
          <button className="btn small danger" onClick={() => act(() => D.removeMember(teamId, m.uid))}>Refuser</button></div>))}</div></>}
      <div className="group-title">Membres ({acc.length})</div>
      <div className="group">{acc.map((m) => (
        <div key={m.uid} className="row"><div className="grow">{m.displayName} {m.role === 'responsable' && <span className="pill">Responsable</span>}</div>
          {m.role !== 'responsable' && <button className="btn small secondary" onClick={() => act(() => D.setMember(teamId, m.uid, { role: 'responsable' }))}>Nommer responsable</button>}
          {m.uid !== me && <button className="btn small danger" onClick={() => confirm(`Retirer ${m.displayName} ?`) && act(() => D.removeMember(teamId, m.uid))}>Retirer</button>}</div>))}</div>
    </>
  );
}

/* ---------- Fiche Équipe enrichie (V2) ---------- */
function rankHistory(games: Game[], teamId: number) {
  const played = games.filter(isPlayed).sort((a, b) => a.d.localeCompare(b.d));
  const dates = [...new Set(played.map((g) => g.d))];
  const tbl = new Map<number, { w: number; l: number; diff: number }>();
  const out: { d: string; rank: number; n: number }[] = [];
  let i = 0;
  for (const d of dates) {
    for (; i < played.length && played[i].d === d; i++) {
      const g = played[i];
      for (const [t, me, op] of [[g.h, g.hs!, g.as!], [g.a, g.as!, g.hs!]] as const) {
        const r = tbl.get(t) ?? { w: 0, l: 0, diff: 0 }; me > op ? r.w++ : r.l++; r.diff += me - op; tbl.set(t, r);
      }
    }
    const order = [...tbl.entries()].sort((a, b) => b[1].w - a[1].w || a[1].l - b[1].l || b[1].diff - a[1].diff);
    const rank = order.findIndex(([t]) => t === teamId) + 1;
    if (rank > 0) out.push({ d, rank, n: order.length });
  }
  return out;
}

function TeamStats({ team, games }: { team: Team; club: Club; games: Game[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const played = games.filter(isPlayed).filter((g) => g.ty !== 'amical');
  const last5 = played.slice(-5);
  const next = games.find((g) => g.d >= today && !isPlayed(g));
  const serieId = (next ?? played[played.length - 1])?.s;
  const serie = useAsync(() => (serieId ? loadSerie(serieId) : Promise.resolve(null)), [serieId]);
  const [ptsFor, ptsAg] = played.reduce(([f, a], g) => g.h === team.id ? [f + g.hs!, a + g.as!] : [f + g.as!, a + g.hs!], [0, 0]);
  const hist = useMemo(() => (serie.data ? rankHistory(serie.data.games.filter((g) => g.ty !== 'amical'), team.id) : []), [serie.data, team.id]);
  if (!played.length && !next) return null;
  const opp = next ? (next.h === team.id ? next.a : next.h) : null;
  const st = serie.data?.standings ?? [];
  const sorted = [...st].sort((a, b) => b.pts - a.pts);
  const oppRank = opp ? sorted.findIndex((r) => r.team === opp) + 1 : 0;
  const aller = opp ? played.find((g) => g.h === opp || g.a === opp) : undefined;
  const W = 300, H = 90, n = Math.max(...hist.map((h) => h.n), 2);
  const pts = hist.map((h, i) => `${(i / Math.max(hist.length - 1, 1)) * W},${((h.rank - 1) / (n - 1)) * H}`).join(' ');
  return (
    <>
      <div className="group-title">Forme & statistiques</div>
      <div className="group" style={{ padding: 16 }}>
        {last5.length > 0 && <div className="hstack" style={{ justifyContent: 'space-between' }}><span className="muted">5 derniers</span>
          <div className="dots">{last5.map((g) => { const w = g.h === team.id ? g.hs! > g.as! : g.as! > g.hs!; return <i key={g.id} style={{ background: w ? 'var(--green)' : 'var(--red)' }} title={`${g.hn} ${g.hs}-${g.as} ${g.an}`}>{w ? 'V' : 'D'}</i>; })}</div></div>}
        {played.length > 0 && <div className="hstack mt" style={{ justifyContent: 'space-around', textAlign: 'center' }}>
          <div><div style={{ fontSize: 26, fontWeight: 700 }}>{(ptsFor / played.length).toFixed(1)}</div><div className="muted" style={{ fontSize: 13 }}>pts marqués / match</div></div>
          <div><div style={{ fontSize: 26, fontWeight: 700 }}>{(ptsAg / played.length).toFixed(1)}</div><div className="muted" style={{ fontSize: 13 }}>pts encaissés / match</div></div></div>}
        {hist.length > 1 && <div className="mt"><div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>Évolution au classement (actuellement {hist[hist.length - 1].rank}ᵉ / {hist[hist.length - 1].n})</div>
          <svg viewBox={`-6 -6 ${W + 12} ${H + 12}`} width="100%" role="img" aria-label="Évolution au classement"><polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" />
            {hist.map((h, i) => <circle key={h.d} cx={(i / Math.max(hist.length - 1, 1)) * W} cy={((h.rank - 1) / (n - 1)) * H} r="4" fill="var(--accent)" />)}</svg></div>}
        {next && <div className="mt"><div className="muted" style={{ fontSize: 13 }}>Prochain adversaire</div>
          <div style={{ fontWeight: 600 }}>{next.h === team.id ? next.an : next.hn} {oppRank > 0 && <span className="pill">{oppRank}ᵉ</span>}</div>
          <div className="muted" style={{ fontSize: 14 }}>{frDate(next.d)} · {next.t}{aller ? ` · Match aller : ${aller.hs}–${aller.as}` : ''}</div></div>}
      </div>
    </>
  );
}

export function useClubs() { const [c, set] = useState<Club[]>([]); useEffect(() => { loadIndex().then((i) => set(i.clubs)); }, []); return c; }

/* ---------- Fiche Équipe : Matchs, Classement, Infos (visibles sans compte) ---------- */
function TeamTabs({ team, club, games }: { team: Team; club: Club; games: Game[] }) {
  const [tab, setTab] = useState<'matchs' | 'classement' | 'infos'>('matchs');
  const ics = `${location.origin}/calendars/team-${team.id}.ics`;
  return (
    <>
      <div className="seg" role="tablist">
        {([['matchs', '📅 Matchs'], ['classement', '📊 Classement'], ['infos', '📈 Infos']] as const).map(([k, l]) =>
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} aria-pressed={tab === k}>{l}</button>)}
      </div>
      {tab === 'matchs' && <TeamGames team={team} games={games} ics={ics} />}
      {tab === 'classement' && <TeamStandings team={team} games={games} />}
      {tab === 'infos' && <TeamStats team={team} club={club} games={games} />}
    </>
  );
}

function TeamGames({ team, games, ics }: { team: Team; games: Game[]; ics: string }) {
  const [which, setWhich] = useState<'avenir' | 'joues'>('avenir');
  const today = new Date().toISOString().slice(0, 10);
  const next = games.filter((g) => g.d >= today && !isPlayed(g));
  const past = games.filter(isPlayed).slice().reverse();
  const list = which === 'avenir' ? next : past;
  return (
    <>
      <div className="hstack" style={{ gap: 8, marginBottom: 12 }}>
        <a className="btn small" href={ics.replace(/^https?:/, 'webcal:')}>📆 Ajouter au calendrier</a>
        <button className="btn small secondary" onClick={() => { navigator.clipboard?.writeText(ics); }}>Copier le lien</button>
      </div>
      <div className="chips">
        <button className={`chip${which === 'avenir' ? ' on' : ''}`} onClick={() => setWhich('avenir')}>À venir ({next.length})</button>
        <button className={`chip${which === 'joues' ? ' on' : ''}`} onClick={() => setWhich('joues')}>Joués ({past.length})</button>
      </div>
      {list.length === 0 ? <Empty ill="📅" title={which === 'avenir' ? 'Aucun match prévu' : 'Aucun match joué'} /> : (
        <div className="group">{list.slice(0, 40).map((g) => (
          <div key={g.id}>
            <GameRow g={g} teamIds={[team.id]} />
            {which === 'avenir' && g.v && <a className="row sub" style={{ paddingTop: 0, minHeight: 34 }} href={mapsUrl(`${g.v} ${g.adr}`, g.lat, g.lng)} target="_blank" rel="noopener">📍 {g.v} · Itinéraire ›</a>}
          </div>))}</div>
      )}
    </>
  );
}

function TeamStandings({ team, games }: { team: Team; games: Game[] }) {
  // Compétitions de l'équipe : on garde celles dont le classement contient l'équipe (ou sans classement, ex. coupe)
  const ids = [...new Set(games.filter((g) => g.ty !== 'amical').map((g) => g.s))];
  const all = useAsync(async () => (await Promise.all(ids.map((i) => loadSerie(i).catch(() => null)))).filter(Boolean)
    .filter((x) => !x!.standings.length || x!.standings.some((r) => r.team === team.id)) as Awaited<ReturnType<typeof loadSerie>>[], [ids.join()]);
  const series = (all.data ?? []).map((x) => [x.serie.id, x.serie.short || x.serie.name] as [number, string]);
  const [pick, setSid] = useState<number | null>(null);
  const sid = pick ?? series[0]?.[0] ?? null;
  const serie = { data: all.data?.find((x) => x.serie.id === sid) ?? null };
  if (all.loading) return <Skeleton h={44} n={6} />;
  if (!series.length) return <Empty ill="📊" title="Pas de classement" text="Cette équipe ne joue que des matchs amicaux pour l'instant." />;
  const names = new Map<number, string>();
  serie.data?.games.forEach((g) => { names.set(g.h, g.hn); names.set(g.a, g.an); });
  const rows = [...(serie.data?.standings ?? [])].sort((a, b) => b.pts - a.pts || (b.pf - b.pa) - (a.pf - a.pa));
  return (
    <>
      {series.length > 1 && <div className="chips">{series.map(([id, n]) => <button key={id} className={`chip${sid === id ? ' on' : ''}`} onClick={() => setSid(id)}>{n}</button>)}</div>}
      {!serie.data ? <Skeleton h={44} n={6} /> : rows.length === 0 ? <Empty ill="📊" title="Classement pas encore publié" /> : (
        <div className="group" style={{ padding: '6px 0' }}>
          <div className="row sub" style={{ minHeight: 30, fontWeight: 600 }}><span style={{ width: 22 }}>#</span><span className="grow">Équipe</span><span style={{ width: 28, textAlign: 'center' }}>J</span><span style={{ width: 28, textAlign: 'center' }}>V</span><span style={{ width: 34, textAlign: 'right' }}>Pts</span></div>
          {rows.map((r, i) => { const me = r.team === team.id; return (
            <a key={r.team} className="row" href={`#/equipe/${r.team}`} style={{ color: 'inherit', minHeight: 44, background: me ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined, fontWeight: me ? 700 : 400 }}>
              <span style={{ width: 22, fontFamily: 'Anton', color: i < 3 ? 'var(--accent)' : undefined }}>{i + 1}</span>
              <span className="grow ellipsis">{names.get(r.team) ?? `Équipe ${r.team}`}</span>
              <span style={{ width: 28, textAlign: 'center' }}>{r.played}</span><span style={{ width: 28, textAlign: 'center' }}>{r.wins}</span>
              <span style={{ width: 34, textAlign: 'right', fontFamily: 'Anton' }}>{r.pts}</span>
            </a>); })}
        </div>
      )}
    </>
  );
}

/** Lien vers un club lié (ex. Mons Basketball ↔ CityX Mons : deux matricules, même famille). */
function LinkedClub({ id }: { id: number }) {
  const { data } = useAsync(loadIndex, []);
  const c = data?.clubs.find((x) => x.id === id);
  if (!c) return null;
  return (
    <a className="row group" href={`#/club/${c.id}`} style={{ color: 'inherit', marginBottom: 22 }}>
      <Disc src={c.logo} name={c.name} size={36} ring={c.c1} />
      <div className="grow"><div className="sub">Club lié</div><div style={{ fontWeight: 600 }}>{c.name}</div></div><span className="chev">›</span>
    </a>
  );
}

/** Équipes du club : liste sobre par niveau ; le choix des équipes suivies se fait dans une feuille dédiée. */
function TeamList({ club }: { club: Club }) {
  const s = useSession();
  const f = s.follows.find((x) => x.type === 'club' && x.refId === club.id);
  const [edit, setEdit] = useState(false);
  const groups: [string, Team[]][] = [
    ['Seniors', club.teams.filter((t) => t.ag === 'seniors')],
    ['Jeunes', club.teams.filter((t) => t.ag !== 'seniors')],
  ];
  const muted = f?.mutedTeams ?? [];
  const toggle = async (tid: number) => {
    if (!f || !s.user) return;
    haptic();
    await D.setMuted(s.user.uid, club.id, muted.includes(tid) ? muted.filter((x) => x !== tid) : [...muted, tid]);
    await s.refresh();
  };
  return (
    <>
      {groups.filter(([, l]) => l.length).map(([g, list]) => (
        <section key={g}>
          <div className="group-title">{g}</div>
          <div className="group">{list.map((t) => (
            <a key={t.id} className="row" href={`#/equipe/${t.id}`} style={{ color: 'inherit' }}>
              <div className="grow">{teamLabel(t)}</div>
              {f && muted.includes(t.id) && <span className="muted" style={{ fontSize: 13 }}>non suivie</span>}
              <span className="chev">›</span>
            </a>))}</div>
        </section>))}
      {f && club.teams.length > 1 && (
        <button className="btn ghost small" style={{ margin: '-10px auto 22px', display: 'flex' }} onClick={() => setEdit(true)}>
          Équipes suivies : {club.teams.length - muted.length}/{club.teams.length} · Modifier
        </button>)}
      {edit && (
        <Sheet title="Équipes suivies" onClose={() => setEdit(false)}>
          <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>Les équipes cochées apparaissent dans ton fil et tes matchs.</p>
          <div className="group">{club.teams.map((t) => { const on = !muted.includes(t.id); return (
            <button key={t.id} className="row" onClick={() => toggle(t.id)} aria-pressed={on}>
              <div className="grow">{teamLabel(t)}</div>
              <span style={{ width: 24, height: 24, borderRadius: 12, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800,
                background: on ? 'var(--accent)' : 'transparent', color: '#fff', boxShadow: on ? 'none' : 'inset 0 0 0 2px var(--sep)' }}>{on ? '✓' : ''}</span>
            </button>); })}</div>
        </Sheet>)}
    </>
  );
}
