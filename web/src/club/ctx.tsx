// Espace Club : qui je suis dans le club (rôle, équipes, joueurs liés), chargé une fois pour tout l'espace.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from '../lib/session';
import { loadIndex, type Club, type Team } from '../lib/data';
import { AGES, type Age } from '../hoopcamp/types';
import * as A from './api';
import { api } from '../lib/api';

interface ClubCtx {
  loading: boolean;
  me: A.ClubUser | null;
  /** Invitation en attente pour mon e-mail (pas encore de compte club) */
  inv: A.Invitation | null;
  /** Fiche BeHoop du club (nom, logo, équipes) */
  club: Club | null;
  /** Mes joueurs : ma propre fiche (joueur) ou mes enfants (parent) */
  players: A.Player[];
  /** Équipes qui me concernent (coach : les siennes ; joueur/parent : celles des joueurs ; admin : toutes) */
  teamIds: string[];
  team: (id: string | null | undefined) => Team | undefined;
  clubName: (id: string) => string;
  reload: () => Promise<void>;
}
const Ctx = createContext<ClubCtx>(null as unknown as ClubCtx);
export const useClub = () => useContext(Ctx);

export function ClubProvider({ children }: { children: ReactNode }) {
  const s = useSession();
  const [st, set] = useState<Omit<ClubCtx, 'reload' | 'team'>>({ loading: true, me: null, inv: null, club: null, players: [], teamIds: [], clubName: (id) => id });
  const load = useCallback(async () => {
    const u = s.user;
    if (!u) { set({ loading: false, me: null, inv: null, club: null, players: [], teamIds: [], clubName: (id) => id }); return; }
    const real = await A.getMe(u.uid).catch(() => null);
    // Super admin qui gère un club depuis la console (Modération → Clubs) : il le voit comme son admin, sans rôle ajouté
    let manage = ''; try { manage = sessionStorage.getItem('espace-gerer') ?? ''; } catch { /* */ }
    // Le super admin a tout débloqué : même dans un espace joueur ou parent, il voit le club comme son admin
    if (s.isAdmin && !manage && real?.club_id && !['coach', 'club_admin', 'super_admin'].includes(real.role)) manage = real.club_id;
    const me: A.ClubUser | null = s.isAdmin && manage ? { ...(real ?? { uid: u.uid }), uid: u.uid, role: 'super_admin', club_id: manage, team_ids: [], children_player_ids: [],
      spaces: A.spacesOf(real) } as A.ClubUser : real;
    // Invitation en attente (aussi pour un compte déjà dans un autre club : il pourra rejoindre ce club en plus)
    const pend = await A.pendingInvitation(u.email);
    const inv = pend && !A.spacesOf(me)[`${pend.club_id}~${pend.role}`] ? pend : null;
    const idx = await loadIndex().catch(() => null);
    const clubId = me?.club_id ?? inv?.club_id;
    const clubs = idx?.clubs ?? [];
    const club = clubId ? idx?.clubs.find((c) => String(c.id) === String(clubId)) ?? null : null;
    let players: A.Player[] = [];
    if (me?.role === 'player') players = (await A.myPlayerCards(u.uid).catch(() => [])).filter((p) => p.club_id === me.club_id);
    if (me?.role === 'parent') players = (await A.childrenOf(u.uid).catch(() => [])).filter((p) => p.club_id === me.club_id);
    const teamIds = me?.role === 'coach' ? me.team_ids ?? []
      : me?.role === 'club_admin' || me?.role === 'super_admin' ? (club?.teams ?? []).map((t) => String(t.id))
        : [...new Set(players.map((p) => p.team_id).filter((x): x is string => !!x))];
    set({ loading: false, me, inv, club, players, teamIds, clubName: (id: string) => clubs.find((c) => String(c.id) === id)?.name ?? Object.values(A.spacesOf(me)).find((x) => x.club_id === id)?.club_name ?? id });
    // Liens Espace Club → Équipes BeHoop (coach = responsable, joueur/parent = membre), une fois par session
    if (me) { const k = `club-sync-${u.uid}`; let done = false; try { done = !!sessionStorage.getItem(k); sessionStorage.setItem(k, '1'); } catch { /* */ }
      if (!done) api('/club/sync', {}).then(() => s.refresh()).catch(() => {}); }
  }, [s.user, s.isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const team = useCallback((id: string | null | undefined) => (id ? st.club?.teams.find((t) => String(t.id) === String(id)) : undefined), [st.club]);
  const v = useMemo(() => ({ ...st, reload: load, team }), [st, load, team]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

/** Catégorie d'âge Hoop Camp déduite de l'équipe (« U14 », « Minimes »…) ; seniors → U21 */
export function ageOfTeam(t?: Team): Age | null {
  if (!t) return null;
  const m = /\bU\s?(\d{1,2})\b/i.exec(`${t.cat} ${t.name}`);
  if (m) { const n = +m[1]; return (AGES.find((a) => +a.slice(1) >= n) ?? 'U21') as Age; }
  if (t.ag === 'seniors' || /senior|dame|heren|messieurs|r\d|p\d/i.test(`${t.cat} ${t.name}`)) return 'U21';
  return null;
}
export const ROLE_LABEL: Record<A.Role, string> = { super_admin: 'Administrateur BeHoop', club_admin: 'Admin du club', coach: 'Coach', player: 'Joueur', parent: 'Parent' };
/** Nom d'équipe lisible : « P1H JS Stambruges A » plutôt que « P1H A P1H JS Stambruges A » */
export const teamName = (tm?: Team) => (!tm ? '' : !tm.name || tm.name === tm.cat ? tm.cat : tm.name.includes(tm.cat) || tm.name.split(' ')[0] === tm.cat.split(' ')[0] ? tm.name : `${tm.cat} · ${tm.name}`);
export const playerName = (p: A.Player) => `${p.prenom}${p.nom ? ` ${p.nom}` : ''}`.trim() || '—';
