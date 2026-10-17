// Notifications FCM (HTTP v1) depuis le Worker, avec préférences par type et anti-spam
// (max 1 notification par équipe et par heure, sauf « Ta vidéo est prête »).
import type { Firestore } from './firestore';
import { accessToken } from './google';
import type { Env } from './index';

export interface Notif { title: string; body: string; url: string }

export async function sendToUsers(fs: Firestore, env: Env, uids: string[], n: Notif, type: string, teamId: number | null) {
  const hour = new Date().toISOString().slice(0, 13);
  const token = await accessToken(env.FIREBASE_SERVICE_ACCOUNT);
  for (const uid of [...new Set(uids)].slice(0, 500)) {
    const p = await fs.get<{ notifPrefs?: Record<string, boolean>; fcmTokens?: string[] }>(`profiles/${uid}`);
    if (!p?.fcmTokens?.length || p.notifPrefs?.[type] === false) continue;
    if (teamId && type !== 'videoReady') {
      const log = `notifLog/${uid}_${teamId}_${hour}`;
      if (await fs.get(log)) continue;
      await fs.set(log, { at: new Date() }, false);
    }
    for (const t of p.fcmTokens) {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token: t, notification: { title: n.title, body: n.body }, data: { url: n.url, tag: type },
          webpush: { fcmOptions: { link: env.SITE_URL + n.url }, notification: { icon: '/icons/icon-192.png' } } } }),
      });
      if (r.status === 404 || r.status === 400) {
        // jeton expiré : on le retire du profil
        const left = (p.fcmTokens ?? []).filter((x) => x !== t);
        await fs.set(`profiles/${uid}`, { fcmTokens: left });
      }
    }
  }
}

let clubIndex: Map<number, number> | null = null;
/** Comptes qui suivent ces équipes (directement ou via leur club). */
export async function followersOfTeams(fs: Firestore, env: Env, teamIds: number[]): Promise<string[]> {
  if (!clubIndex) {
    clubIndex = new Map();
    const idx = (await (await fetch(`${env.SITE_URL}/app-data/index.json`, { cf: { cacheTtl: 3600 } } as RequestInit)).json()) as { clubs: { id: number; teams: { id: number }[] }[] };
    idx.clubs.forEach((c) => c.teams.forEach((t) => clubIndex!.set(t.id, c.id)));
  }
  const clubs = [...new Set(teamIds.map((t) => clubIndex!.get(t)).filter(Boolean) as number[])];
  const a = await fs.query('items', [['type', 'EQUAL', 'team'], ['refId', 'IN', teamIds]], { allDescendants: true });
  const b = clubs.length ? await fs.query('items', [['type', 'EQUAL', 'club'], ['refId', 'IN', clubs]], { allDescendants: true }) : [];
  return [...a, ...b.filter((f) => !teamIds.every((t) => (f.mutedTeams ?? []).includes(t)))].map((f) => f.uid ?? f._path.split('/')[1]);
}
