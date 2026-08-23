// Barre de navigation basse partagée — une seule source de vérité pour
// tous les espaces, afin d'éviter les incohérences de hauteur/contenu
// qui apparaissaient quand chaque page construisait sa propre barre.

const ONGLETS_PAR_ROLE = {
  super_admin: [
    { href: './dashboard.html', icone: '🏠', label: 'Accueil' },
    { href: './admin.html', icone: '🛠️', label: 'Console' },
    { href: './tactique.html', icone: '📋', label: 'Tactique' },
    { href: './compte.html', icone: '⚙️', label: 'Compte' },
  ],
  club_admin: [
    { href: './dashboard.html', icone: '🏠', label: 'Accueil' },
    { href: './mon-club.html', icone: '🏀', label: 'Mon club' },
    { href: './tactique.html', icone: '📋', label: 'Tactique' },
    { href: './compte.html', icone: '⚙️', label: 'Compte' },
  ],
  coach: [
    { href: './dashboard.html', icone: '🏠', label: 'Accueil' },
    { href: './coach.html', icone: '🏀', label: 'Équipe' },
    { href: './tactique.html', icone: '📋', label: 'Tactique' },
    { href: './compte.html', icone: '⚙️', label: 'Compte' },
  ],
  player: [
    { href: './dashboard.html', icone: '🏠', label: 'Accueil' },
    { href: './joueur.html', icone: '🏀', label: 'Équipe' },
    { href: './tactique.html', icone: '📋', label: 'Tactique' },
    { href: './compte.html', icone: '⚙️', label: 'Compte' },
  ],
  parent: [
    { href: './dashboard.html', icone: '🏠', label: 'Accueil' },
    { href: './parent.html', icone: '👨‍👩‍👧', label: 'Enfants' },
    { href: './compte.html', icone: '⚙️', label: 'Compte' },
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
            <span class="icone-nav">${o.icone}</span>${o.label}
          </a>
        `).join('')}
      </div>
    </nav>
  `;
  const existante = document.querySelector('.bottom-nav');
  if (existante) existante.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

const CLE_ROLE = 'behoop_role';

// Affiche la barre immédiatement à partir du rôle mémorisé lors de la
// dernière session, sans attendre la réponse de Firebase — sinon la barre
// « clignote » / se reconstruit visiblement à chaque changement de page.
export function rendreNavImmediat(pageActive) {
  try {
    const role = sessionStorage.getItem(CLE_ROLE) || localStorage.getItem(CLE_ROLE);
    if (role) rendreNav(role, pageActive, true);
  } catch (e) { /* stockage indisponible : la barre s'affichera après l'auth */ }
}
