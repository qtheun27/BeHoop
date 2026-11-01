// Montage de match : choisir le match → ajouter les médias → Vérifier (aperçu en direct des planches) → envoyer → suivre le rendu.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { api, mediaUrl } from '../lib/api';
import { loadClub, loadIndex, teamIndex, isPlayed, normalize, type Game, type Club } from '../lib/data';
import { Screen, Empty, Skeleton, ErrorBox, Sheet, Disc, useAsync } from '../ui/kit';
import { prepare, compressImage, thumbData, ACCEPT, isVideo, type Prepared } from '../lib/media';
import { uploadFile, uploadSmall, keepAwake, fileId, clearScope, lastMove, savedState, stateForSize, finishSaved, dropStates, PART } from '../lib/upload';
import { PlanchePreview } from '../planche/Preview';
import { assignQuarters, mosaicPhotos } from '../../../shared/quarters';
import { validateScores } from '../../../shared/scores';
import type { MatchSettings, MediaItem, PlancheType } from '../../../shared/types';
import { qs } from '../lib/router';
import { store, haptic, dotted, uid as rid } from '../lib/util';
import { t } from '../lib/i18n';
import { Ico } from '../ui/icons';

type Item = MediaItem;
interface Draft { id: string; gameId: number; teamId: number; youth: boolean; settings: MatchSettings; media: Item[]; remember: boolean; step: number }
const draftKey = (id: string) => `behoop.montage.${id}`;
const saveDraft = (d: Draft) => store.set(draftKey(d.id), { ...d, media: d.media.map((m) => ({ ...m, thumb: m.thumb?.startsWith('data:') ? m.thumb : undefined })) });
/** Fichiers choisis pendant la session (non persistables : l'utilisateur les resélectionne après fermeture). */
const FILES = new Map<string, File>();

/* Envoi en arrière-plan : il démarre dès la sélection des médias, pendant que l'utilisateur vérifie le score et les équipes.
   À l'étape « Envoi », il ne reste souvent plus rien à envoyer. Reprise après coupure : voir lib/upload (IndexedDB). */
const UP = new Map<string, Promise<string>>();
/* Reconnaître un fichier resélectionné : sur iPhone, l'app Photos donne un nouveau nom et une nouvelle date à chaque
   sélection ; seule la taille exacte (en octets) reste la même. L'id d'origine (r2Key avant envoi) contient cette taille. */
const sizeOf = (m: Item) => Number(/:(\d+):\d+$/.exec(m.r2Key)?.[1] ?? NaN);
const sameFile = (m: Item, f: File) => m.r2Key.endsWith(`:${f.size}:${f.lastModified}`) || (sizeOf(m) === f.size && m.kind === (isVideo(f) ? 'video' : 'photo'));
/** Photos déjà envoyées (clé R2), gardées entre deux ouvertures de l'appli */
const doneKey = (draftId: string) => `behoop.montage.done.${draftId}`;
const DONE = (draftId: string) => store.get<Record<string, string>>(doneKey(draftId), {});
/** Doublons (même fichier ajouté deux fois avant cette correction) : on garde le premier, qui porte l'envoi déjà fait */
function dedupe(media: Item[]): Item[] {
  const seen = new Map<string, Item>();
  return media.filter((m) => { const k = `${m.kind}:${sizeOf(m)}`; const first = seen.get(k); if (!first || Number.isNaN(sizeOf(m))) { seen.set(k, m); return true; } if (!FILES.get(first.id) && FILES.get(m.id)) FILES.set(first.id, FILES.get(m.id)!); return false; });
}
const PROG = new Map<string, number>();
const INIT = new Map<string, Promise<unknown>>();
const listeners = new Set<() => void>();
const ping = () => listeners.forEach((f) => f());
let active = 0;
const waiting: (() => void)[] = [];
const slot = async () => { if (active >= 2) await new Promise<void>((r) => waiting.push(r)); active++; };
const free = () => { active--; const next = waiting.shift(); if (next) next(); else if (!active) keepAwake(false); };
/* Ce que le serveur a déjà, connu sans resélectionner le fichier : clé finale (envoi terminé) ou octets déjà envoyés.
   Une vidéo entièrement envoyée n'a plus besoin d'être resélectionnée (sur iPhone, la « préparation » d'une longue
   vidéo par l'app Photos peut prendre plusieurs minutes). */
const SERVER = new Map<string, { key?: string; sent: number }>();
const FAILS = new Map<string, number>();
/** Message d'état par fichier (blocage, nouvel essai), affiché sous la barre d'envoi */
const NOTE = new Map<string, string>();
async function scanServer(d: Draft) {
  const done = DONE(d.id);
  for (const m of d.media) {
    if (done[m.id]) { SERVER.set(m.id, { key: done[m.id], sent: sizeOf(m) }); continue; }
    if (m.kind !== 'video' || Number.isNaN(sizeOf(m))) continue;
    const own = await savedState(m.r2Key).catch(() => undefined);
    let st = own && (own.done || Object.keys(own.parts).length) ? own : await stateForSize(sizeOf(m)).catch(() => undefined);
    if (st && !st.done) st = await finishSaved(st).catch(() => st);
    if (st) SERVER.set(m.id, st.done ? { key: st.key, sent: st.size } : { sent: Math.min(st.size, Object.keys(st.parts).length * PART) });
  }
  ping();
}
const isDone = (m: Item) => !!SERVER.get(m.id)?.key;
const needsFile = (m: Item) => !m.excluded && !isDone(m) && !FILES.get(m.id);
function uploadItem(d: Draft, item: Item): Promise<string> | null {
  const k0 = SERVER.get(item.id)?.key;
  if (k0) return Promise.resolve(k0);
  const f = FILES.get(item.id);
  if (!f) return null;
  let p = UP.get(item.id);
  if (!p) {
    p = (async () => {
      if (!INIT.has(d.id)) INIT.set(d.id, api('/montage/init', { id: d.id, gameId: d.gameId, teamId: d.teamId, settings: d.settings }));
      await INIT.get(d.id);
      await slot(); keepAwake(true);
      try {
        // Vidéo : reprise des parties déjà envoyées, retrouvées par l'id d'origine du fichier (pas celui du fichier resélectionné)
        MOVED.set(item.id, Date.now());
        if (item.kind === 'video') {
          // Montage recommencé : on reprend aussi l'envoi d'un essai précédent du même fichier (même taille exacte)
          const own = await savedState(item.r2Key);
          const prev = own && (own.done || Object.keys(own.parts).length) ? own : await stateForSize(f.size);
          const key = await uploadFile(d.id, f, { matchVideoId: d.id, kind: 'video' }, (n) => { PROG.set(item.id, n); MOVED.set(item.id, Date.now()); ping(); }, undefined, prev?.id ?? item.r2Key);
          store.set(doneKey(d.id), { ...DONE(d.id), [item.id]: key }); SERVER.set(item.id, { key, sent: f.size });
          return key;
        }
        const already = DONE(d.id)[item.id];
        const k = already ?? await uploadSmall('photo', await compressImage(f, 2048), { matchVideoId: d.id, rush: true });
        if (!already) store.set(doneKey(d.id), { ...DONE(d.id), [item.id]: k });
        SERVER.set(item.id, { key: k, sent: f.size });
        PROG.set(item.id, f.size); ping();
        return k;
      } finally { free(); }
    })();
    // Échec : on oublie la tentative et on réessaie tout seul 15 s plus tard (reprise là où l'envoi s'était arrêté)
    p.catch(async (e) => {
      UP.delete(item.id); INIT.delete(d.id);
      const n = (FAILS.get(item.id) ?? 0) + 1; FAILS.set(item.id, n);
      // Deux échecs de suite : l'envoi commencé est inutilisable (refusé par le serveur) → on recommence ce fichier
      // proprement dans ce montage, avec le fichier resélectionné
      if (n >= 2 && item.kind === 'video') {
        await dropStates(f.size).catch(() => {}); SERVER.delete(item.id); PROG.delete(item.id); FAILS.set(item.id, 0);
        NOTE.set(item.id, t('{name} : l’envoi précédent était bloqué, il recommence depuis le début.', { name: item.name }));
      } else NOTE.set(item.id, t('{name} : nouvel essai dans 15 s ({e}).', { name: item.name, e: String((e as Error)?.message ?? e).slice(0, 60) }));
      ping();
      setTimeout(() => { if (FILES.get(item.id) && !SERVER.get(item.id)?.key) uploadItem(d, item); }, 15_000);
    });
    UP.set(item.id, p);
  }
  return p;
}
const kick = (d: Draft) => d.media.filter((m) => !m.excluded).forEach((m) => {
  if (UP.has(m.id) && FILES.get(m.id) && !SERVER.get(m.id)?.key && Date.now() - (MOVED.get(m.id) ?? Date.now()) > 300_000) { UP.delete(m.id); MOVED.delete(m.id); }
  uploadItem(d, m);
});
/** Dernier mouvement par fichier (pour repérer un envoi figé) */
const MOVED = new Map<string, number>();
function useUploads() { const [, set] = useState(0); useEffect(() => { const f = () => set((x) => x + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []); }
/** Avancement de l'envoi en arrière-plan (étapes Médias et Vérifier) */
function BgProgress({ draft }: { draft: Draft }) {
  useUploads();
  // Rafraîchit l'affichage même sans événement (pour signaler une attente du réseau)
  const [, tick] = useState(0);
  const ref = useRef(draft); ref.current = draft;
  useEffect(() => { const i = setInterval(() => { tick((x) => x + 1); kick(ref.current); }, 10_000); return () => clearInterval(i); }, []);
  useEffect(() => { scanServer(draft); }, [draft.id, draft.media.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const media = draft.media.filter((m) => !m.excluded);
  const size = (m: Item) => FILES.get(m.id)?.size ?? sizeOf(m);
  const total = media.reduce((a, m) => a + (size(m) || 0), 0);
  if (!total) return null;
  const sentOf = (m: Item) => (isDone(m) ? size(m) : Math.min(size(m), Math.max(PROG.get(m.id) ?? 0, SERVER.get(m.id)?.sent ?? 0)));
  const sent = media.reduce((a, m) => a + (sentOf(m) || 0), 0);
  const need = media.filter(needsFile);
  const left = media.filter((m) => sentOf(m) < size(m)).length;
  const waitingNet = left > need.length && Date.now() - lastMove > 20_000;
  const pc = Math.floor((sent / total) * 100);
  return (
    <div className="banner mt"><Ico n={pc >= 100 ? 'checkCircle' : 'device'} /><div style={{ flex: 1 }}>
      <b>{pc >= 100 ? t('Médias envoyés ✓') : t('Envoi en arrière-plan : {n} %', { n: pc })}</b>
      {media.filter((m) => NOTE.get(m.id) && !isDone(m)).map((m) => <div key={m.id} className="muted" style={{ fontSize: 13 }}>⚠️ {NOTE.get(m.id)}</div>)}
      {need.length > 0 && <div style={{ fontSize: 14, margin: '4px 0' }}>{t('Pour finir, touche « Ajouter » et resélectionne seulement : {v} vidéo(s) et {p} photo(s) (marquées « à resélectionner »). Le reste est déjà envoyé.', { v: need.filter((m) => m.kind === 'video').length, p: need.filter((m) => m.kind === 'photo').length })}</div>}
      {pc < 100 && need.length < left && <div className="muted" style={{ fontSize: 13 }}>{waitingNet ? t('Connexion lente ou coupée : l’envoi reprend tout seul dès qu’elle revient.') : t('Continue tranquillement : garde juste BeHoop ouvert (l’écran reste allumé).')} · {t('{n} fichier(s) restant(s)', { n: left })}</div>}
      <div className="progress" style={{ marginTop: 6 }}><i style={{ width: `${pc}%` }} /></div></div></div>
  );
}

export default function Montage({ id }: { id: string }) {
  const s = useSession();
  const [draft, setDraft] = useState<Draft | null>(() => { const d = id && id !== 'new' ? store.get<Draft | null>(draftKey(id), null) : null; return d ? { ...d, media: dedupe(d.media) } : null; });
  useEffect(() => { if (draft && draft.step < 4) saveDraft(draft); }, [draft]);
  if (!s.user) return <Screen title={t('Montage')} back="publier"><Empty ill="video" title={t('Connecte-toi pour créer une vidéo')} action={<button className="btn" onClick={() => s.requireAuth()}>{t('Se connecter')}</button>} /></Screen>;
  if (id && id !== 'new' && !draft) return <RenderStatus id={id} />;
  if (!draft) return <PickMatch onPick={setDraft} />;
  if (draft.step >= 3) return <SendStep draft={draft} setDraft={setDraft} />;
  return <Wizard draft={draft} setDraft={setDraft} />;
}

const normHex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : /^#[0-9a-f]{3}$/i.test(c) ? '#' + [...c.slice(1)].map((x) => x + x).join('') : '#3d8fdb');
const Steps = ({ n }: { n: number }) => (
  <div className="hstack" style={{ gap: 6, marginBottom: 16 }} aria-label={t('Étape {n} sur 4', { n: n + 1 })}>{['Match', 'Médias', 'Vérifier', 'Envoi'].map((l, i) => (
    <div key={l} style={{ flex: 1 }}><div style={{ height: 4, borderRadius: 2, background: i <= n ? 'var(--accent)' : 'var(--bg3)' }} /><div className="muted" style={{ fontSize: 11, marginTop: 4, fontWeight: i === n ? 700 : 400 }}>{t(l)}</div></div>))}</div>
);

/* ---------- 1. Choisir le match (tout est prérempli depuis data.json) ---------- */
/** Montages commencés et pas encore envoyés (gardés sur ce téléphone) */
const openDrafts = (): Draft[] => {
  const out: Draft[] = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (/^behoop\.montage\.[a-z0-9]+$/.test(k)) { const d = store.get<Draft | null>(k, null); if (d && d.step < 4 && d.media?.length) out.push(d); } } } catch { /* stockage indisponible */ }
  // Un seul par match (le plus complet) : les essais recommencés du même match ne s'empilent pas
  const seen = new Set<number>();
  return out.sort((a, b) => b.media.length - a.media.length).filter((d) => !seen.has(d.gameId) && seen.add(d.gameId));
};
function PickMatch({ onPick }: { onPick: (d: Draft) => void }) {
  const s = useSession();
  const drafts = useMemo(openDrafts, []);
  const mine = useAsync(() => (s.user ? D.myVideos(s.user.uid).catch(() => []) : Promise.resolve([])), [s.user?.uid]);
  const resume = (d: Draft) => { history.replaceState(null, '', `#/montage/${d.id}`); onPick({ ...d, media: dedupe(d.media) }); };
  const [q, setQ] = useState('');
  const pre = Number(qs().get('g')) || null;
  const today = new Date().toISOString().slice(0, 10);
  const data = useAsync(async () => {
    const idx = await teamIndex();
    const clubIds = new Set(s.followedTeams.map((t) => idx.get(t)?.club.id).filter(Boolean) as number[]);
    const games = (await Promise.all([...clubIds].map(loadClub))).flatMap((c) => c.games);
    const seen = new Set<number>();
    const mine = games.filter((g) => (s.followedTeams.includes(g.h) || s.followedTeams.includes(g.a) || g.id === pre) && g.d <= today && !seen.has(g.id) && seen.add(g.id))
      .sort((a, b) => (b.d + b.t).localeCompare(a.d + a.t)).slice(0, 30);
    return { mine, idx, all: (await loadIndex()).clubs };
  }, [s.followedTeams.join()]);
  const [clubGames, setClubGames] = useState<Game[] | null>(null);
  const results = useMemo(() => (q.length > 1 && data.data ? data.data.all.filter((c) => normalize(c.name).includes(normalize(q))).slice(0, 8) : []), [q, data.data]);
  const pick = async (g: Game) => {
    // Ce match a déjà un montage en cours : on le reprend (réglages, médias et envoi déjà faits)
    const open = drafts.find((d) => d.gameId === g.id);
    if (open) { resume(open); return; }
    const idx = data.data!.idx;
    const hc = idx.get(g.h)?.club, ac = idx.get(g.a)?.club;
    const mineTeam = s.followedTeams.includes(g.h) ? g.h : s.followedTeams.includes(g.a) ? g.a : g.h;
    const [ih, ia] = await Promise.all([D.getTeamInfo(g.h).catch(() => null), D.getTeamInfo(g.a).catch(() => null)]);
    const side = (c: Club | undefined, short: string, info: D.TeamInfo | null, fallback: string) => ({
      name: info?.override?.displayName ?? c?.short ?? short, logo: info?.override?.logoUrl ?? c?.logo ?? '', color: normHex(info?.override?.colors?.[0] ?? c?.c1 ?? fallback),
    });
    const scores: [number, number][] = isPlayed(g) ? [[0, 0], [0, 0], [0, 0], [g.hs!, g.as!]] : [[0, 0], [0, 0], [0, 0], [0, 0]];
    const home = { ...side(hc, g.hn, ih, '#3d8fdb'), awbbTeamId: g.h }, away = { ...side(ac, g.an, ia, '#8a1e36'), awbbTeamId: g.a };
    const d: Draft = {
      id: rid(16), gameId: g.id, teamId: mineTeam, youth: idx.get(mineTeam)?.team.ag !== 'seniors', remember: false, step: 1, media: [],
      settings: { home, away, date: g.d, time: g.t, venue: [g.v, g.adr].filter(Boolean).join(', '), competition: g.sn, scores,
        title: `${home.name} vs ${away.name} — ${g.d.split('-').reverse().join('/')}`, photos: { q1: [], q2: [], q3: [], fin: [] } },
    };
    history.replaceState(null, '', `#/montage/${d.id}`);
    onPick(d);
  };
  useEffect(() => { if (pre && data.data) { const g = data.data.mine.find((x) => x.id === pre); if (g) pick(g); } }, [pre, data.data]); // eslint-disable-line
  const Row = ({ g }: { g: Game }) => (
    <button className="row" onClick={() => pick(g)}><div className="grow"><div className="ellipsis">{g.hn} – {g.an}</div><div className="sub">{dotted(g.d)} · {g.sn}{isPlayed(g) ? ` · ${g.hs}–${g.as}` : ''}</div></div><span className="chev">›</span></button>
  );
  return (
    <Screen title={t('Quel match ?')} back="publier">
      <Steps n={0} />
      {(mine.data ?? []).length > 0 && <>
        <h3 className="group-title">{t('Mes vidéos')}</h3>
        <div className="group">{mine.data!.slice(0, 8).map((v) => (
          <a key={v.id} className="row" href={v.status === 'ready' ? `#/video/${v.id}` : `#/montage/${v.id}`}>
            <span className="grow"><span className="nm ellipsis">{v.title}</span><span className="sub">{v.status === 'ready' ? t('Prête ▶') : v.status === 'error' ? t('Échec du montage') : t('Montage en cours…')}</span></span><span className="chev">›</span>
          </a>))}</div>
      </>}
      {drafts.length > 0 && <>
        <h3 className="group-title">{t('Reprendre un montage en cours')}</h3>
        <div className="group">{drafts.map((d) => (
          <button key={d.id} className="row" onClick={() => resume(d)}>
            <span className="grow"><span className="nm ellipsis">{d.settings.title}</span><span className="sub">{t('{v} vidéo(s) · {p} photo(s)', { v: d.media.filter((m) => m.kind === 'video').length, p: d.media.filter((m) => m.kind === 'photo').length })}</span></span><span className="chev">›</span>
          </button>))}</div>
      </>}
      <div className="search"><input className="field" placeholder={t('Chercher un autre club…')} value={q} onChange={(e) => { setQ(e.target.value); setClubGames(null); }} /></div>
      {results.length > 0 && !clubGames && <div className="group">{results.map((c) => <button key={c.id} className="row" onClick={async () => setClubGames((await loadClub(c.id)).games.filter((g) => g.d <= today).reverse().slice(0, 40))}><Disc src={c.logo} name={c.name} size={32} ring={c.c1} /><div className="grow">{c.name}</div></button>)}</div>}
      {clubGames && <div className="group">{clubGames.map((g) => <Row key={g.id} g={g} />)}</div>}
      {data.error && <ErrorBox msg={data.error} retry={data.reload} />}
      {!data.data ? <Skeleton h={56} n={6} /> : !clubGames && (data.data.mine.length ? <><div className="group-title">{t('Matchs récents de tes équipes')}</div><div className="group">{data.data.mine.map((g) => <Row key={g.id} g={g} />)}</div></>
        : <Empty ill="calendar" title={t('Aucun match récent')} text={t('Suis une équipe ou cherche un club ci-dessus.')} />)}
    </Screen>
  );
}

/* ---------- 2. Médias ---------- */
function Wizard({ draft, setDraft }: { draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft | null>> }) {
  const [busy, setBusy] = useState('');
  const upd = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  // Montage commencé avec l'ancienne version : on retire les doublons (fichiers resélectionnés pris pour des nouveaux)
  useEffect(() => { const m = dedupe(draft.media); if (m.length !== draft.media.length) setDraft((d) => (d ? { ...d, media: assignQuarters(dedupe(d.media)) } : d)); }, [draft.media.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { kick(draft); }, [draft.media]); // eslint-disable-line react-hooks/exhaustive-deps
  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    await keepAwake(true);
    const arr = Array.from(list); const out: Item[] = [];
    let done = 0;
    const flush = () => { const batch = out.splice(0); if (batch.length) setDraft((d) => (d ? { ...d, media: assignQuarters([...d.media, ...batch]) } : d)); };
    const queue = [...arr];
    const worker = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        const known = draft.media.find((m) => sameFile(m, f!)) ?? out.find((m) => sameFile(m, f!));
        if (known) { // fichier resélectionné : reprise
          FILES.set(known.id, f);
          if (known.kind === 'photo' && !known.thumb?.startsWith('data:')) { const th = await thumbData(f).catch(() => ''); if (th) setDraft((d) => (d ? { ...d, media: d.media.map((x) => (x.id === known.id ? { ...x, thumb: th } : x)) } : d)); }
        }
        else {
          const p: Prepared = await prepare(f);
          const id = rid(10); FILES.set(id, f);
          out.push({ id, r2Key: fileId(draft.id, f), kind: p.kind, name: f.name, takenAt: p.takenAt, duration: p.duration, width: p.width, height: p.height, thumb: p.thumb });
        }
        done++; setBusy(t('Lecture des médias {i}/{n}…', { i: done, n: arr.length }));
        if (out.length >= 3) flush();
      }
    };
    setBusy(t('Lecture des médias {i}/{n}…', { i: 0, n: arr.length }));
    await Promise.all([worker(), worker(), worker()]);
    flush(); setBusy(t('')); haptic();
    kick(draft);
  };
  if (draft.step === 1) return (
    <Screen title={t('Vidéos et photos')} back="publier">
      <Steps n={1} />
      <p className="muted">{t('Sélectionne toutes les vidéos et photos du match depuis ta galerie. BeHoop les classe par quart-temps grâce à l\'heure de prise de vue.')}</p>
      <label className="btn">{t('＋ Ajouter depuis la galerie')}<input type="file" accept={ACCEPT} multiple hidden onChange={(e) => addFiles(e.target.files)} /></label>
      <p className="hint">{t('Si la sélection est longue, c’est l’iPhone qui récupère les vidéos depuis iCloud : reste sur cet écran, il ne se mettra pas en veille.')}</p>
      {busy && <p className="muted center">{busy}</p>}
      <BgProgress draft={draft} />
      {draft.media.length > 0 && <>
        <p className="mt"><b>{draft.media.filter((m) => m.kind === 'video').length}</b> {t('vidéo(s)')} · <b>{draft.media.filter((m) => m.kind === 'photo').length}</b> {t('photo(s)')}</p>
        <div className="grid3">{draft.media.slice(0, 30).map((m) => <Thumb key={m.id} m={m} />)}</div>
        <button className="btn mt" onClick={() => upd({ step: 2 })}>{t('Continuer')}</button>
      </>}
    </Screen>
  );
  return <Verify draft={draft} upd={upd} addFiles={addFiles} busy={busy} />;
}

function Thumb({ m, onClick, sel }: { m: Item; onClick?: () => void; sel?: boolean }) {
  useUploads();
  return (
    <button className={`thumb${m.excluded || m.offPlay ? ' off' : ''}${m.featured ? ' feat' : ''}`} onClick={onClick} style={{ backgroundImage: m.thumb ? `url(${m.thumb})` : undefined, outline: sel ? '3px solid var(--accent)' : undefined }} aria-label={m.name}>
      {isDone(m) ? <span className="badge" style={{ left: 'auto', right: 6, top: 6, bottom: 'auto', background: '#1f9d55' }}>✓</span> : needsFile(m) && <span className="badge" style={{ left: 'auto', right: 6, top: 6, bottom: 'auto', background: '#c2410c' }}>{t('à resélectionner')}</span>}
      <span className="badge">{m.kind === 'video' ? <><Ico n="play" /> {m.duration ? Math.round(m.duration) + ' s' : ''}</> : m.scoreboardOfQuarter ? <><Ico n="scoreboard" /> Q{m.scoreboardOfQuarter}</> : <Ico n={m.featured ? 'star' : 'image'} />}</span>
    </button>
  );
}

/* ---------- 3. Vérifier ---------- */
function Verify({ draft, upd, addFiles, busy }: { draft: Draft; upd: (p: Partial<Draft>) => void; addFiles: (l: FileList | null) => void; busy: string }) {
  const s = useSession();
  const st = draft.settings, media = draft.media;
  const setSt = (p: Partial<MatchSettings>) => upd({ settings: { ...st, ...p } });
  const [q, setQ] = useState<1 | 2 | 3 | 4>(1);
  const [pl, setPl] = useState<PlancheType>('pre');
  const [sel, setSel] = useState<Item | null>(null);
  const [err, setErr] = useState('');
  const preview: MatchSettings = useMemo(() => {
    const u = (m?: Item) => m?.thumb ?? '';
    const all = media.filter((m) => m.kind === 'photo' && !m.excluded && !m.offPlay && !m.scoreboardOfQuarter);
    return { ...st, photos: { pre: u(all[0]), q1: mosaicPhotos(media, 1).map(u), q2: mosaicPhotos(media, 2).map(u), q3: mosaicPhotos(media, 3).map(u), fin: all.slice(-8).map(u) } };
  }, [st, media]);
  const items = media.filter((m) => m.quarter === q).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const patch = (id: string, p: Partial<Item>) => upd({ media: media.map((m) => (m.id === id ? { ...m, ...p } : m)) });
  const setScore = (i: number, side: number, v: number) => { const sc = st.scores.map((x) => [...x] as [number, number]); sc[i][side] = Math.max(0, v); setSt({ scores: sc }); };
  const move = (m: Item, dir: -1 | 1) => {
    const other = items[items.findIndex((x) => x.id === m.id) + dir]; if (!other) return;
    upd({ media: media.map((x) => (x.id === m.id ? { ...x, order: other.order } : x.id === other.id ? { ...x, order: m.order } : x)) });
  };
  const setSide = (side: 'home' | 'away', p: Partial<MatchSettings['home']>) => setSt({ [side]: { ...st[side], ...p } } as Partial<MatchSettings>);
  const setLogo = async (side: 'home' | 'away', f?: File) => {
    if (!f) return;
    const sq = await squareCrop(f);
    let url = URL.createObjectURL(sq);
    try { url = mediaUrl(await uploadSmall('logo', sq, { teamId: st[side].awbbTeamId })); } catch { /* aperçu local */ }
    setSide(side, { logo: url, color: (await dominantColor(sq)) ?? st[side].color });
  };
  // Résultat officiel arrivé depuis la création du montage : on préremplit le score final s'il est vide
  useEffect(() => {
    if (st.scores[3][0] || st.scores[3][1] || !st.home.awbbTeamId) return;
    teamIndex().then((idx) => loadClub(idx.get(st.home.awbbTeamId!)!.club.id)).then((d) => {
      const g = d.games.find((x) => x.id === draft.gameId);
      if (g && g.hs != null && g.as != null) { const sc = st.scores.map((x) => [...x] as [number, number]); sc[3] = [g.hs, g.as]; setSt({ scores: sc }); s.toast(t('Score final officiel ajouté : {h} – {a}', { h: g.hs, a: g.as })); }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const ocr = async (m: Item) => {
    const f = FILES.get(m.id); if (!f || !m.scoreboardOfQuarter) return;
    try {
      const b = await compressImage(f, 1280, .8);
      const b64 = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b); });
      const r = await api<{ home: number; away: number } | null>('/score-ocr', { image: b64 });
      if (r && confirm(t('Score lu : {h} – {a}. L’utiliser pour la fin du Q{q} ?', { h: r.home, a: r.away, q: m.scoreboardOfQuarter ?? '' }))) {
        const sc = st.scores.map((x) => [...x] as [number, number]); sc[m.scoreboardOfQuarter - 1] = [r.home, r.away]; setSt({ scores: sc });
      }
      else if (!r) s.toast(t('Score non lu automatiquement : saisis-le dans « Scores cumulés ».'));
    } catch { s.toast(t('Lecture automatique indisponible : saisis le score.')); }
  };
  const go = async () => {
    const e = validateScores(st.scores); if (e) { setErr(e); return; }
    const [fh, fa] = st.scores[3];
    // Scores vides : le serveur les lit sur les photos du marquoir marquées et ajoute le résultat officiel au lancement
    const boards = media.filter((m) => m.scoreboardOfQuarter && !m.excluded).length;
    if (!fh && !fa && !boards && !confirm(t('Aucun score ni photo du marquoir marquée : seul le résultat officiel pourra être ajouté (s’il est déjà publié). Continuer ?'))) return;
    if (!boards && (fh || fa) && st.scores.slice(0, 3).some(([h, a]) => !h && !a) && !confirm(t('Les scores de fin de quart ne sont pas tous remplis : la vidéo affichera 0–0 pour ces quarts. Continuer quand même ?'))) return;
    if (!media.some((m) => m.kind === 'video' && !m.excluded)) { setErr(t('Ajoute au moins une vidéo.')); return; }
    if (draft.remember) for (const side of ['home', 'away'] as const) if (st[side].awbbTeamId)
      await D.setTeamOverride(st[side].awbbTeamId!, { displayName: st[side].name, ...(st[side].logo.startsWith('blob:') ? {} : { logoUrl: st[side].logo }), colors: [st[side].color] }).catch(() => {});
    upd({ step: 3 });
  };
  const Field = ({ label, v, on, type = 'text' }: { label: string; v: string; on: (x: string) => void; type?: string }) =>
    <><label className="label">{label}</label><input className="field" type={type} defaultValue={v} onBlur={(e) => on(e.target.value)} /></>;
  return (
    <Screen title={t('Vérifier')} back="publier">
      <Steps n={2} />
      <BgProgress draft={draft} />
      <PlanchePreview type={pl} st={preview} />
      <div className="chips mt">{(['pre', 'q1', 'q2', 'q3', 'fin', 'wipe'] as PlancheType[]).map((pt) => <button key={pt} className={`chip${pl === pt ? ' on' : ''}`} onClick={() => setPl(pt)}>{t(({ pre: 'Avant-match', q1: 'Fin Q1', q2: 'Fin Q2', q3: 'Fin Q3', fin: 'Fin de match', wipe: 'Transition' } as Record<string, string>)[pt])}</button>)}</div>

      <div className="group-title">{t('Équipes')}</div>
      {(['home', 'away'] as const).map((side) => (
        <div key={side} className="group" style={{ padding: 14 }}>
          <div className="hstack"><Disc src={st[side].logo} name={st[side].name} size={52} ring={st[side].color} />
            <input className="field" defaultValue={st[side].name} onBlur={(e) => setSide(side, { name: e.target.value })} aria-label={t('Nom affiché')} /></div>
          <div className="hstack mt"><label className="btn small secondary">{t('Changer le logo')}<input type="file" accept="image/*" hidden onChange={(e) => setLogo(side, e.target.files?.[0])} /></label>
            <label className="hstack" style={{ gap: 6 }}>{t('Couleur')} <input type="color" value={st[side].color} onChange={(e) => setSide(side, { color: e.target.value })} style={{ width: 44, height: 34, border: 0, background: 'none' }} /></label>
            <span className="muted" style={{ fontSize: 13 }}>{side === 'home' ? t('Domicile') : t('Visiteurs')}</span></div>
        </div>))}
      <label className="check"><input type="checkbox" checked={draft.remember} onChange={(e) => upd({ remember: e.target.checked })} />{t('Toujours utiliser ces noms, logos et couleurs pour ces équipes')}</label>

      <div className="group-title">{t('Scores cumulés')}</div>
      <div className="group" style={{ padding: 12 }}>
        {['Fin Q1', 'Fin Q2', 'Fin Q3', 'Final'].map((l, i) => (
          <div key={l} className="hstack" style={{ justifyContent: 'space-between', padding: '6px 0' }}>
            <b style={{ width: 60 }}>{t(l)}</b>
            {[0, 1].map((side) => <div key={side} className="stepper"><button onClick={() => setScore(i, side, st.scores[i][side] - 1)} aria-label={t('Moins')}>−</button>
              <input inputMode="numeric" value={st.scores[i][side]} onChange={(e) => setScore(i, side, +e.target.value.replace(/\D/g, '') || 0)} aria-label={`${l} ${side ? st.away.name : st.home.name}`} />
              <button onClick={() => setScore(i, side, st.scores[i][side] + 1)} aria-label={t('Plus')}>+</button></div>)}
          </div>))}
      </div>

      <div className="group-title">{t('Match')}</div>
      <div className="group" style={{ padding: '0 14px 14px' }}>
        <Field label={t('Titre de la vidéo')} v={st.title} on={(v) => setSt({ title: v })} />
        <div className="hstack"><div style={{ flex: 1 }}><Field label={t('Date')} type="date" v={st.date} on={(v) => setSt({ date: v })} /></div><div style={{ flex: 1 }}><Field label={t('Heure')} type="time" v={st.time} on={(v) => setSt({ time: v })} /></div></div>
        <Field label={t('Lieu')} v={st.venue} on={(v) => setSt({ venue: v })} />
      </div>

      <div className="group-title">{t('Médias par quart-temps')}</div>
      <div className="seg">{([1, 2, 3, 4] as const).map((n) => <button key={n} className={q === n ? 'on' : ''} onClick={() => setQ(n)}>Q{n} ({media.filter((m) => m.quarter === n && !m.excluded).length})</button>)}</div>
      <div className="grid3">{items.map((m) => <Thumb key={m.id} m={m} sel={sel?.id === m.id} onClick={() => setSel(m)} />)}</div>
      <label className="btn secondary mt">{t('＋ Ajouter des médias')}<input type="file" accept={ACCEPT} multiple hidden onChange={(e) => addFiles(e.target.files)} /></label>
      <button className="btn ghost" onClick={() => upd({ media: assignQuarters(media) })}>{t('Reclasser automatiquement')}</button>
      {busy && <p className="muted center">{busy}</p>}
      {err && <div className="err mt">{err}</div>}
      <button className="btn mt" onClick={go}>{t('Générer la vidéo')}</button>

      {sel && <Sheet title={sel.name} onClose={() => setSel(null)}>
        <div className="hstack" style={{ flexWrap: 'wrap', gap: 8 }}>{([1, 2, 3, 4] as const).map((n) => <button key={n} className={`btn small${sel.quarter === n ? '' : ' secondary'}`} onClick={() => { patch(sel.id, { quarter: n }); setSel(null); }}>Q{n}</button>)}</div>
        <div className="group mt">
          <button className="row" onClick={() => { move(sel, -1); setSel(null); }}>{t('↑ Avancer dans l\'ordre')}</button>
          <button className="row" onClick={() => { move(sel, 1); setSel(null); }}>{t('↓ Reculer dans l\'ordre')}</button>
          <button className="row" onClick={() => { patch(sel.id, { excluded: !sel.excluded }); setSel(null); }}>{sel.excluded ? t('Réintégrer') : t('Exclure du montage')}</button>
          {sel.kind === 'photo' && <>
            <button className="row" onClick={() => { patch(sel.id, { offPlay: !sel.offPlay }); setSel(null); }}>{sel.offPlay ? t('Photo de jeu') : t('Hors jeu (banc, temps mort…)')}</button>
            <button className="row" onClick={() => { upd({ media: media.map((m) => (m.quarter === sel.quarter ? { ...m, featured: m.id === sel.id } : m)) }); setSel(null); }}><><Ico n="star" />{t('Photo vedette du quart')}</></button>
            {([1, 2, 3, 4] as const).map((n) => <button key={n} className="row" onClick={() => { const on = sel.scoreboardOfQuarter !== n; upd({ media: assignQuarters(media.map((m) => (m.id === sel.id ? { ...m, scoreboardOfQuarter: on ? n : null } : m))) }); setSel(null); if (on) ocr({ ...sel, scoreboardOfQuarter: n }); }}>
              <Ico n="scoreboard" style={{ marginRight: 6 }} />{n === 4 ? t('Tableau du score final') : t('Tableau « fin du quart {n} »', { n })} {sel.scoreboardOfQuarter === n && <Ico n="check" style={{ color: 'var(--accent)' }} />}</button>)}
            {sel.scoreboardOfQuarter && <button className="row" onClick={() => { ocr(sel); setSel(null); }}><><Ico n="sparkles" />{t('Lire le score automatiquement')}</></button>}
          </>}
        </div>
      </Sheet>}
    </Screen>
  );
}

async function squareCrop(f: File): Promise<Blob> {
  const bmp = await createImageBitmap(f); const s = Math.min(bmp.width, bmp.height); const out = Math.min(800, s);
  const c = document.createElement('canvas'); c.width = c.height = out;
  c.getContext('2d')!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, out, out);
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
}
/** Couleur dominante (hors blanc/noir/gris) : pré-détection de la couleur de l'équipe depuis son logo. */
async function dominantColor(b: Blob): Promise<string | null> {
  const bmp = await createImageBitmap(b); const c = document.createElement('canvas'); c.width = c.height = 48;
  const g = c.getContext('2d')!; g.drawImage(bmp, 0, 0, 48, 48);
  const d = g.getImageData(0, 0, 48, 48).data; const bins = new Map<string, number>();
  for (let i = 0; i < d.length; i += 4) {
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    if (d[i + 3] < 128 || mx - mn < 40 || mx < 40) continue;
    const k = [d[i], d[i + 1], d[i + 2]].map((x) => Math.round(x / 32) * 32).join(); bins.set(k, (bins.get(k) ?? 0) + 1);
  }
  const top = [...bins.entries()].sort((a, b) => b[1] - a[1])[0]; if (!top) return null;
  return '#' + top[0].split(',').map((x) => Math.min(255, +x).toString(16).padStart(2, '0')).join('');
}

/* ---------- 4. Envoi reprenable puis lancement du rendu ---------- */
function SendStep({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
  useUploads();
  const media = draft.media.filter((m) => !m.excluded);
  const missing = media.filter(needsFile);
  useEffect(() => { scanServer(draft); }, [draft.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, setState] = useState<'idle' | 'sending' | 'error'>('idle');
  const size = (m: Item) => FILES.get(m.id)?.size ?? (sizeOf(m) || 0);
  const total = media.reduce((a, m) => a + size(m), 0);
  const prog = Object.fromEntries(media.map((m) => [m.id, isDone(m) ? size(m) : Math.min(size(m), Math.max(PROG.get(m.id) ?? 0, SERVER.get(m.id)?.sent ?? 0))]));
  const sent = Object.values(prog).reduce((a, b) => a + b, 0);
  const start = async () => {
    setState('sending'); await keepAwake(true);
    try {
      const keys: Record<string, string> = {};
      await Promise.all(media.map(async (m) => { keys[m.id] = await uploadItem(draft, m)!; }));
      const mediaOut = draft.media.map(({ thumb: _t, ...m }) => ({ ...m, r2Key: keys[m.id] ?? m.r2Key }));
      await api('/render', { matchVideoId: draft.id, media: mediaOut, settings: draft.settings });
      await keepAwake(false); await clearScope(draft.id);
      media.forEach((m) => { UP.delete(m.id); PROG.delete(m.id); });
      store.set(draftKey(draft.id), null); store.set(doneKey(draft.id), null); haptic(30);
      setDraft({ ...draft, step: 4 });
    } catch { setState('error'); await keepAwake(false); }
  };
  // Tout est déjà là (envoyé en arrière-plan) : on lance le montage directement
  useEffect(() => { if (!missing.length && state === 'idle') start(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (draft.step === 4) return <RenderStatus id={draft.id} />;
  return (
    <Screen title={t('Envoi')} back="publier">
      <Steps n={3} />
      {missing.length > 0 ? (
        <div className="banner"><Ico n="folder" /><div style={{ flex: 1 }}>{t('L’appli a été fermée : resélectionne les {n} fichier(s) pour reprendre l’envoi là où il s’était arrêté.', { n: missing.length })}
          <label className="btn small mt">{t('Resélectionner')}<input type="file" accept={ACCEPT} multiple hidden onChange={(e) => {
            Array.from(e.target.files ?? []).forEach((f) => { const m = draft.media.find((x) => sameFile(x, f)); if (m) FILES.set(m.id, f); });
            setDraft({ ...draft });
          }} /></label></div></div>
      ) : (
        <>
          <div className="center"><div style={{ fontSize: 48, fontWeight: 700 }}>{total ? Math.floor((sent / total) * 100) : 0} %</div>
            <div className="muted">{(sent / 1e9).toFixed(2)} / {(total / 1e9).toFixed(2)} Go</div></div>
          <div className="progress mt"><i style={{ width: `${total ? (sent / total) * 100 : 0}%` }} /></div>
          {state === 'sending' && <div className="banner mt"><Ico n="device" /><div>{t('Garde BeHoop ouvert pendant l\'envoi. En cas de coupure, l\'envoi reprend tout seul.')}</div></div>}
          {state === 'error' && <ErrorBox msg={t('L’envoi a été interrompu. Il reprendra là où il s’était arrêté.')} retry={start} />}
          {state === 'idle' && !missing.length && <button className="btn mt" onClick={start}>{t('Envoyer et générer')}</button>}
          <div className="group mt">{media.map((m) => { const p = size(m) ? (prog[m.id] ?? 0) / size(m) : 0; return (
            <div key={m.id} className="row"><div className="grow"><div className="ellipsis" style={{ fontSize: 14 }}><Ico n={m.kind === 'video' ? 'video' : 'image'} /> {m.name}</div><div className="progress" style={{ marginTop: 6 }}><i style={{ width: `${p * 100}%` }} /></div></div>
              <span className="muted" style={{ fontSize: 13, width: 40, textAlign: 'right' }}>{Math.round(p * 100)}%</span></div>); })}</div>
        </>
      )}
    </Screen>
  );
}

/* ---------- 5. Suivi du rendu (temps réel Firestore) ---------- */
interface Job { status: 'queued' | 'running' | 'done' | 'error'; step: string; progress: number; error?: string; ghRunUrl?: string }
function RenderStatus({ id }: { id: string }) {
  const s = useSession();
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [mv, setMv] = useState<{ authorUid: string; version: number } | null>(null);
  useEffect(() => D.watchDoc<Job>(`renderJobs/${id}`, setJob), [id]);
  useEffect(() => D.watchDoc<{ authorUid: string; version: number }>(`matchVideos/${id}`, setMv), [id]);
  const relaunch = async () => { try { await api('/render', { matchVideoId: id, rerun: true }); s.toast(t('Rendu relancé')); } catch { s.toast(t('Impossible de relancer')); } };
  const del = async () => { if (!confirm(t('Supprimer cette vidéo ?'))) return; await api(`/montage/${id}`, undefined, 'DELETE').catch(() => {}); location.hash = '/fil'; };
  return (
    <Screen title={t('Montage')} back="fil">
      {job === undefined ? <Skeleton /> : !job ? <Empty ill="video" title={t('Montage introuvable')} /> : (
        <div className="center" style={{ paddingTop: 30 }}>
          <div className="ill-tile" aria-hidden><Ico n={job.status === 'done' ? 'checkCircle' : job.status === 'error' ? 'alert' : 'video'} /></div>
          <h2>{job.status === 'done' ? t('Ta vidéo est prête !') : job.status === 'error' ? t('Le montage a échoué') : t('Montage en cours…')}</h2>
          <p className="muted">{job.status === 'error' ? job.error : t(job.step ?? '')}</p>
          {job.status !== 'done' && job.status !== 'error' && <><div className="progress"><i style={{ width: `${job.progress}%` }} /></div><p className="muted">{job.progress} % · {t('tu recevras une notification quand ce sera prêt.')}</p></>}
          {job.status === 'done' && <a className="btn" href={`#/video/${id}`}>{t('▶ Regarder')}</a>}
          {job.status === 'error' && <><button className="btn" onClick={relaunch}>{t('Relancer')}</button>{job.ghRunUrl && <a className="btn ghost" href={job.ghRunUrl} target="_blank" rel="noopener">{t('Voir le détail technique')}</a>}</>}
          {mv?.authorUid === s.user?.uid && job.status === 'done' && <div className="hstack mt"><button className="btn secondary" onClick={relaunch}>{t('Régénérer')} (v{(mv?.version ?? 1) + 1})</button><button className="btn danger" onClick={del}>{t('Supprimer')}</button></div>}
        </div>)}
    </Screen>
  );
}
