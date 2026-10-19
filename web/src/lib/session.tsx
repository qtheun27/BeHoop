import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';
import * as D from './db';
import { loadIndex, type Club } from './data';
import { SUPER_ADMIN_EMAIL } from './config';
import { t, lang, onLang } from './i18n';
import { applyTheme, DEFAULT_THEME } from './theme';

interface Session {
  ready: boolean; user: User | null; profile: D.Profile | null; isAdmin: boolean;
  follows: D.Follow[]; memberships: D.Membership[];
  /** Équipes suivies (directement ou via un club, moins les équipes désactivées) */
  followedTeams: number[]; followedClubs: number[]; targets: string[];
  privateTeams: number[]; responsibleTeams: number[];
  refresh: () => Promise<void>; setProfile: (p: D.Profile | null) => void;
  toggleFollow: (type: 'club' | 'team', id: number) => Promise<void>;
  /** Ouvre la feuille de connexion puis rejoue l'action */
  requireAuth: (then?: () => void) => boolean; authSheet: (() => void) | null | undefined; closeAuth: () => void;
  logout: () => Promise<void>; toast: (m: string) => void; toastMsg: string;
}
const Ctx = createContext<Session>(null as unknown as Session);
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<D.Profile | null>(null);
  const [follows, setFollows] = useState<D.Follow[]>([]);
  const [memberships, setMemberships] = useState<D.Membership[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [authSheet, setAuthSheet] = useState<(() => void) | null | undefined>(undefined);
  const [toastMsg, setToast] = useState('');

  const load = useCallback(async (u: User | null) => {
    if (!u) { setProfile(null); setFollows([]); setMemberships([]); return; }
    const [p, f, m] = await Promise.all([D.getProfile(u.uid), D.listFollows(u.uid).catch(() => []), D.myMemberships(u.uid).catch(() => [])]);
    // Club fusionné (ancien identifiant) : on déplace le suivi vers la fiche actuelle
    const alias = (await loadIndex().catch(() => null))?.alias ?? {};
    for (const x of f) {
      const n = x.type === 'club' ? alias[x.refId] : undefined;
      if (!n) continue;
      if (!f.some((y) => y.type === 'club' && y.refId === n)) D.follow(u.uid, 'club', n).catch(() => {});
      D.unfollow(u.uid, 'club', x.refId).catch(() => {});
      x.refId = n; x.id = D.followId('club', n);
    }
    if (p && !p.avatarUrl && u.photoURL) { p.avatarUrl = u.photoURL; D.updateProfile(u.uid, { avatarUrl: u.photoURL }).catch(() => {}); }
    setProfile(p); setFollows([...new Map(f.map((x) => [x.id, x])).values()]); setMemberships(m);
  }, []);
  useEffect(() => onAuthStateChanged(auth, async (u) => { setUser(u); try { await load(u); } finally { setReady(true); } }), [load]);
  useEffect(() => { loadIndex().then((i) => setClubs(i.clubs)).catch(() => {}); }, []);
  // Le site public (behoop.be) affiche « Ouvrir mon fil » quand on est connecté
  useEffect(() => {
    try { if (user && profile) localStorage.setItem('behoop.session', profile.displayName); else if (ready && !user) localStorage.removeItem('behoop.session'); } catch { /* stockage indisponible */ }
  }, [user, profile, ready]);
  // Langue de l'appli enregistrée sur le profil : les notifications arrivent dans cette langue
  useEffect(() => {
    if (!user || !profile) return;
    if (profile.lang !== lang()) D.updateProfile(user.uid, { lang: lang() }).catch(() => {});
    return onLang((l) => { D.updateProfile(user.uid, { lang: l }).catch(() => {}); });
  }, [user, profile?.lang, !!profile]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!profile) return;
    applyTheme({ ...DEFAULT_THEME, mode: profile.theme ?? 'auto', ...profile.ui }, clubs);
  }, [profile, clubs]);

  const toast = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); }, []);
  const derived = useMemo(() => {
    const teams = new Set<number>(), cl: number[] = [];
    for (const f of follows) {
      if (f.type === 'team') teams.add(f.refId);
      else { cl.push(f.refId); clubs.find((c) => c.id === f.refId)?.teams.forEach((t) => { if (!f.mutedTeams?.includes(t.id)) teams.add(t.id); }); }
    }
    const acc = memberships.filter((m) => m.status === 'accepted');
    return {
      followedTeams: [...teams], followedClubs: cl,
      targets: [...[...teams].map((t) => `t:${t}`), ...cl.map((c) => `c:${c}`)],
      privateTeams: acc.map((m) => m.teamId), responsibleTeams: acc.filter((m) => m.role === 'responsable').map((m) => m.teamId),
    };
  }, [follows, memberships, clubs]);

  const toggleFollow = useCallback(async (type: 'club' | 'team', id: number) => {
    if (!user) return;
    const exists = follows.some((f) => f.type === type && f.refId === id);
    // UI optimiste
    setFollows((fs) => (exists ? fs.filter((f) => !(f.type === type && f.refId === id)) : [...fs, { id: D.followId(type, id), type, refId: id, mutedTeams: [] }]));
    try { exists ? await D.unfollow(user.uid, type, id) : await D.follow(user.uid, type, id); }
    catch { toast(t('Impossible de modifier le suivi. Réessaie.')); setFollows(await D.listFollows(user.uid)); }
  }, [user, follows, toast]);

  const value: Session = {
    ready, user, profile, isAdmin: !!user?.email && user.email === SUPER_ADMIN_EMAIL && user.emailVerified,
    follows, memberships, ...derived,
    refresh: () => load(user), setProfile, toggleFollow,
    requireAuth: (then) => { if (user && profile) return true; setAuthSheet(() => then ?? null); return false; },
    authSheet, closeAuth: () => setAuthSheet(undefined),
    logout: async () => { await signOut(auth); }, toast, toastMsg,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
