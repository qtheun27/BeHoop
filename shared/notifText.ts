// Textes des notifications (scripts ops/ et Worker), en français, néerlandais et anglais.
// Chaque notification est envoyée dans la langue choisie par l'utilisateur dans l'appli (profiles/{uid}.lang).
export type NLang = 'fr' | 'nl' | 'en';
export type Txt = string | Record<NLang, string>;
export const pick = (x: Txt, l?: string): string => (typeof x === 'string' ? x : x[l as NLang] ?? x.fr);

const someone = { fr: 'Quelqu’un', nl: 'Iemand', en: 'Someone' };

export const N = {
  match2h: (h: string, a: string) => ({ fr: `Match dans 2 h : ${h} – ${a}`, nl: `Wedstrijd binnen 2 u: ${h} – ${a}`, en: `Game in 2 hours: ${h} – ${a}` }),
  carpoolTomorrow: { fr: 'Covoiturage demain', nl: 'Carpoolen morgen', en: 'Carpool tomorrow' },
  carpoolDetail: (h: string, a: string, time: string, from: string) => ({
    fr: `${h} – ${a} · départ ${time} de ${from}`, nl: `${h} – ${a} · vertrek ${time} uit ${from}`, en: `${h} – ${a} · leaving ${time} from ${from}` }),
  videoReady: { fr: 'Ta vidéo est prête 🎬', nl: 'Je video is klaar 🎬', en: 'Your video is ready 🎬' },
  newVideo: (h: string, a: string) => ({ fr: `Nouvelle vidéo : ${h} – ${a}`, nl: `Nieuwe video: ${h} – ${a}`, en: `New video: ${h} – ${a}` }),
  momentReady: { fr: 'Ton Moment est prêt ⚡', nl: 'Je Moment is klaar ⚡', en: 'Your Moment is ready ⚡' },
  result: (h: string, hs: number | string, as: number | string, a: string) => ({
    fr: `Résultat final : ${h} ${hs} – ${as} ${a}`, nl: `Eindresultaat: ${h} ${hs} – ${as} ${a}`, en: `Final result: ${h} ${hs} – ${as} ${a}` }),
  removedTitle: { fr: 'Contenu retiré', nl: 'Inhoud verwijderd', en: 'Content removed' },
  removedBody: { fr: 'Un parent a retiré une publication de jeunes. Elle est masquée.', nl: 'Een ouder heeft een jeugdbericht verwijderd. Het is verborgen.', en: 'A parent removed a youth post. It is now hidden.' },
  liveFinal: (h: number | string, a: number | string) => ({ fr: `Fin du match : ${h} – ${a}`, nl: `Einde wedstrijd: ${h} – ${a}`, en: `Full time: ${h} – ${a}` }),
  liveBody: { fr: 'Score saisi en direct sur BeHoop', nl: 'Score live ingevoerd op BeHoop', en: 'Score entered live on BeHoop' },
  joinTitle: { fr: 'Demande d’accès à l’Équipe 🔒', nl: 'Toegangsaanvraag voor de Ploeg 🔒', en: 'Team access request 🔒' },
  joinBody: (name: string | undefined, msg: string) => ({
    fr: `${name ?? someone.fr} souhaite rejoindre l’équipe.${msg}`, nl: `${name ?? someone.nl} wil bij de ploeg aansluiten.${msg}`, en: `${name ?? someone.en} would like to join the team.${msg}` }),
  welcomeTitle: { fr: 'Bienvenue dans l’Équipe 🔒', nl: 'Welkom in de Ploeg 🔒', en: 'Welcome to the Team 🔒' },
  welcomeBody: { fr: 'Ta demande est acceptée : tu vois maintenant les photos et vidéos de l’équipe.', nl: 'Je aanvraag is aanvaard: je ziet nu de foto’s en video’s van de ploeg.', en: 'Your request was accepted: you can now see the team’s photos and videos.' },
  hoopcamp: { fr: 'Hoop Camp', nl: 'Hoop Camp', en: 'Hoop Camp' },
  hoopcampAssign: (name: string | undefined, prog: string) => ({ fr: `${name ?? someone.fr} t’envoie un programme : ${prog}.`, nl: `${name ?? someone.nl} stuurt je een programma: ${prog}.`, en: `${name ?? someone.en} sent you a programme: ${prog}.` }),
  hoopcampDone: (name: string | undefined, n: number) => ({ fr: `${name ?? someone.fr} a fini sa séance : ${n} exercice(s) à valider.`, nl: `${name ?? someone.nl} heeft de training af: ${n} oefening(en) te beoordelen.`, en: `${name ?? someone.en} finished a session: ${n} exercise(s) to review.` }),
  hoopcampRated: (name: string | undefined) => ({ fr: `${name ?? someone.fr} a validé ta séance. Va voir tes points !`, nl: `${name ?? someone.nl} heeft je training beoordeeld. Bekijk je punten!`, en: `${name ?? someone.en} reviewed your session. Check your points!` }),
  carpool: { fr: 'Covoiturage', nl: 'Carpoolen', en: 'Carpool' },
  carpoolAccepted: (name: string | undefined) => ({ fr: `${name ?? someone.fr} t’a accepté·e : son numéro est dans l’annonce.`, nl: `${name ?? someone.nl} heeft je geaccepteerd: het nummer staat in het zoekertje.`, en: `${name ?? someone.en} accepted you: their number is in the listing.` }),
  carpoolRefused: (name: string | undefined) => ({ fr: `${name ?? someone.fr} n’a plus de place pour toi.`, nl: `${name ?? someone.nl} heeft geen plaats meer voor je.`, en: `${name ?? someone.en} has no room for you.` }),
  carpoolCancelled: (name: string | undefined) => ({ fr: `${name ?? someone.fr} a supprimé son annonce de covoiturage.`, nl: `${name ?? someone.nl} heeft het carpoolzoekertje verwijderd.`, en: `${name ?? someone.en} removed their carpool listing.` }),
  carpoolWithdrawn: (name: string | undefined) => ({ fr: `${name ?? someone.fr} a annulé sa demande.`, nl: `${name ?? someone.nl} heeft het verzoek geannuleerd.`, en: `${name ?? someone.en} cancelled their request.` }),
  carpoolReply: (name: string | undefined) => ({ fr: `${name ?? someone.fr} a répondu à ton annonce.`, nl: `${name ?? someone.nl} heeft op je zoekertje gereageerd.`, en: `${name ?? someone.en} replied to your listing.` }),
};
