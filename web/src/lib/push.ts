// Notifications Web Push via Firebase Cloud Messaging.
import { app } from './firebase';
import { VAPID_KEY } from './config';
import { addFcmToken } from './db';

export const pushSupported = () => 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
/** iOS : les notifications ne marchent qu'une fois l'appli ajoutée à l'écran d'accueil. */
export const needsInstallForPush = () => /iPhone|iPad/.test(navigator.userAgent) && !(navigator as any).standalone;

export async function enableNotifications(uid: string): Promise<boolean> {
  if (!pushSupported()) return false;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted' || !VAPID_KEY) return false;
  const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) return false;
  const reg = await navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' });
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  if (token) await addFcmToken(uid, token);
  return !!token;
}
