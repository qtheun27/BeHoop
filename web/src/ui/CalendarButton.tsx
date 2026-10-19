// « Ajouter au calendrier » : l'abonnement (webcal) couvre tous les matchs de l'équipe, une seule fois suffit.
// L'appli ne peut pas lire le calendrier du téléphone : on retient les équipes déjà ajoutées
// (profil Firestore si connecté, pour tous ses appareils ; sinon ce navigateur).
import { arrayUnion } from 'firebase/firestore';
import { useSession } from '../lib/session';
import { updateProfile } from '../lib/db';

const KEY = 'behoop.calendars';
const local = (): number[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } };

export const icsUrl = (teamId: number) => `${location.origin}/calendars/team-${teamId}.ics`;

export function useCalendar(teamId: number) {
  const s = useSession();
  const done = (s.profile?.calendars ?? []).includes(teamId) || local().includes(teamId);
  const mark = () => {
    try { localStorage.setItem(KEY, JSON.stringify([...new Set([...local(), teamId])])); } catch { /* stockage indisponible */ }
    if (s.user && s.profile) {
      s.setProfile({ ...s.profile, calendars: [...new Set([...(s.profile.calendars ?? []), teamId])] });
      updateProfile(s.user.uid, { calendars: arrayUnion(teamId) as unknown as number[] }).catch(() => {});
    }
  };
  return { done, mark };
}

/** compact : sur une carte de match → rien du tout une fois l'équipe ajoutée. */
export function CalendarButton({ teamId, label = '📆 Ajouter au calendrier', compact, primary }: { teamId: number; label?: string; compact?: boolean; primary?: boolean }) {
  const { done, mark } = useCalendar(teamId);
  const href = icsUrl(teamId).replace(/^https?:/, 'webcal:');
  if (done && compact) return null;
  if (done) return <a className="btn small secondary" href={href} title="Ajouter à nouveau (autre appareil)">✓ Dans ton calendrier</a>;
  return (
    <>
      <a className={`btn small${primary ? '' : ' secondary'}`} href={href} onClick={mark}>{label}</a>
      <button className="btn small ghost" onClick={mark} title="Ton calendrier contient déjà les matchs de cette équipe">✓ Déjà fait</button>
    </>
  );
}
