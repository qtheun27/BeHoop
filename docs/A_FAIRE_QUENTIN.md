# À faire par Quentin — mise en service

✅ **Mise en service terminée** (19/10/2026) : l'appli tourne en production sur **behoop.be/app/**.

## ✅ Commentaires et réactions — 20/10/2026
Rien à faire : les **règles** Firestore se publient toutes seules à chaque modification (workflow « Règles et index Firestore — publication »).

## ✅ Appli en 3 langues (FR · NL · EN) — fait le 20/10/2026
Le secret GitHub `CLOUDFLARE_API_TOKEN` est en place : le Worker se redéploie tout seul à chaque modification (workflow « Worker media.behoop.be — déploiement »).

## ✅ Compétitions européennes et internationales — 20/10/2026
Rien à faire : EuroLeague, EuroCup, WNBA, Champions League, FIBA Europe Cup, EuroLeague Women, EuroCup Women, qualifications de la Coupe du monde 2027, Coupe du monde féminine 2026 et EuroBasket féminin 2027 (avec ses qualifications) se mettent à jour toutes seules, avec le classement officiel de chaque organisateur.
ℹ️ Les épreuves d'équipes nationales ont une adresse par édition (`FIBA_EVENTS` dans `ops/pro.ts`) : quand une nouvelle édition démarre (qualifications de l'EuroBasket 2029, JO de Los Angeles 2028…), il suffit de demander à Claude de l'ajouter.

## Historique de la mise en service
Le détail clic par clic de chaque étape reste dans **[SETUP.md](SETUP.md)** (même numérotation), utile pour refaire une configuration.

| # | Action | Où | État |
|---|---|---|---|
| 1 | Publier les règles Firestore (fusionnées avec celles de l'Espace Club dans `firestore.rules`) | Console Firebase → Firestore → Règles | ✅ |
| 2 | Créer les index Firestore | `npx firebase deploy --only firestore:indexes` | ✅ |
| 3 | Google et E-mail (lien + mot de passe) dans Authentication, `behoop.be` dans les domaines autorisés | Console Firebase → Authentication | ✅ |
| 4 | Clé de compte de service Firebase | Console Firebase → Comptes de service | ✅ |
| 5 | Secret GitHub `FIREBASE_SERVICE_ACCOUNT` | GitHub → Secrets | ✅ |
| 6 | Cloud Messaging + clé VAPID en variable GitHub `FCM_VAPID_KEY` | Firebase / GitHub → Variables | ✅ |
| 7 | Bucket R2 `behoop-media` (juridiction UE) + CORS + clés API | Cloudflare → R2 | ✅ |
| 8 | Secrets GitHub `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | GitHub → Secrets | ✅ |
| 9 | Jeton GitHub « fine-grained » (Actions : écriture) | GitHub → Developer settings | ✅ |
| 10 | Worker déployé + secrets, domaine `media.behoop.be` | `npx wrangler …` | ✅ |
| 11 | Variable GitHub `WORKER_URL` = `https://media.behoop.be` | GitHub → Variables | ✅ |
| 12 | Responsable de la première Équipe 🔒 | behoop.be/app → Modération | ✅ |
| 13 | Relecture des pages légales (CGU, confidentialité, charte) | `web/src/screens/Legal.tsx` | ✅ |
| 14 | *(Optionnel)* Secret Worker `ANTHROPIC_API_KEY` (lecture du score sur photo) | console.anthropic.com | ✅ |
| 15 | *(Optionnel)* Secret Worker `SUPER_ADMIN_UID` | Console Firebase → Authentication | ✅ |

ℹ️ L'ancien bandeau « Crée ton compte » du site public (`"banner"` dans `web/public/config.json`) a été remplacé par la carte de présentation « Créer mon compte / J'ai déjà un compte » sous la recherche de `index.html` : ce réglage n'est plus utilisé.
