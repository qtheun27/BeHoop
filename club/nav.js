export function rendreEntete(titre) {
  document.title = titre + " — BeHoop";
  const el = document.querySelector('.app-bar .titre');
  if (el) el.textContent = titre;
}

export function rendreNavImmediat(pageActive) {
  const role = localStorage.getItem('behoop_role') || sessionStorage.getItem('behoop_role');
  if (role) rendreNav(role, pageActive);
}

export function rendreNav(role, pageActive) {
  localStorage.setItem('behoop_role', role);
  sessionStorage.setItem('behoop_role', role);

  const items = [];
  items.push({ id: 'dashboard', url: './dashboard.html', icone: '🏠', label: 'Accueil' });

  if (role === 'super_admin') {
    items.push({ id: 'espace', url: './admin.html', icone: '🛠️', label: 'Admin' });
  } else if (role === 'club_admin') {
    items.push({ id: 'espace', url: './mon-club.html', icone: '🏢', label: 'Mon club' });
    // L'onglet tactique est explicitement retiré pour l'admin de club.
  } else if (role === 'coach') {
    items.push({ id: 'espace', url: './coach.html', icone: '🏀', label: 'Équipe' });
    items.push({ id: 'tactique', url: './tactique.html', icone: '📋', label: 'Tactique' });
  } else if (role === 'player') {
    items.push({ id: 'espace', url: './joueur.html', icone: '🏀', label: 'Équipe' });
    items.push({ id: 'tactique', url: './tactique.html', icone: '📋', label: 'Tactique' });
  } else if (role === 'parent') {
    items.push({ id: 'espace', url: './parent.html', icone: '👨‍👩‍👧', label: 'Enfants' });
    items.push({ id: 'tactique', url: './tactique.html', icone: '📋', label: 'Tactique' });
  }

  items.push({ id: 'compte', url: './compte.html', icone: '⚙️', label: 'Compte' });

  // Navigation Mobile (Barre du bas)
  let $nav = document.getElementById('bottom-nav');
  if (!$nav) {
    $nav = document.createElement('nav');
    $nav.id = 'bottom-nav';
    $nav.className = 'bottom-nav cache-si-nav-basse';
    document.body.appendChild($nav);
  }

  $nav.innerHTML = `
    <div class="bottom-nav-inner">
      ${items.map(i => `
        <a href="${i.url}" class="${i.id === pageActive ? 'actif' : ''}">
          <span class="icone-nav">${i.icone}</span>
          ${i.label}
        </a>
      `).join('')}
    </div>
  `;
  $nav.classList.remove('cache-si-nav-basse');

  // Navigation Bureau (En-tête)
  const $header = document.querySelector('.app-bar');
  if ($header) {
    let $bureau = $header.querySelector('.nav-bureau');
    if (!$bureau) {
      $bureau = document.createElement('div');
      $bureau.className = 'nav-bureau';
      $header.insertBefore($bureau, $header.querySelector('.lien-public'));
    }
    $bureau.innerHTML = items.map(i => `
      <a href="${i.url}" class="${i.id === pageActive ? 'actif' : ''}">
        ${i.icone} ${i.label}
      </a>
    `).join('');
  }
}
