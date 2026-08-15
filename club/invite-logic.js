import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Crée le profil users/{uid} à partir de l'invitation en attente
// correspondant à l'email de l'utilisateur connecté. Lève une erreur
// explicite si aucune invitation valide n'est trouvée.
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
  if (invite.role === 'coach') profil.team_ids = invite.team_id ? [invite.team_id] : [];
  if (invite.role === 'player') profil.team_id = invite.team_id || null;
  if (invite.role === 'parent') profil.children_uids = [];

  await setDoc(doc(db, 'users', user.uid), profil);
  await updateDoc(inviteRef, {
    status: 'used', role: invite.role, club_id: invite.club_id, team_id: invite.team_id ?? null,
  });
}
