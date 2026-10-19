import { useMemo, useState } from 'react';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { teamIndex, teamLabel } from '../lib/data';
import { Screen, Sheet, Empty, useAsync } from '../ui/kit';
import { compressImage, ACCEPT } from '../lib/media';
import { uploadSmall } from '../lib/upload';
import { USE_EMULATOR } from '../lib/config';
import { haptic } from '../lib/util';
import { useClubs } from './Explore';
import { t } from '../lib/i18n';

export function Publish() {
  const s = useSession();
  const [open, setOpen] = useState(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('photo') === '1');
  if (!s.user) return <Screen title={t('Publier')}><Empty ill="➕" title={t('Publie pour ton équipe')} text={t('Photos, messages et vidéos de match montées automatiquement.')} action={<button className="btn" onClick={() => s.requireAuth()}>{t('Se connecter')}</button>} /></Screen>;
  return (
    <Screen title={t('Publier')}>
      <button className="card" style={{ width: '100%', textAlign: 'left', padding: 20 }} onClick={() => setOpen(true)}>
        <div style={{ fontSize: 34 }}>📸</div><div style={{ fontWeight: 700, fontSize: 20, marginTop: 6 }}>{t('Photo / message')}</div>
        <div className="muted">{t('Partage un moment ou une info avec une équipe ou un club.')}</div></button>
      <a className="card" style={{ display: 'block', padding: 20, color: 'inherit', background: '#0a0c12', position: 'relative', overflow: 'hidden' }} href="#/montage/new">
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg,transparent 0 62%,#8a1e36 62% 70%,transparent 70% 72%,#3d8fdb 72% 75%,transparent 75%)', opacity: .8 }} />
        <div style={{ position: 'relative', color: '#fff' }}><div style={{ fontSize: 34 }}>🎬</div><div style={{ fontFamily: 'Anton', fontSize: 30, textTransform: 'uppercase', marginTop: 6 }}>{t('Montage de match')}</div>
          <div style={{ opacity: .75 }}>{t('Envoie tes vidéos et photos : BeHoop monte la vidéo avec les planches animées.')}</div></div></a>
      {open && <Composer onClose={() => setOpen(false)} />}
    </Screen>
  );
}

function Composer({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const clubs = useClubs();
  const idx = useAsync(teamIndex, []);
  const [target, setTarget] = useState<{ kind: 'team' | 'club'; id: number } | null>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [pledge, setPledge] = useState(false);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const options = useMemo(() => {
    const o: { kind: 'team' | 'club'; id: number; label: string; ag?: string }[] = [];
    s.followedTeams.forEach((t) => { const e = idx.data?.get(t); if (e) o.push({ kind: 'team', id: t, label: `${e.club.short} · ${teamLabel(e.team)}`, ag: e.team.ag }); });
    s.followedClubs.forEach((c) => { const cl = clubs.find((x) => x.id === c); if (cl) o.push({ kind: 'club', id: c, label: `${cl.name} (${t('club')})` }); });
    return o.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  }, [s.followedTeams, s.followedClubs, idx.data, clubs]);
  const sel = options.find((o) => target && o.kind === target.kind && o.id === target.id);
  const youth = !!files.length && sel?.kind === 'team' && sel.ag !== 'seniors';
  const member = sel?.kind === 'team' && s.privateTeams.includes(sel.id);
  const blocked = youth && !member;
  const publish = async () => {
    if (!sel || !s.user || !s.profile) return;
    setErr(t('')); setBusy(t('Préparation…'));
    try {
      const id = D.newPostId();
      const photos: { key: string }[] = [];
      for (const [i, f] of files.entries()) {
        setBusy(t('Envoi de la photo {i}/{n}…', { i: i + 1, n: files.length }));
        const blob = await compressImage(f, 2048);
        let key: string;
        try { key = await uploadSmall('photo', blob, { postId: id, n: i, teamId: sel.kind === 'team' ? sel.id : null, clubId: sel.kind === 'club' ? sel.id : null }); }
        catch (e) { if (!USE_EMULATOR) throw e; key = await new Promise<string>(async (r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.readAsDataURL(await compressImage(f, 480, .6)); }); }
        photos.push({ key });
      }
      const e = sel.kind === 'team' ? idx.data!.get(sel.id)! : null;
      await D.createPost(id, {
        type: files.length ? 'photo' : 'message', authorUid: s.user.uid, authorName: s.profile.displayName,
        clubId: e ? e.club.id : sel.id, teamIds: e ? [sel.id] : [], targets: e ? [`t:${sel.id}`, `c:${e.club.id}`] : [`c:${sel.id}`],
        visibility: youth ? 'team' : 'public', teamIdPrivate: youth ? sel.id : null,
        payload: { text: text.trim(), photos, teamLabel: sel.label },
      });
      haptic(20); s.toast(t('Publié !')); onClose(); location.hash = '/fil';
    } catch { setErr(t('La publication a échoué. Vérifie ta connexion et réessaie.')); } finally { setBusy(t('')); }
  };
  return (
    <Sheet title={t('Nouvelle publication')} onClose={onClose} right={<button className="btn small" disabled={!sel || (!text.trim() && !files.length) || !!busy || blocked || (youth && !pledge) || (sel.kind === 'club' && files.length > 0)} onClick={publish}>{t('Publier')}</button>}>
      <label className="label" htmlFor="tg">{t('Pour')}</label>
      <select id="tg" className="field" value={target ? `${target.kind}:${target.id}` : ''} onChange={(e) => { const [k, v] = e.target.value.split(':'); setTarget(v ? { kind: k as 'team', id: +v } : null); }}>
        <option value="">{t('Choisir une équipe ou un club…')}</option>{options.map((o) => <option key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>{o.label}</option>)}</select>
      {!options.length && <p className="muted" style={{ fontSize: 14 }}>{t('Suis d\'abord une équipe ou un club depuis Explorer.')}</p>}
      <label className="label" htmlFor="tx">{t('Message')}</label>
      <textarea id="tx" className="field" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Quel match !')} />
      <div className="muted" style={{ fontSize: 12, textAlign: 'right' }}>{text.length}/500</div>
      <label className="btn secondary mt">📷 {t('Ajouter des photos')} ({files.length}/10)
        <input type="file" accept={ACCEPT.replace(/\.(mov|mp4|m4v),?|video\/\*,?/g, '')} multiple hidden onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 10))} /></label>
      {files.length > 0 && <div className="grid3 mt">{files.map((f, i) => <button key={i} className="thumb" style={{ backgroundImage: `url(${URL.createObjectURL(f)})` }} onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={t('Retirer la photo')}><span className="badge">✕</span></button>)}</div>}
      {sel?.kind === 'club' && files.length > 0 && <div className="err mt">{t('Les photos doivent être liées à une équipe (pas à un club entier).')}</div>}
      {youth && <>
        <div className="banner mt"><span>🔒</span><div style={{ fontSize: 14 }}>{t('Équipe Jeunes : ces photos ne seront visibles que par les membres de l\'Équipe.')}</div></div>
        {blocked ? <div className="err">{t('Tu dois être membre de l\'Équipe 🔒 pour publier des photos de jeunes. Demande à la rejoindre depuis sa page.')}</div>
          : <label className="check"><input type="checkbox" checked={pledge} onChange={(e) => setPledge(e.target.checked)} />{t('Je publie pour les membres de l’équipe et je retirerai ce contenu si un parent le demande.')}</label>}
      </>}
      {busy && <p className="muted center">{busy}</p>}
      {err && <div className="err mt">{err}</div>}
    </Sheet>
  );
}
