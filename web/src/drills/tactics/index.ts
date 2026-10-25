// Bibliothèque de tactiques animées : principes (dès le mini-basket), attaque placée, attaque de zone, remises en jeu,
// défenses, presses, transition, fin de match. Chaque étape = positions des joueurs ; le Playbook anime le passage d'une étape à l'autre.
import { T } from './h';
import type { Tactic } from '../types';

const TAC: Tactic[] = [
  // ---------- Principes de jeu ----------
  T('pri-passe-et-va', 'Passe et va', 'principes', 'U8', 'Le premier principe du jeu collectif : après avoir passé, je coupe vers le panier pour recevoir en retour.',
    ['Couper devant son défenseur', 'Main cible vers le passeur', 'Passe à terre si le défenseur gêne'], [
      ['top lw', 1, '1 a le ballon, 2 est à l’aile'],
      ['top lw', 2, '1 passe à 2'],
      ['lrim lw', 2, '1 coupe vers le panier, devant son défenseur'],
      ['lrim lw', 1, '2 rend la balle à 1'],
      ['lrim lw', 0, 'Tir en course'],
    ]),
  T('pri-ecartement', 'Écartement : les 5 places', 'principes', 'U10', 'Occuper le terrain : un meneur, deux ailes, deux coins. Plus on est écartés, plus il y a d’espace pour dribbler et couper.',
    ['4 à 5 m entre deux joueurs', 'Jamais deux au même endroit', 'Quand un joueur part, un autre remplit sa place'], [
      ['mp le re lb rb', 1, 'Tous collés au panier : pas d’espace !', 'none'],
      ['top lw rw lc rc', 1, 'On s’écarte : 1 en haut, 2 et 3 aux ailes, 4 et 5 dans les coins', 'none'],
      ['top lw rw lc rc', 2, 'La balle circule facilement', 'none'],
      ['top lw rw lc rc', 4, 'Et les défenseurs doivent couvrir tout le terrain', 'none'],
    ]),
  T('pri-couper-remplacer', 'Passer, couper, remplacer', 'principes', 'U10', 'Le mouvement continu en 5 dehors : chaque passe est suivie d’une coupe, et les autres remplissent la place libérée.',
    ['Coupe franche jusqu’au panier', 'Le joueur le plus proche remplit la place vide', 'Ressortir dans le coin libre'], [
      ['top lw rw lc rc', 1, '1 en haut avec le ballon'],
      ['top lw rw lc rc', 2, '1 passe à 2 à l’aile'],
      ['mp lw rw lc rc', 2, '1 coupe vers le panier'],
      ['rc lw top lc rw', 2, '1 ressort dans le coin opposé ; 3 remplit le haut, 5 remonte à l’aile'],
      ['rc lw top lc rw', 3, '2 renverse vers 3 : on recommence de l’autre côté'],
    ]),
  T('pri-penetrer-ressortir', 'Pénétrer et ressortir', 'principes', 'U12', 'Le porteur attaque le panier ; quand un défenseur vient aider, il ressort la balle au joueur laissé libre.',
    ['Pénétrer jusqu’à faire bouger un défenseur', 'Le tireur se rend visible (coin, aile)', 'Passe dans les mains, prêt à tirer'], [
      ['top lw rw lc rc', 1, '1 attaque l’espace au milieu', 'auto'],
      ['mp lw rw lc rc', 1, '1 pénètre ; le défenseur de 4 vient aider', '230,190 92,190 375,190 160,110 400,75'],
      ['mp lw rw lc rc', 4, '1 ressort vers 4, seul dans le coin', '230,190 92,190 375,190 160,110 400,75'],
      ['mp lw rw lc rc', 0, '4 tire', '230,190 92,190 375,190 90,80 400,75'],
    ]),
  T('pri-back-door', 'La coupe dans le dos (back-door)', 'principes', 'U12', 'Quand mon défenseur m’empêche de recevoir, je coupe derrière lui vers le panier.',
    ['2 pas vers l’extérieur pour attirer le défenseur', 'Changement de vitesse', 'Passe à terre du meneur'], [
      ['top lw', 1, '2 est empêché de recevoir à l’aile', '250,270 120,225'],
      ['top 40,240', 1, '2 fait 2 pas vers l’extérieur, son défenseur suit', '250,270 75,230'],
      ['top lrim', 1, '2 coupe dans le dos du défenseur', '250,270 100,200'],
      ['top lrim', 2, 'Passe à terre', '250,270 150,140'],
      ['top lrim', 0, 'Tir en course', '250,270 190,110'],
    ]),
  T('pri-ecran-sans-ballon', 'Écran sans ballon', 'principes', 'U14', 'Un joueur pose un écran loin du ballon pour libérer un coéquipier qui vient recevoir.',
    ['L’écraneur est immobile, pieds écartés', 'Le joueur attend que l’écran soit posé', 'L’écraneur se démarque ensuite'], [
      ['top rw lb', 1, '1 a le ballon, 3 et 2 du côté gauche'],
      ['top 140,175 lb', 1, '2 descend poser un écran sur le défenseur de 3', 'auto'],
      ['top 140,175 lw', 1, '3 sort de l’écran vers l’aile', '250,268 160,165 120,180'],
      ['top 140,175 lw', 3, '1 passe à 3', '250,268 160,165 120,180'],
      ['top lrim lw', 0, '3 tire (ou 2 roule vers le panier)', '250,268 185,110 100,195'],
    ]),
  T('pri-pick-and-roll', 'Écran porteur (pick and roll)', 'principes', 'U14', 'L’intérieur pose un écran sur le défenseur du porteur ; le porteur attaque, l’intérieur roule vers le panier.',
    ['Écran immobile', 'Le porteur frôle l’écran (épaule contre épaule)', 'Lecture : tir, pénétration ou passe au rouleur'], [
      ['1@top 5@hp', 1, '1 en haut, 5 au poste haut'],
      ['1@top 5@220,275', 1, '5 pose l’écran sur le défenseur de 1'],
      ['1@rs 5@mp', 1, '1 sort à droite de l’écran ; 5 roule vers le panier', '300,280 245,170'],
      ['1@re 5@rrim', 1, '1 attaque le panier, le défenseur de 5 doit choisir', '290,190 250,130'],
      ['1@re 5@rrim', 2, 'Passe à 5 qui a roulé', '290,190 250,130'],
      ['1@re 5@rrim', 0, 'Panier', '290,190 260,100'],
    ]),

  // ---------- Attaque placée ----------
  T('att-motion-5-dehors', 'Motion 5 dehors', 'attaque', 'U12', 'Attaque sans intérieur fixe : on passe, on coupe, on remplit. Idéal pour apprendre à jouer ensemble.',
    ['Après chaque passe : couper ou poser un écran', 'Remplir la place libre', 'Tir ouvert ou pénétration dès qu’un espace s’ouvre'], [
      ['top lw rw lc rc', 1, 'Placement 5 dehors'],
      ['top lw rw lc rc', 3, '1 passe à 3'],
      ['mp lw rw lc rc', 3, '1 coupe au panier'],
      ['lc ls rw 45,140 rc', 3, '1 sort dans le coin gauche, 2 remplit le haut, 4 remonte'],
      ['lc ls rw 45,140 rc', 2, '3 renverse vers 2'],
      ['lc ls 300,250 45,140 rc', 2, '3 pose un écran retard pour 5', 'auto'],
    ]),
  T('att-4-1', '4 dehors, 1 dedans', 'attaque', 'U14', 'Quatre joueurs écartés autour d’un intérieur qui se déplace côté ballon. Simple et efficace dès U14.',
    ['L’intérieur suit le ballon (poste bas côté ballon)', 'Passe à l’intérieur = les autres se replacent pour être visibles', 'Jeu à deux aile–intérieur'], [
      ['top lw rw lc lb', 1, '4 dehors, 5 au poste bas gauche'],
      ['top lw rw lc lb', 2, '1 passe à l’aile gauche'],
      ['top lw rw lc 150,120', 5, '2 passe à 5 au poste bas'],
      ['ls lw rs lc 150,120', 5, 'Les extérieurs se replacent ; 5 joue ou ressort'],
      ['ls lw rs lc rb', 3, 'Si la balle change de côté, 5 traverse la raquette'],
    ]),
  T('att-horns', 'Horns (pick and roll)', 'attaque', 'U14', 'Deux intérieurs aux coudes, deux tireurs dans les coins. Le meneur choisit son écran.',
    ['Le meneur lit le côté le plus ouvert', 'Le second intérieur s’écarte (pop) en haut', 'Les coins restent dans les coins'], [
      ['top lc rc le re', 1, 'Placement Horns : 4 et 5 aux coudes'],
      ['top lc rc le 270,280', 1, '5 monte poser l’écran'],
      ['rs lc rc ls mp', 1, '1 sort à droite, 5 roule, 4 s’écarte en haut à gauche'],
      ['re lc rc ls rrim', 1, '1 attaque', 'auto'],
      ['re lc rc ls rrim', 5, 'Passe à 5 au panier (ou à 4 en haut, ou au coin)'],
      ['re lc rc ls rrim', 0, 'Panier'],
    ]),
  T('att-horns-hand-off', 'Horns : passe et main à main', 'attaque', 'U16', 'Variante Horns : passe au coude, puis main à main pour le tireur qui remonte du coin.',
    ['Le main à main se fait épaule contre épaule', 'Le tireur lit son défenseur : tir ou pénétration'], [
      ['top lc rc le re', 1, 'Placement Horns'],
      ['top lc rc le re', 4, '1 passe à 4 au coude gauche'],
      ['rc lw rc le re', 4, '2 remonte du coin vers 4 ; 1 file dans le coin droit'],
      ['rc 180,250 rc le re', 2, 'Main à main de 4 à 2'],
      ['rc ls rc 200,140 re', 2, '2 tire (ou pénètre) ; 4 roule'],
    ]),
  T('att-flex', 'Flex', 'attaque', 'U14', 'Attaque continue d’écrans en ligne de fond et d’écrans descendants. Tout le monde passe à tous les postes.',
    ['Écran de fond pour le joueur du coin', 'Puis écran descendant pour l’écraneur', 'On recommence de l’autre côté'], [
      ['rs lc rc ls lb', 1, 'Départ : 1 en haut à droite, 4 à gauche, 5 au poste bas gauche'],
      ['rs lc rc ls lb', 4, '1 renverse vers 4'],
      ['rs rb rc ls lb', 4, '2 coupe en ligne de fond grâce à l’écran de 5'],
      ['rs rb rc ls lb', 2, 'Passe à 2 au poste bas droit si libre'],
      ['250,190 rb rc ls 230,300', 4, 'Sinon, 1 pose un écran descendant pour 5 qui monte'],
      ['250,190 rb rc ls 230,300', 5, 'Passe à 5 en haut : la suite repart de l’autre côté'],
    ]),
  T('att-ucla', 'UCLA', 'attaque', 'U16', 'Le meneur passe à l’aile et coupe vers le panier grâce à l’écran de l’intérieur au poste haut.',
    ['5 pose l’écran dos au panier', '1 frôle l’écran', 'Si rien, 1 sort dans le coin et 5 joue le pick and roll avec 2'], [
      ['top rw lw lc hp', 1, '1 en haut, 5 au poste haut'],
      ['top rw lw lc hp', 2, '1 passe à 2 à l’aile droite'],
      ['rrim rw lw lc hp', 2, '1 coupe sur l’écran de 5'],
      ['rrim rw lw lc hp', 1, 'Passe à 1 au panier'],
      ['rc rw lw lc 360,240', 2, 'Sinon : 1 sort dans le coin, 5 pose l’écran pour 2'],
    ]),
  T('att-hammer', 'Hammer', 'attaque', 'U16', 'Pénétration en ligne de fond et écran dans le dos pour le tireur du coin opposé : passe croisée et tir à 3 points.',
    ['Pénétrer vraiment vers le panier', 'Écran au moment où le défenseur regarde la pénétration', 'Passe croisée à une main'], [
      ['rw top lc lb rb', 1, '1 à l’aile droite, 3 dans le coin gauche'],
      ['rsc top lc lb rb', 1, '1 pénètre en ligne de fond'],
      ['rsc top lc 120,80 rb', 1, '4 pose un écran sur le défenseur de 3', 'auto'],
      ['rsc top lw 120,80 rb', 1, '3 s’écarte vers l’aile', '330,95 250,265 160,130 140,95 300,110'],
      ['rsc top lw 120,80 rb', 3, 'Passe croisée de 1 à 3', '330,95 250,265 160,130 140,95 300,110'],
      ['rsc top lw 120,80 rb', 0, '3 tire à 3 points', '330,95 250,265 110,195 140,95 300,110'],
    ]),
  T('att-floppy', 'Floppy', 'attaque', 'U16', 'Le tireur part sous le panier et choisit son côté entre deux écrans.',
    ['Le tireur lit son défenseur avant de choisir', 'Les écraneurs tiennent leur écran', 'Le meneur passe du côté choisi'], [
      ['top rim lw lb rb', 1, '2 sous le panier, 4 et 5 aux postes bas'],
      ['top 300,100 lw lb rb', 1, '2 feinte à gauche…'],
      ['top rw lw lb rb', 1, '… et sort à droite grâce à l’écran de 5'],
      ['top rw lw lb rb', 2, 'Passe à 2'],
      ['top rw lw lb rb', 0, '2 tire'],
    ]),
  T('att-spain', 'Spain pick and roll', 'attaque', 'U18', 'Pick and roll central, et un tireur vient poser un écran dans le dos du défenseur de l’intérieur qui roule.',
    ['Le tireur pose l’écran puis ressort à 3 points', 'Le rouleur file vers le panier', 'Lecture : rouleur, tireur, ou pénétration'], [
      ['top lc rc lw hp', 1, '1 en haut, 5 au poste haut, 4 à l’aile gauche'],
      ['top lc rc 210,200 220,280', 1, '5 pose l’écran, 4 se place derrière'],
      ['rs lc rc 210,200 mp', 1, '1 attaque, 5 roule, 4 pose l’écran sur le défenseur de 5'],
      ['re lc rc ls rrim', 1, '4 ressort en haut'],
      ['re lc rc ls rrim', 5, 'Passe à 5 au panier (ou à 4 à 3 points)'],
    ]),
  T('att-pick-pop', 'Pick and pop', 'attaque', 'U14', 'Pick and roll où l’intérieur s’écarte pour tirer au lieu de rouler.',
    ['Écraneur adroit à mi-distance ou à 3 points', 'Le porteur attire les deux défenseurs'], [
      ['top lc rc lw hp', 1, 'Placement'],
      ['top lc rc lw 220,275', 1, '5 pose l’écran'],
      ['re lc rc lw 210,300', 1, '1 attaque à droite, 5 s’écarte en haut', '290,200 95,40 420,50 95,195 230,250'],
      ['re lc rc lw 210,300', 5, 'Passe à 5', '290,200 95,40 420,50 95,195 230,250'],
      ['re lc rc lw 210,300', 0, '5 tire', '290,200 95,40 420,50 95,195 220,280'],
    ]),
  T('att-iso', 'Isolation à l’aile', 'attaque', 'U14', 'On vide un côté pour laisser le meilleur attaquant en 1c1.',
    ['Les autres restent écartés côté opposé', 'Si l’aide vient, passe au joueur libre'], [
      ['top lw rw rc rb', 1, 'Placement'],
      ['top lw rw rc rb', 2, '1 passe à 2 à gauche'],
      ['rs lw rw rc rb', 2, '1 dégage : tout le côté gauche est libre'],
      ['rs lb rw rc rb', 2, '2 attaque en 1c1'],
      ['rs lrim rw rc rb', 0, 'Panier'],
    ]),
  T('att-stack-ecran', 'Double écran (stagger)', 'attaque', 'U16', 'Deux écrans à la suite pour libérer le meilleur tireur.',
    ['Écrans posés l’un après l’autre', 'Le tireur passe au ras des deux écrans'], [
      ['top rim lw lb le', 1, '2 sous le panier, 5 au poste bas et 4 au coude gauche'],
      ['top 190,110 lw 185,135 190,215', 1, '2 monte entre les deux écrans'],
      ['top lw 120,300 185,135 190,215', 1, '2 sort à l’aile, 3 lui laisse la place'],
      ['top lw 120,300 185,135 190,215', 2, 'Passe et tir'],
    ]),

  // ---------- Attaque de zone ----------
  T('zon-131-vs-23', '1-3-1 contre une zone 2-3', 'zone', 'U14', 'Se placer dans les trous de la zone : un joueur en haut, deux ailes, un poste haut, un joueur en ligne de fond.',
    ['Se placer entre deux défenseurs', 'Passe au poste haut = la zone se resserre', 'Le joueur de fond glisse d’un côté à l’autre'], [
      ['top lw rw hp 250,40', 1, 'Placement 1-3-1 face à la 2-3', 'z2l z2r z3l z3m z3r'],
      ['top lw rw hp 250,40', 4, 'Passe au poste haut', '205,250 295,250 140,140 250,130 360,140'],
      ['top lw rw hp lsc', 4, '5 glisse dans le coin court', '205,250 295,250 140,140 230,120 360,140'],
      ['top lw rw hp lsc', 5, 'Passe à 5', '205,250 295,250 120,105 230,120 360,140'],
      ['top lw rw hp lsc', 0, '5 tire ou passe à 2', '205,250 295,250 120,105 230,120 360,140'],
    ]),
  T('zon-surcharge', 'Surcharge d’un côté', 'zone', 'U14', 'Mettre trois attaquants d’un même côté contre deux défenseurs de zone.',
    ['Créer le surnombre', 'Passes rapides', 'Tir du joueur libre'], [
      ['top lw rw lc lb', 1, 'Placement : 2, 4 et 5 à gauche', 'z2l z2r z3l z3m z3r'],
      ['top lw rw lc lb', 2, 'Balle à l’aile gauche', '150,230 300,250 100,120 220,105 350,130'],
      ['top lw rw lc lb', 4, 'Passe au coin : la zone glisse', '150,230 300,250 80,80 200,110 340,120'],
      ['top lw rw lc 180,170', 4, '5 monte au poste moyen, ouvert', '150,230 300,250 80,80 200,110 340,120'],
      ['top lw rw lc 180,170', 5, 'Passe à 5', '150,230 300,250 80,80 200,110 340,120'],
      ['top lw rw lc 180,170', 0, 'Tir', '150,230 300,250 80,80 200,110 340,120'],
    ]),
  T('zon-vs-131', 'Attaquer une zone 1-3-1', 'zone', 'U16', 'Deux meneurs de chaque côté du défenseur de pointe, et des joueurs dans les coins.',
    ['Deux joueurs en haut (pas un seul)', 'Les coins sont la faiblesse de la 1-3-1', 'Passe croisée rapide'], [
      ['ls rs lc rc hp', 1, 'Placement 2-1-2', 'z1t z1l z1m z1r z1b'],
      ['ls rs lc rc hp', 2, 'Passe en haut d’un côté à l’autre', '290,280 110,190 250,180 390,190 250,90'],
      ['ls rs lc rc hp', 4, 'Passe au coin droit', '290,280 110,190 250,180 390,190 320,80'],
      ['ls rs lc rc hp', 0, 'Tir du coin', '290,280 110,190 250,180 400,110 400,70'],
    ]),

  // ---------- Remises en jeu ----------
  T('rem-box', 'Remise sous le panier : la boîte', 'remise', 'U12', 'Quatre joueurs en carré (postes bas et coudes), deux écrans en même temps.',
    ['Signal du passeur (main levée)', 'Écrans posés franchement', 'Le passeur reste prudent : un joueur en sécurité'], [
      ['ob lb rb le re', 1, 'Placement en boîte, 1 remet sous le panier'],
      ['ob lb 290,105 le 300,170', 1, '3 monte poser un écran pour 5'],
      ['ob lc 290,105 185,130 rrim', 1, '5 plonge vers le panier, 4 descend écran pour 2 qui sort au coin'],
      ['ob lc 290,105 185,130 rrim', 5, 'Passe à 5 (ou à 2 au coin)'],
      ['ob lc 290,105 185,130 rrim', 0, 'Panier'],
    ]),
  T('rem-ligne', 'Remise sous le panier : la ligne', 'remise', 'U12', 'Quatre joueurs alignés qui s’éparpillent au signal.',
    ['Chacun connaît sa direction', 'Le dernier reste en sécurité en haut'], [
      ['ob 250,110 250,160 250,210 250,260', 1, 'Placement en ligne au milieu'],
      ['ob rrim lc rc top', 1, 'Au signal : 2 plonge, 3 et 4 vont aux coins, 5 recule'],
      ['ob rrim lc rc top', 2, 'Passe à 2 au panier'],
      ['ob rrim lc rc top', 0, 'Panier'],
    ]),
  T('rem-cote', 'Remise sur le côté sécurisée', 'remise', 'U12', 'Remettre en jeu sur le côté sans perdre le ballon, avec un écran pour le meneur.',
    ['Le meneur vient vers le ballon', 'Une option longue en sécurité'], [
      ['sor rb rs lw hp', 1, '1 remet du côté droit'],
      ['sor rb 360,260 lw 330,240', 1, '5 pose un écran pour 3'],
      ['sor rb 430,280 lw 330,240', 1, '3 vient vers le ballon'],
      ['sor rb 430,280 lw 330,240', 3, 'Passe à 3'],
      ['rw rb 430,280 lw 330,240', 3, '1 entre en jeu côté ballon'],
    ]),
  T('rem-3pts', 'Remise : tir à 3 points', 'remise', 'U16', 'Remise sous le panier quand il faut un tir à 3 points : double écran pour le tireur.',
    ['Le tireur part loin du ballon', 'Écrans dos à la ligne'], [
      ['ob rb lb le re', 1, '2 au poste bas droit'],
      ['ob 260,120 lb le re', 1, '2 traverse sous le panier'],
      ['ob lc 140,110 120,180 re', 1, '4 et 5 posent un double écran, 2 sort au coin gauche'],
      ['ob lc 140,110 120,180 re', 2, 'Passe et tir à 3 points'],
    ]),

  // ---------- Défenses ----------
  T('def-individuelle', 'Défense individuelle : aide et refus', 'defense', 'U12', 'Chaque défenseur se place selon le ballon : sur le porteur, en refus à une passe, en aide à deux passes.',
    ['Voir son joueur et le ballon (triangle)', 'À deux passes : un pied dans la raquette', 'Parler : « ballon ! », « aide ! »'], [
      ['top lw rw lc rc', 1, 'Ballon en haut', '250,295 120,230 380,230 195,110 305,110'],
      ['top lw rw lc rc', 2, 'Ballon à l’aile : tout le monde glisse', '200,285 100,195 290,190 75,85 275,100'],
      ['top lw rw lc rc', 4, 'Ballon au coin : aide côté opposé', '215,225 95,170 300,170 75,70 250,100'],
    ]),
  T('def-zone-23', 'Zone 2-3', 'defense', 'U14', 'Deux défenseurs en haut, trois en bas. On défend une zone, on glisse avec le ballon.',
    ['Bras écartés, on parle', 'Le défenseur central protège la raquette', 'Sortie sur le porteur à chaque passe'], [
      ['top lw rw lc rc', 1, 'Ballon en haut', 'z2l z2r z3l z3m z3r'],
      ['top lw rw lc rc', 2, 'Ballon à l’aile : le défenseur haut sort', '110,200 240,240 120,110 230,110 340,130'],
      ['top lw rw lc rc', 4, 'Ballon au coin : le défenseur bas sort, le centre se décale', '150,210 260,230 75,70 180,100 300,110'],
    ]),
  T('def-zone-131', 'Zone 1-3-1', 'defense', 'U16', 'Une zone agressive qui pousse vers les côtés et les coins pour piéger.',
    ['La pointe dirige le ballon vers une aile', 'Piège à l’aile', 'Le dernier défenseur couvre la ligne de fond'], [
      ['ls rs lc rc hp', 1, 'Placement 1-3-1', 'z1t z1l z1m z1r z1b'],
      ['ls lw lc rc hp', 2, 'Ballon à l’aile : piège avec la pointe', '120,240 90,200 250,190 360,170 160,80'],
    ]),
  T('def-box-and-one', 'Box and one', 'defense', 'U16', 'Quatre en zone (carré), un en individuelle sur le meilleur attaquant adverse.',
    ['Le défenseur individuel ne lâche jamais son joueur', 'Les quatre autres protègent la raquette'], [
      ['top lw rw lc rc', 1, 'D1 sur le meilleur attaquant (1), les autres en carré', '250,295 190,215 310,215 190,110 310,110'],
      ['top lw rw lc rc', 2, 'Ballon à l’aile : le carré glisse, D1 reste sur 1', '250,290 120,200 290,215 140,110 290,105'],
    ]),

  // ---------- Presses ----------
  T('pre-1-2-1-1', 'Presse 1-2-1-1 tout terrain', 'presse', 'U16', 'On gêne la remise en jeu puis on piège le premier receveur près de la ligne de côté.',
    ['Piéger près des lignes (coins du terrain)', 'Couper les passes vers le milieu', 'Le dernier défenseur protège le panier'], [
      ['250,880 150,760 350,760 250,600 250,350', 1, 'Remise : D1 gêne le passeur', '250,845 150,720 350,720 250,560 250,230'],
      ['250,880 150,760 350,760 250,600 250,350', 2, 'Passe vers 2', '250,845 150,720 350,720 250,560 250,230'],
      ['230,860 120,740 350,700 250,600 250,350', 2, 'Piège sur 2 avec D1 et D2 ; D3 et D4 coupent les passes', '150,780 110,700 300,700 190,620 250,350'],
    ], 'full'),
  T('pre-2-2-1', 'Presse 2-2-1 (ralentir)', 'presse', 'U14', 'Presse de contention : on laisse remettre, on ralentit la remontée et on piège après la ligne médiane.',
    ['Ne pas se faire battre au milieu', 'Piège à la ligne médiane, côté ligne de touche'], [
      ['250,880 150,760 350,760 250,600 250,350', 1, 'Placement', '180,700 320,700 150,540 350,540 250,250'],
      ['250,880 130,600 350,760 250,600 250,350', 2, '2 remonte côté gauche', '150,640 300,650 150,540 340,520 250,250'],
      ['250,880 110,470 350,760 250,600 250,350', 2, 'Piège après la ligne médiane', '150,500 290,560 90,420 330,460 250,250'],
    ], 'full'),

  // ---------- Transition ----------
  T('tra-3-couloirs', 'Contre-attaque en 3 couloirs', 'transition', 'U12', 'Après le rebond : première passe, le meneur au centre, les ailes courent large.',
    ['Première passe vers la ligne de touche', 'Ailes en avance, larges', 'Le meneur arrive au milieu'], [
      ['250,700 110,760 390,760 250,830 300,830', 4, 'Rebond défensif de 4', '250,600 150,620 350,620 250,760 300,760'],
      ['250,700 110,640 390,760 250,830 300,830', 2, 'Première passe à 2 sur le côté', '250,600 150,560 350,620 250,760 300,760'],
      ['250,560 110,500 390,560 250,700 300,760', 1, '1 reçoit au milieu ; les ailes courent', '250,450 150,430 350,450 250,620 300,700'],
      ['250,330 60,220 440,220 250,560 300,650', 1, '1 pousse le ballon, 2 et 3 larges', '250,250 120,200 370,200 250,450 300,560'],
      ['250,330 lrim 440,220 250,560 300,650', 2, 'Passe à 2 qui coupe', '250,250 160,140 370,200 250,450 300,560'],
      ['250,330 lrim 440,220 250,560 300,650', 0, 'Panier', '250,250 180,110 370,200 250,450 300,560'],
    ], 'full'),
  T('tra-early', 'Transition secondaire', 'transition', 'U16', 'Si la contre-attaque ne marche pas, on enchaîne tout de suite un pick and roll avant que la défense soit placée.',
    ['Pas de pause entre transition et attaque', 'L’intérieur qui arrive en dernier pose l’écran'], [
      ['top lc rc lw back', 1, 'Les ailes dans les coins, 4 à l’aile, 5 arrive en retard'],
      ['top lc rc lw 230,290', 1, '5 pose l’écran tout de suite'],
      ['re lc rc lw mp', 1, '1 attaque, 5 roule'],
      ['re lc rc lw mp', 5, 'Passe au rouleur'],
    ]),

  // ---------- Fin de match ----------
  T('fin-dernier-tir', 'Dernière possession', 'fin', 'U14', 'On garde le ballon écarté, puis pick and roll à 8 secondes de la fin : tir ou passe au joueur libre.',
    ['Gérer le chrono (attaque à ±8 s)', 'Les autres restent écartés', 'Pas de tir précipité'], [
      ['back lc rc lw rw', 1, 'Ballon en haut, tout le monde écarté'],
      ['top lc rc lw 230,290', 1, 'À 8 secondes : 5 pose l’écran'],
      ['rs lc rc lw mp', 1, '1 attaque, 5 roule'],
      ['re lc rc lw mp', 0, 'Tir (ou passe au coin si l’aide vient)'],
    ]),
  T('fin-temps-mort', 'Après temps mort : écran pour le tireur', 'fin', 'U16', 'Remise sur le côté en zone avant : écran pour le meilleur tireur qui sort vers le ballon.',
    ['Le tireur part loin du ballon', 'Deux options de passe sûres'], [
      ['sorh rb lw ls hp', 1, '1 remet sur le côté, 2 au poste bas droit'],
      ['sorh 330,160 lw ls hp', 1, '2 monte, 5 pose l’écran'],
      ['sorh rw lw ls 330,210', 1, '2 sort à l’aile droite'],
      ['sorh rw lw ls 330,210', 2, 'Passe et tir'],
    ]),
];

export const TACTICS: Tactic[] = TAC;
export const TACTIC_BY_ID = new Map(TAC.map((x) => [x.id, x]));
