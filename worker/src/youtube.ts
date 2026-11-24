// Publication sur YouTube (chaîne de chaque utilisateur, OAuth Google) :
//  • l'identifiant et le secret du client OAuth sont rangés par l'admin dans Firestore config/google (jamais lisibles par l'appli) ;
//  • la connexion d'une chaîne garde le jeton de rafraîchissement dans ytTokens/{uid} (serveur seulement) ;
//  • l'envoi de la vidéo se fait du serveur (workflow youtube.yml), jamais depuis le téléphone.
import type { Firestore } from './firestore';

export const YT_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';
export const YT_CALLBACK = 'https://media.behoop.be/youtube/callback';
export interface GoogleConfig { clientId: string; clientSecret: string }

export async function googleConfig(fs: Firestore): Promise<GoogleConfig | null> {
  const c = await fs.get<GoogleConfig>('config/google');
  return c?.clientId && c?.clientSecret ? c : null;
}

/** Jeton d'accès (1 h) à partir du jeton de rafraîchissement d'un utilisateur */
export async function ytAccess(cfg: GoogleConfig, refreshToken: string): Promise<string> {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(j.error === 'invalid_grant' ? 'YT_RECONNECT' : `Google ${r.status}`);
  return j.access_token;
}

/** Retour de Google après « Connecter ma chaîne » : échange du code, chaîne, retour vers l'appli */
export async function ytCallback(url: URL, fs: Firestore, site: string): Promise<Response> {
  const code = url.searchParams.get('code'), state = url.searchParams.get('state') ?? '';
  const st = /^[a-z0-9]{20,64}$/.test(state) ? await fs.get<{ uid: string; exp: number; back?: string }>(`ytStates/${state}`) : null;
  const to = st?.back ?? '#/profil';
  const back = (r: string) => Response.redirect(`${site}/app/${to}${to.includes('?') ? '&' : '?'}yt=${r}`, 302);
  if (!code || !st) return back('annule');
  await fs.delete(`ytStates/${state}`).catch(() => {});
  if (st.exp < Date.now()) return back('expire');
  const cfg = await googleConfig(fs); if (!cfg) return back('erreur');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: YT_CALLBACK, grant_type: 'authorization_code' }) });
  const tok: any = await r.json().catch(() => ({}));
  if (!r.ok || !tok.access_token) return back('erreur');
  if (!String(tok.scope ?? '').includes(YT_SCOPE)) return back('droits'); // case YouTube décochée sur l'écran de Google
  const ch: any = await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${tok.access_token}` } })).json().catch(() => ({}));
  const c = ch.items?.[0];
  if (!c) return back('sanschaine');
  const old = await fs.get<{ refreshToken?: string }>(`ytTokens/${st.uid}`);
  const refreshToken = tok.refresh_token ?? old?.refreshToken;
  if (!refreshToken) return back('erreur');
  await fs.set(`ytTokens/${st.uid}`, { refreshToken, channelId: c.id, channelTitle: c.snippet?.title ?? '', channelThumb: c.snippet?.thumbnails?.default?.url ?? '', at: Date.now() }, false);
  return back('ok');
}
