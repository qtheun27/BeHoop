const PALETTE = ['#0b5cab', '#7c3aed', '#d32f2f', '#1f9d55', '#b45309', '#0891b2', '#c026d3', '#4f46e5'];

function couleurDe(texte) {
  let hash = 0;
  for (const c of (texte || '?')) hash = (hash * 31 + c.charCodeAt(0)) % 997;
  return PALETTE[hash % PALETTE.length];
}

function initialesDe(nom) {
  const mots = (nom || '?').trim().split(/\s+/);
  return ((mots[0]?.[0] || '') + (mots[1]?.[0] || '')).toUpperCase() || '?';
}

// Nom à afficher : "Prénom N." si prénom/nom renseignés, sinon repli sur
// display_name (ancien champ, ex. déduit de l'email ou de Google), sinon
// l'email lui-même en tout dernier recours.
export function nomAffichage(profil) {
  if (profil && profil.prenom) {
    const initiale = profil.nom ? profil.nom.trim().charAt(0).toUpperCase() + '.' : '';
    return [profil.prenom, initiale].filter(Boolean).join(' ');
  }
  return (profil && (profil.display_name || profil.email)) || '?';
}

// Renvoie le HTML d'un avatar : la photo si disponible, sinon un rond de
// couleur avec les initiales du nom (couleur dérivée du nom, stable).
export function avatarHtml(photoUrl, nom, taille = 40) {
  const style = `width:${taille}px;height:${taille}px;font-size:${Math.round(taille * 0.38)}px;`;
  if (photoUrl) {
    return `<span class="avatar" style="${style}"><img src="${photoUrl}" alt="" style="width:100%;height:100%;object-fit:cover;"></span>`;
  }
  return `<span class="avatar" style="${style}background:${couleurDe(nom)};">${initialesDe(nom)}</span>`;
}

// Redimensionne/compresse une image choisie par l'utilisateur (fichier ou
// blob caméra) en un carré JPEG léger encodé en base64 — pour rester
// stocké directement dans le profil Firestore (pas de Firebase Storage,
// qui exige un plan payant).
export function comprimerPhoto(fichier, taille = 320, qualite = 0.72) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image invalide.'));
      img.onload = () => {
        const cote = Math.min(img.width, img.height);
        const sx = (img.width - cote) / 2;
        const sy = (img.height - cote) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = taille; canvas.height = taille;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, cote, cote, 0, 0, taille, taille);
        resolve(canvas.toDataURL('image/jpeg', qualite));
      };
      img.src = lecteur.result;
    };
    lecteur.readAsDataURL(fichier);
  });
}
