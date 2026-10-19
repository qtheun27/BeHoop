import { useMemo, useState } from 'react';
import { useSession } from '../lib/session';
import { loadClub, teamIndex, isPlayed, teamLabel, type Game } from '../lib/data';
import { Screen, Empty, Skeleton, ErrorBox, useAsync } from '../ui/kit';
import { CalendarButton } from '../ui/CalendarButton';
import { mapsUrl, frDate } from '../lib/util';
import { qs } from '../lib/router';
import * as D from '../lib/db';
import { LiveScoreSheet, useLive } from './Live';

export function Matches() {
  const s = useSession();
  const [tab, setTab] = useState<'next' | 'past'>('next');
  const [sheet, setSheet] = useState<null | { kind: 'live'; g: Game }>(null);
  const focus = Number(qs().get('g')) || null;
  const { data, error, reload } = useAsync(async () => {
    const idx = await teamIndex();
    const clubs = new Set(s.followedTeams.map((t) => idx.get(t)?.club.id).filter(Boolean) as number[]);
    const all = (await Promise.all([...clubs].map((c) => loadClub(c)))).flatMap((x) => x.games);
    const mine = new Set(s.followedTeams);
    const seen = new Set<number>();
    const games = all.filter((g) => (mine.has(g.h) || mine.has(g.a) || g.id === focus) && !seen.has(g.id) && seen.add(g.id)).sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t));
    const videos = await D.getDocs(D.query(D.collection(D.db, 'matchVideos'), D.where('matchAwbbId', 'in', games.filter(isPlayed).slice(-30).map((g) => g.id).concat([-1])), D.where('status', '==', 'ready'))).catch(() => null);
    const vids = new Map<number, string>(); videos?.forEach((v) => vids.set(v.data().matchAwbbId, v.id));
    return { games, idx, vids };
  }, [s.followedTeams.join()]);
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const groups = useMemo(() => {
    if (!data) return [];
    if (tab === 'past') return [{ t: 'Matchs passés', l: data.games.filter((g) => g.d <= today && isPlayed(g)).reverse().slice(0, 40) }];
    const up = data.games.filter((g) => g.d >= today && !isPlayed(g));
    return [{ t: "Aujourd'hui", l: up.filter((g) => g.d === today) }, { t: 'Cette semaine', l: up.filter((g) => g.d > today && g.d <= weekEnd) }, { t: 'Plus tard', l: up.filter((g) => g.d > weekEnd).slice(0, 30) }].filter((x) => x.l.length);
  }, [data, tab, today, weekEnd]);

  if (!s.user) return <Screen title="Matchs"><Empty ill="📅" title="Tes prochains matchs" text="Connecte-toi et suis tes équipes pour voir leurs prochains matchs ici." action={<button className="btn" onClick={() => s.requireAuth()}>Se connecter</button>} /></Screen>;
  return (
    <Screen title="Matchs">
      <div className="seg"><button className={tab === 'next' ? 'on' : ''} onClick={() => setTab('next')}>À venir</button><button className={tab === 'past' ? 'on' : ''} onClick={() => setTab('past')}>Passés</button></div>
      {error && <ErrorBox msg={error} retry={reload} />}
      {!data && !error ? <Skeleton h={110} /> : groups.length === 0 ? <Empty ill="📅" title="Aucun match" text={s.followedTeams.length ? 'Rien de prévu pour tes équipes.' : 'Suis des équipes pour voir leurs matchs.'} action={!s.followedTeams.length && <a className="btn" href="#/explorer">Explorer</a>} /> :
        groups.map((gr) => (
          <section key={gr.t}><div className="group-title">{gr.t}</div>
            {gr.l.map((g) => <MatchCard key={g.id} g={g} focus={g.id === focus} data={data!} onLive={() => setSheet({ kind: 'live', g })} />)}</section>))}
      {sheet?.kind === 'live' && <LiveScoreSheet g={sheet.g} home={sheet.g.hn} away={sheet.g.an} onClose={() => setSheet(null)} />}
    </Screen>
  );
}


function MatchCard({ g, data, focus, onLive }: { g: Game; data: { idx: Awaited<ReturnType<typeof teamIndex>>; vids: Map<number, string> }; focus: boolean; onLive: () => void }) {
  const s = useSession();
  const played = isPlayed(g);
  const today = new Date().toISOString().slice(0, 10);
  const live = useLive(g.d === today && !played ? g.id : null);
  const mineHome = s.followedTeams.includes(g.h);
  const t = data.idx.get(mineHome ? g.h : g.a);
  const vid = data.vids.get(g.id);
  return (
    <div className="card" style={{ padding: 14, outline: focus ? '2px solid var(--accent)' : undefined }}>
      <div className="hstack" style={{ justifyContent: 'space-between' }}>
        <span className="muted" style={{ fontSize: 14 }}>{frDate(g.d)} · {g.t} {t && `· ${teamLabel(t.team)}`}</span>
        {live?.status === 'live' && <span className="pill live">🔴 LIVE</span>}
      </div>
      <div className="hstack mt" style={{ alignItems: 'center' }}>
        <div style={{ flex: 1 }}><div style={{ fontWeight: mineHome ? 700 : 500 }}>{g.hn}</div><div style={{ fontWeight: mineHome ? 500 : 700 }}>{g.an}</div></div>
        {(played || live) && <div style={{ fontFamily: 'Anton', fontSize: 28, textAlign: 'right', lineHeight: 1.1 }}><div>{played ? g.hs : live!.home}</div><div>{played ? g.as : live!.away}</div></div>}
      </div>
      {live && !played && <div className="muted" style={{ fontSize: 13 }}>Q{live.quarter} · mis à jour par {live.updatedByName}</div>}
      {!played && <div className="muted" style={{ fontSize: 14, marginTop: 6 }}>📍 {g.v}{g.adr ? ` — ${g.adr}` : ''}</div>}
      <div className="hstack mt" style={{ flexWrap: 'wrap', gap: 8 }}>
        {!played && <a className="btn small secondary" href={mapsUrl(`${g.v} ${g.adr}`, g.lat, g.lng)} target="_blank" rel="noopener">Itinéraire</a>}
        {!played && <CalendarButton teamId={mineHome ? g.h : g.a} label="Ajouter au calendrier" compact />}
        {!played && g.d === today && <button className="btn small" onClick={() => s.requireAuth(onLive) && onLive()}>Score en direct</button>}
        {played && vid && <a className="btn small" href={`#/video/${vid}`}>▶ Vidéo du match</a>}
        {played && <a className="btn small secondary" href={`#/montage/new?g=${g.id}`}>Créer la vidéo</a>}
      </div>
    </div>
  );
}
