// Mini-basket (U6 à U13) : la fédération ne publie ni résultats ni classements. BeHoop montre les scores encodés par les
// clubs et un classement calculé aux membres connectés seulement ; les visiteurs voient le calendrier.
// Même règle pour la génération des données (ops/build-app-data.ts) et pour l'appli.
// Noms reconnus : « U12 Mixte A », « Provincial U10 - Série A », « U12HM G », « PU12HM », « Jongens U12 », « Benjamins ».
export const MINI = /(?:^|[^a-z0-9])[a-z]{0,3}u\s?-?(?:6|7|8|9|10|11|12|13)(?!\d)|\b(?:benjamins?|pupil(?:len)?|poussins?)\b/i;
/** Série (ou compétition, nom de série d'un match) de mini-basket */
export const isMini = (serieName: string | null | undefined) => MINI.test(serieName ?? '');
