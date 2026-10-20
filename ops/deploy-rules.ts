// Publication des règles Firestore (firestore.rules) et des index de champ (fieldOverrides de firestore.indexes.json)
// avec le compte de service FIREBASE_SERVICE_ACCOUNT, par l'API Firebase Admin (sans « firebase deploy », qui demande
// des droits Service Usage que ce compte n'a pas). Lancé par .github/workflows/rules.yml après les tests des règles.
import { readFileSync } from 'node:fs';
import { getApp } from 'firebase-admin/app';
import { getSecurityRules } from 'firebase-admin/security-rules';
import { admin } from './lib/admin';

export async function run() {
  admin();
  const app = getApp();
  const project = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!).project_id as string;
  const rs = await getSecurityRules(app).releaseFirestoreRulesetFromSource(readFileSync('firestore.rules', 'utf8'));
  console.log(`Règles publiées : ${rs.name}`);
  // Index de champ (ex. commentaires par auteur, pour la suppression d'un compte). Un refus de droits n'empêche pas les règles.
  const token = (await app.options.credential!.getAccessToken()).access_token;
  const { fieldOverrides = [] } = JSON.parse(readFileSync('firestore.indexes.json', 'utf8')) as { fieldOverrides?: { collectionGroup: string; fieldPath: string; indexes: { order?: string; arrayConfig?: string; queryScope: string }[] }[] };
  for (const f of fieldOverrides) {
    const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/${f.collectionGroup}/fields/${f.fieldPath}?updateMask=indexConfig`;
    const body = { indexConfig: { indexes: f.indexes.map((i) => ({ queryScope: i.queryScope, fields: [{ fieldPath: f.fieldPath, ...(i.order ? { order: i.order } : { arrayConfig: i.arrayConfig }) }] })) } };
    const r = await fetch(url, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    console.log(`Index ${f.collectionGroup}.${f.fieldPath} : ${r.ok ? 'ok' : `${r.status} ${(await r.text()).slice(0, 160)}`}`);
  }
}
if (import.meta.url === `file://${process.argv[1]}`) run().catch((e) => { console.error(e); process.exit(1); });
