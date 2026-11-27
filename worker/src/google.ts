// Jetons Google : vérification des ID tokens Firebase (jose + clés publiques Google) et
// jeton OAuth du compte de service (Firestore REST + FCM HTTP v1).
import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
export interface FirebaseUser { uid: string; email?: string; email_verified?: boolean; child?: boolean; parent?: string }
export async function verifyIdToken(token: string, projectId: string): Promise<FirebaseUser> {
  const { payload } = await jwtVerify(token, JWKS, { issuer: `https://securetoken.google.com/${projectId}`, audience: projectId });
  if (!payload.sub) throw new Error('jeton invalide');
  return { uid: payload.sub, email: payload.email as string | undefined, email_verified: payload.email_verified as boolean | undefined,
    child: payload.child === true, parent: typeof payload.parent === 'string' ? payload.parent : undefined };
}

let cached: { token: string; exp: number } | null = null;
export async function accessToken(saJson: string): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const sa = JSON.parse(saJson) as { client_email: string; private_key: string };
  const key = await importPKCS8(sa.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/identitytoolkit' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(sa.client_email).setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}` });
  if (!r.ok) throw new Error(`OAuth ${r.status}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

/** Jeton personnalisé Firebase (connexion d'un accès enfant) : signé par le compte de service, avec des attributs (child, parent) */
export async function customToken(saJson: string, uid: string, claims: Record<string, unknown>): Promise<string> {
  const sa = JSON.parse(saJson) as { client_email: string; private_key: string };
  const key = await importPKCS8(sa.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ uid, claims }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(sa.client_email).setSubject(sa.client_email)
    .setAudience('https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit').setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
}
/** Supprime un compte de connexion Firebase (accès enfant coupé : ses sessions ne peuvent plus être renouvelées) */
export async function deleteAuthUser(saJson: string, projectId: string, uid: string): Promise<void> {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:delete`, { method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken(saJson)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: uid }) });
  if (!r.ok && r.status !== 400) throw new Error(`suppression du compte ${r.status}`);
}
