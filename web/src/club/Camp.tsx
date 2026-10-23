// Hoop Camp dans l'espace BeHoop (#/camp/hoopcamp/{joueur}, #/camp/valider/{joueur}) : joueurs et parents y accèdent
// depuis le Vestiaire, sans passer par l'Espace Club (réservé aux coachs et aux admins).
import { Screen } from '../ui/kit';
import { t } from '../lib/i18n';
import { ClubProvider } from './ctx';
import { HoopCampPage } from './HoopCamp';
import { Validate } from './Validate';
import { Tactique } from './Tactique';
import './space.css';

export default function Camp({ sub, arg }: { sub?: string; arg?: string }) {
  return (
    <ClubProvider>
      <Screen title={sub === 'valider' ? t('Validation du soir') : sub === 'playbook' ? 'Playbook' : 'Hoop Camp'} back="equipes">
        {sub === 'valider' ? <Validate pid={arg!} /> : sub === 'playbook' ? <Tactique /> : <HoopCampPage key={arg} pid={arg!} />}
      </Screen>
    </ClubProvider>
  );
}
