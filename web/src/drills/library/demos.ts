// Schémas animés des exercices collectifs : seulement là où la vue de dessus aide vraiment à comprendre
// (placements, passes, courses, rôles à plusieurs). Les exercices sur place n'en ont pas : une vidéo les montre mieux.
import { frames, type F } from '../tactics/h';
import { TACTIC_BY_ID } from '../tactics';
import type { DrillDemo } from '../types';

const N = 'none';
const dm = (list: F[], mode: 'half' | 'full' = 'half', cones?: [number, number][]): DrillDemo => ({ mode, frames: frames(list, mode === 'full'), ...(cones ? { cones } : {}) });
/** Même animation qu'une tactique de la bibliothèque */
const from = (id: string): DrillDemo => { const x = TACTIC_BY_ID.get(id)!; return { mode: x.mode, frames: x.frames }; };

export const DEMOS: Record<string, DrillDemo> = {
  'ech-3-lignes-passes': dm([
    ['250,840 120,840 380,840', 1, 'Trois colonnes sur la ligne de fond', N],
    ['250,760 120,740 380,700', 3, '1 passe à 3…', N],
    ['400,600 110,580 260,600', 3, '…et passe derrière lui ; 3 vient au milieu', N],
    ['400,560 110,520 260,560', 2, '3 passe à 2', N],
    ['400,420 250,420 110,420', 2, '3 passe derrière 2 ; 2 vient au milieu', N],
    ['400,300 250,330 110,330', 1, '2 passe à 1', N],
    ['300,100 250,250 110,260', 0, 'Tir en course', N],
  ], 'full'),
  'pas-carre': dm([
    ['150,380 150,180 350,180 350,380', 1, 'Un joueur à chaque coin', N],
    ['120,160 150,180 350,180 350,380', 2, '1 passe à 2 et court derrière sa passe', N],
    ['120,160 380,150 350,180 350,380', 3, '2 passe à 3 et suit', N],
    ['120,160 380,150 380,410 350,380', 4, '3 passe à 4 et suit', N],
  ]),
  'pas-taureau': dm([
    ['250,140 355,215 315,340 185,340 145,215', 1, 'Cercle de 5, le défenseur au milieu', '250,240'],
    ['250,140 355,215 315,340 185,340 145,215', 3, 'Passe à travers le cercle', '275,280'],
    ['250,140 355,215 315,340 185,340 145,215', 5, 'Le défenseur suit le ballon…', '205,245'],
    ['250,140 355,215 315,340 185,340 145,215', 2, '…on passe là où il n’est pas', '300,225'],
  ]),
  'pas-passe-course': dm([
    ['425,260 75,260', 1, '2 part vers le panier', N],
    ['425,260 170,150', 1, '1 le regarde courir', N],
    ['425,260 205,115', 2, 'Passe devant lui, dans sa course', N],
    ['425,260 lrim', 0, 'Tir en course', N],
  ]),
  'pas-passe-penetration': dm([
    ['top lw rw', 1, '1 en haut, deux tireurs aux ailes', N],
    ['mp lw rw', 1, '1 pénètre vers la raquette', N],
    ['mp lw rw', 2, 'Il ressort la balle au tireur', N],
    ['mp lw rw', 0, 'Tir directement', N],
  ]),
  'tir-sortie-ecran': dm([
    ['top lb', 1, 'Le tireur part du poste bas', N],
    ['top 150,175', 1, 'Il frôle l’écran (le plot)', N],
    ['top 90,235', 2, 'Il sort à l’aile et reçoit', N],
    ['top 90,235', 0, 'Tir', N],
  ], 'half', [[195, 165]]),
  'tir-reception-tir': dm([
    ['250,110 100,235', 1, 'Le passeur sous le panier, le tireur au premier plot', N],
    ['250,110 100,235', 2, 'Passe…', N],
    ['250,110 100,235', 0, '…tir directement', N],
    ['250,110 165,310', 1, 'Le tireur file au second plot', N],
    ['250,110 165,310', 2, 'Passe', N],
    ['250,110 165,310', 0, 'Tir', N],
  ], 'half', [[95, 265], [160, 340]]),
  'tir-tir-defenseur-closeout': dm([
    ['lw', '235,100', 'Le défenseur a le ballon sous le panier', '250,90'],
    ['lw', 1, 'Il passe au tireur…', '220,120'],
    ['lw', 1, '…et sort sur lui, main haute', '110,200'],
    ['lw', 0, 'Tir (ou feinte et un dribble)', '105,205'],
  ]),
  'def-closeout': dm([
    ['lw', '235,100', 'Défenseur sous le panier avec le ballon', '250,90'],
    ['lw', 1, 'Passe au tireur, sprint', '170,150'],
    ['lw', 1, 'Petits pas, main haute, poids en arrière', '110,200'],
    ['150,140', 1, 'S’il attaque, on glisse sans le laisser passer', '165,120'],
  ]),
  'fin-double-pas': dm([
    ['425,300 75,300', 1, 'Une colonne à chaque aile', N],
    ['330,170 75,300', 1, 'Dribble vers le panier', N],
    ['rrim 75,300', 0, 'Côté droit : main droite', N],
    ['60,330 170,170', 2, 'Puis l’autre colonne', N],
    ['60,330 lrim', 0, 'Côté gauche : main gauche', N],
  ]),
  'fin-1c1-poursuite': dm([
    ['250,450', 1, 'L’attaquant part, le défenseur 2 m derrière', '250,510'],
    ['260,230', 1, 'Course au panier', '256,290'],
    ['rrim', 0, 'Finir loin du défenseur', '262,130'],
  ], 'full'),
  'reb-box-out': dm([
    ['300,215 top', 2, 'Le coach (2) va tirer', '285,170'],
    ['300,215 top', 0, 'Tir : le défenseur se retourne', '292,185'],
    ['300,225 top', 0, 'Il bloque l’attaquant avec le dos', '296,192'],
    ['300,225 top', '280,150', 'Puis il va chercher le ballon', '280,150'],
  ]),
  '1c1-aile': dm([
    ['lw', '215,160', 'Le défenseur a le ballon', '200,150'],
    ['lw', 1, 'Il passe et vient défendre', '105,195'],
    ['150,125', 1, 'L’attaquant attaque la ligne de fond', '130,150'],
    ['lrim', 0, 'Panier en 3 dribbles maximum', '175,110'],
  ]),
  '1c1-dos-panier': dm([
    ['160,120 lw', 2, 'L’intérieur prend position, dos au panier', '175,100'],
    ['160,120 lw', 1, 'Passe au poste bas', '175,100'],
    ['205,90 lw', 1, 'Drop-step vers le panier', '175,105'],
    ['205,90 lw', 0, 'Tir', '180,100'],
  ]),
  'def-aide-et-reprise': dm([
    ['ls rs lw rw', 1, 'Ballon en haut à gauche', '165,275 300,270 110,210 290,150'],
    ['ls rs lw rw', 3, 'Ballon à l’aile : on se replace', '165,265 260,215 100,195 285,125'],
    ['ls rs lw rw', 4, 'Renversement : tout le monde glisse', '240,220 340,270 215,125 400,195'],
  ]),
  'def-refus-passe': dm([
    ['top lw', 1, 'Défenseur dans la ligne de passe', '250,275 115,225'],
    ['top 50,250', 1, 'L’attaquant s’écarte : le défenseur suit', '250,275 85,245'],
    ['top lrim', 1, 'Coupe dans le dos : il ferme vers le panier', '250,275 160,140'],
  ]),
  'tra-2c1': dm([
    ['170,520 330,520', 1, '2 contre 1, en restant larges', '250,190'],
    ['185,320 345,320', 1, 'Le porteur attaque le défenseur', '250,200'],
    ['200,250 360,250', 2, 'Il vient : passe à l’autre', '215,215'],
    ['200,250 rrim', 0, 'Panier', '240,180'],
  ], 'full'),
  'tra-3c2': dm([
    ['250,520 90,500 410,500', 1, '3 contre 2 (défense en tandem)', '250,260 250,120'],
    ['250,330 80,250 420,250', 1, 'Milieu au ballon, ailes larges', '250,280 250,130'],
    ['250,330 80,250 420,250', 3, 'Passe à l’aile : le 2e défenseur sort', '250,290 385,175'],
    ['250,330 170,110 420,250', 2, 'Passe croisée à 2 qui coupe', '250,290 330,140'],
    ['250,330 170,110 420,250', 0, 'Panier', '250,290 300,120'],
  ], 'full'),
  'tra-premiere-passe': dm([
    ['250,790 90,700 400,760', '250,818', 'Tir adverse', N],
    ['250,790 90,700 400,760', 1, 'Rebond défensif', N],
    ['250,780 80,640 400,700', 2, 'Première passe vers le côté', N],
    ['250,700 120,450 420,300', 2, '2 pousse le ballon, 3 file', N],
    ['250,600 150,300 330,130', 3, 'Passe en avant', N],
    ['250,600 150,300 rrim', 0, 'Panier', N],
  ], 'full'),
  'tra-3-couloirs': from('tra-3-couloirs'),
  'col-passe-et-va': from('pri-passe-et-va'),
  'col-donne-et-suis': from('pri-penetrer-ressortir'),
  'col-ecran-retard': from('pri-pick-and-roll'),
  'col-ecran-retrait': from('pri-ecran-sans-ballon'),
  'col-back-door': from('pri-back-door'),
  'dri-slalom-plots': dm([
    ['215,440', 1, 'Main extérieure au plot', N],
    ['285,380', 1, 'Changement de main', N],
    ['215,320', 1, 'Changement de main', N],
    ['285,260', 1, 'Changement de main', N],
    ['215,200', 1, 'Accélère…', N],
    ['lrim', 0, '…et finis au panier', N],
  ], 'half', [[250, 410], [250, 350], [250, 290], [250, 230]]),
  'dri-zigzag': dm([
    ['40,440', 1, 'Départ', N],
    ['240,380', 1, 'Pied extérieur planté, changement de main', N],
    ['40,320', 1, 'Et de l’autre côté', N],
    ['240,260', 1, 'On continue jusqu’au bout', N],
    ['40,200', 1, '', N],
  ]),
  'def-zigzag-1c1': dm([
    ['40,440', 1, 'Le défenseur reste devant le dribbleur', '60,400'],
    ['240,380', 1, 'Il coupe la route en se déplaçant avant lui', '225,340'],
    ['40,320', 1, 'Pas chassés, sans croiser les pieds', '60,280'],
    ['240,260', 1, '', '225,220'],
  ]),
  'dri-hesitation-attaque': dm([
    ['250,440', 1, 'Arrivée en dribble face au plot', N],
    ['250,345', 1, 'Hésitation ou crossover devant le plot', N],
    ['305,270', 1, 'On le dépasse au ras', N],
    ['rrim', 0, 'Un dribble et panier', N],
  ], 'half', [[250, 300]]),
};
