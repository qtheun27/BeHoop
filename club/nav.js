// Barre de navigation basse + en-tête partagés — une seule source de vérité
// pour tous les espaces, afin d'éviter les incohérences d'un écran à l'autre.

// Icônes SVG au trait, dans l'esprit de l'appli (plutôt que des émojis,
// dont le rendu varie selon l'appareil et fait "brouillon").
const ICONES = {
  accueil: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5"/>',
  ballon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18"/><path d="M5.6 5.6c3.6 3.6 3.6 9.2 0 12.8M18.4 5.6c-3.6 3.6-3.6 9.2 0 12.8"/>',
  tactique: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3.5h6v2H9z"/><path d="M8 11h3.5M12.5 15H16"/><circle cx="14" cy="10" r="1.3"/><circle cx="9.5" cy="16" r="1.3"/>',
  reglages: '<circle cx="12" cy="12" r="3"/><path d="M12 2v2.5M12 19.5V22M22 12h-2.5M4.5 12H2M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6"/>',
  console: '<path d="M4 6h16v12H4z"/><path d="M8 10l2.5 2L8 14M13 14h3"/>',
  famille: '<circle cx="8.5" cy="8" r="2.8"/><circle cx="16" cy="9.5" r="2.2"/><path d="M3.5 20c0-3 2.2-5 5-5s5 2 5 5"/><path d="M14 20c0-2.2 1.4-3.8 3.4-3.8S21 17.8 21 20"/>',
  monde: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.4 2.6 3.6 5.6 3.6 9S14.4 18.4 12 21c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3z"/>',
};

function svg(nom, taille = 22) {
  return `<svg class="icone-nav" viewBox="0 0 24 24" width="${taille}" height="${taille}" fill="none"
    stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${ICONES[nom] || ''}</svg>`;
}

const CLE_ROLE = 'behoop_role';

const ONGLETS_PAR_ROLE = {
  super_admin: [
    { href: './dashboard.html', icone: 'accueil', label: 'Accueil' },
    { href: './admin.html', icone: 'console', label: 'Console' },
    { href: './tactique.html', icone: 'tactique', label: 'Tactique' },
    { href: './compte.html', icone: 'reglages', label: 'Compte' },
  ],
  club_admin: [
    { href: './dashboard.html', icone: 'accueil', label: 'Accueil' },
    { href: './mon-club.html', icone: 'ballon', label: 'Mon club' },
    { href: './tactique.html', icone: 'tactique', label: 'Tactique' },
    { href: './compte.html', icone: 'reglages', label: 'Compte' },
  ],
  coach: [
    { href: './dashboard.html', icone: 'accueil', label: 'Accueil' },
    { href: './coach.html', icone: 'ballon', label: 'Équipe' },
    { href: './tactique.html', icone: 'tactique', label: 'Tactique' },
    { href: './compte.html', icone: 'reglages', label: 'Compte' },
  ],
  player: [
    { href: './dashboard.html', icone: 'accueil', label: 'Accueil' },
    { href: './joueur.html', icone: 'ballon', label: 'Équipe' },
    { href: './tactique.html', icone: 'tactique', label: 'Tactique' },
    { href: './compte.html', icone: 'reglages', label: 'Compte' },
  ],
  parent: [
    { href: './dashboard.html', icone: 'accueil', label: 'Accueil' },
    { href: './parent.html', icone: 'famille', label: 'Enfants' },
    { href: './tactique.html', icone: 'tactique', label: 'Tactique' },
    { href: './compte.html', icone: 'reglages', label: 'Compte' },
  ],
};

// pageActive : 'dashboard' | 'espace' | 'tactique' | 'compte'
export function rendreNav(role, pageActive, provisoire = false) {
  if (!provisoire) {
    try {
      sessionStorage.setItem(CLE_ROLE, role);
      localStorage.setItem(CLE_ROLE, role);
    } catch (e) { /* stockage indisponible, sans conséquence */ }
  }
  const onglets = ONGLETS_PAR_ROLE[role] || ONGLETS_PAR_ROLE.parent;
  const cleDe = (o) => {
    if (o.href.includes('dashboard')) return 'dashboard';
    if (o.href.includes('tactique')) return 'tactique';
    if (o.href.includes('compte')) return 'compte';
    return 'espace';
  };
  const html = `
    <nav class="bottom-nav">
      <div class="bottom-nav-inner">
        ${onglets.map(o => `
          <a href="${o.href}" class="${cleDe(o) === pageActive ? 'actif' : ''}">
            ${svg(o.icone)}${o.label}
          </a>
        `).join('')}
      </div>
    </nav>
  `;
  const existante = document.querySelector('.bottom-nav');
  if (existante) existante.remove();
  document.body.insertAdjacentHTML('beforeend', html);

  rendreNavBureau(onglets, pageActive, cleDe);
}

// Sur ordinateur la barre du bas est masquée : on place les mêmes entrées
// dans l'en-tête, sinon plus aucune navigation n'est possible.
let dernierEtatNav = null;

function rendreNavBureau(onglets, pageActive, cleDe) {
  dernierEtatNav = { onglets, pageActive, cleDe };
  const barre = document.querySelector('.app-bar');
  if (!barre) return;
  const ancienne = barre.querySelector('.nav-bureau');
  if (ancienne) ancienne.remove();

  const html = `
    <nav class="nav-bureau">
      ${onglets.map(o => `
        <a href="${o.href}" class="${cleDe(o) === pageActive ? 'actif' : ''}">
          ${svg(o.icone, 18)}<span>${o.label}</span>
        </a>
      `).join('')}
    </nav>
  `;
  const lienPublic = barre.querySelector('.lien-public');
  if (lienPublic) lienPublic.insertAdjacentHTML('beforebegin', html);
  else barre.insertAdjacentHTML('beforeend', html);
}

// Affiche la barre immédiatement à partir du rôle mémorisé lors de la
// dernière session, sans attendre la réponse de Firebase — sinon la barre
// « clignote » / se reconstruit visiblement à chaque changement de page.
export function rendreNavImmediat(pageActive) {
  try {
    const role = sessionStorage.getItem(CLE_ROLE) || localStorage.getItem(CLE_ROLE);
    if (role) rendreNav(role, pageActive, true);
  } catch (e) { /* stockage indisponible : la barre s'affichera après l'auth */ }
}

// En-tête unifié : logo + nom BeHoop + accès au site public, identique sur
// toutes les pages. Le titre de la page n'apparaît que sur ordinateur —
// sur mobile la barre du bas indique déjà où l'on se trouve.
export function rendreEntete(titrePage = '', prefixe = '.') {
  const html = `
    <div class="app-bar">
      <a class="marque" href="${prefixe}/dashboard.html">
        <img src="${prefixe}/../icons/icon-192.png" alt="">
        <span class="marque-nom">BeHoop</span>
      </a>
      <a class="lien-public" href="${prefixe}/../index.html">
        ${svg('monde', 16)}<span>Site public</span>
      </a>
    </div>
    ${titrePage ? `<div class="titre-page"><div class="container"><h1>${titrePage}</h1></div></div>` : ''}
  `;
  const existant = document.querySelector('.app-bar');
  if (existant) {
    const titre = document.querySelector('.titre-page');
    if (titre) titre.remove();
    existant.outerHTML = html;
  } else {
    document.body.insertAdjacentHTML('afterbegin', html);
  }
  // L'en-tete vient d'etre reconstruit : on y replace la navigation bureau.
  if (dernierEtatNav) {
    rendreNavBureau(dernierEtatNav.onglets, dernierEtatNav.pageActive, dernierEtatNav.cleDe);
  }
}
