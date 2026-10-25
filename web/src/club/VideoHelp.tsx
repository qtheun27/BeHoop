// Vidéo d'explication d'un exercice ou d'une tactique (Hoop Camp, exercices collectifs, Playbook)
import { useEffect, useState } from 'react';
import { useSession } from '../lib/session';
import { t } from '../lib/i18n';
import { useAsync } from '../ui/kit';
import { Ico } from '../ui/icons';
import { Embed, parseEmbed } from '../ui/Embed';
import { api, ensureMediaCookie, mediaUrl } from '../lib/api';
import { uploadSmall } from '../lib/upload';
import * as A from './api';

/** Vidéo perso envoyée depuis la galerie du téléphone (stockée dans clips/{uid}/, lisible par son propriétaire seulement) */
function Clip({ k }: { k: string }) {
  const [ok, setOk] = useState(false);
  useEffect(() => { ensureMediaCookie().then(() => setOk(true)).catch(() => setOk(true)); }, []);
  return ok ? <video className="clip" src={mediaUrl(k)} controls playsInline preload="metadata" /> : null;
}

/** Vidéo d'explication : chacun peut épingler la vidéo qu'il préfère pour un exercice ou une tactique — un lien
 *  (YouTube, Instagram, TikTok) ou sa propre vidéo depuis la galerie ; elle n'est visible que par lui.
 *  Une vidéo montre le geste en vrai (vue de côté, rythme), là où le schéma vu de dessus ne suffit pas. */
export function VideoHelp({ refId, query }: { refId: string; query: string }) {
  const s = useSession();
  const uid = s.user?.uid ?? '';
  const pinned = useAsync(() => (uid ? A.pinnedVideo(uid, refId).catch(() => null) : Promise.resolve(null)), [uid, refId]);
  const [edit, setEdit] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState('');
  const url = pinned.data ?? '';
  const clip = url.startsWith('clip:') ? url.slice(5) : null;
  const e = !clip && url ? parseEmbed(url) : null;
  const emb = link.trim() ? parseEmbed(link) : null;
  const search = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${query} basket`)}`;
  const save = async (v: string) => {
    try {
      await A.pinVideo(uid, refId, v);
      // L'ancienne vidéo de galerie (remplacée ou retirée) est supprimée du stockage
      if (clip && v !== url) api('/clip/delete', { key: clip }).catch(() => {});
      setEdit(false); setLink(''); pinned.reload();
    } catch { s.toast(t('Accès refusé.')); }
  };
  const upload = async (f?: File) => {
    if (!f) return;
    if (f.size > 200_000_000) { s.toast(t('Vidéo trop lourde (200 Mo maximum).')); return; }
    setBusy(t('Envoi de la vidéo…'));
    try { // Type toujours renseigné : il fait partie de la signature de l'envoi
      const key = await uploadSmall('clip', f.type ? f : new Blob([f], { type: 'video/mp4' }), {}); await save(`clip:${key}`); s.toast(t('Vidéo enregistrée.')); }
    catch { s.toast(t('L’envoi a échoué. Vérifie ta connexion et réessaie.')); } finally { setBusy(''); }
  };
  return (
    <div className="vid-help">
      {(clip || e) && <h4>{t('Ma vidéo')}</h4>}
      {clip && <Clip k={clip} />}
      {e && <Embed e={e} />}
      <div className="vid-actions">
        <a className="btn small secondary" href={search} target="_blank" rel="noopener noreferrer"><Ico n="video" />{t('Voir des vidéos')}</a>
        {uid && <button className="btn small secondary" onClick={() => { setEdit(!edit); setLink(e ? url : ''); }}>{url ? t('Changer ma vidéo') : t('Épingler une vidéo')}</button>}
      </div>
      {edit && (
        <div className="form" style={{ padding: 0, marginTop: 8 }}>
          <label className="btn secondary"><Ico n="image" />{t('Choisir dans ma galerie')}
            <input type="file" accept="video/*" hidden disabled={!!busy} onChange={(ev) => upload(ev.target.files?.[0])} /></label>
          {busy && <p className="muted center">{busy}</p>}
          <p className="hint" style={{ margin: 0 }}>{t('Ou colle un lien :')}</p>
          <input className="field" inputMode="url" placeholder={t('Lien YouTube, Instagram ou TikTok')} value={link} onChange={(ev) => setLink(ev.target.value)} />
          {link.trim() && !emb && <div className="err">{t('Lien non reconnu : colle le lien complet d’un post Instagram, d’une vidéo TikTok ou YouTube.')}</div>}
          <p className="hint">{t('Cette vidéo s’affichera ici pour toi seulement.')}</p>
          <div className="setup-actions">
            {url && <button className="btn small danger" disabled={!!busy} onClick={() => save('')}>{t('Retirer')}</button>}
            <button className="btn small volt" disabled={!emb || !!busy} onClick={() => save(link.trim())}>{t('Enregistrer')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
