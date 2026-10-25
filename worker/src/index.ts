// Worker Cloudflare BeHoop — media.behoop.be
//  /api/*  : API authentifiée par jeton Firebase (envoi R2 pré-signé, montage, Moments, notifications, compte)
//  /m/*    : diffusion des médias R2 avec contrôle d'accès par cookie signé (HMAC, 6 h) + cache Cloudflare
import { AwsClient } from 'aws4fetch';
import { verifyIdToken, accessToken, type FirebaseUser } from './google';
import { Firestore } from './firestore';
import { signCookie, verifyCookie, readCookie, canAccess, contentType, safeName } from './access';
import { sendToUsers, followersOfTeams } from './notify';
import { settingsToStore } from '../../shared/types';
import { N } from '../../shared/notifText';
import { clubApi, spacesOf } from './club';

export interface Env {
  BUCKET: R2Bucket;
  FIREBASE_PROJECT_ID: string; FIREBASE_SERVICE_ACCOUNT: string; GITHUB_TOKEN: string; GITHUB_REPO: string;
  RENDER_SECRET: string; MEDIA_COOKIE_SECRET: string; ALLOWED_ORIGINS: string; SITE_URL: string;
  R2_ACCOUNT_ID: string; R2_JURISDICTION?: string; R2_ACCESS_KEY_ID: string; R2_SECRET_ACCESS_KEY: string; R2_BUCKET: string;
  ANTHROPIC_API_KEY?: string; SUPER_ADMIN_UID?: string;
}
const COOKIE_TTL = 6 * 3600;
const json = (d: unknown, status = 200, h: HeadersInit = {}) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json', ...h } });
const fail = (msg: string, status = 400) => new Response(msg, { status });

function cors(req: Request, env: Env): Record<string, string> {
  const o = req.headers.get('Origin') ?? '';
  if (!env.ALLOWED_ORIGINS.split(',').includes(o)) return {};
  return { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range', Vary: 'Origin' };
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    // auth.behoop.be : pages de connexion Firebase (Google…) servies sous le domaine BeHoop plutôt que sous
    // l'identifiant technique du projet (basket-awbb-club.firebaseapp.com), simple relais vers celui-ci.
    if (url.hostname === 'auth.behoop.be') return authProxy(req, env, url);
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    let res: Response;
    try {
      if (url.pathname.startsWith('/m/')) res = await serveMedia(req, env, ctx, decodeURIComponent(url.pathname.slice(3)));
      else if (url.pathname.startsWith('/api/')) res = await api(req, env, url.pathname.slice(4));
      else res = fail('BeHoop media', 404);
    } catch (e) {
      const m = String((e as Error)?.message ?? e);
      res = m.startsWith('AUTH') ? fail('Non connecté', 401) : m.startsWith('FORBIDDEN') ? fail('Accès refusé', 403) : (console.error(m), fail('Erreur serveur', 500));
    }
    const out = new Response(res.body, res);
    Object.entries(h).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  },
};

/* ---------------- Connexion (auth.behoop.be) ----------------
 * Relais documenté par Firebase (« proxy auth requests to firebaseapp.com ») : seules les pages /__/auth/ et
 * /__/firebase/ sont transmises, telles quelles, au domaine Firebase du projet. */
async function authProxy(req: Request, env: Env, url: URL): Promise<Response> {
  if (!url.pathname.startsWith('/__/auth/') && !url.pathname.startsWith('/__/firebase/')) return Response.redirect('https://behoop.be/app/', 302);
  const target = new URL(url.pathname + url.search, `https://${env.FIREBASE_PROJECT_ID}.firebaseapp.com`);
  const r = await fetch(target.toString(), { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body, redirect: 'manual' });
  return new Response(r.body, r);
}

/* ---------------- Médias ---------------- */
async function serveMedia(req: Request, env: Env, ctx: ExecutionContext, key: string): Promise<Response> {
  const claims = await verifyCookie(readCookie(req.headers.get('Cookie')), env.MEDIA_COOKIE_SECRET);
  if (!canAccess(key, claims)) return fail(claims ? 'Accès refusé' : 'Non connecté', claims ? 403 : 401);
  const range = req.headers.get('Range');
  // Cache Cloudflare (clé interne, après le contrôle d'accès) pour les segments et playlists
  const cacheKey = new Request(`https://cache.behoop.internal/${key}`);
  if (!range) { const hit = await caches.default.match(cacheKey); if (hit) return withPrivate(hit); }
  const obj = await env.BUCKET.get(key, range ? { range: req.headers } : {});
  if (!obj) return fail('Introuvable', 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Content-Type', contentType(key, headers.get('Content-Type') ?? undefined));
  headers.set('ETag', obj.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', key.endsWith('.m3u8') ? 'public, max-age=60' : 'public, max-age=31536000, immutable');
  if (range && 'range' in obj && obj.range) {
    const r = obj.range as { offset: number; length: number };
    headers.set('Content-Range', `bytes ${r.offset}-${r.offset + r.length - 1}/${obj.size}`);
    return withPrivate(new Response((obj as R2ObjectBody).body, { status: 206, headers }));
  }
  const resp = new Response((obj as R2ObjectBody).body, { headers });
  if (obj.size < 50_000_000) ctx.waitUntil(caches.default.put(cacheKey, resp.clone()));
  return withPrivate(resp);
}
function withPrivate(r: Response) { const o = new Response(r.body, r); o.headers.set('Cache-Control', 'private, max-age=3600'); return o; }

/* ---------------- API ---------------- */
async function api(req: Request, env: Env, path: string): Promise<Response> {
  const fs = new Firestore(env.FIREBASE_PROJECT_ID, () => accessToken(env.FIREBASE_SERVICE_ACCOUNT));
  const tok = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!tok) throw new Error('AUTH');
  const user = await verifyIdToken(tok, env.FIREBASE_PROJECT_ID).catch(() => { throw new Error('AUTH'); });
  const isAdmin = user.email === 'q.theuninck@gmail.com' && user.email_verified === true;
  const profile = await fs.get<{ banned?: boolean; displayName?: string }>(`profiles/${user.uid}`);
  if (profile?.banned) throw new Error('FORBIDDEN');
  const body: any = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const s3 = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' });
  const r2url = (key: string) => `https://${env.R2_ACCOUNT_ID}${env.R2_JURISDICTION ? '.' + env.R2_JURISDICTION : ''}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const presign = async (key: string, query = '', type?: string) =>
    (await s3.sign(new Request(`${r2url(key)}?${query}${query ? '&' : ''}X-Amz-Expires=3600`, { method: 'PUT', headers: type ? { 'Content-Type': type } : {} }), { aws: { signQuery: true } })).url;
  const memberTeams = async (uid: string) => (await fs.query('members', [['uid', 'EQUAL', uid], ['status', 'EQUAL', 'accepted']], { allDescendants: true })).map((m) => Number(m.teamId));
  const isYouth = async (teamId: number) => { const t = await fs.get<{ ageGroup: string; ageGroupOverride?: string }>(`teamInfo/${teamId}`); return (t?.ageGroupOverride ?? t?.ageGroup) !== 'seniors'; };
  const ownVideo = async (id: string) => { const v = await fs.get<any>(`matchVideos/${id}`); if (!v || (v.authorUid !== user.uid && !isAdmin)) throw new Error('FORBIDDEN'); return v; };

  // Cookie de lecture des médias (6 h) : liste des Équipes 🔒 dont l'utilisateur est membre accepté
  if (path === '/media-cookie') {
    const exp = Math.floor(Date.now() / 1000) + COOKIE_TTL;
    const v = await signCookie({ uid: user.uid, teams: await memberTeams(user.uid), exp }, env.MEDIA_COOKIE_SECRET);
    return json({ exp }, 200, { 'Set-Cookie': `bh_media=${v}; Path=/; Max-Age=${COOKIE_TTL}; HttpOnly; Secure; SameSite=None` });
  }

  // ----- Montage : création du document matchVideos (visibilité déduite de l'équipe, jamais choisie)
  if (path === '/montage/init') {
    const { id, gameId, teamId, settings } = body;
    if (!/^[a-z0-9]{8,32}$/.test(id)) return fail('id invalide');
    const youth = await isYouth(teamId);
    if (youth && !(await memberTeams(user.uid)).includes(teamId) && !isAdmin) return fail("Rejoins l'Équipe 🔒 pour créer sa vidéo.", 403);
    await fs.create(`matchVideos/${id}`, { matchAwbbId: gameId, authorUid: user.uid, authorName: profile?.displayName ?? '', teamIds: [settings.home.awbbTeamId ?? 0, settings.away.awbbTeamId ?? 0],
      visibility: youth ? 'team' : 'public', teamIdPrivate: youth ? teamId : null, status: 'uploading', version: 0, settings: settingsToStore(settings) as any, media: [], title: settings.title, createdAt: new Date() });
    const v = await ownVideo(id);
    return json({ ok: true, visibility: v.visibility });
  }
  if (path.startsWith('/montage/') && req.method === 'DELETE') {
    const id = path.split('/')[2]; const v = await ownVideo(id);
    await fs.set(`matchVideos/${id}`, { status: 'deleted' });
    await fs.delete(`posts/video-${id}`);
    const prefix = `videos/${v.visibility === 'team' ? `team-${v.teamIdPrivate}` : 'public'}/${id}/`;
    for (let c: string | undefined; ;) { const l = await env.BUCKET.list({ prefix, cursor: c }); if (l.objects.length) await env.BUCKET.delete(l.objects.map((o) => o.key)); if (!l.truncated) break; c = l.cursor; }
    return json({ ok: true });
  }

  // ----- Envoi direct navigateur → R2 (multipart S3, URLs pré-signées)
  if (path === '/upload/create') {
    await ownVideo(body.matchVideoId);
    const key = `rushes/${body.matchVideoId}/${crypto.randomUUID().slice(0, 8)}-${safeName(body.name)}`;
    const mp = await env.BUCKET.createMultipartUpload(key, { httpMetadata: { contentType: body.type }, customMetadata: { uid: user.uid } });
    return json({ key, uploadId: mp.uploadId });
  }
  if (path === '/upload/sign') {
    const mv = /^rushes\/([a-z0-9]+)\//.exec(body.key)?.[1]; if (!mv) return fail('clé invalide');
    await ownVideo(mv);
    const urls: Record<number, string> = {};
    for (const n of (body.parts as number[]).slice(0, 10)) urls[n] = await presign(body.key, `partNumber=${n}&uploadId=${encodeURIComponent(body.uploadId)}`);
    return json({ urls });
  }
  if (path === '/upload/complete') {
    const mv = /^rushes\/([a-z0-9]+)\//.exec(body.key)?.[1]; if (!mv) return fail('clé invalide');
    await ownVideo(mv);
    const up = env.BUCKET.resumeMultipartUpload(body.key, body.uploadId);
    await up.complete((body.parts as { partNumber: number; etag: string }[]).sort((a, b) => a.partNumber - b.partNumber));
    return json({ ok: true });
  }
  if (path === '/upload/single') {
    if (body.size > (body.kind === 'clip' ? 200_000_000 : 25_000_000)) return fail('fichier trop gros');
    let key: string;
    if (body.kind === 'avatar') key = `avatars/${user.uid}-${crypto.randomUUID().slice(0, 6)}.jpg`;
    else if (body.kind === 'clip') { const ext = /quicktime/.test(body.type) ? 'mov' : /webm/.test(body.type) ? 'webm' : 'mp4'; key = `clips/${user.uid}/${crypto.randomUUID().slice(0, 12)}.${ext}`; }
    else if (body.kind === 'logo') key = `logos/${Number(body.teamId) || 'x'}-${crypto.randomUUID().slice(0, 8)}.png`;
    else if (body.rush) { await ownVideo(body.matchVideoId); key = `rushes/${body.matchVideoId}/${crypto.randomUUID().slice(0, 8)}.jpg`; }
    else {
      // Photo d'un post : la visibilité vient de l'équipe liée (Jeunes → dossier privé de l'Équipe 🔒)
      const team = Number(body.teamId) || null;
      const youth = team ? await isYouth(team) : false;
      if (youth && !(await memberTeams(user.uid)).includes(team!)) return fail('Réservé aux membres', 403);
      key = `photos/${youth ? `team-${team}` : 'public'}/${safeName(String(body.postId))}/${Number(body.n) || 0}.jpg`;
    }
    return json({ key, url: await presign(key, '', body.type) });
  }

  // ----- Rendu : renderJobs + workflow_dispatch GitHub Actions
  if (path === '/render') {
    const v = await ownVideo(body.matchVideoId);
    if (body.media) await fs.set(`matchVideos/${body.matchVideoId}`, { media: body.media, settings: settingsToStore(body.settings) as any, title: body.settings.title });
    await fs.set(`matchVideos/${body.matchVideoId}`, { status: 'queued' });
    await fs.set(`renderJobs/${body.matchVideoId}`, { matchVideoId: body.matchVideoId, authorUid: v.authorUid, status: 'queued', step: "En file d'attente…", progress: 0, error: null, startedAt: new Date(), finishedAt: null });
    await dispatch(env, 'render.yml', { matchVideoId: body.matchVideoId });
    return json({ ok: true });
  }
  if (path === '/moments') {
    const v = await fs.get<any>(`matchVideos/${body.matchVideoId}`);
    if (!v || v.status !== 'ready') return fail('Vidéo indisponible', 404);
    if (v.visibility === 'team' && !(await memberTeams(user.uid)).includes(v.teamIdPrivate) && !isAdmin) throw new Error('FORBIDDEN');
    const start = Math.max(0, Number(body.start)), end = Number(body.end);
    if (!(end - start >= 15 && end - start <= 30)) return fail('Durée entre 15 et 30 s');
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await fs.set(`moments/${id}`, { matchVideoId: body.matchVideoId, authorUid: user.uid, authorName: profile?.displayName ?? '', start, end, status: 'queued', visibility: v.visibility, teamIdPrivate: v.teamIdPrivate ?? null, createdAt: new Date() }, false);
    await dispatch(env, 'moment.yml', { momentId: id });
    return json({ id });
  }

  // ----- Lecture auto du score (API Claude vision) — optionnelle
  if (path === '/score-ocr') {
    if (!env.ANTHROPIC_API_KEY) return json(null);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 50, messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: String(body.image).slice(0, 4_000_000) } },
        { type: 'text', text: 'Photo d’un tableau d’affichage de basket. Réponds uniquement en JSON {"home": <score équipe locale>, "away": <score visiteurs>}, ou null si illisible.' }] }] }),
    });
    if (!r.ok) return json(null);
    const t = ((await r.json()) as any).content?.[0]?.text ?? 'null';
    try { const j = JSON.parse(t.match(/\{[^}]*\}|null/)?.[0] ?? 'null'); return json(j && Number.isInteger(j.home) && Number.isInteger(j.away) ? j : null); } catch { return json(null); }
  }

  // ----- Notifications déclenchées par l'appli
  if (path === '/notify/parent-removal') {
    const p = await fs.get<any>(`posts/${body.postId}`);
    if (!p?.hidden || p.hiddenReason !== 'parent') return fail('rien à faire');
    await fs.set(`reports/${body.postId}_parent`, { postId: body.postId, reporterUid: user.uid, reason: 'Retrait parent (contenu masqué)', status: 'open', createdAt: new Date() }, false);
    const to = [p.authorUid, env.SUPER_ADMIN_UID].filter(Boolean) as string[];
    await sendToUsers(fs, env, to, { title: N.removedTitle, body: N.removedBody, url: '/app/#/moderation' }, 'parent', null);
    return json({ ok: true });
  }
  if (path === '/notify/live-final') {
    const l = await fs.get<any>(`liveScores/${Number(body.gameId)}`);
    if (!l || l.status !== 'final' || l.notified) return json({ ok: true });
    await fs.set(`liveScores/${Number(body.gameId)}`, { notified: true });
    const uids = await followersOfTeams(fs, env, l.teamIds);
    await sendToUsers(fs, env, uids, { title: N.liveFinal(l.home, l.away), body: N.liveBody, url: '/app/#/matchs' }, 'live', l.teamIds[0]);
    return json({ ok: true });
  }
  // Demande d'accès à une Équipe 🔒 → responsables de l'équipe (ou super admin si elle n'en a pas encore)
  if (path === '/notify/join-request') {
    const teamId = Number(body.teamId);
    const me = await fs.get<any>(`teamMembers/${teamId}/members/${user.uid}`);
    if (!me || me.status !== 'pending') return json({ ok: true });
    const resp = (await fs.query('members', [['role', 'EQUAL', 'responsable'], ['status', 'EQUAL', 'accepted']], { parent: `teamMembers/${teamId}` })).map((m) => m._path.split('/').pop() as string);
    const to = resp.length ? resp : [env.SUPER_ADMIN_UID].filter(Boolean) as string[];
    await sendToUsers(fs, env, to, { title: N.joinTitle, body: N.joinBody(profile?.displayName, me.message ? ` « ${String(me.message).slice(0, 80)} »` : ''), url: `/app/#/equipes/${teamId}` }, 'joinRequest', null);
    return json({ ok: true });
  }
  // Demande acceptée → le nouveau membre (appel par un responsable ou le super admin)
  const grantFromJoin = async (uid: string, teamId: number, m: any) => {
    const rel = String(m.relation ?? '');
    if (!['joueur', 'parent', 'coach'].includes(rel)) return;
    const idx: any = await fetch(`${env.SITE_URL}/app-data/index.json`).then((r) => r.json()).catch(() => null);
    const club = idx?.clubs?.find((c: any) => c.teams?.some((t: any) => t.id === teamId));
    if (!club) return;
    const admin = (path2: string, b: any) => clubApi(path2, { fs, env, user, profile, isAdmin: true, body: b, json });
    const base = { uid, club_id: String(club.id), club_name: club.name, name: m.displayName ?? '', email: '' };
    if (rel === 'joueur') await admin('/admin/set-role', { ...base, role: 'player', team_id: String(teamId) });
    // Un coach n'est nommé que si c'est l'admin du club (ou le super admin) qui accepte
    if (rel === 'coach' && !isAdmin && !spacesOf(await fs.get<any>(`users/${user.uid}`))[`${club.id}~club_admin`]) return;
    if (rel === 'coach') {
      const u = await fs.get<any>(`users/${uid}`), cur = (u?.spaces ?? {})[`${club.id}~coach`]?.team_ids ?? (u?.role === 'coach' && String(u.club_id) === String(club.id) ? u.team_ids ?? [] : []);
      await admin('/admin/set-role', { ...base, role: 'coach', team_ids: [...new Set([...cur, String(teamId)])] });
    }
    if (rel === 'parent') {
      const prenom = String(m.child ?? '').trim();
      // Fiche de l'enfant : celle de l'équipe au même prénom, sinon nouvelle fiche
      const cards = await fs.query('players', [['team_id', 'EQUAL', String(teamId)]]);
      let card = prenom ? cards.find((p: any) => String(p.prenom ?? '').trim().toLowerCase() === prenom.toLowerCase()) : null;
      if (!card && prenom) { const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20); await fs.set(`players/${id}`, { club_id: String(club.id), team_id: String(teamId), account_uid: '', parent_uids: [], prenom, nom: '', created_at: new Date() } as any); card = { _path: `players/${id}` }; }
      if (card) await admin('/admin/link', { player_id: card._path.split('/').pop(), parent_uid: uid, on: true, club_name: club.name, name: m.displayName ?? '' });
      else await admin('/admin/set-role', { ...base, role: 'parent' });
    }
  };
  if (path === '/notify/join-accepted') {
    const teamId = Number(body.teamId), uid = String(body.uid).replace(/[^\w-]/g, '');
    const me = await fs.get<any>(`teamMembers/${teamId}/members/${user.uid}`);
    if (!isAdmin && !(me?.status === 'accepted' && me?.role === 'responsable')) throw new Error('FORBIDDEN');
    const m = await fs.get<any>(`teamMembers/${teamId}/members/${uid}`);
    if (m?.status === 'accepted') {
      // Un seul système de rôles : la demande acceptée crée le rôle dans le club (joueur et sa fiche, parent relié à l'enfant, coach de l'équipe)
      await grantFromJoin(uid, teamId, m).catch((e) => console.error('rôle club', e));
      await sendToUsers(fs, env, [uid], { title: N.welcomeTitle, body: N.welcomeBody, url: `/app/#/equipes/${teamId}` }, 'joinAccepted', null);
    }
    return json({ ok: true });
  }
  if (path === '/notify/carpool') {
    // event : request / withdrawn (passager → conducteur), accepted / refused (conducteur → un passager), cancelled (conducteur → tous)
    const gid = Number(body.gameId);
    const o = await fs.get<any>(`carpools/${gid}/offers/${String(body.offerId).replace(/\W/g, '')}`);
    const url = `/app/#/matchs?g=${gid}&car=1`, who = profile?.displayName, reqs: Record<string, any> = o?.requests ?? {};
    const ev = String(body.event ?? 'request');
    if (o && (ev === 'request' || ev === 'withdrawn') && reqs[user.uid] && o.driverUid !== user.uid)
      await sendToUsers(fs, env, [o.driverUid], { title: N.carpool, body: ev === 'request' ? N.carpoolReply(who) : N.carpoolWithdrawn(who), url }, 'carpool', null);
    else if (o && (ev === 'accepted' || ev === 'refused') && o.driverUid === user.uid && reqs[String(body.to)])
      await sendToUsers(fs, env, [String(body.to)], { title: N.carpool, body: ev === 'accepted' ? N.carpoolAccepted(who) : N.carpoolRefused(who), url }, 'carpool', null);
    else if (o && ev === 'cancelled' && o.driverUid === user.uid) {
      const to = Object.entries(reqs).filter(([, r]) => r?.status !== 'refused').map(([u]) => u);
      if (to.length) await sendToUsers(fs, env, to, { title: N.carpool, body: N.carpoolCancelled(who), url }, 'carpool', null);
    }
    return json({ ok: true });
  }

  // ----- Espace Club : espaces (club + rôle), liens avec les Équipes BeHoop, QR code, outils du super admin (worker/src/club.ts)
  if (path.startsWith('/club/') || path.startsWith('/admin/') || path.startsWith('/support/')) { const r = await clubApi(path, { fs, env, user, profile, isAdmin, body, json, notify: (uids, title, text, url) => sendToUsers(fs, env, uids, { title: { fr: title, nl: title, en: title }, body: { fr: text, nl: text, en: text }, url }, 'support', null) }); if (r) return r; }

  if (path === '/notify/hoopcamp') {
    // assign : un coach envoie un programme (joueurs et parents prévenus) ; done : séance finie → parents et coach ;
    // rated : séance validée → le joueur (ou le parent qui gère l'enfant). Vérifié côté serveur avec les liens de l'Espace Club.
    const ev = String(body.event ?? ''), me = await fs.get<any>(`users/${user.uid}`), who = profile?.displayName ?? me?.display_name;
    if (ev === 'assign') {
      const a = await fs.get<any>(`hoopcamp_assign/${String(body.assignId).replace(/\W/g, '')}`);
      if (!a || me?.role !== 'coach' || !(me.team_ids ?? []).includes(a.team_id)) return json({ ok: false });
      const players = (await fs.query('players', [['team_id', 'EQUAL', a.team_id]])).filter((p: any) => !a.player_ids?.length || a.player_ids.includes(p._path.split('/').pop()));
      const to = players.flatMap((p: any) => [p.account_uid, ...(p.parent_uids ?? [])]).filter(Boolean);
      if (to.length) await sendToUsers(fs, env, to, { title: N.hoopcamp, body: N.hoopcampAssign(who, String(a.title ?? a.program?.name ?? 'Hoop Camp').slice(0, 60)), url: '/app/#/espace' }, 'hoopcamp', null);
      return json({ ok: true });
    }
    const pid = String(body.playerId).replace(/[^\w-]/g, ''), p = await fs.get<any>(`players/${pid}`);
    if (!p) return json({ ok: false });
    if (ev === 'done' && (p.account_uid === user.uid || (p.parent_uids ?? []).includes(user.uid))) {
      const coaches = p.team_id ? (await fs.get<any>(`teams/${p.team_id}`))?.coach_uids ?? [] : [];
      const to = [...(p.parent_uids ?? []), ...coaches].filter((u: string) => u !== user.uid);
      const name = p.prenom || who;
      if (to.length) await sendToUsers(fs, env, to, { title: N.hoopcamp, body: N.hoopcampDone(name, Math.max(1, Number(body.count) || 1)), url: `/app/#/camp/valider/${pid}` }, 'hoopcamp', null);
    } else if (ev === 'rated' && ((p.parent_uids ?? []).includes(user.uid) || (me?.role === 'coach' && (me.team_ids ?? []).includes(p.team_id)))) {
      const to = p.account_uid ? [p.account_uid] : [];
      if (to.length && to[0] !== user.uid) await sendToUsers(fs, env, to, { title: N.hoopcamp, body: N.hoopcampRated(who), url: `/app/#/camp/hoopcamp/${pid}` }, 'hoopcamp', null);
    }
    return json({ ok: true });
  }

  // ----- Suppression du compte et de ses données (RGPD)
  if (path === '/account' && req.method === 'DELETE') {
    for (const f of await fs.query('items', [], { parent: `follows/${user.uid}` }).catch(() => [])) await fs.delete(f._path);
    for (const m of await fs.query('members', [['uid', 'EQUAL', user.uid]], { allDescendants: true })) await fs.delete(m._path);
    for (const p of await fs.query('posts', [['authorUid', 'EQUAL', user.uid]])) {
      for (const ph of p.payload?.photos ?? []) await env.BUCKET.delete(ph.key).catch(() => {});
      await fs.delete(p._path);
    }
    for (const v of await fs.query('matchVideos', [['authorUid', 'EQUAL', user.uid]])) await fs.set(v._path, { status: 'deleted', authorUid: 'supprimé' });
    // Commentaires (actus, matchs, publications) : liste personnelle myComments/{uid}, effacés puis compteur du fil recalculé
    const threads = new Set<string>();
    for (const m of await fs.query('items', [], { parent: `myComments/${user.uid}` }).catch(() => [])) {
      const id = m._path.split('/').pop()!;
      if (typeof m.thread === 'string' && /^(news|game|post)-[\w-]+$/.test(m.thread)) { await fs.delete(`threads/${m.thread}/comments/${id}`); threads.add(`threads/${m.thread}`); }
      await fs.delete(m._path);
    }
    for (const th of threads) await fs.set(th, { comments: (await fs.query('comments', [], { parent: th }).catch(() => [])).length });
    // Covoiturage : liste personnelle myCarpools/{uid} → mes annonces supprimées, mes demandes et mon téléphone retirés
    for (const m of await fs.query('items', [], { parent: `myCarpools/${user.uid}` }).catch(() => [])) {
      const id = m._path.split('/').pop()!.replace(/\W/g, ''), off = `carpools/${Number(m.game)}/offers/${id}`;
      await fs.delete(`${off}/contacts/${user.uid}`).catch(() => {});
      const o = await fs.get<any>(off);
      if (o?.driverUid === user.uid) await fs.delete(off);
      else if (o?.requests?.[user.uid]) { const { [user.uid]: _, ...rest } = o.requests; await fs.set(off, { requests: rest }); }
      await fs.delete(m._path);
    }
    await fs.delete(`legalAcceptances/${user.uid}`);
    await fs.delete(`profiles/${user.uid}`);
    return json({ ok: true });
  }
  return fail('Route inconnue', 404);
}

async function dispatch(env: Env, workflow: string, inputs: Record<string, string>) {
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'behoop-worker' },
    body: JSON.stringify({ ref: 'main', inputs }),
  });
  if (!r.ok) throw new Error(`GitHub ${r.status} ${await r.text()}`);
}
export type { FirebaseUser };
