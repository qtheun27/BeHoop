import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Lit l'invitation en attente pour l'email de l'utilisateur connecté (ou
// null si aucune). Ne modifie rien — juste une lecture, utilisée pour
// décider où rediriger après la connexion.
export async function lireInvitationEnAttente(db, user) {
  const email = user.email.toLowerCase();
  const inviteSnap = await getDoc(doc(db, 'invitations', email));
  if (!inviteSnap.exists() || inviteSnap.data().status !== 'pending') return null;
  return inviteSnap.data();
}

// Crée le profil users/{uid} à partir de l'invitation en attente.
// NE PAS utiliser pour le rôle "player" — celui-ci passe par
// choix-role.html (le joueur doit d'abord préciser s'il est le joueur ou
// un parent qui gère son compte).
export async function reclamerInvitation(db, user) {
  const email = user.email.toLowerCase();
  const inviteRef = doc(db, 'invitations', email);
  const inviteSnap = await getDoc(inviteRef);

  if (!inviteSnap.exists() || inviteSnap.data().status !== 'pending') {
    throw new Error(
      "Aucune invitation en attente n'a été trouvée pour cet email. " +
      "Contacte l'administrateur de ton club pour en recevoir une."
    );
  }

  const invite = inviteSnap.data();
  const profil = {
    role: invite.role,
    club_id: invite.club_id,
    email,
    display_name: user.displayName || email.split('@')[0],
    created_at: serverTimestamp(),
  };
  if (invite.club_name) profil.club_name = invite.club_name;
  if (invite.role === 'coach') profil.team_ids = invite.team_id ? [invite.team_id] : [];
  if (invite.role === 'parent') profil.children_player_ids = [];

  await setDoc(doc(db, 'users', user.uid), profil);
  await updateDoc(inviteRef, {
    status: 'used', role: invite.role, club_id: invite.club_id, team_id: invite.team_id ?? null,
  });
}
