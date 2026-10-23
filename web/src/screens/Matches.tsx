import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../lib/session';
import { trainingsOf, type Training } from '../club/api';
import { loadClub, teamIndex, isPlayed, teamLabel, type Game } from '../lib/data';
import { Screen, Empty, Skeleton, ErrorBox, useAsync } from '../ui/kit';
import { CalendarButton } from '../ui/CalendarButton';
import { mapsUrl, frDate } from '../lib/util';
import { qs } from '../lib/router';
import * as D from '../lib/db';
import { LiveScoreSheet, useLive } from './Live';
import { CarpoolSheet, CarpoolBadge, useCarpoolAccess } from './Carpool';
import { t } from '../lib/i18n';
import { Ico } from '../ui/icons';

export function Matches() {
  const s = useSession();
  const [tab, setTab] = useState<'next' | 'past'>('next');
  const [sheet, setSheet] = useState<null | { kind: 'live' | 'car'; g: Game; youth?: number | null }>(null);
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
  // Saison : les entraînements de mes équipes (membre accepté) s'ajoutent aux matchs suivis
  const trains = useAsync(() => (s.privateTeams.length ? trainingsOf(s.privateTeams.map(String), today).catch(() => []) : Promise.resolve([] as Training[])), [s.privateTeams.join()]);
  type Item = { d: string; k: string; g?: Game; tr?: Training };
  const groups = useMemo(() => {
    if (!data) return [] as { t: string; l: Item[] }[];
    if (tab === 'past') return [{ t: t('Matchs passés'), l: data.games.filter((g) => g.d <= today && isPlayed(g)).reverse().slice(0, 40).map((g): Item => ({ d: g.d, k: `g${g.id}`, g })) }];
    const up: Item[] = [...data.games.filter((g) => g.d >= today && !isPlayed(g)).map((g) => ({ d: `${g.d} ${g.t}`, k: `g${g.id}`, g })),
      ...(trains.data ?? []).map((tr) => ({ d: `${tr.date} ${tr.start_time ?? ''}`, k: `t${tr.id}`, tr }))].sort((a, b) => a.d.localeCompare(b.d));
    const day = (x: Item) => x.d.slice(0, 10);
    return [{ t: t('Aujourd’hui'), l: up.filter((x) => day(x) === today) }, { t: t('Cette semaine'), l: up.filter((x) => day(x) > today && day(x) <= weekEnd) }, { t: t('Plus tard'), l: up.filter((x) => day(x) > weekEnd).slice(0, 30) }].filter((x) => x.l.length);
  }, [data, tab, today, weekEnd, trains.data]);

  if (!s.user) return <Screen title={t('Saison')}><Empty ill="calendar" title={t('Tes prochains matchs')} text={t('Connecte-toi et suis tes équipes pour voir leurs prochains matchs ici.')} action={<button className="btn" onClick={() => s.requireAuth()}>{t('Se connecter')}</button>} /></Screen>;
  return (
    <Screen title={t('Saison')}>
      <div className="seg"><button className={tab === 'next' ? 'on' : ''} onClick={() => setTab('next')}>{t('À venir')}</button><button className={tab === 'past' ? 'on' : ''} onClick={() => setTab('past')}>{t('Passés')}</button></div>
      {error && <ErrorBox msg={error} retry={reload} />}
      {!data && !error ? <Skeleton h={110} /> : groups.length === 0 ? <Empty ill="calendar" title={t('Aucun match')} text={s.followedTeams.length ? t('Rien de prévu pour tes équipes.') : t('Suis des équipes pour voir leurs matchs.')} action={!s.followedTeams.length && <a className="btn" href="#/explorer">{t('Explorer')}</a>} /> :
        groups.map((gr) => (
          <section key={gr.t}><div className="group-title">{gr.t}</div>
            {gr.l.map((x) => x.g ? <MatchCard key={x.k} g={x.g} focus={x.g.id === focus} data={data!} onLive={() => setSheet({ kind: 'live', g: x.g! })} onCar={(youth) => setSheet({ kind: 'car', g: x.g!, youth })} />
              : <TrainingCard key={x.k} tr={x.tr!} team={data!.idx.get(Number(x.tr!.team_id))} />)}</section>))}
      {sheet?.kind === 'car' && <CarpoolSheet g={sheet.g} youthTeam={sheet.youth ?? null} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'live' && <LiveScoreSheet g={sheet.g} home={sheet.g.hn} away={sheet.g.an} onClose={() => setSheet(null)} />}
    </Screen>
  );
}


function MatchCard({ g, data, focus, onLive, onCar }: { g: Game; data: { idx: Awaited<ReturnType<typeof teamIndex>>; vids: Map<number, string> }; focus: boolean; onLive: () => void; onCar: (youth: number | null) => void }) {
  const s = useSession();
  const played = isPlayed(g);
  const today = new Date().toISOString().slice(0, 10);
  const live = useLive(g.d === today && !played ? g.id : null);
  const mineHome = s.followedTeams.includes(g.h);
  const te = data.idx.get(mineHome ? g.h : g.a);
  const vid = data.vids.get(g.id);
  // Covoiturage : seulement pour les déplacements (mon équipe joue à l'extérieur)
  const away = !mineHome && s.followedTeams.includes(g.a);
  const youth = te && te.team.ag === 'jeunes' ? te.team.id : null;
  const car = useCarpoolAccess(youth) && away && !played;
  // Lien d'une notification (…?g=match&car=1) : ouvre directement le covoiturage
  useEffect(() => { if (focus && car && qs().get('car')) onCar(youth); }, [focus, car]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="card" style={{ padding: 14, outline: focus ? '2px solid var(--accent)' : undefined }}>
      <div className="hstack" style={{ justifyContent: 'space-between' }}>
        <span className="muted" style={{ fontSize: 14 }}>{frDate(g.d)} · {g.t} {te && `· ${teamLabel(te.team)}`}</span>
        {live?.status === 'live' && <span className="pill live"><><Ico n="live" />{t('LIVE')}</></span>}
      </div>
      <div className="hstack mt" style={{ alignItems: 'center' }}>
        <div style={{ flex: 1 }}><div style={{ fontWeight: mineHome ? 700 : 500 }}>{g.hn}</div><div style={{ fontWeight: mineHome ? 500 : 700 }}>{g.an}</div></div>
        {(played || live) && <div style={{ fontFamily: 'Anton', fontSize: 28, textAlign: 'right', lineHeight: 1.1 }}><div>{played ? g.hs : live!.home}</div><div>{played ? g.as : live!.away}</div></div>}
      </div>
      {live && !played && <div className="muted" style={{ fontSize: 13 }}>Q{live.quarter} · mis à jour par {live.updatedByName}</div>}
      {!played && <div className="muted" style={{ fontSize: 14, marginTop: 6 }}><Ico n="pin" /> {g.v}{g.adr ? ` — ${g.adr}` : ''}</div>}
      <div className="hstack mt" style={{ flexWrap: 'wrap', gap: 8 }}>
        {!played && <a className="btn small secondary" href={mapsUrl(`${g.v} ${g.adr}`, g.lat, g.lng)} target="_blank" rel="noopener">{t('Itinéraire')}</a>}
        {car && <button className="btn small" onClick={() => onCar(youth)}><Ico n="car" />{t('Covoiturage')}</button>}
        {car && <CarpoolBadge g={g} youthTeam={youth} />}
        {!played && <CalendarButton teamId={mineHome ? g.h : g.a} label={t('Ajouter au calendrier')} compact />}
        {!played && g.d === today && <button className="btn small" onClick={() => s.requireAuth(onLive) && onLive()}>{t('Score en direct')}</button>}
        {played && vid && <a className="btn small" href={`#/video/${vid}`}>{t('▶ Vidéo du match')}</a>}
        {played && <a className="btn small secondary" href={`#/montage/new?g=${g.id}`}>{t('Créer la vidéo')}</a>}
      </div>
    </div>
  );
}

/** Entraînement d'une de mes équipes (Saison) */
function TrainingCard({ tr, team }: { tr: Training; team?: { club: { short: string }; team: Parameters<typeof teamLabel>[0] } }) {
  return (
    <div className="card training-card">
      <div className="card-head"><Ico n="clock" /><div className="grow"><div className="who">{t('Entraînement')}{team ? ` · ${team.club.short} ${teamLabel(team.team)}` : ''}</div>
        <div className="when">{frDate(tr.date)} · {tr.start_time}{tr.end_time ? `–${tr.end_time}` : ''}{tr.location ? ` · ${tr.location}` : ''}</div>{tr.notes && <div className="when">{tr.notes}</div>}</div></div>
    </div>
  );
}
