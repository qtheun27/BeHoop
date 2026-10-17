# Mise en service — pas à pas (sans être développeur)

> Garde ce document ouvert à côté de ton navigateur. Chaque étape correspond à une ligne de `A_FAIRE_QUENTIN.md`.
> Pour les commandes « Terminal » : ouvre le Terminal du Mac, puis `cd ~/BeHoop` (dossier du dépôt cloné).

## 1. Règles Firestore (⚠️ important)
1. Console Firebase → projet **basket-awbb-club** → **Firestore Database** → onglet **Règles**.
2. Copie les règles actuelles (celles de l'Espace Club) dans un fichier de sauvegarde.
3. Ouvre `firestore.rules` du dépôt. Colle **à l'intérieur** du bloc `match /databases/{database}/documents { … }` des règles existantes tout ce qui se trouve entre `// ---------- Profils` et `match /notifLog/{id} { allow read, write: if false; }` (inclus), ainsi que les fonctions du début (`signedIn`, `uid`, `isAdmin`, …) si elles n'existent pas déjà sous un autre nom.
   Les collections sociales (`profiles`, `follows`, `teamInfo`, `teamMembers`, `posts`, `reports`, `matchVideos`, `renderJobs`, `liveScores`, `moments`, `momentVotes`, `carpools`, `notifLog`, `legalAcceptances`) n'existent pas côté Club : il n'y a pas de conflit.
4. Clique **Publier**. Vérifie que l'Espace Club fonctionne toujours (connexion coach/parent).
   Astuce : tu peux me redemander de faire la fusion si tu me colles les règles actuelles.

## 2. Index Firestore
Terminal : `npx firebase login` puis `npx firebase deploy --only firestore:indexes --project basket-awbb-club`.
(Sinon : à la première ouverture du fil, la console du navigateur affiche un lien « create index » — clique dessus.)

## 3. Connexion
Console Firebase → **Authentication** → **Sign-in method** : active **Google** et **E-mail/Mot de passe** avec **Lien par e-mail (connexion sans mot de passe)**.
Onglet **Settings → Authorized domains** : vérifie que `behoop.be` est présent (sinon **Add domain**).

## 4. Compte de service
Console Firebase → ⚙️ **Paramètres du projet** → **Comptes de service** → **Générer une nouvelle clé privée** → un fichier `.json` se télécharge.
⚠️ Ne le mets jamais dans le dépôt ni dans un e-mail. Range-le dans ton gestionnaire de mots de passe.

## 5. Secret GitHub du compte de service
GitHub → dépôt **BeHoop** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
Nom : `FIREBASE_SERVICE_ACCOUNT` — Valeur : tout le contenu du fichier `.json` (ouvre-le avec TextEdit, copie tout).
→ Au prochain passage du scraper (6 h / 18 h), les cartes de score apparaîtront dans les fils.

## 6. Notifications (FCM)
Console Firebase → ⚙️ Paramètres → **Cloud Messaging** → section **Web Push certificates** → **Generate key pair** → copie la clé.
GitHub → Settings → Secrets and variables → Actions → onglet **Variables** → **New variable** : `FCM_VAPID_KEY` = la clé.
Sur iPhone, les notifications web demandent d'**ajouter BeHoop à l'écran d'accueil** (voir « Tester sur ton téléphone »).

## 7. Bucket Cloudflare R2
1. dash.cloudflare.com → **R2** → (active R2 : offre gratuite, une carte peut être demandée) → **Create bucket** : `behoop-media`, région automatique.
2. Bucket → **Settings** → **CORS Policy** → **Add** et colle :
```json
[{ "AllowedOrigins": ["https://behoop.be", "https://www.behoop.be", "http://localhost:5173"],
   "AllowedMethods": ["PUT", "GET", "HEAD"], "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
```
3. R2 → **Manage R2 API Tokens** → **Create API token** → permission **Object Read & Write**, limité au bucket `behoop-media` → note **Access Key ID**, **Secret Access Key** et l'**Account ID** (affiché sur la page R2).

## 8. Secrets GitHub R2
Comme à l'étape 5, crée : `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (= `behoop-media`).

## 9. Jeton GitHub pour le Worker
GitHub → photo de profil → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
Nom `behoop-worker`, expiration 1 an, **Only select repositories** → `qtheun27/BeHoop`, **Repository permissions → Actions : Read and write**. Copie le jeton (`github_pat_…`).

## 10. Déployer le Worker (media.behoop.be)
Prérequis : le domaine `behoop.be` doit être géré par Cloudflare (DNS). Si ce n'est pas le cas, dis-le-moi : on utilisera l'adresse `behoop-media.<ton-compte>.workers.dev` à la place.
Terminal :
```bash
cd ~/BeHoop
npx wrangler login
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT --config worker/wrangler.toml
npx wrangler secret put GITHUB_TOKEN --config worker/wrangler.toml
npx wrangler secret put R2_ACCOUNT_ID --config worker/wrangler.toml
npx wrangler secret put R2_ACCESS_KEY_ID --config worker/wrangler.toml
npx wrangler secret put R2_SECRET_ACCESS_KEY --config worker/wrangler.toml
npx wrangler secret put MEDIA_COOKIE_SECRET --config worker/wrangler.toml
npx wrangler secret put RENDER_SECRET --config worker/wrangler.toml
npm run worker:deploy
```
Pour `MEDIA_COOKIE_SECRET` et `RENDER_SECRET`, invente deux longues phrases aléatoires différentes (ou génère-les : `openssl rand -hex 32`).
Le domaine `media.behoop.be` est créé automatiquement (ligne `custom_domain` de `worker/wrangler.toml`).
Vérification : ouvre https://media.behoop.be → la page doit afficher « BeHoop media ».

## 11. Brancher l'appli sur le Worker
GitHub → Variables : `WORKER_URL` = `https://media.behoop.be`. Puis **Actions** → « Appli BeHoop — tests et build » → **Run workflow**.

## 12. Premier responsable d'Équipe
Connecte-toi sur behoop.be/app avec `q.theuninck@gmail.com` → Profil → **Console de modération** → **Équipes** → cherche l'équipe → colle l'identifiant (uid) du responsable (visible dans Firebase → Authentication) → **Nommer**.

## 13. Pages légales
Relis les textes dans `web/src/screens/Legal.tsx` (ou sur behoop.be/app → Profil). Dis-moi ce qu'il faut changer.

## 14–15. Optionnel
`npx wrangler secret put ANTHROPIC_API_KEY --config worker/wrangler.toml` (clé sur console.anthropic.com) ;
`npx wrangler secret put SUPER_ADMIN_UID --config worker/wrangler.toml` (ton uid).

---

## Développement local (pour info)
```bash
npm install
npm run emulators            # terminal 1 : émulateur Firebase (Java requis)
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed:demo   # terminal 2 : match test
VITE_USE_EMULATOR=1 npm run dev                             # puis http://localhost:5173/app/
```
Comptes de test : `ops/fixtures/demo-users.json`. Tests : `npm test`, `npm run test:rules`, `npm run test:e2e`.
Rendu vidéo local : `npx tsx ops/render/demo-job.ts && npm run build && npm run render:local -- out/demo-job`.
