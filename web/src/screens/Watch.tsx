// Lecteur vidéo de match (HLS) façon Apple + Moments (V2) + vote « Action du match ».
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { api, ensureMediaCookie, mediaUrl } from '../lib/api';
import { Screen, Empty, Skeleton, ErrorBox, Sheet, useAsync } from '../ui/kit';
import { store, haptic, setReturnTo } from '../lib/util';
import type { Chapter } from '../../../shared/chapters';
import { t } from '../lib/i18n';
import { Ico } from '../ui/icons';
import { qs } from '../lib/router';
import { teamIndex, teamLabel } from '../lib/data';
import { JoinSheet } from './Explore';
import { keepAwake } from '../lib/upload';
import { settingsFromStore, type StoredSettings, type MatchSettings } from '../../../shared/types';
import { validateScores } from '../../../shared/scores';

/** Corriger le score d'une vidéo déjà montée : les planches sont refaites avec les mêmes médias (nouvelle version) */
function ScoreSheet({ id, mv, onClose }: { id: string; mv: MatchVideo; onClose: () => void }) {
  const s = useSession();
  const st: MatchSettings = settingsFromStore(mv.settings!);
  const [sc, setSc] = useState(st.scores.map((x) => [...x] as [number, number]));
  const [err, setErr] = useState('');
  // Proposition automatique : photos du marquoir lues et résultat officiel (seulement les scores encore vides)
  const [auto, setAuto] = useState('');
  useEffect(() => {
    setAuto(t('Lecture des photos du marquoir…'));
    api<{ scores: [number, number][]; read: number[]; official: boolean }>('/montage/autoscore', { matchVideoId: id }).then((r) => {
      setSc((cur) => cur.map((x, i) => (!x[0] && !x[1] ? r.scores[i] : x)));
      setAuto(r.read.length || r.official ? [r.read.length ? t('Lu sur les photos du marquoir : {q}.', { q: r.read.map((q) => (q === 4 ? t('final') : `Q${q}`)).join(', ') }) : '', r.official ? t('Score final officiel ajouté.') : ''].filter(Boolean).join(' ') + ' ' + t('Vérifie avant de valider.')
        : t('Aucun score lu automatiquement : saisis-les à partir des photos du marquoir.'));
    }).catch(() => setAuto(''));
  }, [id]);
  const set = (i: number, side: number, v: number) => setSc(sc.map((x, j) => (j === i ? (side ? [x[0], Math.max(0, v)] : [Math.max(0, v), x[1]]) as [number, number] : x)));
  const go = async () => {
    const e = validateScores(sc as MatchSettings['scores']); if (e) { setErr(e); return; }
    try { await api('/render', { matchVideoId: id, settings: { ...st, scores: sc } }); s.toast(t('Score corrigé : la vidéo est refaite.')); location.hash = `/montage/${id}`; }
    catch { setErr(t('Impossible de relancer. Réessaie.')); }
  };
  return (
    <Sheet title={t('Corriger le score')} onClose={onClose}>
      <div className="form">
        <p className="hint" style={{ margin: 0 }}>{t('Scores cumulés à la fin de chaque quart ({h} – {a}).', { h: st.home.name, a: st.away.name })}</p>
        {['Fin Q1', 'Fin Q2', 'Fin Q3', 'Final'].map((l, i) => (
          <div key={l} className="hstack" style={{ justifyContent: 'space-between' }}>
            <b style={{ width: 60 }}>{t(l)}</b>
            {[0, 1].map((side) => <input key={side} className="field" style={{ width: 90, textAlign: 'center' }} inputMode="numeric" value={sc[i][side]} onChange={(e) => set(i, side, +e.target.value.replace(/\D/g, '') || 0)} aria-label={`${t(l)} ${side ? st.away.name : st.home.name}`} />)}
          </div>))}
        {auto && <div className="banner"><Ico n="sparkles" /><div style={{ fontSize: 14 }}>{auto}</div></div>}
        {err && <div className="err">{err}</div>}
        <p className="hint">{t('La vidéo est refaite avec les mêmes vidéos et photos (cela peut prendre un moment). Tu reçois une notification quand elle est prête.')}</p>
        <button className="btn" onClick={go}>{t('Corriger et refaire la vidéo')}</button>
      </div>
    </Sheet>
  );
}

/** Téléchargement : dans l'appli installée sur l'écran d'accueil, un lien externe s'ouvre dans le navigateur intégré,
 *  qui ne sait pas télécharger (page blanche). Sur iPhone (iOS 17+), « x-safari-https:// » l'ouvre dans le vrai Safari. */
const inSafari = (u: string) => {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone || matchMedia('(display-mode: standalone)').matches;
  return ios && standalone ? `x-safari-${u}` : u;
};

/** Lien à partager : l'équipe est dans le lien, pour qu'un non-membre puisse demander l'accès directement depuis la vidéo */
const shareUrl = (id: string, team?: number) => `${location.origin}/app/#/video/${id}${team ? `?e=${team}` : ''}`;
async function shareLink(title: string, url: string, toast: (m: string) => void) {
  try { if (navigator.share) { await navigator.share({ title, text: t('🏀 {t} — à voir sur BeHoop', { t: title }), url }); return; } } catch { return; /* partage annulé */ }
  await navigator.clipboard?.writeText(url).then(() => toast(t('Lien copié.'))).catch(() => {});
}

/** Vidéo d'une Équipe Jeunes ouverte par un non-membre : demander l'accès sans quitter la vidéo */
function AskAccess({ teamId }: { teamId: number }) {
  const s = useSession();
  const [open, setOpen] = useState(false);
  const info = useAsync(async () => {
    const [idx, mine] = await Promise.all([teamIndex(), D.myMemberships(s.user!.uid)]);
    const e = idx.get(teamId);
    return { name: e ? `${e.club.name} · ${teamLabel(e.team)}` : t('l’équipe'), pending: mine.some((m) => m.teamId === teamId && m.status === 'pending') };
  }, [teamId, open]);
  return (
    <Screen title={t('Vidéo')} back="fil">
      <Empty ill="lock" title={t('Vidéo réservée à l’équipe')} text={info.data?.pending
        ? t('Ta demande pour {e} est envoyée. Dès que le coach l’accepte, tu reçois une notification et tu peux revenir sur ce lien.', { e: info.data.name })
        : t('Pour protéger les jeunes, cette vidéo est visible par les membres de {e}. Demande l’accès : le coach accepte en un geste.', { e: info.data?.name ?? t('l’équipe') })}
        action={!info.data?.pending && <button className="btn" onClick={() => setOpen(true)}>{t('Demander l’accès à l’équipe')}</button>} />
      {open && <JoinSheet teamId={teamId} name={info.data?.name ?? ''} video={location.hash.replace(/^#\/video\//, '').split('?')[0]} onClose={() => { setOpen(false); info.reload(); }} />}
    </Screen>
  );
}

/** Au-delà, iOS ferme l'appli faute de mémoire avant la fin (la vidéo doit tenir en entier dans l'appli pour le partage) */
const PHOTOS_MAX = 350_000_000;
/** Affiches : affichées si elles existent ; sinon (vidéo montée avant leur arrivée), on les crée à la demande */
function AffichesBlock({ id, mv: mv0 }: { id: string; mv: MatchVideo }) {
  const s = useSession();
  const [live, setLive] = useState<MatchVideo | null>(null);
  useEffect(() => D.watchDoc<MatchVideo>(`matchVideos/${id}`, (x) => x && setLive(x)), [id]);
  const mv = live ?? mv0;
  const [asked, setAsked] = useState(false);
  const busy = asked || mv.affichesStatus === 'queued' || mv.affichesStatus === 'running';
  const make = async () => { setAsked(true); try { await api('/affiches', { matchVideoId: id }); } catch { setAsked(false); s.toast(t('Impossible de créer les affiches. Réessaie.')); } };
  if (mv.hls?.affiches?.length) return <Affiches id={id} keys={mv.hls.affiches} title={mv.title} />;
  return (
    <>
      <div className="group-title mt">{t('Affiches du match')}</div>
      {mv.affichesStatus === 'error' && <div className="err">{t('La création des affiches a échoué. Réessaie.')}</div>}
      <button className="btn secondary" disabled={busy} onClick={make}>
        <Ico n="image" />{busy ? t('Création des affiches… (quelques minutes)') : t('Créer les affiches du match')}</button>
    </>
  );
}

/** Affiches du match (avant-match, fins de quart, score final) : images 1920 × 1080 à enregistrer ou partager */
const AFF_LABEL: Record<string, string> = { pre: 'Avant-match', q1: 'Fin du 1er quart', q2: 'Mi-temps', q3: 'Fin du 3e quart', fin: 'Score final' };
function Affiches({ id, keys, title }: { id: string; keys: string[]; title: string }) {
  const s = useSession();
  // Liens de téléchargement signés (serveur, 3 h) : un vrai téléchargement, sans dépendre des cookies du navigateur
  const links = useAsync(() => api<{ links: Record<string, string> }>('/download', { matchVideoId: id, affiches: true }).then((r) => r.links), [id, keys.join()]);
  const name = (k: string) => `${title.replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'match'} - ${t(AFF_LABEL[k.split('/').pop()!.replace('.jpg', '')] ?? 'affiche')}.jpg`;
  // Partager (téléphone) : menu de partage, avec « Enregistrer l'image » pour Photos
  const share = async (k: string) => {
    try {
      const r = await fetch(links.data![k]);
      if (!r.ok) throw new Error(String(r.status));
      const f = new File([await r.blob()], name(k), { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f] }); else location.href = inSafari(links.data![k]);
    } catch (e) { if ((e as Error)?.name !== 'AbortError') s.toast(t('Impossible de partager l’affiche.')); }
  };
  const phone = typeof navigator.share === 'function' && /iPhone|iPad|Android/i.test(navigator.userAgent);
  return (
    <>
      <div className="group-title mt">{t('Affiches du match')}</div>
      {links.error && <ErrorBox msg={t('Impossible d’enregistrer l’affiche.')} retry={links.reload} />}
      <div className="grid-aff">{keys.map((k) => { const kind = k.split('/').pop()!.replace('.jpg', ''); return (
        <div key={k} className="aff">
          <img src={mediaUrl(k)} alt={t(AFF_LABEL[kind] ?? kind)} loading="lazy" /><span>{t(AFF_LABEL[kind] ?? kind)}</span>
          <div className="aff-btns">
            {phone ? <button className="btn small secondary" disabled={!links.data} onClick={() => share(k)}>{t('Enregistrer / partager')}</button>
              : <a className={`btn small secondary${links.data ? '' : ' disabled'}`} href={links.data?.[k] ?? undefined} download={name(k)}>{t('Enregistrer')}</a>}
          </div>
        </div>); })}</div>
    </>
  );
}

/** Enregistrer dans Photos : une appli web ne peut pas écrire directement dans Photos ; on télécharge la vidéo dans
 *  l'appli, puis le partage de l'iPhone propose « Enregistrer la vidéo » (Photos) ou YouTube. Fichier gardé en mémoire :
 *  le 720p est plus sûr pour une longue vidéo. */
function SaveToPhotos({ url, name }: { url: string; name: string }) {
  const s = useSession();
  const [st, setSt] = useState<{ pc?: number; file?: File; err?: string }>({});
  const go = async () => {
    setSt({ pc: 0 }); await keepAwake(true);
    try {
      const r = await fetch(url);
      if (!r.ok || !r.body) throw new Error(String(r.status));
      const total = Number(r.headers.get('Content-Length')) || 0;
      const reader = r.body.getReader(); const parts: Uint8Array[] = []; let got = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; if (total) setSt({ pc: Math.floor((got / total) * 100) }); }
      setSt({ file: new File(parts as BlobPart[], name, { type: 'video/mp4' }) });
    } catch { setSt({ err: t('Téléchargement interrompu (vidéo trop lourde pour la mémoire du téléphone ?). Essaie le 720p, ou « Télécharger dans Fichiers ».') }); }
    finally { keepAwake(false); }
  };
  const share = async () => {
    const f = st.file!;
    if (!navigator.canShare?.({ files: [f] })) { s.toast(t('Ton téléphone ne permet pas ce partage : utilise « Télécharger dans Fichiers ».')); return; }
    try { await navigator.share({ files: [f] }); } catch { /* partage annulé */ }
  };
  if (st.file) return <button className="btn" onClick={share}><Ico n="image" />{t('Enregistrer dans Photos / YouTube…')}</button>;
  if (st.pc !== undefined) return <div><div className="progress"><i style={{ width: `${st.pc}%` }} /></div><p className="muted center" style={{ fontSize: 13 }}>{t('Téléchargement {n} % — garde l’appli ouverte', { n: st.pc })}</p></div>;
  return <>{st.err && <div className="err">{st.err}</div>}<button className="btn" onClick={go}><Ico n="image" />{t('Enregistrer dans Photos')}</button></>;
}

/** Publier sur YouTube : enregistrer la vidéo, puis l'envoyer depuis l'app YouTube (titre et description prêts à coller) */
function YoutubeSheet({ id, mv: mv0, team, onClose }: { id: string; mv: MatchVideo; team?: number; onClose: () => void }) {
  const s = useSession();
  // Suivi en direct : le fichier MP4 peut être préparé à la demande (quelques minutes, sur nos serveurs)
  const [live, setLive] = useState<MatchVideo | null>(null);
  useEffect(() => D.watchDoc<MatchVideo>(`matchVideos/${id}`, (x) => x && setLive(x)), [id]);
  const mv = live ?? mv0;
  // 1080p pour les grands écrans et YouTube (par défaut), 720p plus léger
  const [q, setQ] = useState<'1080p' | '720p'>('1080p');
  const mp4 = q === '1080p' ? mv.hls?.mp4Key1080 : mv.hls?.mp4Key;
  const status = q === '1080p' ? mv.mp4Status1080 : mv.mp4Status;
  const [asked, setAsked] = useState<string>('');
  const prepare = async () => { setAsked(q); try { await api('/mp4', { matchVideoId: id, quality: q }); } catch { setAsked(''); s.toast(t('Impossible de préparer le fichier. Réessaie.')); } };
  const busy = asked === q || status === 'queued' || status === 'running';
  const youth = mv.visibility === 'team';
  const [ok, setOk] = useState(!youth);
  // Lien de téléchargement préparé à l'avance (le toucher doit ouvrir le lien directement, sinon iOS le bloque)
  const [dl, setDl] = useState<string | null>(null);
  const [size, setSize] = useState(0);
  useEffect(() => { setDl(null); if (mp4 && ok) api<{ url: string; size?: number }>('/download', { matchVideoId: id, quality: q }).then((r) => { setDl(r.url); setSize(r.size ?? 0); }).catch(() => s.toast(t('Lien de téléchargement indisponible. Réessaie.'))); }, [mp4, ok, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const desc = `${mv.title}\n${t('Vidéo du match réalisée avec BeHoop')} : ${shareUrl(id, team)}`;
  const copy = (x: string) => navigator.clipboard?.writeText(x).then(() => s.toast(t('Copié.'))).catch(() => {});
  return (
    <Sheet title={t('Publier sur YouTube')} onClose={onClose}>
      <div className="form">
        {youth && <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />{t('J’ai l’accord des parents des joueurs filmés pour publier cette vidéo sur YouTube.')}</label>}
        <div className="seg">{(['1080p', '720p'] as const).map((x) => <button key={x} className={q === x ? 'on' : ''} onClick={() => setQ(x)}>{x === '1080p' ? t('1080p · grand écran') : t('720p · plus léger')}</button>)}</div>
        <p className="hint" style={{ margin: 0 }}>{t('1. « Enregistrer dans Photos » télécharge la vidéo puis ouvre le partage de l’iPhone : choisis « Enregistrer la vidéo » ou YouTube. Pour une longue vidéo, le 720p est plus sûr. Sinon : « Télécharger dans Fichiers (Safari) » : Safari demande « Télécharger », le suivi est sous la flèche ↓. Reste en Wi-Fi.')}</p>
        {!mp4 ? <button className="btn" disabled={busy || !ok} onClick={prepare}><Ico n="video" />{busy ? t('Préparation du fichier… (quelques minutes, tu peux fermer)') : t('Préparer le fichier vidéo')}</button>
          : ok && dl ? <>{size && size <= PHOTOS_MAX ? <SaveToPhotos key={dl} url={dl} name={`${mv.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 50) || 'match'} ${q}.mp4`} />
              : <p className="hint" style={{ margin: 0 }}>{t('Vidéo trop lourde ({g} Go) pour aller directement dans Photos : télécharge-la dans Fichiers, puis dans Fichiers touche-la › partager › « Enregistrer la vidéo ».', { g: (size / 1e9).toFixed(1) })}</p>}
            <a className="btn secondary" href={inSafari(dl)} target="_blank" rel="noopener noreferrer"><Ico n="folder" />{t('Télécharger dans Fichiers (Safari)')}</a></>
          : <button className="btn" disabled><Ico n="video" />{t('Enregistrer la vidéo')}</button>}
        <p className="hint" style={{ margin: 0 }}>{t('2. Sur YouTube, colle le titre et la description ci-dessous. Pour un club de jeunes, mets la vidéo plutôt en « Non répertoriée ».')}</p>
        <button className="btn secondary" onClick={() => copy(mv.title)}>{t('Copier le titre')}</button>
        <button className="btn secondary" onClick={() => copy(desc)}>{t('Copier la description')}</button>
        <a className="btn ghost" href="https://www.youtube.com/upload" target="_blank" rel="noopener noreferrer">{t('Ouvrir YouTube')}</a>
      </div>
    </Sheet>
  );
}

interface MatchVideo { settings?: StoredSettings; title: string; status: string; visibility: 'public' | 'team'; teamIds: number[]; authorUid: string; version: number; mp4Status?: 'queued' | 'running' | 'ready' | 'error'; mp4Status1080?: 'queued' | 'running' | 'ready' | 'error'; affichesStatus?: 'queued' | 'running' | 'ready' | 'error';
  hls?: { masterKey: string; chapters: Chapter[]; duration: number; posterKey: string; mp4Key?: string; mp4Key1080?: string; affiches?: string[] }; voteUntil?: { toMillis: () => number } }
interface Moment { id: string; start: number; end: number; status: string; r2Key?: string; authorUid?: string }

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function Watch({ id, t: part }: { id: string; t?: string }) {
  const s = useSession();
  const v = useAsync(async () => { await ensureMediaCookie(); const x = await D.getDoc(D.doc(D.db, 'matchVideos', id)); return x.exists() ? (x.data() as MatchVideo) : null; }, [id, s.user?.uid]);
  const team = Number(qs().get('e')) || undefined;
  if (!s.user) { setReturnTo(location.hash); return <Screen title={t('Vidéo')} back="fil"><Empty ill="video" title={t('Une vidéo de match t’attend')} text={t('Crée ton compte BeHoop gratuit en 30 secondes pour la regarder : tu reviens ici juste après.')} action={<button className="btn" onClick={() => s.requireAuth()}>{t('Créer mon compte / me connecter')}</button>} /></Screen>; }
  if (v.error && team) return <AskAccess teamId={team} />;
  if (v.error) return <Screen title={t('Vidéo')} back="fil"><ErrorBox msg={v.error === t('Accès refusé.') ? t('Cette vidéo est réservée aux membres de l’Équipe.') : v.error} retry={v.reload} /></Screen>;
  if (v.loading) return <Screen title={t('Vidéo')} back="fil"><Skeleton h={220} n={2} /></Screen>;
  const mv = v.data;
  if (!mv || !mv.hls) return <Screen title={t('Vidéo')} back="fil"><Empty ill="video" title={mv ? t('Vidéo en préparation') : t('Vidéo introuvable')} text={mv ? t('Elle apparaîtra ici dès que le montage sera terminé.') : undefined} /></Screen>;
  const momentId = part?.startsWith('m-') ? part.slice(2) : null;
  return (
    <Screen title={mv.title} back="fil">
      {momentId ? <MomentPlayer id={momentId} youth={mv.visibility === 'team'} /> : <Player id={id} mv={mv} team={team ?? mv.teamIds.find(Boolean)} />}
      <Moments id={id} mv={mv} />
    </Screen>
  );
}

function Player({ id, mv, team }: { id: string; mv: MatchVideo; team?: number }) {
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
  const [yt, setYt] = useState(false);
  const [fix, setFix] = useState(false);
  // Vidéo publique : vrai lien de téléchargement (un lien de lecture ouvrirait le lecteur de l'iPhone, sans enregistrement)
  const author = !!s.user && mv.authorUid === s.user.uid;
  const pubDl = useAsync(async () => (author && !youth && mv.hls?.mp4Key ? (await api<{ url: string }>('/download', { matchVideoId: id })).url : null), [id, s.user?.uid]);
  // YouTube et téléchargement : réservés à l'auteur du montage
  const canPublish = { data: !!s.user && mv.authorUid === s.user.uid };
  return (
    <>
      <div ref={box} className={`player${idle ? ' idle' : ''}`} onClick={onTap}>
        <video ref={ref} playsInline poster={mediaUrl(mv.hls!.posterKey)} controlsList={author ? undefined : 'nodownload'} onContextMenu={(e) => !author && e.preventDefault()}
          onTimeUpdate={(e) => { const c = e.currentTarget.currentTime; setTime(c); if (Math.round(c) % 5 === 0) store.set(posKey, c > dur - 10 ? 0 : c); }}
          onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); setIdle(false); }} />
        <div className="ctrl" onClick={(e) => e.stopPropagation()}>
          <div className="bar" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * dur); }} role="slider" aria-label={t('Position')} aria-valuemin={0} aria-valuemax={dur} aria-valuenow={Math.round(time)}>
            <div className="track" /><div className="fillp" style={{ width: `${(time / dur) * 100}%` }} />
            {chapters.slice(1).map((c) => <div key={c.title} className="mark" style={{ left: `${(c.start / dur) * 100}%` }} title={c.title} />)}
          </div>
          <div className="btns">
            <button onClick={toggle} aria-label={playing ? 'Pause' : 'Lecture'} ><Ico n={playing ? 'pause' : 'play'} size={22} /></button>
            <button onClick={() => seek(time - 10)} aria-label={t('Reculer de 10 s')}>↺10</button><button onClick={() => seek(time + 10)} aria-label={t('Avancer de 10 s')}>10↻</button>
            <span style={{ flex: 1, opacity: .85 }}>{fmt(time)} / {fmt(dur)}</span>
            <button onClick={() => { const n = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1; ref.current!.playbackRate = n; setRate(n); }} aria-label={t('Vitesse')}>{rate}×</button>
            {levels.length > 1 && <button onClick={() => { const n = level === -1 ? 0 : level === levels.length - 1 ? -1 : level + 1; hlsRef.current.currentLevel = n; setLevel(n); }} aria-label={t('Qualité')}>{level === -1 ? 'Auto' : `${levels[level].h}p`}</button>}
            <button aria-label={t('Plein écran')} onClick={() => { const el = ref.current as any; if (el.webkitEnterFullscreen) el.webkitEnterFullscreen(); else box.current!.requestFullscreen?.(); }}><Ico n="expand" size={22} /></button>
          </div>
        </div>
      </div>
      <div className="group-title mt">{t('Chapitres')}</div>
      <div className="group">{chapters.map((c) => (
        <button key={c.title} className="row" onClick={() => { seek(c.start); ref.current!.play(); }}>
          <div className="grow" style={{ fontWeight: time >= c.start && time < c.end ? 700 : 400 }}>{t(c.title)}</div><span className="muted">{fmt(c.start)}</span></button>))}</div>
      <div className="hstack">
        <button className="btn secondary" onClick={() => s.requireAuth(() => setClip(true)) && setClip(true)}><><Ico n="bolt" />{t('Créer un Moment')}</></button>
        <button className="btn secondary" onClick={() => shareLink(mv.title, shareUrl(id, youth ? team : undefined), s.toast)}><Ico n="external" />{t('Partager le lien')}</button>
        {!youth && pubDl.data && <a className="btn ghost" href={inSafari(pubDl.data)} target="_blank" rel="noopener noreferrer">{t('Télécharger la vidéo')}</a>}
      </div>
      {mv.settings && (mv.authorUid === s.user?.uid || s.isAdmin) && <button className="btn ghost mt" onClick={() => setFix(true)}><Ico n="scoreboard" />{t('Corriger le score')}</button>}
      {fix && <ScoreSheet id={id} mv={mv} onClose={() => setFix(false)} />}
      {author && <AffichesBlock id={id} mv={mv} />}
      {canPublish.data && <button className="btn ghost mt" onClick={() => setYt(true)}><Ico n="video" />{t('Publier sur YouTube')}</button>}
      {yt && <YoutubeSheet id={id} mv={mv} team={team} onClose={() => setYt(false)} />}
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
  const s = useSession();
  const m = useAsync(async () => { const x = await D.getDoc(D.doc(D.db, 'moments', id)); return x.exists() ? ({ id, ...x.data() } as Moment) : null; }, [id]);
  if (!m.data) return <Skeleton h={400} n={1} />;
  if (m.data.status !== 'ready' || !m.data.r2Key) return <Empty ill="bolt" title={t('Moment en préparation')} />;
  const url = mediaUrl(m.data.r2Key);
  return (
    <div className="center">
      <video src={url} controls playsInline style={{ maxHeight: '70dvh', borderRadius: 16, background: '#000', maxWidth: '100%' }} controlsList={m.data.authorUid === s.user?.uid ? undefined : 'nodownload'} />
      {!youth ? <button className="btn secondary mt" onClick={async () => {
        // Le fichier lui-même : seulement pour l'auteur du Moment ; les autres partagent le lien
        try { if (m.data!.authorUid !== s.user?.uid) { await navigator.share?.({ url: location.href, text: t('Un Moment sur BeHoop 🏀') }); return; }
          const blob = await (await fetch(url, { credentials: 'include' })).blob(); const f = new File([blob], 'moment-behoop.mp4', { type: 'video/mp4' });
          if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], text: t('Un Moment sur BeHoop 🏀') }); else await navigator.share?.({ url: location.href }); } catch { /* partage annulé */ } }}>{t('Partager (WhatsApp…)')}</button>
        : <p className="muted" style={{ fontSize: 14 }}><Ico n="lock" style={{ marginRight: 4 }} />{t('Moment d\'une équipe Jeunes : partage limité à l\'Équipe.')}</p>}
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
      <div className="group-title mt">{t('Moments')} {open ? `· ${t('vote pour l’Action du match')}` : top ? <>· <Ico n="trophy" /> {t('Action du match')}</> : ''}</div>
      <div className="group">{list.data.moments.map((m, i) => (
        <div key={m.id} className="row">
          <a className="grow" href={`#/video/${id}/m-${m.id}`} style={{ color: 'inherit' }}>{top?.[0] === m.id && !open && <Ico n="trophy" style={{ marginRight: 4, color: 'var(--accent)' }} />}{t('Action')} {i + 1} · {fmt(m.start)}<div className="sub">{t('{n} vote(s)', { n: list.data!.count[m.id] ?? 0 })}</div></a>
          {open && <button className={`btn small${list.data!.mine === m.id ? '' : ' secondary'}`} onClick={() => vote(m.id)}>{list.data!.mine === m.id ? <><Ico n="check" />{t('Mon vote')}</> : t('Voter')}</button>}
        </div>))}</div>
      <p className="group-foot">{t('On vote pour une action, jamais pour un joueur.')}</p>
    </>
  );
}
