import { doc, getDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { avatarHtml, nomAffichage } from "./avatar.js";

export const POSITIONS = {
  meneur: 'Meneur (1)', arriere: 'Arrière (2)', ailier: 'Ailier (3)',
  ailier_fort: 'Ailier fort (4)', pivot: 'Pivot (5)',
};

function formatDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-BE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

// Affiche la vue "équipe / entraînements à venir / statistiques" d'un
// joueur donné (par son id dans players/{id}) — réutilisée par joueur.html
// (le joueur voit sa propre fiche) et parent.html ("voir comme le joueur").
export async function afficherVueJoueur(db, playerId, els) {
  const { entete, entrainements, stats, titre } = els;
  const playerSnap = await getDoc(doc(db, 'players', playerId));
  if (!playerSnap.exists()) {
    entrainements.innerHTML = '<p class="vide">Fiche joueur introuvable.</p>';
    return;
  }
  const joueur = { id: playerId, ...playerSnap.data() };

  // Photo et nom sont saisis dans le compte (users/), pas dans la fiche
  // joueur : on les recupere pour que la fiche reste a jour.
  if (joueur.account_uid) {
    try {
      const compte = await getDoc(doc(db, 'users', joueur.account_uid));
      if (compte.exists()) {
        const u = compte.data();
        if (u.photo_url) joueur.photo_url = u.photo_url;
        if (u.prenom) joueur.prenom = u.prenom;
        if (u.nom) joueur.nom = u.nom;
        if (!joueur.prenom && u.display_name) joueur.display_name = u.display_name;
      }
    } catch (e) { /* compte inaccessible : on garde la fiche telle quelle */ }
  }

  let nomEquipe = 'Mon équipe';
  let logoClub = null, nomClub = '';
  if (joueur.club_id) {
    const res = await fetch('../data.json?t=' + Date.now());
    const donnees = await res.json();
    const club = (donnees.clubs || []).find(c => String(c.id) === String(joueur.club_id));
    const equipe = club ? (club.teams || []).find(e => String(e.id) === String(joueur.team_id)) : null;
    nomEquipe = equipe ? (equipe.category || equipe.name) : 'Aucune équipe assignée';
    logoClub = club ? club.logo_url : null;
    nomClub = club ? club.name : '';
  }
  if (titre) titre.textContent = '🏀 ' + nomEquipe;

  entete.style.display = 'block';
  const aUnNom = !!(joueur.prenom || joueur.display_name);
  const visuel = logoClub
    ? `<img src="${logoClub}" alt="" style="width:52px;height:52px;object-fit:contain;background:#fff;border-radius:12px;padding:5px;flex-shrink:0;" onerror="this.style.display='none'">`
    : avatarHtml(joueur.photo_url, nomAffichage(joueur), 52);

  entete.innerHTML = `
    <div class="entete-joueur">
      ${visuel}
      <div>
        <strong>${nomEquipe}</strong>
        <div class="vide" style="margin-top:2px;">
          ${nomClub}${aUnNom ? ' · ' + nomAffichage(joueur) : ''}${joueur.position ? ' · ' + (POSITIONS[joueur.position] || joueur.position) : ''}
        </div>
      </div>
    </div>
  `;

  if (!joueur.team_id) {
    entrainements.innerHTML = '<p class="vide">Aucune équipe assignée pour le moment.</p>';
    stats.innerHTML = '';
    return;
  }

  const qEnt = query(collection(db, 'trainings'), where('team_id', '==', String(joueur.team_id)));
  const snapEnt = await getDocs(qEnt);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const items = snapEnt.docs.map(d => d.data()).filter(t => t.date >= aujourdhui).sort((a, b) => a.date.localeCompare(b.date));
  entrainements.innerHTML = items.length
    ? items.map(t => `<div class="entrainement">${formatDate(t.date)} · ${t.start_time || ''}<div class="lieu">${t.location || ''}</div></div>`).join('')
    : '<p class="vide">Aucun entraînement à venir.</p>';

  const qStats = query(collection(db, 'player_stats'), where('player_id', '==', playerId));
  const snapStats = await getDocs(qStats);
  const lignes = snapStats.docs.map(d => d.data()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  stats.innerHTML = lignes.length ? `
    <table class="historique">
      <thead><tr><th>Date</th><th>Pts</th><th>Reb</th><th>Pas</th><th>Min</th></tr></thead>
      <tbody>${lignes.map(l => `<tr><td>${l.date}</td><td>${l.points ?? 0}</td><td>${l.rebonds ?? 0}</td><td>${l.passes ?? 0}</td><td>${l.minutes ?? 0}</td></tr>`).join('')}</tbody>
    </table>
  ` : '<p class="vide">Aucune statistique enregistrée.</p>';
}
