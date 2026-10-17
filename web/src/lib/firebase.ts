import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { firebaseConfig, USE_EMULATOR } from './config';

export const app = initializeApp(USE_EMULATOR ? { ...firebaseConfig, projectId: 'demo-behoop', apiKey: 'demo-key' } : firebaseConfig);
export const auth = getAuth(app);
auth.languageCode = 'fr';
export const db = initializeFirestore(app, USE_EMULATOR ? {} : { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
if (USE_EMULATOR) {
  const host = location.hostname;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
}
