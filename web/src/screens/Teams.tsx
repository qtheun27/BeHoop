// Onglet « Équipes » : les équipes dont je fais partie (que je gère, de mon enfant, où je joue) — pas les équipes suivies.
// Tout l'essentiel au même endroit : prochain match, covoiturage, fil de l'équipe (🔒 compris), galerie, vidéos, membres.
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { mediaUrl, ensureMediaCookie } from '../lib/api';
import { loadClub, teamIndex, teamLabel, isPlayed, type Game } from '../lib/data';
import { Screen, Empty, Skeleton, Disc, Sheet, useAsync } from '../ui/kit';
import { PostCard } from './Feed';
import { MembersList } from './Explore';
import { CarpoolSheet, LiveScoreSheet, useLive } from './Live';
import { frDate, mapsUrl, store } from '../lib/util';

export function MyTeams({ id }: { id?: number }) {
  const s = useSession();
  const idx = useAsync(teamIndex, []);
  const mine = s.memberships;
  const [sel, setSel] = useState<number | undefined>(() => id ?? store.get<number | undefined>('behoop.equipe', undefined));
  const current = mine.find((m) => m.teamId === sel) ?? mine.find((m) => m.status === 'accepted') ?? mine[0];
  useEffect(() => { if (current) store.set('behoop.equipe', current.teamId); }, [current?.teamId]); // eslint-disable-line

  if (!s.user) return (
    <Screen title="Équipes"><Empty ill="👨‍👩‍👧" title="L'espace de ton équipe" text="Connecte-toi pour retrouver l'équipe que tu gères, celle de ton enfant ou celle où tu joues : matchs, covoiturage, photos et vidéos."
      action={<button className="btn" onClick={() => s.requireAuth()}>Se connecter</button>} /></Screen>);
  if (!mine.length) return (
    <Screen title="Équipes"><Empty ill="👨‍👩‍👧" title="Tu ne fais encore partie d'aucune équipe" text="Ouvre la fiche de l'équipe de ton enfant (ou celle que tu coaches) et touche « Rejoindre ». Un responsable validera ta demande."
      action={<a className="btn" href="#/explorer">Trouver mon équipe</a>} /></Screen>);
  const name = (tid: number) => { const e = idx.data?.get(tid); return e ? `${e.club.short} · ${teamLabel(e.team)}` : `Équipe ${tid}`; };
  return (
    <Screen title="Équipes">
      {mine.length > 1 && <div className="chips">{mine.map((m) => (
        <button key={m.teamId} className={`chip${current?.teamId === m.teamId ? ' on' : ''}`} onClick={() => setSel(m.teamId)}>{name(m.teamId)}</button>))}</div>}
      {current && (current.status === 'accepted' ? <TeamSpace key={current.teamId} m={current} /> : (
        <Empty ill="⏳" title={`Demande envoyée : ${name(current.teamId)}`} text="Un responsable de l'équipe doit valider ta demande. Tu recevras une notification." />))}
    </Screen>
  );
}

function TeamSpace({ m }: { m: D.Membership }) {
  const s = useSession();
  const data = useAsync(async () => {
    const e = (await teamIndex()).get(m.teamId); if (!e) throw new Error('Équipe introuvable');
    const c = await loadClub(e.club.id);
    await ensureMediaCookie();
    const posts = await D.postsForTeam(m.teamId, true);
    return { ...e, games: c.games.filter((g) => g.h === m.teamId || g.a === m.teamId), posts };
  }, [m.teamId]);
  const [sheet, setSheet] = useState<null | { kind: 'car' | 'live' | 'members'; g?: Game }>(null);
  const members = useAsync(() => D.teamMembersList(m.teamId), [m.teamId]);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = useMemo(() => (data.data?.games ?? []).filter((g) => g.d >= today && !isPlayed(g)).slice(0, 3), [data.data, today]);
  const last = useMemo(() => (data.data?.games ?? []).filter(isPlayed).slice(-1)[0], [data.data]);
  if (!data.data) return <Skeleton h={120} n={3} />;
  const { team, club, posts } = data.data;
  const resp = m.role === 'responsable';
  const photos = posts.filter((p) => p.type === 'photo' && !p.hidden).flatMap((p) => (p.payload.photos as { key: string }[]).map((ph) => ({ key: ph.key, post: p.id }))).slice(0, 12);
  const videos = posts.filter((p) => (p.type === 'video' || p.type === 'moment') && !p.hidden);
  const acc = (members.data ?? []).filter((x) => x.status === 'accepted');
  const pending = (members.data ?? []).filter((x) => x.status === 'pending');
  return (
    <>
      <a className="hstack" href={`#/equipe/${team.id}`} style={{ color: 'inherit', marginBottom: 18 }}>
        <Disc src={club.logo} name={club.name} size={60} ring={club.c1} />
        <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 19 }}>{teamLabel(team)}</div><div className="muted">{club.name}</div></div>
        <span className="pill">{resp ? 'Responsable' : 'Membre'}</span>
      </a>

      <div className="group-title">Prochains matchs</div>
      {upcoming.length === 0 ? <div className="group"><div className="row muted">Aucun match programmé.</div></div> : upcoming.map((g, i) => (
        <NextGame key={g.id} g={g} teamId={team.id} big={i === 0} onCar={() => setSheet({ kind: 'car', g })} onLive={() => setSheet({ kind: 'live', g })} />))}
      {last && <a className="row group" href={`#/equipe/${team.id}`} style={{ color: 'inherit' }}>
        <div className="grow"><div className="sub">Dernier résultat · {frDate(last.d, { day: 'numeric', month: 'short' })}</div>
          <div style={{ fontWeight: 600 }}>{last.hn} {last.hs} – {last.as} {last.an}</div></div><span className="chev">›</span></a>}

      {videos.length > 0 && <>
        <div className="group-title">🎬 Vidéos de match</div>
        <div className="group">{videos.slice(0, 5).map((p) => (
          <a key={p.id} className="row" href={p.type === 'video' ? `#/video/${p.payload.matchVideoId}` : `#/video/${p.payload.matchVideoId}/m-${p.payload.momentId}`} style={{ color: 'inherit' }}>
            <div className="thumb" style={{ width: 72, aspectRatio: '16/9', backgroundImage: p.payload.posterKey ? `url(${mediaUrl(p.payload.posterKey)})` : undefined }} />
            <div className="grow ellipsis">{p.type === 'moment' ? '⚡ ' : ''}{p.payload.title}<div className="sub">{p.payload.score}</div></div><span className="chev">›</span></a>))}</div>
      </>}

      {photos.length > 0 && <>
        <div className="group-title">📷 Galerie</div>
        <div className="grid3" style={{ marginBottom: 22 }}>{photos.map((ph, i) => (
          <a key={i} className="thumb" href={`#/post/${ph.post}`} style={{ backgroundImage: `url(${mediaUrl(ph.key)})` }} aria-label="Voir la photo" />))}</div>
      </>}

      <div className="group-title">👥 Membres</div>
      <button className="row group" onClick={() => setSheet({ kind: 'members' })}>
        <div className="grow">{acc.length} membre{acc.length > 1 ? 's' : ''}{resp && pending.length > 0 && <span className="pill live" style={{ marginLeft: 8 }}>{pending.length} demande{pending.length > 1 ? 's' : ''}</span>}</div>
        <span className="chev">›</span></button>

      <div className="hstack" style={{ justifyContent: 'space-between', margin: '6px 4px 8px' }}>
        <div className="group-title" style={{ margin: 0 }}>Fil de l'équipe</div>
        <a href="#/publier?photo=1" style={{ fontWeight: 600, fontSize: 15 }}>＋ Publier</a>
      </div>
      {posts.length === 0 ? <Empty ill="🏀" title="Rien pour l'instant" text="Les résultats, photos et vidéos de l'équipe apparaîtront ici." /> : posts.slice(0, 10).map((p) => <PostCard key={p.id} post={p} />)}

      {sheet?.kind === 'car' && sheet.g && <CarpoolSheet g={sheet.g} youthTeam={team.ag === 'jeunes' ? team.id : null} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'live' && sheet.g && <LiveScoreSheet g={sheet.g} home={sheet.g.hn} away={sheet.g.an} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'members' && <Sheet title="Membres de l'équipe" onClose={() => setSheet(null)}>
        {resp ? <MembersList teamId={team.id} members={members.data ?? []} reload={members.reload} me={s.user!.uid} />
          : <div className="group">{acc.map((x) => <div key={x.uid} className="row"><div className="grow">{x.displayName}</div>{x.role === 'responsable' && <span className="pill">Responsable</span>}</div>)}</div>}
      </Sheet>}
    </>
  );
}

function NextGame({ g, teamId, big, onCar, onLive }: { g: Game; teamId: number; big: boolean; onCar: () => void; onLive: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const live = useLive(g.d === today ? g.id : null);
  const home = g.h === teamId;
  return (
    <div className="card" style={{ padding: big ? 16 : 12 }}>
      <div className="hstack" style={{ justifyContent: 'space-between' }}>
        <span className="muted" style={{ fontSize: 14 }}>{frDate(g.d)} · {g.t}</span>
        <span className="pill">{home ? 'Domicile' : 'Extérieur'}</span>
      </div>
      <div style={{ fontWeight: 700, fontSize: big ? 18 : 16, marginTop: 6 }}>{home ? `vs ${g.an}` : `@ ${g.hn}`}</div>
      {live?.status === 'live' && <div className="pill live" style={{ marginTop: 6 }}>🔴 {live.home} – {live.away} · Q{live.quarter}</div>}
      {big && g.v && <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>📍 {g.v}{g.adr ? ` — ${g.adr}` : ''}</div>}
      <div className="hstack" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        <button className="btn small" onClick={onCar}>🚗 Covoiturage</button>
        {big && g.v && <a className="btn small secondary" href={mapsUrl(`${g.v} ${g.adr}`, g.lat, g.lng)} target="_blank" rel="noopener">Itinéraire</a>}
        {big && <a className="btn small secondary" href={`${location.origin}/calendars/team-${teamId}.ics`.replace(/^https?:/, 'webcal:')}>📆 Calendrier</a>}
        {g.d === today && <button className="btn small secondary" onClick={onLive}>Score en direct</button>}
      </div>
    </div>
  );
}
