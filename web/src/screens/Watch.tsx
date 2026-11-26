// Lecteur vidéo de match (HLS) façon Apple + Moments (V2) + vote « Action du match ».
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditSheet } from '../ui/EditSheet';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { api, ensureMediaCookie, mediaUrl } from '../lib/api';
import { WORKER_URL } from '../lib/config';
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
// Lien de partage : page du serveur avec le titre et l'affiche (aperçu WhatsApp / Facebook), qui renvoie vers l'appli
const shareUrl = (id: string, team?: number) => `${WORKER_URL}/s/v/${id}${team ? `?e=${team}` : ''}`;
const momentShareUrl = (mid: string) => `${WORKER_URL}/s/m/${mid}`;
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
  // Préparation bloquée (plus de 70 min, tâche arrêtée en route) : on peut la redemander
  const since = Number((q === '1080p' ? mv.mp4Status1080Since : mv.mp4StatusSince) ?? 0);
  const busy = asked === q || ((status === 'queued' || status === 'running') && Date.now() - since < 70 * 60e3);
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
        <YtPublish id={id} mv={mv} youth={youth} parentsOk={ok} desc={desc} />
        <div className="group-title mt">{t('Ou à la main')}</div>
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

/** Publication directe sur la chaîne YouTube de l'utilisateur : envoyée par le serveur (rien ne passe par le téléphone) */
function YtPublish({ id, mv, youth, parentsOk, desc, moment }: { id: string; mv: MatchVideo; youth: boolean; parentsOk: boolean; desc: string; moment?: Moment }) {
  const s = useSession();
  const st = useAsync(() => api<{ available: boolean; connected: boolean; channelTitle: string | null }>('/youtube/status', {}), []);
  const lists = useAsync(async () => (st.data?.connected ? (await api<{ playlists: { id: string; title: string }[] }>('/youtube/playlists', {})).playlists : []), [st.data?.connected]);
  const set = mv.settings ? settingsFromStore(mv.settings) : null;
  const season = (() => { const d = new Date(set?.date ?? Date.now()); const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String(y + 1).slice(2)}`; })();
  const [title, setTitle] = useState(moment ? moment.title || `${mv.title} — Moment` : mv.title), [text, setText] = useState(moment?.text ? `${moment.text}\n\n${desc}` : desc);
  const target = moment ? { matchVideoId: id, momentId: moment.id } : { matchVideoId: id };
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>(youth ? 'unlisted' : 'public');
  const [pl, setPl] = useState('none'), [plName, setPlName] = useState(set ? `${set.home.name} — ${season}` : `BeHoop — ${season}`);
  const [busy, setBusy] = useState(false);
  // Vidéo supprimée depuis YouTube : l'appli l'oublie (plus de lien mort, bouton « Publier sur YouTube » de retour)
  const [gone, setGone] = useState(false);
  const y0 = moment ? moment.youtube : mv.youtube;
  const y = gone ? undefined : y0;
  useEffect(() => { if (y0?.status === 'done' && y0.url) api<{ gone: boolean }>('/youtube/check', target).then((r) => setGone(r.gone)).catch(() => {}); }, [id, moment?.id, y0?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  const running = !!y && ['queued', 'preparing', 'uploading'].includes(y.status) && Date.now() - Number(y.at ?? 0) < 3 * 3600e3;
  useEffect(() => { const r = qs().get('yt'); if (r && r !== 'ok') s.toast(t('Connexion à YouTube non terminée ({r}).', { r })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!st.data?.available) return null;
  if (!st.data.connected) return (
    <><p className="hint" style={{ margin: 0 }}>{t('Publie directement sur ta chaîne YouTube : BeHoop envoie la vidéo depuis ses serveurs, en 1080p, sans rien télécharger sur ton téléphone.')}</p>
      <button className="btn" onClick={async () => { try { location.href = (await api<{ url: string }>('/youtube/start', { back: moment ? `#/video/${id}/m-${moment.id}?pub=1` : `#/video/${id}?pub=1` })).url; } catch { s.toast(t('Connexion à YouTube indisponible pour le moment.')); } }}><Ico n="video" />{t('Connecter ma chaîne YouTube')}</button></>
  );
  if (running) return (
    <div className="banner"><Ico n="video" /><div style={{ flex: 1 }}><b>{y!.status === 'preparing' ? t('Préparation du fichier 1080p…') : y!.status === 'queued' ? t('Envoi vers YouTube en attente…') : t('Envoi vers YouTube : {n} %', { n: y!.progress ?? 0 })}</b>
      <div className="muted" style={{ fontSize: 13 }}>{t('Tu peux fermer l’appli : tu recevras une notification quand la vidéo sera en ligne.')}</div>
      <div className="progress" style={{ marginTop: 6 }}><i style={{ width: `${y!.progress ?? 0}%` }} /></div></div></div>
  );
  return (<>
    {y?.status === 'done' && y.url && <div className="banner"><Ico n="checkCircle" /><div style={{ flex: 1 }}><b>{t('Publiée sur YouTube')}</b> · <a href={y.url} target="_blank" rel="noopener noreferrer">{t('Voir la vidéo')}</a></div></div>}
    {y?.status === 'error' && <div className="banner"><Ico n="alert" /><div style={{ flex: 1, fontSize: 14 }}>{y.error ?? t('Envoi impossible.')}</div></div>}
    <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t('Chaîne : {c}', { c: st.data.channelTitle ?? '' })}</p>
    <label className="label">{t('Titre')}</label><input className="field" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
    <label className="label">{t('Description')}</label><textarea className="field" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
    <label className="label">{t('Visibilité')}</label>
    <div className="seg">{(['public', 'unlisted', 'private'] as const).filter((p) => !(youth && p === 'public')).map((p) => <button key={p} className={privacy === p ? 'on' : ''} onClick={() => setPrivacy(p)}>{p === 'public' ? t('Publique') : p === 'unlisted' ? t('Non répertoriée') : t('Privée')}</button>)}</div>
    <label className="label">{t('Playlist')}</label>
    <select className="field" value={pl} onChange={(e) => setPl(e.target.value)}>
      <option value="none">{t('Aucune')}</option>
      <option value="new">{t('Nouvelle playlist…')}</option>
      {(lists.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
    </select>
    {pl === 'new' && <input className="field" value={plName} maxLength={150} onChange={(e) => setPlName(e.target.value)} aria-label={t('Nom de la playlist')} />}
    <button className="btn" disabled={busy || (youth && !parentsOk) || !title.trim()} onClick={async () => { setBusy(true);
      try { await api('/youtube/publish', { ...target, title, description: text, privacy, parentsOk, playlistId: pl !== 'none' && pl !== 'new' ? pl : undefined, newPlaylist: pl === 'new' ? plName : undefined }); s.toast(t('Envoi vers YouTube lancé.')); }
      catch { s.toast(t('Impossible de lancer l’envoi. Réessaie.')); } finally { setBusy(false); } }}><Ico n="video" />{y?.status === 'done' ? t('Publier à nouveau') : t('Publier sur YouTube')}</button>
  </>);
}

interface MatchVideo { youtube?: { status: 'queued' | 'preparing' | 'uploading' | 'done' | 'error'; progress?: number; url?: string; error?: string; at?: number }; settings?: StoredSettings; title: string; status: string; visibility: 'public' | 'team'; teamIds: number[]; authorUid: string; version: number; mp4Status?: 'queued' | 'running' | 'ready' | 'error'; mp4Status1080?: 'queued' | 'running' | 'ready' | 'error'; mp4StatusSince?: number; mp4Status1080Since?: number; affichesStatus?: 'queued' | 'running' | 'ready' | 'error';
  hls?: { masterKey: string; chapters: Chapter[]; duration: number; posterKey: string; mp4Key?: string; mp4Key1080?: string; affiches?: string[] }; voteUntil?: { toMillis: () => number } }
interface Moment { id: string; start: number; end: number; status: string; r2Key?: string; authorUid?: string; youtube?: MatchVideo['youtube']; title?: string; text?: string; posterKey?: string }

/** Le volume est-il réglable par la page ? (non sur iPhone/iPad : il suit les boutons du téléphone) */
const CAN_VOLUME = (() => { try { const v = document.createElement('video'); v.volume = 0.5; return v.volume === 0.5 && !/iPhone|iPad|iPod/.test(navigator.userAgent); } catch { return false; } })();

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
      {momentId ? <MomentPlayer id={momentId} vid={id} mv={mv} youth={mv.visibility === 'team'} /> : <Player id={id} mv={mv} team={team ?? mv.teamIds.find(Boolean)} />}
      <MomentsPending id={id} />
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
  // Son : coupé / volume (gardés d'une vidéo à l'autre). Sur iPhone le volume suit les boutons du téléphone : seul « couper » est proposé.
  const [muted, setMuted] = useState(() => store.get('player-muted', false)), [vol, setVol] = useState(() => store.get('player-vol', 1));
  useEffect(() => { const el = ref.current; if (!el) return; el.muted = muted; if (CAN_VOLUME) el.volume = vol; store.set('player-muted', muted); store.set('player-vol', vol); }, [muted, vol]);
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
  // Position montrée pendant un glissement sur la barre (la vidéo suit, en image clé pendant le geste, précise au lâcher)
  const [drag, setDrag] = useState<number | null>(null);
  const lastSeek = useRef(0);
  const scrubTo = (x: number, final = false) => {
    const v = ref.current!, tt = Math.max(0, Math.min(dur, x));
    setDrag(final ? null : tt); setIdle(false);
    const now = Date.now();
    if (final) { v.currentTime = tt; setTime(tt); return; }
    if (now - lastSeek.current < 90) return; // au plus ~11 recherches par seconde : fluide sans saturer le lecteur
    lastSeek.current = now;
    const fs = (v as HTMLVideoElement & { fastSeek?: (t: number) => void }).fastSeek;
    if (fs) fs.call(v, tt); else v.currentTime = tt;
  };
  const barTime = (e: React.PointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * dur; };
  // Mode Moment : le passage choisi [a, b] ; « preview » = lecture du passage en boucle
  const [sel, setSel] = useState<[number, number] | null>(null);
  const preview = useRef(false);
  const toggle = () => { const el = ref.current!; if (el.paused) el.play(); else el.pause(); };
  const onTap = (e: React.MouseEvent) => {
    const now = Date.now(); const r = box.current!.getBoundingClientRect();
    if (now - lastTap.current < 300) { haptic(); seek(ref.current!.currentTime + (e.clientX - r.left < r.width / 2 ? -10 : 10)); } else setIdle((i) => !i);
    lastTap.current = now;
  };
  const youth = mv.visibility === 'team';
  // Retour de Google après « Connecter ma chaîne » : on rouvre la publication
  const [yt, setYt] = useState(() => !!qs().get('pub'));
  const [fix, setFix] = useState(false);
  const [ren, setRen] = useState(false);
  // Vidéo publique : vrai lien de téléchargement (un lien de lecture ouvrirait le lecteur de l'iPhone, sans enregistrement)
  const author = !!s.user && mv.authorUid === s.user.uid;
  const pubDl = useAsync(async () => (author && !youth && mv.hls?.mp4Key ? (await api<{ url: string }>('/download', { matchVideoId: id })).url : null), [id, s.user?.uid]);
  // YouTube et téléchargement : réservés à l'auteur du montage
  const canPublish = { data: !!s.user && mv.authorUid === s.user.uid };
  return (
    <>
      <div ref={box} className={`player${idle ? ' idle' : ''}`} onClick={onTap}>
        {/* use-credentials : sur iPhone (lecture HLS par Safari), la vidéo est demandée avec l'autorisation du serveur vidéo →
            l'appli peut lire ses images (« Suivre l'action »). Le serveur répond déjà avec les en-têtes CORS + cookies. */}
        <video ref={ref} playsInline crossOrigin="use-credentials" poster={mediaUrl(mv.hls!.posterKey)} controlsList={author ? undefined : 'nodownload'} onContextMenu={(e) => !author && e.preventDefault()}
          onTimeUpdate={(e) => { const c = e.currentTarget.currentTime; setTime(c); if (Math.round(c) % 5 === 0) store.set(posKey, c > dur - 10 ? 0 : c);
            if (preview.current && sel && c >= sel[1]) e.currentTarget.currentTime = sel[0]; }}
          onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); setIdle(false); }} />
        <div className="ctrl" onClick={(e) => e.stopPropagation()}>
          <div className={`bar${drag != null ? ' active' : ''}`} role="slider" aria-label={t('Position')} aria-valuemin={0} aria-valuemax={dur} aria-valuenow={Math.round(time)} tabIndex={0}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); haptic(); scrubTo(barTime(e)); }}
            onPointerMove={(e) => { if (drag != null) scrubTo(barTime(e)); }}
            onPointerUp={(e) => { if (drag != null) scrubTo(barTime(e), true); }} onPointerCancel={() => drag != null && scrubTo(drag, true)}
            onKeyDown={(e) => { if (e.key === 'ArrowLeft') seek(time - 5); if (e.key === 'ArrowRight') seek(time + 5); }}>
            <div className="track" /><div className="fillp" style={{ width: `${((drag ?? time) / dur) * 100}%` }} />
            {chapters.slice(1).map((c) => <div key={c.title} className="mark" style={{ left: `${(c.start / dur) * 100}%` }} title={c.title} />)}
            {sel && <div className="selp" style={{ left: `${(sel[0] / dur) * 100}%`, width: `${((sel[1] - sel[0]) / dur) * 100}%` }} />}
            <div className="knob" style={{ left: `${((drag ?? time) / dur) * 100}%` }} />
            {drag != null && <div className="bubble" style={{ left: `clamp(24px, ${(drag / dur) * 100}%, calc(100% - 24px))` }}>{fmt(drag)}</div>}
          </div>
          <div className="btns">
            <button onClick={toggle} aria-label={playing ? 'Pause' : 'Lecture'} ><Ico n={playing ? 'pause' : 'play'} size={22} /></button>
            <button onClick={() => seek(time - 10)} aria-label={t('Reculer de 10 s')}>↺10</button><button onClick={() => seek(time + 10)} aria-label={t('Avancer de 10 s')}>10↻</button>
            <button onClick={() => setMuted((m) => !m)} aria-label={muted ? t('Activer le son') : t('Couper le son')} aria-pressed={muted}><Ico n={muted || vol === 0 ? 'mute' : 'volume'} size={22} /></button>
            {CAN_VOLUME && <input className="vol" type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol} aria-label={t('Volume')}
              onChange={(e) => { const v = Number(e.target.value); setVol(v); setMuted(v === 0); }} />}
            <span style={{ flex: 1, opacity: .85 }}>{fmt(time)} / {fmt(dur)}</span>
            <button onClick={() => { const n = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1; ref.current!.playbackRate = n; setRate(n); }} aria-label={t('Vitesse')}>{rate}×</button>
            {levels.length > 1 && <button onClick={() => { const n = level === -1 ? 0 : level === levels.length - 1 ? -1 : level + 1; hlsRef.current.currentLevel = n; setLevel(n); }} aria-label={t('Qualité')}>{level === -1 ? 'Auto' : `${levels[level].h}p`}</button>}
            <button aria-label={t('Plein écran')} onClick={() => { const el = ref.current as any; if (el.webkitEnterFullscreen) el.webkitEnterFullscreen(); else box.current!.requestFullscreen?.(); }}><Ico n="expand" size={22} /></button>
          </div>
        </div>
      </div>
      {clip && <ClipEditor id={id} video={ref} dur={dur} time={time} sel={sel} setSel={setSel} preview={preview} onClose={() => { preview.current = false; setSel(null); setClip(false); }} />}
      {!clip && <>
      <div className="group-title mt">{t('Chapitres')}</div>
      <div className="group">{chapters.map((c) => (
        <button key={c.title} className="row" onClick={() => { seek(c.start); ref.current!.play(); }}>
          <div className="grow" style={{ fontWeight: time >= c.start && time < c.end ? 700 : 400 }}>{t(c.title)}</div><span className="muted">{fmt(c.start)}</span></button>))}</div>
      <div className="hstack">
        <button className="btn secondary" onClick={() => { const go = () => { ref.current?.pause(); setClip(true);
          // La vidéo juste sous l'en-tête : vidéo et réglages du Moment tiennent ensemble à l'écran
          const top = box.current!.getBoundingClientRect().top + scrollY - (document.querySelector('.navbar')?.getBoundingClientRect().height ?? 0) - 8;
          scrollTo({ top: Math.max(0, top), behavior: 'smooth' }); }; if (s.requireAuth(go)) go(); }}><><Ico n="bolt" />{t('Créer un Moment')}</></button>
        <button className="btn secondary" onClick={() => shareLink(mv.title, shareUrl(id, youth ? team : undefined), s.toast)}><Ico n="external" />{t('Partager le lien')}</button>
        {!youth && pubDl.data && <a className="btn ghost" href={inSafari(pubDl.data)} target="_blank" rel="noopener noreferrer">{t('Télécharger la vidéo')}</a>}
      </div>
      {mv.settings && (mv.authorUid === s.user?.uid || s.isAdmin) && <button className="btn ghost mt" onClick={() => setFix(true)}><Ico n="scoreboard" />{t('Corriger le score')}</button>}
      {(mv.authorUid === s.user?.uid || s.isAdmin) && <div className="hstack mt" style={{ gap: 8 }}>
        <button className="btn ghost small" onClick={() => setRen(true)}>{t('Renommer')}</button>
        <button className="btn ghost small" style={{ color: 'var(--red)' }} onClick={async () => { if (!confirm(t('Supprimer la vidéo du match ? Ses Moments et ses fichiers seront supprimés définitivement.'))) return;
          try { await api(`/montage/${id}`, undefined, 'DELETE'); s.toast(t('Vidéo supprimée')); location.hash = '/fil'; } catch { s.toast(t('Action impossible. Réessaie.')); } }}>{t('Supprimer la vidéo')}</button></div>}
      {ren && <EditSheet title={t('Renommer')} fields={[{ key: 'title', label: t('Titre'), value: mv.title, max: 100, required: true }]} onClose={() => setRen(false)}
        onSave={async (x) => { try { await api('/video/rename', { matchVideoId: id, title: x.title }); s.toast(t('Modifié')); location.reload(); } catch { s.toast(t('Action impossible. Réessaie.')); } }} />}
      {fix && <ScoreSheet id={id} mv={mv} onClose={() => setFix(false)} />}
      {author && <AffichesBlock id={id} mv={mv} />}
      {canPublish.data && <button className="btn ghost mt" onClick={() => setYt(true)}><Ico n="video" />{t('Publier sur YouTube')}</button>}
      {yt && <YoutubeSheet id={id} mv={mv} team={team} onClose={() => setYt(false)} />}
      </>}
    </>
  );
}

const fmtP = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const WIN = 90; // largeur de la frise zoomée (s)

/** Création d'un Moment, sous la vidéo (qui reste visible) : frise zoomée de 90 s autour du passage, poignées début / fin
 *  et passage entier à faire glisser (la vidéo montre l'image exacte pendant le geste), réglages fins ±1 s, aperçu en
 *  boucle. Passage de 5 à 30 s, monté ensuite au format vertical avec le score. */
const CLIP_MIN = 5, CLIP_MAX = 30, MOMENT_TOTAL = 60, MOMENT_PARTS = 6;
type Key = { t: number; pos: number };
/** Position du cadre à l'instant t du passage (même calcul que le montage : glissement doux entre deux points) */
function keyPos(k: Key[], t: number): number {
  if (t <= k[0].t) return k[0].pos;
  for (let i = 0; i < k.length - 1; i++) if (t < k[i + 1].t) { const s = (t - k[i].t) / Math.max(0.05, k[i + 1].t - k[i].t); return k[i].pos + (k[i + 1].pos - k[i].pos) * s * s * (3 - 2 * s); }
  return k[k.length - 1].pos;
}
/** Largeur du cadre vertical (9:16 recadré dans une image 16:9) : 1080 / (1920 × 16/9) */
const CROP_W = (1080 / ((1920 * 16) / 9)) * 100;
function ClipEditor({ id, video, dur, time, sel, setSel, preview, onClose }: { id: string; video: React.RefObject<HTMLVideoElement>; dur: number; time: number;
  sel: [number, number] | null; setSel: (x: [number, number]) => void; preview: React.MutableRefObject<boolean>; onClose: () => void }) {
  const s = useSession();
  const around = (c: number): [number, number] => { const a = Math.max(0, Math.min(dur - 20, c - 10)); return [a, Math.min(dur, a + 20)]; };
  const [a, b] = sel ?? around(time);
  useEffect(() => { if (!sel) setSel(around(time)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Fenêtre de la frise : fixe pendant un geste, recentrée quand le passage en sort
  const [win, setWin] = useState(() => Math.max(0, Math.min(dur - WIN, (a + b) / 2 - WIN / 2)));
  useEffect(() => { if (a < win || b > win + WIN) setWin(Math.max(0, Math.min(dur - WIN, (a + b) / 2 - WIN / 2))); }, [a, b]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false), [playing, setPlaying] = useState(false);
  // Plusieurs passages enchaînés (vague au montage), 60 s au total ; cadrage plein écran (position) ou image entière
  const [parts, setParts] = useState<{ a: number; b: number; keys: Key[] }[]>([]);
  const [keys, setKeys] = useState<Key[]>([]); // points de cadrage du passage en cours (t depuis son début)
  const [layout, setLayout] = useState<'full' | 'fit'>('full'), [pos, setPos] = useState(0.5);
  const [mTitle, setMTitle] = useState(''), [mText, setMText] = useState('');
  const g = useRef<{ kind: 'a' | 'b' | 'm'; x0: number; a0: number; b0: number; w: number; lastX?: number } | null>(null);
  const last = useRef(0);
  const show = (tt: number, final = false) => {
    const v = video.current; if (!v) return;
    const now = Date.now(); if (!final && now - last.current < 80) return; last.current = now;
    const fs = (v as HTMLVideoElement & { fastSeek?: (t: number) => void }).fastSeek;
    if (fs && !final) fs.call(v, tt); else v.currentTime = tt;
  };
  const stop = () => { preview.current = false; setPlaying(false); video.current?.pause(); };
  const put = (na: number, nb: number, kind: 'a' | 'b' | 'm', final = false) => {
    const r = (x: number) => Math.round(x * 10) / 10;
    na = r(Math.max(0, na)); nb = r(Math.min(dur, nb));
    setSel([na, nb]); show(kind === 'b' ? nb : na, final);
  };
  const down = (kind: 'a' | 'b' | 'm') => (e: React.PointerEvent) => {
    e.stopPropagation(); stop(); haptic();
    const track = (e.currentTarget as HTMLElement).closest('.clip-track') as HTMLElement;
    track.setPointerCapture(e.pointerId);
    g.current = { kind, x0: e.clientX, a0: a, b0: b, w: track.getBoundingClientRect().width };
  };
  const move = (e: React.PointerEvent, final = false) => {
    const d = g.current; if (!d) return;
    // Tactile : zone morte de 6 px (un toucher ne déplace rien) et, au relâchement, la dernière position voulue
    // (le doigt glisse en se levant : on ignore ce dernier mouvement)
    if (!final) { if (d.lastX == null && Math.abs(e.clientX - d.x0) < 6) return; d.lastX = e.clientX; }
    else if (d.lastX == null) { g.current = null; return; }
    const dt = (((final ? d.lastX! : e.clientX) - d.x0) / d.w) * WIN;
    if (d.kind === 'm') { const len = d.b0 - d.a0; const na = Math.max(0, Math.min(dur - len, d.a0 + dt)); put(na, na + len, 'm', final); }
    else if (d.kind === 'a') put(Math.min(Math.max(d.a0 + dt, d.b0 - CLIP_MAX), d.b0 - CLIP_MIN), d.b0, 'a', final);
    else put(d.a0, Math.max(Math.min(d.b0 + dt, d.a0 + CLIP_MAX), d.a0 + CLIP_MIN), 'b', final);
    if (final) g.current = null;
  };
  const pct = (x: number) => `${((x - win) / WIN) * 100}%`;
  const len = Math.round((b - a) * 10) / 10;
  const total = Math.round((parts.reduce((x, p) => x + p.b - p.a, 0) + len) * 10) / 10;
  const curKeys = (): Key[] => (keys.length ? keys : [{ t: 0, pos }]);
  // Cadre affiché : suit les points de cadrage pendant la lecture (même glissement doux qu'au montage)
  const shown = keys.length && time >= a && time <= b ? keyPos(keys, time - a) : pos;
  const ok = len >= CLIP_MIN && len <= CLIP_MAX && total <= MOMENT_TOTAL;
  const canAdd = ok && parts.length < MOMENT_PARTS - 1 && total + CLIP_MIN <= MOMENT_TOTAL;
  // « Suivre l'action » : analyse du passage (≈ 4 images/s, en petit) → zone la plus animée de la largeur du cadre → points de cadrage
  const [scan, setScan] = useState<number | null>(null);
  const follow = async () => {
    const v = video.current; if (!v || scan != null) return;
    stop(); haptic(); setScan(0);
    const W = 160, H = 90, cw = Math.round((W * CROP_W) / 100), step = 0.25;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true })!;
    const seekTo = (tt: number) => new Promise<void>((res) => { let done = false; const on = () => { if (done) return; done = true; v.removeEventListener('seeked', on); res(); }; v.addEventListener('seeked', on); v.currentTime = tt; setTimeout(on, 2000); });
    try {
      let prev: Uint8ClampedArray | null = null; const raw: { t: number; c: number | null }[] = [];
      for (let tt = a; tt <= b + 0.01; tt += step) {
        await seekTo(Math.min(tt, b)); g.drawImage(v, 0, 0, W, H);
        const d = g.getImageData(0, 0, W, H).data;
        if (prev) {
          const col = new Float32Array(W); let tot = 0;
          for (let y = Math.floor(H * 0.18); y < H; y++) for (let x = 0; x < W; x++) {
            if (y < H * 0.32 && x > W * 0.72) continue; // logo BeHoop incrusté (coin haut droit)
            const i = (y * W + x) * 4, dv = Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]);
            if (dv > 60) { col[x]++; tot++; }
          }
          let best = -1, bx = 0, sum = 0;
          for (let x = 0; x < W; x++) { sum += col[x]; if (x >= cw) sum -= col[x - cw]; if (x >= cw - 1 && sum > best) { best = sum; bx = x - cw + 1; } }
          // caméra qui bouge (tout l'écran change) ou presque rien ne bouge : on garde la position précédente
          raw.push({ t: Math.min(tt, b) - a, c: tot > W * H * 0.45 || best < 12 ? null : bx / (W - cw) });
        }
        prev = d; setScan(Math.round(((tt - a) / Math.max(0.1, b - a)) * 100));
      }
      let last = raw.find((r) => r.c != null)?.c ?? 0.5;
      const filled = raw.map((r) => (last = r.c ?? last));
      const sm = filled.map((_, i) => { const w = filled.slice(Math.max(0, i - 5), i + 6); return w.reduce((x, y) => x + y, 0) / w.length; });
      // Simplification (Ramer–Douglas–Peucker) : seuls les points qui changent vraiment la trajectoire du cadre
      const pts = raw.map((r, i) => ({ t: Math.round(r.t * 10) / 10, pos: Math.round(sm[i] * 100) / 100 }));
      const keep = new Set([0, pts.length - 1]);
      const rdp = (i0: number, i1: number) => { let m = -1, mi = -1; for (let i = i0 + 1; i < i1; i++) { const f = (pts[i].t - pts[i0].t) / Math.max(0.01, pts[i1].t - pts[i0].t), d = Math.abs(pts[i].pos - (pts[i0].pos + f * (pts[i1].pos - pts[i0].pos))); if (d > m) { m = d; mi = i; } } if (m > 0.1) { keep.add(mi); rdp(i0, mi); rdp(mi, i1); } };
      if (pts.length > 2) rdp(0, pts.length - 1);
      const k: Key[] = pts.filter((_, i) => keep.has(i)).filter((p, i, arr) => i === 0 || i === arr.length - 1 || p.t - arr[i - 1].t >= 1.5);
      if (k.length) { setKeys(k); setPos(k[0].pos); s.toast(t('Cadrage calculé : vérifie avec l’aperçu, corrige si besoin.')); }
    } catch { s.toast(t('Analyse impossible sur cet appareil : place les points à la main.')); }
    finally { setScan(null); v.currentTime = a; }
  };
  const add = () => { stop(); haptic(); setParts((p) => [...p, { a, b, keys: curKeys() }]); setKeys([]); const na = Math.min(dur - 10, b + 2); put(na, Math.min(dur, na + 10), 'm', true); };
  const ticks = Array.from({ length: 10 }, (_, i) => Math.ceil(win / 10) * 10 + i * 10).filter((x) => x <= win + WIN);
  const [stepS, setStepS] = useState(1);
  const nudge = (which: 'a' | 'b', d0: number) => { const d = d0 * stepS; stop(); haptic();
    if (which === 'a') put(Math.min(Math.max(a + d, b - CLIP_MAX), b - CLIP_MIN), b, 'a', true); else put(a, Math.max(Math.min(b + d, a + CLIP_MAX), a + CLIP_MIN), 'b', true); };
  // Édition au doigt (mobile) : vidéo fixe en haut, onglets courts, barre d'actions fixe en bas, cadre à glisser sur la vidéo
  const [tab, setTab] = useState<'pass' | 'crop' | 'info'>('pass');
  const [selKey, setSelKey] = useState<number | null>(null);
  useEffect(() => { document.documentElement.classList.add('moment-edit'); return () => document.documentElement.classList.remove('moment-edit', 'crop-edit'); }, []);
  const cropping = tab === 'crop' && layout === 'full';
  useEffect(() => { document.documentElement.classList.toggle('crop-edit', cropping); }, [cropping]);
  const nowT = () => Math.round(Math.min(b - a, Math.max(0, (video.current?.currentTime ?? time) - a)) * 10) / 10;
  const upsert = (p: number) => { const tt = nowT(); setKeys((k) => { const near = k.find((x) => Math.abs(x.t - tt) < 0.4); return [...k.filter((x) => x !== near), { t: near?.t ?? tt, pos: p }].sort((x, y) => x.t - y.t); }); setSelKey(null); };
  const drag = useRef<{ w: number; l: number; fw: number; x0: number; moved?: boolean } | null>(null);
  const frameAt = (x: number, d: { w: number; l: number; fw: number }) => { const p = Math.round(Math.min(1, Math.max(0, (x - d.l - d.fw / 2) / (d.w - d.fw))) * 100) / 100; setPos(p); upsert(p); };
  const frameDown = (e: React.PointerEvent) => { e.stopPropagation(); e.preventDefault(); stop(); haptic(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const d = { w: r.width, l: r.left, fw: (r.width * CROP_W) / 100, x0: e.clientX }; drag.current = d; frameAt(e.clientX, d); };
  const frameMove = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; e.stopPropagation(); if (!d.moved && Math.abs(e.clientX - d.x0) < 4) return; d.moved = true; frameAt(e.clientX, d); };
  const frameUp = (e: React.PointerEvent) => { e.stopPropagation(); drag.current = null; };
  const seekIn = (tt: number) => { stop(); const v = video.current; if (v) v.currentTime = a + tt; };
  const scrub = useRef(false);
  const lineAt = (e: React.PointerEvent, final = false) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const tt = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (b - a); show(a + tt, final); };
  const lineTap = (e: React.PointerEvent) => { stop(); scrub.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); lineAt(e, true); setSelKey(null); };
  const create = async () => { stop(); setBusy(true);
    try { const r = await api<{ id: string }>('/moments', { matchVideoId: id, clips: [...parts, { a, b, keys: curKeys() }].map((p) => ({ start: p.a, end: p.b, keys: layout === 'full' ? p.keys : undefined })), layout, pos, title: mTitle, text: mText });
      s.toast(t('Moment en préparation…')); if (r?.id) { store.set(`mpend-${id}`, [...store.get<string[]>(`mpend-${id}`, []), r.id]); dispatchEvent(new Event('bh-moment')); } onClose(); }
    catch { s.toast(t('Impossible de créer le Moment')); } finally { setBusy(false); } };
  return (
    <div className="clip-ed">
      {video.current?.parentElement && layout === 'full' && createPortal(<div className="crop-mask" aria-hidden><i style={{ width: `${shown * (100 - CROP_W)}%` }} />
        <b style={{ width: `${CROP_W}%` }} /><i style={{ flex: 1 }} /></div>, video.current.parentElement)}
      {video.current?.parentElement && cropping && createPortal(<div className="crop-touch" onPointerDown={frameDown} onPointerMove={frameMove} onPointerUp={frameUp} onPointerCancel={frameUp} onClick={(e) => e.stopPropagation()} />, video.current.parentElement)}
      <div className="clip-head"><b><Ico n="bolt" /> {parts.length ? t('Passage {n}', { n: parts.length + 1 }) : t('Nouveau Moment')} · <span style={{ color: ok ? 'var(--accent)' : 'var(--red)' }}>{len.toFixed(1)} s</span>
        {parts.length > 0 && <span className="muted" style={{ fontWeight: 400 }}> · {total.toFixed(0)}/{MOMENT_TOTAL} s</span>}</b>
        <button className="btn ghost small" onClick={() => { stop(); onClose(); }}>{t('Annuler')}</button></div>
      <div className="seg clip-tabs"><button className={tab === 'pass' ? 'on' : ''} onClick={() => setTab('pass')}>{t('Passage')}</button><button className={tab === 'crop' ? 'on' : ''} onClick={() => setTab('crop')}>{t('Cadrage')}</button><button className={tab === 'info' ? 'on' : ''} onClick={() => setTab('info')}>{t('Infos')}</button></div>
      {tab === 'pass' && <>
        <div className="clip-track" onPointerMove={(e) => move(e)} onPointerUp={(e) => move(e, true)} onPointerCancel={(e) => move(e, true)}>
          {ticks.map((x) => <div key={x} className="clip-tick" style={{ left: pct(x) }}><span>{fmt(x)}</span></div>)}
          <div className="clip-sel" style={{ left: pct(a), width: `${((b - a) / WIN) * 100}%` }} onPointerDown={down('m')}>
            <div className="clip-h l" onPointerDown={down('a')} aria-label={t('Début')} />
            <div className="clip-h r" onPointerDown={down('b')} aria-label={t('Fin')} />
          </div>
          {time >= win && time <= win + WIN && <div className="clip-now" style={{ left: pct(time) }} />}
        </div>
        <div className="clip-fine">
          <div><span className="muted">{t('Début')}</span><div className="hstack"><button className="btn ghost small" onClick={() => nudge('a', -1)} aria-label={t('Début − 1 s')}>−{stepS === 1 ? '1' : '0,1'}</button><b>{fmtP(a)}</b><button className="btn ghost small" onClick={() => nudge('a', 1)} aria-label={t('Début + 1 s')}>+{stepS === 1 ? '1' : '0,1'}</button></div></div>
          <div><span className="muted">{t('Fin')}</span><div className="hstack"><button className="btn ghost small" onClick={() => nudge('b', -1)} aria-label={t('Fin − 1 s')}>−{stepS === 1 ? '1' : '0,1'}</button><b>{fmtP(b)}</b><button className="btn ghost small" onClick={() => nudge('b', 1)} aria-label={t('Fin + 1 s')}>+{stepS === 1 ? '1' : '0,1'}</button></div></div>
        </div>
        <div className="hstack" style={{ justifyContent: 'center', gap: 6, marginTop: 6, fontSize: 13 }}><span className="muted">{t('Pas des boutons')}</span>
          <div className="seg" style={{ width: 150 }}><button className={stepS === 1 ? 'on' : ''} onClick={() => setStepS(1)}>1 s</button><button className={stepS !== 1 ? 'on' : ''} onClick={() => setStepS(0.1)}>0,1 s</button></div></div>
        <div className="hstack" style={{ gap: 8, marginTop: 8 }}>
          <button className="btn ghost small" style={{ flex: 1 }} onClick={() => { stop(); const c = video.current?.currentTime ?? time; const [na, nb] = around(c); put(na, nb, 'm', true); }}>{t('Partir d\'ici')}</button>
          <button className="btn ghost small" style={{ flex: 1 }} disabled={!canAdd} onClick={add}><Ico n="plus" />{t('Ajouter un passage')}</button>
        </div>
        {parts.length > 0 && <div className="clip-parts">{parts.map(({ a: p0, b: p1, keys: pk }, i) => (
          <div key={i} className="clip-part"><span>{t('Passage {n}', { n: i + 1 })} · {fmtP(p0)} → {fmtP(p1)} · {(p1 - p0).toFixed(1)} s{pk.length > 1 ? ` · ${pk.length} ${t('points de cadrage')}` : ''}</span>
            <button className="btn ghost small" aria-label={t('Retirer')} onClick={() => setParts((p) => p.filter((_, k) => k !== i))}>✕</button></div>))}</div>}
      </>}
      {tab === 'crop' && <>
        <div className="seg"><button className={layout === 'full' ? 'on' : ''} onClick={() => setLayout('full')}>{t('Portrait')}</button><button className={layout !== 'full' ? 'on' : ''} onClick={() => setLayout('fit')}>{t('Paysage')}</button></div>
        {layout === 'full' && <>
          <p className="hint" style={{ margin: '8px 0 0' }}>{t('Glisse le doigt sur la frise pour choisir l’instant, puis touche la vidéo là où est l’action : un point est posé. Le cadre glisse de point en point.')}</p>
          <div className="key-line" onPointerDown={lineTap} onPointerMove={(e) => scrub.current && lineAt(e)} onPointerUp={() => { scrub.current = false; }} onPointerCancel={() => { scrub.current = false; }}>
            <div className="ph" style={{ left: `${Math.min(100, Math.max(0, ((time - a) / Math.max(0.1, b - a)) * 100))}%` }} />
            {keys.map((k) => <button key={k.t} className={`kd${selKey === k.t ? ' on' : ''}`} style={{ left: `${(k.t / Math.max(0.1, b - a)) * 100}%` }} aria-label={t('Point de cadrage')}
              onPointerDown={(e) => { e.stopPropagation(); haptic(); seekIn(k.t); setSelKey(k.t); setPos(k.pos); }} />)}
          </div>
          <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn ghost small" onClick={() => { haptic(); upsert(shown); }}><Ico n="plus" />{t('Point ici')}</button>
            <button className="btn small" disabled={scan != null} onClick={follow}><Ico n="bolt" />{scan != null ? t('Analyse… {n} %', { n: scan }) : t('Suivre l’action')}</button>
            {selKey != null && <button className="btn ghost small" style={{ color: 'var(--red)' }} onClick={() => { setKeys((k) => k.filter((x) => x.t !== selKey)); setSelKey(null); }}>{t('Supprimer ce point')}</button>}
            {keys.length > 0 && selKey == null && <button className="btn ghost small" onClick={() => setKeys([])}>{t('Effacer les points')}</button>}
          </div>
        </>}
      </>}
      {tab === 'info' && <>
        <input className="field" value={mTitle} maxLength={80} onChange={(e) => setMTitle(e.target.value)} placeholder={t('Titre (facultatif) — ex. : le panier de la victoire')} aria-label={t('Titre')} />
        <textarea className="field mt" rows={3} value={mText} maxLength={500} onChange={(e) => setMText(e.target.value)} placeholder={t('Description (facultatif)')} aria-label={t('Description')} />
      </>}
      <div className="clip-bar">
        <button className="btn secondary" onClick={() => { haptic(); if (playing) { stop(); return; } const v = video.current!; v.currentTime = a; preview.current = true; setPlaying(true); v.play().catch(() => setPlaying(false)); }}>
          <Ico n={playing ? 'pause' : 'play'} />{playing ? t('Pause') : t('Aperçu')}</button>
        <button className="btn" disabled={!ok || busy} onClick={create}>{t('Créer')}{parts.length ? ` (${parts.length + 1})` : ''}</button>
      </div>
    </div>
  );
}

function MomentPlayer({ id, vid, mv, youth }: { id: string; vid: string; mv: MatchVideo; youth: boolean }) {
  const s = useSession();
  const m = useAsync(async () => { const x = await D.getDoc(D.doc(D.db, 'moments', id)); return x.exists() ? ({ id, ...x.data() } as Moment) : null; }, [id]);
  // Suivi en direct de la publication YouTube (Short)
  const [live, setLive] = useState<Moment | null>(null);
  useEffect(() => D.watchDoc<Omit<Moment, 'id'>>(`moments/${id}`, (x) => x && setLive({ id, ...x } as Moment)), [id]);
  const [yt, setYt] = useState(qs().get('pub') === '1');
  const [ed, setEd] = useState(false);
  if (!m.data) return <Skeleton h={400} n={1} />;
  const mo = live ?? m.data;
  const canPublish = mo.authorUid === s.user?.uid || mv.authorUid === s.user?.uid || s.isAdmin;
  if (m.data.status !== 'ready' || !m.data.r2Key) return <Empty ill="bolt" title={t('Moment en préparation')} />;
  const url = mediaUrl(m.data.r2Key);
  return (
    <div className="center">
      <video src={url} controls playsInline style={{ maxHeight: '70dvh', borderRadius: 16, background: '#000', maxWidth: '100%' }} controlsList={m.data.authorUid === s.user?.uid ? undefined : 'nodownload'} />
      <div className="hstack mt" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="btn secondary" onClick={() => shareLink(mo.title || mv.title, momentShareUrl(id), s.toast)}><Ico n="external" />{t('Partager le lien')}</button>
      </div>
      {canPublish && mo.r2Key && <div className="mt" style={{ maxWidth: 360, margin: '12px auto 0' }}><SaveToPhotos url={url} name={`${(mo.title || mv.title).replace(/[^\w\- ]+/g, '').trim().slice(0, 50) || 'moment'}.mp4`} /></div>}
      {youth && <p className="muted" style={{ fontSize: 14 }}><Ico n="lock" style={{ marginRight: 4 }} />{t('Moment d\'une équipe Jeunes : seuls les membres de l\'Équipe peuvent l\'ouvrir.')}</p>}
      {canPublish && <button className="btn secondary mt" onClick={() => setYt(true)}><Ico n="video" />{mo.youtube?.status === 'done' ? t('Publié sur YouTube (Short)') : t('Publier sur YouTube (Short)')}</button>}
      {canPublish && <div className="hstack mt" style={{ gap: 8, justifyContent: 'center' }}>
        <button className="btn ghost small" onClick={() => setEd(true)}>{t('Modifier')}</button>
        <button className="btn ghost small" style={{ color: 'var(--red)' }} onClick={async () => { if (!confirm(t('Supprimer ce Moment ?'))) return;
          try { await api('/moment/delete', { momentId: id }); s.toast(t('Moment supprimé')); location.hash = `/video/${vid}`; } catch { s.toast(t('Action impossible. Réessaie.')); } }}>{t('Supprimer')}</button></div>}
      {ed && <EditSheet title={t('Modifier le Moment')} onClose={() => setEd(false)}
        fields={[{ key: 'title', label: t('Titre'), value: mo.title ?? '', max: 80 }, { key: 'text', label: t('Description'), value: mo.text ?? '', max: 500, multiline: true }]}
        onSave={async (x) => { try { await api('/moment/update', { momentId: id, ...x }); s.toast(t('Modifié')); } catch { s.toast(t('Action impossible. Réessaie.')); } }} />}
      {yt && canPublish && <MomentYtSheet vid={vid} mv={mv} moment={mo} youth={youth} onClose={() => setYt(false)} />}
    </div>
  );
}

/** Moments en préparation (créés depuis cet appareil) : avancement en direct, comme pour les vidéos de match */
function MomentsPending({ id }: { id: string }) {
  const [ids, setIds] = useState<string[]>(() => store.get<string[]>(`mpend-${id}`, []));
  useEffect(() => { const f = () => setIds(store.get<string[]>(`mpend-${id}`, [])); addEventListener('bh-moment', f); return () => removeEventListener('bh-moment', f); }, [id]);
  const done = (mid: string) => { const n = store.get<string[]>(`mpend-${id}`, []).filter((x) => x !== mid); store.set(`mpend-${id}`, n); setIds(n); };
  return <>{ids.map((mid) => <MomentProgress key={mid} vid={id} mid={mid} onGone={() => done(mid)} />)}</>;
}
function MomentProgress({ vid, mid, onGone }: { vid: string; mid: string; onGone: () => void }) {
  const [m, setM] = useState<{ status: string; progress?: number; step?: string } | null>(null);
  useEffect(() => D.watchDoc<{ status: string; progress?: number; step?: string }>(`moments/${mid}`, (x) => { if (!x) onGone(); else setM(x); }), [mid]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return null;
  if (m.status === 'ready') return <div className="banner mt"><Ico n="checkCircle" /><div style={{ flex: 1 }}><b>{t('Moment prêt')}</b> · <a href={`#/video/${vid}/m-${mid}`} onClick={onGone}>{t('Voir')}</a></div><button className="btn ghost small" onClick={onGone} aria-label={t('Fermer')}>✕</button></div>;
  if (m.status === 'error') return <div className="banner mt"><Ico n="alert" /><div style={{ flex: 1 }}>{t('Le montage du Moment a échoué.')}</div><button className="btn ghost small" onClick={onGone} aria-label={t('Fermer')}>✕</button></div>;
  const pc = m.progress ?? (m.status === 'queued' ? 0 : 5);
  return <div className="banner mt"><Ico n="bolt" /><div style={{ flex: 1 }}><b>{t('Moment en préparation : {n} %', { n: pc })}</b>
    <div className="muted" style={{ fontSize: 13 }}>{m.status === 'queued' ? t('En attente du serveur…') : t(m.step ?? 'Préparation')} · {t('tu peux fermer l’appli')}</div>
    <div className="progress" style={{ marginTop: 6 }}><i style={{ width: `${pc}%` }} /></div></div></div>;
}

/** Publication d'un Moment sur YouTube : vertical et court, il devient un Short */
function MomentYtSheet({ vid, mv, moment, youth, onClose }: { vid: string; mv: MatchVideo; moment: Moment; youth: boolean; onClose: () => void }) {
  const [ok, setOk] = useState(!youth);
  const desc = `${mv.title}\n${t('Moment réalisé avec BeHoop')} : ${location.origin}/app/#/video/${vid}/m-${moment.id}\n#Shorts`;
  return (
    <Sheet title={t('Publier sur YouTube (Short)')} onClose={onClose}>
      <div className="form">
        <p className="hint" style={{ margin: 0 }}>{t('Le Moment est vertical et court : YouTube le publie en Short.')}</p>
        {youth && <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />{t('J’ai l’accord des parents des joueurs filmés pour publier cette vidéo sur YouTube.')}</label>}
        <YtPublish id={vid} mv={mv} youth={youth} parentsOk={ok} desc={desc} moment={moment} />
      </div>
    </Sheet>
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
