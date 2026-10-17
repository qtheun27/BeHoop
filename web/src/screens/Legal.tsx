import { Screen } from '../ui/kit';

// Brouillons — À RELIRE par Quentin (et idéalement un juriste) avant la mise en ligne publique.
const DOCS: Record<string, { title: string; body: [string, string][] }> = {
  cgu: { title: "Conditions d'utilisation", body: [
    ['Le service', "BeHoop (behoop.be) est un projet personnel et gratuit qui affiche les résultats du basket AWBB et permet de suivre des clubs, de publier des messages, photos et vidéos de match."],
    ['Ton compte', "Il faut avoir 13 ans ou plus. Ton prénom et l'initiale de ton nom sont visibles des autres utilisateurs. Tu es responsable de ce que tu publies."],
    ['Ce que tu publies', "Tu dois avoir le droit de publier tes photos et vidéos. Les médias d'une équipe Jeunes ne sont visibles que par les membres validés de l'Équipe 🔒. Tu t'engages à retirer un contenu si un parent le demande."],
    ['Modération', "Tout contenu peut être signalé. BeHoop peut masquer un contenu ou suspendre un compte qui ne respecte pas la charte, sans préavis."],
    ['Responsabilité', "Les données sportives proviennent de l'AWBB et peuvent contenir des erreurs. Le service est fourni « tel quel », sans garantie de disponibilité."],
    ['Contact', 'q.theuninck@gmail.com'],
  ] },
  confidentialite: { title: 'Politique de confidentialité', body: [
    ['Responsable', 'Quentin T. — q.theuninck@gmail.com.'],
    ['Données collectées', "Adresse e-mail et identifiant de connexion (Firebase Auth), prénom et initiale du nom, clubs et équipes suivis, adhésions aux Équipes, publications, réactions, signalements, jetons de notification, photos et vidéos envoyées."],
    ['Pourquoi', "Faire fonctionner ton compte, ton fil, les notifications et le montage vidéo. Aucune publicité, aucune revente, aucun profilage."],
    ['Où', "Google Firebase (UE/États-Unis, clauses contractuelles types) et Cloudflare R2 (stockage des médias). Les rushes vidéo sont supprimés 48 h après le montage."],
    ['Durée', "Tant que ton compte existe. Les contenus d'un compte supprimé sont effacés sous 30 jours (sauvegardes comprises)."],
    ['Tes droits (RGPD)', "Accès, rectification, effacement (bouton « Supprimer mon compte » dans Profil), opposition, portabilité. Écris à q.theuninck@gmail.com. Tu peux aussi saisir l'Autorité de protection des données (autoriteprotectiondonnees.be)."],
    ['Mineurs', "Les photos et vidéos de jeunes ne sont jamais publiques et ne sont pas téléchargeables. Un parent peut retirer immédiatement un contenu via « Je suis parent — retirer ce contenu »."],
  ] },
  charte: { title: 'Charte BeHoop', body: [
    ['Respect', "On parle de basket avec respect : joueurs, coachs, arbitres, parents et bénévoles."],
    ['Pas de moquerie', "Aucune moquerie, aucun commentaire sur le physique ou le niveau d'un joueur, surtout chez les jeunes."],
    ['Enfants', "Pas de publication d'enfants sans l'accord de leurs parents. Les médias Jeunes restent dans l'Équipe 🔒."],
    ['Signaler', "Si quelque chose te dérange, utilise « Signaler » : on regarde chaque signalement."],
  ] },
};

export function Legal({ doc }: { doc: string }) {
  const d = DOCS[doc] ?? DOCS.cgu;
  return (
    <Screen title={d.title} back="profil">
      <p className="pill" style={{ background: 'var(--gold)', color: '#000' }}>Brouillon — à relire</p>
      {d.body.map(([h, t]) => <section key={h}><h2 style={{ fontSize: 20, margin: '20px 0 6px' }}>{h}</h2><p style={{ margin: 0 }}>{t}</p></section>)}
      <p className="muted mt" style={{ fontSize: 13 }}>Version 2026-10</p>
    </Screen>
  );
}
