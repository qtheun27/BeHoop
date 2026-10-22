// Configuration publique (aucun secret ici : les vraies protections sont les règles Firestore et le Worker).
export const firebaseConfig = {
  apiKey: 'AIzaSyDHkNK2f2NwxfFfn39w2cr2lu35t4U5MUA',
  // Connexion servie sous behoop.be (relais du Worker vers le domaine Firebase du projet, voir worker/src/index.ts)
  authDomain: 'auth.behoop.be',
  projectId: 'basket-awbb-club',
  storageBucket: 'basket-awbb-club.firebasestorage.app',
  messagingSenderId: '699662188163',
  appId: '1:699662188163:web:75c1b8964da8d85921e5b6',
};
const env = import.meta.env;
export const USE_EMULATOR = env.VITE_USE_EMULATOR === '1' || new URLSearchParams(location.search).has('emu');
export const WORKER_URL: string = env.VITE_WORKER_URL ?? 'https://media.behoop.be';
export const VAPID_KEY: string = env.VITE_FCM_VAPID_KEY ?? '';
export const DATA_BASE = '/app-data';
export const SUPER_ADMIN_EMAIL = 'q.theuninck@gmail.com';
export const CGU_VERSION = '2026-10';
/** L'Espace Club reste masqué tant qu'il n'est pas prêt. */
export const SHOW_CLUB_SPACE = false;
