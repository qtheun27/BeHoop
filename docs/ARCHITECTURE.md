# BeHoop Social — Architecture (lot 0)

## Constat de l'audit
- **Site public** : `index.html` autonome (JS inline) + `sw.js` + `manifest.json`, servis par GitHub Pages depuis la racine de `main` (domaine `behoop.be` via `CNAME`).
- **Scraper** : `scraper.py`, lancé par `.github/workflows/update.yml` (6 h et 18 h), écrit `data.json` (~27 Mo : clubs, équipes avec `category` du type `PU12HM A`, séries, classements, ~28 000 matchs) et `calendars/team-*.ics`.
- **Espace Club** `/club/` : Firebase (`basket-awbb-club`), collections `users`, `teams`, `players`, `trainings`, `plays`, `invitations`. **Non modifié.**
- ⚠️ **Collision** : `users` et `teams` existent déjà côté Club → la couche sociale utilise `profiles` (au lieu de `users`) et `teamInfo` (au lieu de `teams`). Les autres noms du cahier des charges sont conservés.
- ⚠️ Les règles Firestore du Club ne sont pas dans le dépôt : `firestore.rules` ne contient que la partie sociale et **doit être fusionné** avant tout déploiement (voir `A_FAIRE_QUENTIN.md`).

## Intégration sans casser le site
| Élément | Choix |
|---|---|
| Appli | Vite + React 18 + TypeScript strict dans `web/`, **compilée dans `/app/`** (servie à `behoop.be/app/`). Routage par hash (`/app/#/fil`) : aucune réécriture d'URL nécessaire sur GitHub Pages. |
| Site actuel | Inchangé. Seul ajout : un bandeau discret « Crée ton compte pour suivre tes clubs » (script de 20 lignes en bas de `index.html`) pointant vers `/app/`. |
| Données pour l'appli | `ops/build-app-data.ts` découpe `data.json` en `app-data/index.json` (clubs + équipes + Jeunes/Seniors, ~400 Ko) et `app-data/clubs/{id}.json` (matchs du club). Ajouté comme **étape supplémentaire** de `update.yml` après le scraper ; `scraper.py` n'est pas modifié. |
| Planches | `web/render/planche.html` (même build) → `behoop.be/app/render/planche.html?…&t=…`. Sert au rendu vidéo **et** à l'aperçu en direct. |
| Build / déploiement | `.github/workflows/app.yml` : à chaque push touchant `web/` ou `shared/`, tests + build + commit de `/app/`. Pages continue de servir la branche `main` telle quelle (pas de bascule vers « GitHub Actions » comme source Pages = zéro risque). |
| PWA | Manifest et service worker propres à `/app/` (scope `/app/`) ; le `sw.js` racine n'est pas touché. |

## Arborescence ajoutée
```
shared/      logique pure partagée (Jeunes/Seniors, quarts, scores, chapitres, FFmpeg) + tests Vitest
web/         appli React (onglets Fil, Explorer, Publier, Matchs, Profil, modération, légal) + planches
worker/      Cloudflare Worker (api.behoop.be + media.behoop.be) : jose, Firestore REST, R2, GitHub dispatch
ops/         scripts Node : build-app-data, sync-scores (posts automatiques), notify (FCM), render (montage), seed-demo
firestore.rules, firestore.indexes.json, firebase.json   (émulateur + tests de règles)
.github/workflows/ app.yml · tests.yml · render.yml · notify.yml · moment.yml ; update.yml (+2 étapes)
```

## Flux principaux
- **Auth** : Firebase Auth (Google + lien magique + mot de passe). Le Worker vérifie l'ID token (`jose`, JWKS Google).
- **Posts score** : `ops/sync-scores.ts` (après le scraper) → `posts/score-{idMatchAWBB}` (idempotent, écrit par le compte de service).
- **Médias** : navigateur → R2 en multipart S3 pré-signé (`aws4fetch` dans le Worker), état d'envoi en IndexedDB, reprise automatique.
- **Montage** : Worker crée `renderJobs/{id}` → `workflow_dispatch` de `render.yml` → Playwright capture les planches à 30 i/s, FFmpeg normalise/assemble/HLS → R2 → Firestore + FCM.
- **Lecture** : `media.behoop.be/v/{id}/…` vérifie un cookie HMAC 6 h délivré après contrôle Firebase (membre 🔒 pour les Jeunes).
- **Notifications** : `notify.yml` (cron 30 min, dépôt public = minutes gratuites) envoie « Match dans 2 h » / « Résultat final » ; le Worker et le pipeline envoient les autres.

## Décisions et limites
- Pas de framework UI lourd : CSS maison (variables, clair/sombre, style iOS) pour rester < 150 Ko JS gzip hors Firebase.
- Firestore : listeners ciblés, fil paginé par 15, requête `posts where teamIds array-contains-any [≤30 suivis]`.
- Les tests de règles tournent sur l'émulateur dans GitHub Actions (`tests.yml`) : Java n'est pas installé sur ce Mac.
- Mode démo (`?demo=1` ou absence de config) : l'appli tourne sans Firebase avec des données locales, pour tester l'interface tout de suite.
