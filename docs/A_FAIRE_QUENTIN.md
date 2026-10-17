# À faire par Quentin — dans cet ordre

Tout le code est prêt et testé ; ces étapes demandent tes comptes (Firebase, Cloudflare, GitHub). Compte ~1 h 30 en tout.
Le détail clic par clic de chaque étape est dans **[SETUP.md](SETUP.md)** (même numérotation).

| # | Action | Où | Pourquoi | Bloquant pour |
|---|---|---|---|---|
| 1 | **Fusionner les règles Firestore** avec celles de l'Espace Club, puis les publier | Console Firebase → Firestore → Règles | Le projet `basket-awbb-club` n'a qu'un seul fichier de règles : publier `firestore.rules` tel quel **casserait l'Espace Club**. | Tout (comptes, fil) |
| 2 | Créer les **index Firestore** | Terminal (`npx firebase deploy --only firestore:indexes`) ou liens d'erreur | Requêtes du fil, des publications, des signalements | Fil, Profil |
| 3 | Vérifier **Google** et **E-mail (lien + mot de passe)** dans Authentication, et `behoop.be` dans les domaines autorisés | Console Firebase → Authentication | Connexion | Comptes |
| 4 | Créer une **clé de compte de service** Firebase (fichier JSON) | Console Firebase → Paramètres → Comptes de service | Cartes de score automatiques, Worker, montage | Fil auto, vidéo |
| 5 | Ajouter le **secret GitHub** `FIREBASE_SERVICE_ACCOUNT` | GitHub → Settings → Secrets → Actions | Le scraper crée les cartes de score | Fil auto |
| 6 | Activer **Cloud Messaging** et générer la **clé VAPID** ; l'ajouter en *variable* GitHub `FCM_VAPID_KEY` | Console Firebase → Cloud Messaging ; GitHub → Variables | Notifications | Notifications |
| 7 | Créer le **bucket R2** `behoop-media` + règle **CORS** + **clés API R2** | Cloudflare → R2 | Stockage des photos/vidéos | Photos, vidéo |
| 8 | Ajouter les **secrets GitHub** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | GitHub → Secrets | Montage et purge | Vidéo |
| 9 | Créer un **jeton GitHub** « fine-grained » (Actions : écriture) sur `qtheun27/BeHoop` | GitHub → Settings → Developer settings | Le Worker lance le montage | Vidéo |
| 10 | **Déployer le Worker** + ses secrets, et brancher le domaine `media.behoop.be` | Terminal (`npx wrangler …`) | API + lecture protégée | Photos, vidéo |
| 11 | Ajouter la *variable* GitHub `WORKER_URL` = `https://media.behoop.be` puis relancer le workflow « Appli BeHoop » | GitHub → Variables / Actions | L'appli publiée pointe vers le Worker | — |
| 12 | Te nommer **responsable** de la première Équipe 🔒 (Console de modération → Équipes) | behoop.be/app | Valider les demandes des parents | Équipes 🔒 |
| 13 | **Relire les pages légales** (CGU, confidentialité, charte) marquées « Brouillon » | `web/src/screens/Legal.tsx` | Conformité RGPD | Ouverture publique |
| 13 bis | **Activer le bandeau** « Crée ton compte » sur le site public : passer `"banner": true` dans `web/public/config.json` (ou me le demander) | GitHub | Le bandeau reste masqué tant que l'appli n'est pas configurée | — |
| 14 | *(Optionnel)* Secret Worker `ANTHROPIC_API_KEY` | console.anthropic.com | Lecture auto du score sur photo de tableau | — |
| 15 | *(Optionnel)* Secret Worker `SUPER_ADMIN_UID` (ton uid Firebase) | Console Firebase → Authentication | Notification « contenu retiré par un parent » | — |

✅ Déjà fait automatiquement : le site public est inchangé (le bandeau discret « Crée ton compte » est prêt mais masqué jusqu'à l'étape 13 bis), l'appli est publiée à **behoop.be/app/**, les tests tournent dans GitHub Actions.
