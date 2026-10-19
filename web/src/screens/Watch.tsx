// Lecteur vidéo de match (HLS) façon Apple + Moments (V2) + vote « Action du match ».
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { api, ensureMediaCookie, mediaUrl } from '../lib/api';
import { Screen, Empty, Skeleton, ErrorBox, Sheet, useAsync } from '../ui/kit';
import { store, haptic } from '../lib/util';
import type { Chapter } from '../../../shared/chapters';
import { t } from '../lib/i18n';

interface MatchVideo { title: string; status: string; visibility: 'public' | 'team'; teamIds: number[]; authorUid: string; version: number;
  hls?: { masterKey: string; chapters: Chapter[]; duration: number; posterKey: string; mp4Key?: string }; voteUntil?: { toMillis: () => number } }
interface Moment { id: string; start: number; end: number; status: string; r2Key?: string }

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function Watch({ id, t: part }: { id: string; t?: string }) {
  const s = useSession();
  const v = useAsync(async () => { await ensureMediaCookie(); const x = await D.getDoc(D.doc(D.db, 'matchVideos', id)); return x.exists() ? (x.data() as MatchVideo) : null; }, [id, s.user?.uid]);
  if (!s.user) return <Screen title={t('Vidéo')} back="fil"><Empty ill="🔒" title={t('Connecte-toi pour regarder')} action={<button className="btn" onClick={() => s.requireAuth()}>{t('Se connecter')}</button>} /></Screen>;
  if (v.error) return <Screen title={t('Vidéo')} back="fil"><ErrorBox msg={v.error === t('Accès refusé.') ? t('Cette vidéo est réservée aux membres de l’Équipe 🔒.') : v.error} retry={v.reload} /></Screen>;
  if (v.loading) return <Screen title={t('Vidéo')} back="fil"><Skeleton h={220} n={2} /></Screen>;
  const mv = v.data;
  if (!mv || !mv.hls) return <Screen title={t('Vidéo')} back="fil"><Empty ill="🎬" title={mv ? t('Vidéo en préparation') : t('Vidéo introuvable')} text={mv ? t('Elle apparaîtra ici dès que le montage sera terminé.') : undefined} /></Screen>;
  const momentId = part?.startsWith('m-') ? part.slice(2) : null;
  return (
    <Screen title={mv.title} back="fil">
      {momentId ? <MomentPlayer id={momentId} youth={mv.visibility === 'team'} /> : <Player id={id} mv={mv} />}
      <Moments id={id} mv={mv} />
    </Screen>
  );
}

function Player({ id, mv }: { id: string; mv: MatchVideo }) {
  const s = useSession();
  const ref = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<any>(null);
  const lastTap = useRef(0);
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false), [idle, setIdle] = useState(false);
  const [levels, setLevels] = useState<{ h: number }[]>([]), [level, setLevel] = useState(-1), [rate, setRate] = useState(1);
  const [clip, setClip] = useState(false);
  const dur = mv.hls!.duration, chapters = mv.hls!.chapters ?? [];
  const posKey = `behoop.pos.${id}`;
  useEffect(() => {
    const el = ref.current!; const src = mediaUrl(mv.hls!.masterKey);
    const resume = store.get<number>(posKey, 0);
    let destroyed = false;
    if (el.canPlayType('application/vnd.apple.mpegurl')) { el.src = src; el.currentTime = resume; } // Safari / iOS : HLS natif
    else import('hls.js').then(({ default: Hls }) => {
      if (destroyed || !Hls.isSupported()) return;
      const h = new Hls({ xhrSetup: (x) => { x.withCredentials = true; }, startPosition: resume, capLevelToPlayerSize: true });
      h.loadSource(src); h.attachMedia(el); hlsRef.current = h;
      h.on(Hls.Events.MANIFEST_PARSED, (_e, d) => setLevels(d.levels.map((l) => ({ h: l.height }))));
    });
    return () => { destroyed = true; hlsRef.current?.destroy(); };
  }, [mv.hls, posKey]);
  useEffect(() => { if (!playing || idle) return; const k = setTimeout(() => setIdle(true), 2500); return () => clearTimeout(k); }, [playing, idle]);
  const seek = (x: number) => { ref.current!.currentTime = Math.max(0, Math.min(dur, x)); setIdle(false); };
  const toggle = () => { const el = ref.current!; if (el.paused) el.play(); else el.pause(); };
  const onTap = (e: React.MouseEvent) => {
    const now = Date.now(); const r = box.current!.getBoundingClientRect();
    if (now - lastTap.current < 300) { haptic(); seek(ref.current!.currentTime + (e.clientX - r.left < r.width / 2 ? -10 : 10)); } else setIdle((i) => !i);
    lastTap.current = now;
  };
  const youth = mv.visibility === 'team';
  return (
    <>
      <div ref={box} className={`player${idle ? ' idle' : ''}`} onClick={onTap}>
        <video ref={ref} playsInline poster={mediaUrl(mv.hls!.posterKey)} controlsList={youth ? 'nodownload' : undefined} onContextMenu={(e) => youth && e.preventDefault()}
          onTimeUpdate={(e) => { const c = e.currentTarget.currentTime; setTime(c); if (Math.round(c) % 5 === 0) store.set(posKey, c > dur - 10 ? 0 : c); }}
          onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); setIdle(false); }} />
        <div className="ctrl" onClick={(e) => e.stopPropagation()}>
          <div className="bar" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * dur); }} role="slider" aria-label={t('Position')} aria-valuemin={0} aria-valuemax={dur} aria-valuenow={Math.round(time)}>
            <div className="track" /><div className="fillp" style={{ width: `${(time / dur) * 100}%` }} />
            {chapters.slice(1).map((c) => <div key={c.title} className="mark" style={{ left: `${(c.start / dur) * 100}%` }} title={c.title} />)}
          </div>
          <div className="btns">
            <button onClick={toggle} aria-label={playing ? 'Pause' : 'Lecture'} style={{ fontSize: 20 }}>{playing ? '❚❚' : '▶'}</button>
            <button onClick={() => seek(time - 10)} aria-label={t('Reculer de 10 s')}>↺10</button><button onClick={() => seek(time + 10)} aria-label={t('Avancer de 10 s')}>10↻</button>
            <span style={{ flex: 1, opacity: .85 }}>{fmt(time)} / {fmt(dur)}</span>
            <button onClick={() => { const n = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1; ref.current!.playbackRate = n; setRate(n); }} aria-label={t('Vitesse')}>{rate}×</button>
            {levels.length > 1 && <button onClick={() => { const n = level === -1 ? 0 : level === levels.length - 1 ? -1 : level + 1; hlsRef.current.currentLevel = n; setLevel(n); }} aria-label={t('Qualité')}>{level === -1 ? 'Auto' : `${levels[level].h}p`}</button>}
            <button aria-label={t('Plein écran')} onClick={() => { const el = ref.current as any; if (el.webkitEnterFullscreen) el.webkitEnterFullscreen(); else box.current!.requestFullscreen?.(); }}>⛶</button>
          </div>
        </div>
      </div>
      <div className="group-title mt">{t('Chapitres')}</div>
      <div className="group">{chapters.map((c) => (
        <button key={c.title} className="row" onClick={() => { seek(c.start); ref.current!.play(); }}>
          <div className="grow" style={{ fontWeight: time >= c.start && time < c.end ? 700 : 400 }}>{t(c.title)}</div><span className="muted">{fmt(c.start)}</span></button>))}</div>
      <div className="hstack">
        <button className="btn secondary" onClick={() => s.requireAuth(() => setClip(true)) && setClip(true)}>{t('⚡ Créer un Moment')}</button>
        {!youth && mv.hls!.mp4Key && <a className="btn ghost" href={mediaUrl(mv.hls!.mp4Key)} download>{t('Télécharger (720p)')}</a>}
      </div>
      {clip && <ClipSheet id={id} time={time} dur={dur} onClose={() => setClip(false)} />}
    </>
  );
}

/** Sélection d'un passage de 15 à 30 s (poignées début/fin) → rendu vertical 9:16. */
function ClipSheet({ id, time, dur, onClose }: { id: string; time: number; dur: number; onClose: () => void }) {
  const s = useSession();
  const [a, setA] = useState(Math.max(0, Math.round(time - 10))), [b, setB] = useState(Math.min(dur, Math.round(time + 10)));
  const len = b - a, ok = len >= 15 && len <= 30;
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={t('Nouveau Moment')} onClose={onClose}>
      <p className="muted">{t('Choisis un passage de 15 à 30 secondes. Il sera monté au format vertical avec le score.')}</p>
      <label className="label">{t('Début')} : {fmt(a)}</label><input type="range" min={0} max={dur} value={a} onChange={(e) => setA(Math.min(+e.target.value, b - 15))} style={{ width: '100%' }} />
      <label className="label">{t('Fin')} : {fmt(b)}</label><input type="range" min={0} max={dur} value={b} onChange={(e) => setB(Math.max(+e.target.value, a + 15))} style={{ width: '100%' }} />
      <p style={{ color: ok ? 'var(--text2)' : 'var(--red)' }}>{t('Durée')} : {len} s {ok ? '' : t('(entre 15 et 30 s)')}</p>
      <button className="btn" disabled={!ok || busy} onClick={async () => { setBusy(true); try { await api('/moments', { matchVideoId: id, start: a, end: b }); s.toast(t('Moment en préparation…')); onClose(); } catch { s.toast(t('Impossible de créer le Moment')); } finally { setBusy(false); } }}>{t('Créer le Moment')}</button>
    </Sheet>
  );
}

function MomentPlayer({ id, youth }: { id: string; youth: boolean }) {
  const m = useAsync(async () => { const x = await D.getDoc(D.doc(D.db, 'moments', id)); return x.exists() ? ({ id, ...x.data() } as Moment) : null; }, [id]);
  if (!m.data) return <Skeleton h={400} n={1} />;
  if (m.data.status !== 'ready' || !m.data.r2Key) return <Empty ill="⚡" title={t('Moment en préparation')} />;
  const url = mediaUrl(m.data.r2Key);
  return (
    <div className="center">
      <video src={url} controls playsInline style={{ maxHeight: '70dvh', borderRadius: 16, background: '#000', maxWidth: '100%' }} controlsList={youth ? 'nodownload' : undefined} />
      {!youth ? <button className="btn secondary mt" onClick={async () => {
        try { const blob = await (await fetch(url, { credentials: 'include' })).blob(); const f = new File([blob], 'moment-behoop.mp4', { type: 'video/mp4' });
          if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], text: t('Un Moment sur BeHoop 🏀') }); else await navigator.share?.({ url: location.href }); } catch { /* partage annulé */ } }}>{t('Partager (WhatsApp…)')}</button>
        : <p className="muted" style={{ fontSize: 14 }}>{t('🔒 Moment d\'une équipe Jeunes : partage limité à l\'Équipe.')}</p>}
    </div>
  );
}

/** Liste des Moments du match + vote « Action du match » (un vote par compte, 48 h). */
function Moments({ id, mv }: { id: string; mv: MatchVideo }) {
  const s = useSession();
  const list = useAsync(async () => {
    const q = await D.getDocs(D.query(D.collection(D.db, 'moments'), D.where('matchVideoId', '==', id), D.where('status', '==', 'ready')));
    const votes = await D.getDocs(D.collection(D.db, 'momentVotes', id, 'votes')).catch(() => null);
    const count: Record<string, number> = {}; let mine = '';
    votes?.forEach((v) => { const m = v.data().momentId; count[m] = (count[m] ?? 0) + 1; if (v.id === s.user?.uid) mine = m; });
    return { moments: q.docs.map((d) => ({ id: d.id, ...d.data() }) as Moment), count, mine };
  }, [id]);
  if (!list.data?.moments.length) return null;
  const open = (mv.voteUntil?.toMillis() ?? 0) > Date.now();
  const top = Object.entries(list.data.count).sort((a, b) => b[1] - a[1])[0];
  const vote = async (mid: string) => {
    if (!s.requireAuth()) return;
    await D.setDoc(D.doc(D.db, 'momentVotes', id, 'votes', s.user!.uid), { momentId: mid, at: D.serverTimestamp() }); haptic(); list.reload();
  };
  return (
    <>
      <div className="group-title mt">{t('Moments')} {open ? `· ${t('vote pour l’Action du match')}` : top ? `· 🏆 ${t('Action du match')}` : ''}</div>
      <div className="group">{list.data.moments.map((m, i) => (
        <div key={m.id} className="row">
          <a className="grow" href={`#/video/${id}/m-${m.id}`} style={{ color: 'inherit' }}>{top?.[0] === m.id && !open ? '🏆 ' : ''}{t('Action')} {i + 1} · {fmt(m.start)}<div className="sub">{t('{n} vote(s)', { n: list.data!.count[m.id] ?? 0 })}</div></a>
          {open && <button className={`btn small${list.data!.mine === m.id ? '' : ' secondary'}`} onClick={() => vote(m.id)}>{list.data!.mine === m.id ? t('Mon vote ✓') : t('Voter')}</button>}
        </div>))}</div>
      <p className="group-foot">{t('On vote pour une action, jamais pour un joueur.')}</p>
    </>
  );
}
