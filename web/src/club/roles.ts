// Mes liens avec les clubs, vus depuis l'espace BeHoop : est-ce que je gère (coach, admin) et quels joueurs me concernent
// (ma fiche, mes enfants), tous clubs confondus. Chargé une fois par session.
import { useEffect, useState } from 'react';
import { useSession } from '../lib/session';
import * as A from './api';

export interface ClubRoles { manage: boolean; spaces: A.Space[]; players: A.Player[] }
const MANAGE = new Set(['coach', 'club_admin', 'super_admin']);
let cache: { uid: string; p: Promise<ClubRoles> } | null = null;

export function loadRoles(uid: string, isAdmin: boolean, fresh = false): Promise<ClubRoles> {
  if (!fresh && cache?.uid === uid) return cache.p;
  const p = (async () => {
    const me = await A.getMe(uid).catch(() => null);
    const spaces = Object.values(A.spacesOf(me));
    const roles = new Set(spaces.map((x) => x.role));
    const [mine, kids] = await Promise.all([roles.has('player') ? A.myPlayerCards(uid).catch(() => []) : [], roles.has('parent') ? A.childrenOf(uid).catch(() => []) : []]);
    return { manage: isAdmin || spaces.some((x) => MANAGE.has(x.role)), spaces, players: [...new Map([...mine, ...kids].map((x) => [x.id, x])).values()] };
  })();
  cache = { uid, p };
  return p;
}
export function useClubRoles() {
  const s = useSession();
  const [r, set] = useState<ClubRoles | null>(null);
  useEffect(() => { if (s.user) loadRoles(s.user.uid, s.isAdmin).then(set).catch(() => set({ manage: s.isAdmin, spaces: [], players: [] })); else set(null); }, [s.user, s.isAdmin]);
  return r;
}
