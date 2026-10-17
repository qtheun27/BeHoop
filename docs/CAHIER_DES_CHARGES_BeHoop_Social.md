# Cahier des charges — BeHoop Social & Montage vidéo de match
**Version 2 — 17/10/2026** · remplace le cahier « MatchReel »

> Document destiné à Claude Code. Lis-le en entier, **puis analyse le dépôt existant `qtheun27/BeHoop`** (site public, scraper Python, dossier `/club/`) avant d'écrire du code. Réalise le projet **lot par lot** (§14) en validant les critères d'acceptation de chaque lot. Interface **100 % en français**. Pose-moi les questions bloquantes avant de commencer ; pour le reste, fais des choix raisonnables et documente-les dans `docs/ARCHITECTURE.md`.

---

## 1. Contexte

**BeHoop** (behoop.be) est mon site basket : un scraper Python (GitHub Actions, 2×/jour) récupère clubs, calendriers, classements et coupes des 5 provinces AWBB dans un `data.json` national ; le site est hébergé sur **GitHub Pages**, installable (PWA), avec abonnement `.ics` par équipe. Un **Espace Club** (Firebase, 5 rôles) est en construction dans `/club/` — **ne pas y toucher**, il est hors périmètre.

**Objectif** : ajouter à BeHoop
1. une **couche sociale** : avec un compte, on suit des clubs/équipes et on a un **fil d'actualité basket** ;
2. le **montage vidéo automatique de match** : on envoie ses vidéos/photos depuis le téléphone, BeHoop produit une vidéo montée avec planches animées, lisible en streaming dans l'appli ;
3. des fonctionnalités basket sympas (score en direct, Moments, covoiturage…).

Projet perso : **coût mensuel quasi nul**, mais **expérience utilisateur excellente**, intuitive, design moderne façon Apple.

---

## 2. Stack imposée (coût ≈ 0 €)

| Rôle | Techno |
|---|---|
| Front (site + appli) | **GitHub Pages** sur behoop.be, build statique (Vite + TypeScript ; React recommandé — vérifier la compatibilité avec le site existant et proposer la stratégie d'intégration avant de coder) |
| Comptes | **Firebase Auth** (projet existant `basket-awbb-club`) — **Google + e-mail** (lien magique et/ou mot de passe). **Pas de connexion Apple** pour l'instant |
| Données sociales, temps réel | **Cloud Firestore** (même projet Firebase) |
| Notifications | **Firebase Cloud Messaging** (Web Push) |
| API serveur | **Cloudflare Workers** (offre gratuite) : URLs d'envoi signées, contrôle d'accès vidéo, déclenchement des rendus, envoi des notifications. Vérifie les jetons Firebase (`jose` + clés publiques Google) et parle à Firestore via l'API REST avec un compte de service |
| Stockage vidéo/photo | **Cloudflare R2** (rushes temporaires + vidéos finales + photos). Diffusion gratuite |
| Montage vidéo | **GitHub Actions** (FFmpeg + Playwright) dans le dépôt BeHoop |

**Interdits** : YouTube/Vimeo, Firebase Storage pour les vidéos (trafic facturé), services de montage payants, serveur/VPS, Lovable, Supabase, Vercel.
Rester dans les quotas gratuits Firestore (lectures paginées, listeners ciblés, pas de requêtes globales en boucle).

---

## 3. Principes UX / design

- **Style Apple / iOS** : grands titres qui se réduisent au scroll, **barre d'onglets en bas**, feuilles modales qui montent du bas (« sheets »), flou d'arrière-plan (`backdrop-filter`), coins arrondis généreux, animations douces (ressort), retour haptique (`navigator.vibrate`) sur Android.
- **Thème clair et sombre automatiques**, police système (`-apple-system, SF Pro, Inter` en repli), beaucoup d'espace, **une seule action principale par écran**.
- Mobile d'abord, utilisable d'une main, cibles ≥ 44 px, contrastes AA.
- États vides illustrés, squelettes de chargement, erreurs claires avec bouton « Réessayer ». Pas de jargon.
- Optimistic UI (réactions, suivis instantanés).
- Les **planches, cartes de score et vidéos** gardent le style **sombre et sportif** défini au §8 : c'est l'identité visuelle de BeHoop dans le fil.
- Performances : Lighthouse mobile ≥ 90 ; premier affichage du fil < 1,5 s en 4G.

---

## 4. Structure de l'appli

```
behoop.be
├── SANS COMPTE → site public actuel (clubs, calendriers, classements, coupes)
│                 + bandeau discret « Crée ton compte pour suivre tes clubs »
│
└── AVEC COMPTE → barre d'onglets
    🏠 Fil        posts des clubs/équipes suivis
    🔍 Explorer   contenu public BeHoop + pages Club / Équipe
    ➕ Publier    photo/message · Montage de match
    📅 Matchs     mes prochains matchs · score en direct · covoiturage
    👤 Profil     suivis · mes Équipes 🔒 · demandes à valider · réglages
```

- Les pages publiques existantes restent accessibles et indexables sans compte.
- Connexion/inscription en **sheet** déclenchée par une action (« Suivre », « Réagir », « Publier »), puis retour à l'action.
- **Onboarding** après inscription (3 écrans max) : choisir ses clubs → ses équipes → autoriser les notifications.

---

## 5. Comptes, rôles et visibilité

### 5.1 Comptes
- Inscription Google ou e-mail. **Âge minimum 13 ans** (case à cocher déclarative à l'inscription).
- Profil : prénom + initiale du nom affichés (ex. « Quentin T. »), avatar optionnel.
- Suppression du compte et de ses données depuis Profil (RGPD).

### 5.2 Rôles
- **Utilisateur** : suit, réagit, publie.
- **Responsable d'Équipe** : valide les demandes d'accès à une Équipe 🔒, peut masquer un contenu de cette équipe, peut nommer d'autres responsables.
- **Super admin** (moi, `q.theuninck@gmail.com`) : tout, + console de modération.

### 5.3 Visibilité — règle automatique
Chaque équipe AWBB a une catégorie (récupérée par le scraper). Le système classe chaque équipe **Jeunes** ou **Seniors** via une table de correspondance (U6…U21, Benjamins, Pupilles, Minimes, Cadets, Juniors… → Jeunes ; Seniors/Dames/Messieurs/Régionale/Provinciale → Seniors). **Catégorie inconnue → Jeunes** (par sécurité). Le super admin peut corriger la classification.

| Contenu | Qui publie | Qui voit |
|---|---|---|
| Cartes de score, résultats, messages texte, réactions | Tout compte | **Tout le monde** (compte connecté pour le fil) |
| Photos/vidéos d'une équipe **Seniors** | Tout compte | **Tout le monde** |
| Photos/vidéos d'une équipe **Jeunes** | Membres de l'**Équipe 🔒** | **Membres de l'Équipe 🔒 uniquement** |

Impossible de publier une photo/vidéo de jeunes en public : la visibilité est déduite de l'équipe liée, pas choisie.

### 5.4 Équipe 🔒 (groupe privé par équipe jeunes)
- Bouton « Demander à rejoindre » sur la page Équipe (avec message optionnel « Je suis le papa de… »).
- Le(s) **responsable(s)** acceptent ou refusent (notification + liste dans Profil). Le premier responsable d'une équipe est nommé par le super admin (ou : le premier membre accepté par le super admin).
- Un membre voit et publie les photos/vidéos 🔒 de l'équipe ; il peut quitter l'Équipe. Un responsable peut retirer un membre.

### 5.5 Garde-fous (obligatoires dès la V1)
- À la publication d'un média Jeunes : case « Je publie pour les membres de l'équipe et je retirerai ce contenu si un parent le demande ».
- Sur chaque média Jeunes : bouton **« Je suis parent — retirer ce contenu »** → masquage **immédiat**, notification au super admin et à l'auteur, réactivation possible par le super admin.
- Bouton **Signaler** sur toute publication (motifs prédéfinis) → file de modération.
- Pas de téléchargement des médias Jeunes ; lecture uniquement via le Worker qui vérifie l'appartenance.
- Pages légales simples et lisibles : **Conditions d'utilisation**, **Politique de confidentialité** (RGPD : données collectées, durée, droits, contact), **Charte** (respect, pas de moquerie envers les joueurs, pas de publication d'enfants sans accord). Brouillons fournis par Claude Code, marqués « à relire ».
- Console de modération (super admin) : signalements, contenus masqués, bannissement d'un compte, gestion des responsables, correction Jeunes/Seniors.

---

## 6. Fonctionnalités — V1

### 6.1 Suivre
Bouton « Suivre » sur les pages Club et Équipe (Explorer). Suivre un club = suivre toutes ses équipes (désactivables une à une). Liste dans Profil.

### 6.2 🏠 Fil
Flux chronologique (plus récent en haut, pull-to-refresh, pagination infinie) des posts liés aux clubs/équipes suivis. Types de posts :
- **Carte de score automatique** : à chaque nouveau résultat détecté par le scraper, un post est créé automatiquement (logos, noms, score, date, compétition) au **style des planches** (§8). Composant HTML rendu à partir des données (pas d'image), avec bouton « Partager » qui génère une image 1080×1350 (canvas) pour WhatsApp.
- **Vidéo de match** (lecteur §9, vignette + durée + score).
- **Photo(s)** (carrousel, 10 max) et **message** (texte 500 caractères max, lié à une équipe ou un club).
- **Réactions** : 🏀 🔥 👏 (une par personne et par post, compteur). Pas de commentaires en V1/V2.
- Badge 🔒 sur les contenus privés d'Équipe.

### 6.3 ➕ Publier
Sheet avec deux choix :
1. **Photo / message** : choisir l'équipe ou le club concerné (suggestions : équipes suivies), texte, photos (compressées côté client en 2048 px, envoi direct sur R2).
2. **Montage de match** (§7).

### 6.4 📅 Matchs
Prochains matchs des équipes suivies (aujourd'hui / cette semaine / plus tard) : heure, salle, bouton **Itinéraire** (lien Google/Apple Maps), **Ajouter au calendrier** (.ics existant). Matchs passés avec score et lien vers la vidéo si elle existe.

### 6.5 🔔 Notifications (FCM, réglables par type dans Profil)
« Match dans 2 h », « Résultat final », « Nouvelle vidéo de [équipe] », « Ta vidéo est prête », « Demande d'accès à l'Équipe », « Ta demande est acceptée ». Regroupement pour éviter le spam (max 1 notif par équipe et par heure, sauf « vidéo prête »).

### 6.6 👤 Profil
Clubs/équipes suivis, mes Équipes 🔒, demandes à valider (responsables), mes publications, réglages notifications, thème, pages légales, déconnexion, suppression du compte. Lien « Espace Club » **masqué** tant que l'Espace Club n'est pas prêt.

---

## 7. Montage de match (V1)

### 7.1 Parcours (➕ → Montage de match)
1. **Choisir le match** dans le calendrier BeHoop (matchs récents des équipes suivies en premier, recherche). Tout est **prérempli** depuis `data.json` : équipes, logos, date, heure, salle, compétition, score final si déjà connu.
2. **Ajouter les vidéos et photos** depuis la galerie (sélection multiple).
3. **Vérifier** (écran clé) : tout est modifiable avant le montage, avec **aperçu en direct des planches** :
   - nom affiché de chaque équipe (ex. « Union Mons Hainaut » au lieu du nom officiel),
   - logo de chaque équipe (remplacer par une image, recadrage carré),
   - couleurs des équipes (pré-détectées depuis le logo, modifiables),
   - date, heure, lieu,
   - scores cumulés de fin de Q1, Q2, Q3 et final (gros boutons + / −, saisie directe),
   - **titre de la vidéo** (par défaut « BC AMLL vs Union Mons Hainaut — 10/10/2026 »),
   - répartition des médias par quart (voir 7.3) et choix des photos des planches.
   Les modifications de noms/logos/couleurs peuvent être mémorisées pour les prochains matchs de cette équipe (case « Toujours utiliser pour cette équipe »).
4. **Générer** → écran de suivi (étapes + %), temps réel via Firestore. Notification « Ta vidéo est prête ».
5. La vidéo est publiée dans le fil de l'équipe (🔒 si Jeunes). L'auteur peut la régénérer (nouvelle version) ou la supprimer.

### 7.2 Envoi des médias
- Envoi **direct navigateur → R2** en **multipart S3** (parties de 10 Mo, 3 en parallèle) avec URLs pré-signées délivrées par le Worker (auth Firebase obligatoire). Reprise automatique après coupure réseau, verrouillage d'écran ou réouverture de l'appli (état en IndexedDB).
- Volume typique : **5 à 7 Go par match**, fichiers jusqu'à ~2 Go, iPhone HEVC/H.264 1080p.
- Barre de progression par fichier et globale, Wake Lock pendant l'envoi, message « Garde BeHoop ouvert pendant l'envoi ».
- Formats : `.mov .mp4 .m4v .heic .heif .jpg .jpeg .png .webp`. Photos HEIC converties côté client si possible, sinon dans le pipeline.
- Lecture des métadonnées côté client (date de prise de vue via `exifr` / `creationdate` QuickTime, durée, dimensions) + vignette générée côté client.

### 7.3 Classement automatique par quart-temps
- Tri par date de prise de vue.
- Une photo de **tableau d'affichage** peut être marquée « fin du quart N » → borne. Sans bornes : découpage aux **3 plus grands écarts de temps** entre médias consécutifs.
- Écran de réorganisation : 4 onglets Q1–Q4, vignettes, déplacer/exclure/réordonner (glisser-déposer + boutons), marquer une photo « hors jeu » (exclue des mosaïques : huddle, banc, tableau). Photo vedette par quart.
- **Lecture auto du score** (optionnelle) : sur une photo marquée tableau, appel à l'API Claude (vision) via le Worker (`ANTHROPIC_API_KEY`) → pré-remplissage, toujours confirmé par l'utilisateur. L'appli fonctionne sans.

### 7.4 Pipeline de rendu (GitHub Actions `render.yml`)
Déclenchement : le Worker crée un document `renderJobs/{id}` puis appelle `workflow_dispatch` (token GitHub fine-grained, Actions: write, stocké en secret Worker). `concurrency` par match, `timeout-minutes: 120`.

1. Installer FFmpeg, Node, Playwright Chromium (avec cache).
2. Lire match, médias, réglages (Firestore via compte de service).
3. **Planches animées** (§8) : la page `/render/planche.html?match=…&type=…&t=…` affiche l'état de l'animation à l'instant `t` (animations pilotées par le temps, Web Animations API en pause + `currentTime`, aucune animation dépendante de l'horloge réelle). Capturer **30 images/s** en 1920×1080 → assembler en clip H.264 avec FFmpeg. Durées : avant-match 6 s, fin de quart 5 s, fin de match 8 s.
4. **Clips** : pour chaque vidéo, dans l'ordre, télécharger depuis R2, **normaliser**, supprimer l'original (disque runner ~14 Go) :
   `ffmpeg -i in -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p" -c:v libx264 -preset veryfast -crf 21 -c:a aac -b:a 128k -ar 48000 -ac 2 norm_N.mp4`
   Gérer HEVC, rotation, fréquence variable, absence de piste audio (ajouter silence), vidéos verticales (fond flou de la même vidéo).
5. **Transitions** :
   - **Planche ↔ vidéo : « vague aux couleurs des clubs »** — deux bandes diagonales (115°, couleur équipe domicile puis équipe visiteuse, bande fine de séparation) balaient l'écran de gauche à droite en 0,3 s, couvrent entièrement l'image, la coupe se fait à ce moment, puis elles sortent en 0,3 s en révélant la séquence suivante. Rendue en séquence PNG avec transparence par Playwright (même page, type `wipe`) puis superposée avec FFmpeg (`overlay`) à chaque jonction.
   - **Vidéo ↔ vidéo** dans un même quart : fondu enchaîné de 0,25 s (`xfade`).
   - Audio : fondu de 0,2 s à chaque jonction ; « whoosh » léger (son libre de droits fourni dans `render/assets/`) sur la vague.
6. **Assemblage** : avant-match → Q1 → fin Q1 → Q2 → fin Q2 → Q3 → fin Q3 → Q4 → fin de match.
7. **Chapitres** `chapters.vtt` (Avant-match, Q1, Q2, Q3, Q4, Fin) depuis les durées cumulées.
8. **HLS** : 1080p (~4,5 Mb/s) + 720p (~2,5 Mb/s), segments de 6 s, `master.m3u8`, `poster.jpg`. Pas de MP4 téléchargeable pour les Jeunes ; MP4 720p optionnel pour les Seniors.
9. **Upload R2** sous `videos/{matchVideoId}/v{n}/…` avec les bons `Content-Type`.
10. Mise à jour Firestore (statut, durée, chapitres, chemins) → création/mise à jour du post dans le fil → notification FCM.
11. **Purge des rushes vidéo** sur R2 après succès (délai 48 h pour permettre une régénération). Les photos sont conservées (2048 px) pour la galerie.
12. Progression (`progress` 0–100, `step` en français) à chaque étape ; en cas d'erreur : message lisible + lien vers le run GitHub, bouton « Relancer ».

Cible : < 40 min de runner pour 1 h de rushes. Taille finale visée : 1,5–2,5 Go par match.

---

## 8. Design des planches (identique au rendu du 17/10/2026)

Référence : `docs/planches_reference.html` + 5 PNG d'exemple (`docs/planches/`). **Reproduire fidèlement**, puis ajouter les animations.

- Canvas 1920×1080, fond `#0a0c12`, grain léger, tracé discret du terrain (rond central + ligne médiane, 7 %).
- Bandes diagonales 115° aux couleurs des deux équipes.
- Polices **Anton** (titres/chiffres) et **Oswald 600/700** (libellés), auto-hébergées (`@fontsource`).
- Or `#f2c14e` pour le score de l'équipe qui mène et les surtitres.
- Logos dans un **disque blanc** avec liseré couleur équipe.

Les 5 planches :
1. **Avant-match** : photo floutée/assombrie en fond, logos 330 px face à face, « VS » italique en dégradé, noms, « LOCAUX/VISITEURS », bandeau date (blanc) + heure (couleur équipe), surtitre « Avant-match · Basket », titre « Jour de match ».
2–4. **Fin du Nᵉ quart** : panneau gauche 700 px (« Fin du / 1ᵉʳ quart », logo + nom + score cumulé ×2, « Score du quart-temps x – y »), mosaïque de 3 à 6 **photos de jeu** à droite (vedette grande avec liseré blanc ; dispositions 3 / 4 / 5 / 6 photos).
5. **Fin de match** : mosaïque de 8 photos assombrie + voile radial, « Score final », logos 220 px, score géant, bandeau « Victoire de … » / « Match nul », tableau des scores par quart.

**Animations** (pilotées par `t`) :
- Avant-match : bandes qui glissent (0–0,4 s), logos qui arrivent des côtés avec rebond (0,2–0,8 s), « VS » en zoom-punch (0,6 s), noms puis bandeau date en fondu montant.
- Fin de quart : panneau qui glisse depuis la gauche, **scores qui défilent de 0 au score réel** (compteur, 0,8 s, easing), photos de la mosaïque qui apparaissent une à une (décalage 0,12 s) puis léger zoom lent (Ken Burns).
- Fin de match : fond en zoom lent, « Score final » en fondu, scores qui défilent, bandeau victoire qui se déplie, tableau ligne par ligne.

La même page sert à l'**aperçu en direct** dans l'écran Vérifier (animation jouée en boucle, réduite à la largeur de l'écran).

---

## 9. Lecteur vidéo

- `hls.js` (natif Safari/iOS), contrôles personnalisés façon Apple : lecture/pause, double-tap ±10 s, barre avec **marqueurs de chapitres**, liste des chapitres sous la vidéo, plein écran, qualité Auto/1080p/720p, vitesse 1×/1,5×/2×, reprise de lecture (localStorage dans try/catch).
- Démarrage < 2 s en 4G.
- **Accès** : toutes les requêtes HLS passent par le Worker `media.behoop.be` qui vérifie un **cookie signé (HMAC, durée 6 h)** délivré après contrôle Firebase (membre de l'Équipe 🔒 pour les Jeunes ; tout compte pour les Seniors), avec cache Cloudflare. CORS limité à behoop.be.

---

## 10. Fonctionnalités — V2

1. **Score en direct** : depuis 📅 Matchs, un utilisateur présent met le score à jour (fin de chaque quart, ou en continu avec +1/+2/+3). Affiché en temps réel (listener Firestore) aux abonnés avec pastille 🔴 LIVE dans le fil et sur la page Équipe, « mis à jour par Quentin T. ». Plusieurs contributeurs possibles (dernier écrit gagne, historique conservé). Remplacé par le résultat officiel quand le scraper le récupère. Notification « Fin du match : X – Y ».
2. **Moments** : depuis le lecteur d'une vidéo de match, sélectionner un passage (15–30 s, poignées début/fin) → rendu **vertical 9:16** (fond flou, vidéo centrée, bandeau score + logos en haut, logo BeHoop discret) par GitHub Actions → post « Moment » dans le fil, partageable (WhatsApp) **uniquement pour les Seniors** ; pour les Jeunes, partage limité à l'Équipe 🔒.
3. **Action du match** : vote parmi les Moments d'un match (un vote par compte, 48 h), résultat affiché sur la carte du match. On vote pour une action, jamais pour un joueur nommé.
4. **Covoiturage** : sur un match à l'extérieur, « Je propose X places au départ de [commune] à [heure] » / « Je cherche une place ». Demande → acceptation par le conducteur → les deux voient leur contact (prénom + téléphone ou message in-app). Pour les matchs de Jeunes, **réservé aux membres de l'Équipe 🔒**. Rappel la veille.
5. **Fiche Équipe enrichie** : forme sur les 5 derniers matchs (pastilles V/D), graphique d'évolution au classement, prochain adversaire avec son classement et le résultat du match aller, statistiques simples (points marqués/encaissés moyens).

**Hors périmètre V1/V2** (plus tard) : commentaires, pronostics, badges, connexion Apple, Espace Club.

---

## 11. Modèle de données (Firestore)

```
users/{uid}                 displayName, avatarUrl, createdAt, ageConfirmed, notifPrefs, fcmTokens[], banned
follows/{uid}/items/{id}    type (club|team), refId, createdAt
teams/{teamId}              awbbId, clubId, name, category, ageGroup (jeunes|seniors), override{displayName,logoUrl,colors}
teamMembers/{teamId}/members/{uid}   role (membre|responsable), status (pending|accepted), message, createdAt
posts/{postId}              type (score|video|photo|message|moment|live), authorUid|null(auto), clubId, teamIds[],
                            visibility (public|team), teamIdPrivate|null, payload{…}, reactions{🏀,🔥,👏}, hidden, createdAt
posts/{postId}/reactions/{uid}  emoji
matchVideos/{id}            matchAwbbId, authorUid, teamIds, visibility, settings{names, logos, colors, scores, title, quarters…},
                            media[]{r2Key, kind, takenAt, duration, quarter, order, excluded, offPlay, featured, scoreboardOfQuarter},
                            status, version, hls{masterKey, chapters, duration, posterKey}
renderJobs/{id}             matchVideoId, status, step, progress, error, ghRunUrl, startedAt, finishedAt
liveScores/{matchAwbbId}    home, away, quarter, updatedBy, updatedAt, history[]         (V2)
moments/{id}                matchVideoId, start, end, status, r2Key, votes                (V2)
carpools/{matchAwbbId}/offers/{id}  driverUid, seats, from, time, requests{uid:status}  (V2)
reports/{id}                postId, reporterUid, reason, status, createdAt
legalAcceptances/{uid}      cguVersion, acceptedAt
```

- **Règles Firestore strictes** et testées (émulateur) : un post `visibility: team` n'est lisible que par les membres acceptés de l'équipe ; seul l'auteur ou un responsable/super admin peut masquer ; écriture des posts automatiques uniquement par le compte de service.
- Le scraper existant est étendu : quand un résultat apparaît (ou change), il crée/met à jour le post `score` correspondant (idempotent, clé = id du match AWBB) et alimente `teams` (catégorie → ageGroup).

---

## 12. Secrets et configuration

- **Worker** : `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT` (JSON), `R2_*` (binding natif), `GITHUB_TOKEN`, `GITHUB_REPO`, `RENDER_SECRET`, `MEDIA_COOKIE_SECRET`, `ANTHROPIC_API_KEY` (optionnel).
- **GitHub Actions** : `FIREBASE_SERVICE_ACCOUNT`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `RENDER_SECRET`, `WORKER_BASE_URL`.
- **Front** : config Firebase publique, clé VAPID FCM, URL du Worker.
- Fournir `.env.example` et **`docs/SETUP.md` pas-à-pas pour un non-développeur** : création du bucket R2 + CORS + domaine `media.behoop.be`, déploiement du Worker (`wrangler`), compte de service Firebase, activation FCM, secrets GitHub, domaines autorisés Firebase Auth.

---

## 13. Coûts attendus

| Poste | Estimation |
|---|---|
| GitHub Pages, GitHub Actions | 0 € (quotas inclus ; ~20–40 min de runner par montage) |
| Firebase Auth, Firestore, FCM | 0 € dans les quotas gratuits (surveiller les lectures du fil) |
| Cloudflare Workers | 0 € (offre gratuite) |
| Cloudflare R2 | 10 Go gratuits puis ~0,015 $/Go/mois ; **diffusion gratuite** — ~0,60 $/mois pour une saison de vidéos |
| API Claude (optionnel) | quelques centimes par match |

---

## 14. Lots de réalisation et critères d'acceptation

**Lot 0 — Analyse** : audit du dépôt, proposition d'intégration (structure, build, déploiement GitHub Pages sans casser le site actuel), plan validé par moi.
✅ Je valide un plan clair d'une page.

**Lot 1 — Comptes et structure** : Firebase Auth (Google + e-mail), onboarding, barre d'onglets, Explorer branché sur `data.json`, Suivre, Profil, pages légales, design system (clair/sombre).
✅ Sans compte, le site est identique à aujourd'hui ; je crée un compte sur mon iPhone, je suis Union Mons Hainaut, l'appli est installable et fluide.

**Lot 2 — Fil et posts** : cartes de score automatiques (extension du scraper), posts photo/message, réactions, Équipes 🔒 (demandes, responsables), règles Jeunes/Seniors, signalement, retrait parent, console de modération.
✅ Après le passage du scraper, une carte de score apparaît dans mon fil ; une photo publiée dans une équipe U12 n'est visible que par les membres acceptés.

**Lot 3 — Matchs et notifications** : onglet Matchs, itinéraire, calendrier, FCM avec réglages.
✅ Je reçois « Match dans 2 h » et « Résultat final » sur mon téléphone.

**Lot 4 — Planches animées** : page de rendu fidèle à la référence + animations + transition « vague », aperçu en direct.
✅ Les 5 planches du match test sont équivalentes aux PNG de référence et s'animent proprement.

**Lot 5 — Montage de match** : envoi R2 reprenable, écran Vérifier complet, classement par quart, pipeline Actions, lecteur HLS protégé, post vidéo, purge.
✅ « Générer » → vidéo prête en < 40 min, lisible sans saccade sur iPhone et Android en 4G, chapitres cliquables, inaccessible à un compte non membre de l'Équipe 🔒.

**Lot 6 — V2** : score en direct, Moments, Action du match, covoiturage, fiche Équipe enrichie, lecture auto du score.

---

## 15. Données de test

Match du **samedi 10/10/2026, 13h00** : **BC AMLL** (domicile, logo loup bleu, `docs/test/logo_amll.png`) vs **Union Mons Hainaut** (visiteurs, logo patte bordeaux « Mons Basketball », `docs/test/logo_mons.jpg`), catégorie jeunes.
Scores cumulés : Q1 0–17 · Q2 1–45 · Q3 3–73 · Final 11–94.
Photos fournies par quart-temps (dossiers `1er quart-temps` … `4ème quart-temps`). Créer un script `seed:demo`.

---

## 16. Consignes pour Claude Code

- Ne pas modifier `/club/` ni casser le site public ou le scraper existants ; tout changement du scraper est rétrocompatible.
- TypeScript strict ; commentaires en français là où ce n'est pas évident ; tests unitaires pour : découpage par quart, scores par quart, chapitres, classification Jeunes/Seniors, règles Firestore (émulateur), génération des commandes FFmpeg.
- Commits clairs par lot, jamais de secret dans le dépôt.
- À la fin de chaque lot : ce qui marche, ce qui reste, et **les actions manuelles à faire de mon côté en étapes simples**.
