// « Ajouter au calendrier » : l'abonnement (webcal) couvre tous les matchs de l'équipe, une seule fois suffit.
// L'appli ne peut pas lire le calendrier du téléphone : on retient les équipes déjà ajoutées
// (profil Firestore si connecté, pour tous ses appareils ; sinon ce navigateur).
import { arrayUnion } from 'firebase/firestore';
import { useSession } from '../lib/session';
import { updateProfile } from '../lib/db';
import { t } from '../lib/i18n';
import { Ico } from './icons';

const KEY = 'behoop.calendars';
/** Calendrier d'une équipe (identifiant numérique) ou d'une compétition entière ('comp-bnxt') */
export type CalKey = number | `comp-${string}`;
const local = (): CalKey[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } };

export const icsUrl = (k: CalKey) => `${location.origin}/calendars/${typeof k === 'number' ? `team-${k}` : k}.ics`;

export function useCalendar(k: CalKey) {
  const s = useSession();
  const done = (s.profile?.calendars ?? []).includes(k) || local().includes(k);
  const mark = () => {
    try { localStorage.setItem(KEY, JSON.stringify([...new Set([...local(), k])])); } catch { /* stockage indisponible */ }
    if (s.user && s.profile) {
      s.setProfile({ ...s.profile, calendars: [...new Set([...(s.profile.calendars ?? []), k])] });
      updateProfile(s.user.uid, { calendars: arrayUnion(k) as unknown as CalKey[] }).catch(() => {});
    }
  };
  return { done, mark };
}

/** compact : sur une carte de match → rien du tout une fois l'équipe ajoutée.
 *  comp : calendrier de toute une compétition (tous ses matchs, pas ceux d'une équipe). */
export function CalendarButton({ teamId, comp, label = t('Ajouter au calendrier'), compact, primary }: { teamId?: number; comp?: string; label?: string; compact?: boolean; primary?: boolean }) {
  const k: CalKey = comp ? `comp-${comp}` : teamId!;
  const { done, mark } = useCalendar(k);
  const href = icsUrl(k).replace(/^https?:/, 'webcal:');
  if (done && compact) return null;
  if (done) return <a className="btn small secondary" href={href} title={t('Ajouter à nouveau (autre appareil)')}><Ico n="check" />{t('Dans ton calendrier')}</a>;
  return (
    <>
      <a className={`btn small${primary ? '' : ' secondary'}`} href={href} onClick={mark}><Ico n="calendarAdd" />{label}</a>
      <button className="btn small ghost" onClick={mark} title={comp ? t('Ton calendrier contient déjà les matchs de cette compétition') : t('Ton calendrier contient déjà les matchs de cette équipe')}><Ico n="check" />{t('Déjà fait')}</button>
    </>
  );
}
