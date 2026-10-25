// Vidéo d'explication d'un exercice ou d'une tactique (Hoop Camp, exercices collectifs, Playbook)
import { useState } from 'react';
import { useSession } from '../lib/session';
import { t } from '../lib/i18n';
import { useAsync } from '../ui/kit';
import { Ico } from '../ui/icons';
import { Embed, parseEmbed } from '../ui/Embed';
import * as A from './api';

/** Vidéo d'explication : chacun peut épingler la vidéo qu'il préfère pour un exercice ou une tactique ; elle n'est visible que par lui.
 *  Une vidéo montre le geste en vrai (vue de côté, rythme), là où le schéma vu de dessus ne suffit pas. */
export function VideoHelp({ refId, query }: { refId: string; query: string }) {
  const s = useSession();
  const uid = s.user?.uid ?? '';
  const pinned = useAsync(() => (uid ? A.pinnedVideo(uid, refId).catch(() => null) : Promise.resolve(null)), [uid, refId]);
  const [edit, setEdit] = useState(false);
  const [link, setLink] = useState('');
  const e = pinned.data ? parseEmbed(pinned.data) : null;
  const emb = link.trim() ? parseEmbed(link) : null;
  const search = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${query} basket`)}`;
  return (
    <div className="vid-help">
      {e && <><h4>{t('Ma vidéo')}</h4><Embed e={e} /></>}
      <div className="vid-actions">
        <a className="btn small secondary" href={search} target="_blank" rel="noopener noreferrer"><Ico n="video" />{t('Voir des vidéos')}</a>
        {uid && <button className="btn small secondary" onClick={() => { setEdit(!edit); setLink(pinned.data ?? ''); }}>{e ? t('Changer ma vidéo') : t('Épingler une vidéo')}</button>}
      </div>
      {edit && (
        <div className="form" style={{ padding: 0, marginTop: 8 }}>
          <input className="field" inputMode="url" placeholder={t('Lien YouTube, Instagram ou TikTok')} value={link} onChange={(ev) => setLink(ev.target.value)} />
          {link.trim() && !emb && <div className="err">{t('Lien non reconnu : colle le lien complet d’un post Instagram, d’une vidéo TikTok ou YouTube.')}</div>}
          <p className="hint">{t('Cette vidéo s’affichera ici pour toi seulement.')}</p>
          <div className="setup-actions">
            {pinned.data && <button className="btn small danger" onClick={async () => { await A.pinVideo(uid, refId, '').catch(() => s.toast(t('Accès refusé.'))); setEdit(false); pinned.reload(); }}>{t('Retirer')}</button>}
            <button className="btn small volt" disabled={!emb} onClick={async () => { try { await A.pinVideo(uid, refId, link.trim()); setEdit(false); pinned.reload(); } catch { s.toast(t('Accès refusé.')); } }}>{t('Enregistrer')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
