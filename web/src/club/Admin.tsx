// Administration du club : invitations (seule porte d'entrée), membres et équipes des coachs, joueurs.
import { useState } from 'react';
import { useSession } from '../lib/session';
import { t, tn } from '../lib/i18n';
import { Sheet, Skeleton, Empty, useAsync } from '../ui/kit';
import { Ico } from '../ui/icons';
import * as A from './api';
import { useClub, playerName, ROLE_LABEL } from './ctx';

export function AdminSpace() {
  const k = useClub();
  const [tab, setTab] = useState<'invitations' | 'membres' | 'joueurs'>('invitations');
  const clubId = k.me!.club_id;
  return (
    <>
      <section className="hc-hero small">
        <div className="hc-kick"><Ico n="club" />{t('Mon club')}</div>
        <h2>{k.club?.name ?? clubId}</h2>
        <p>{t('Invite les coachs, les joueurs et les parents. Chacun ne voit que ce qui le concerne.')}</p>
      </section>
      <div className="seg work-seg" role="tablist">
        {([['invitations', 'Invitations'], ['membres', 'Membres'], ['joueurs', 'Joueurs']] as const).map(([id, l]) => <button key={id} role="tab" className={tab === id ? 'on' : ''} aria-selected={tab === id} onClick={() => setTab(id)}>{t(l)}</button>)}
      </div>
      {tab === 'invitations' && <Invitations clubId={clubId} />}
      {tab === 'membres' && <Members clubId={clubId} />}
      {tab === 'joueurs' && <Players clubId={clubId} />}
    </>
  );
}

function TeamSelect({ value, onChange, empty }: { value: string; onChange: (v: string) => void; empty?: string }) {
  const k = useClub();
  return (
    <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      {empty && <option value="">{empty}</option>}
      {(k.club?.teams ?? []).map((tm) => <option key={tm.id} value={String(tm.id)}>{tm.cat}{tm.name && tm.name !== tm.cat ? ` · ${tm.name}` : ''}</option>)}
    </select>
  );
}

function Invitations({ clubId }: { clubId: string }) {
  const s = useSession();
  const k = useClub();
  const inv = useAsync(() => A.invitationsOf(clubId), [clubId]);
  const [f, setF] = useState({ email: '', role: 'player' as A.Role, team_id: '' });
  const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim());
  const send = async () => {
    try {
      await A.invite({ email: f.email, role: f.role, club_id: clubId, club_name: k.club?.name, team_id: f.team_id || null });
      s.toast(t('Invitation créée. Préviens la personne : elle se connecte sur BeHoop avec cette adresse.'));
      setF({ ...f, email: '' }); inv.reload();
    } catch { s.toast(t('Accès refusé.')); }
  };
  const pending = (inv.data ?? []).filter((i) => i.status === 'pending');
  return (
    <>
      <div className="form card-form">
        <input className="field" type="email" inputMode="email" placeholder={t('Adresse e-mail')} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <select className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as A.Role })}>
          {(['player', 'parent', 'coach', 'club_admin'] as A.Role[]).map((r) => <option key={r} value={r}>{t(ROLE_LABEL[r])}</option>)}
        </select>
        {f.role !== 'club_admin' && <TeamSelect value={f.team_id} onChange={(v) => setF({ ...f, team_id: v })} empty={t('Équipe (facultatif)')} />}
        <p className="hint">{f.role === 'player' ? t('Joueur : il aura son propre compte. Si l’enfant n’a pas d’e-mail, mets l’adresse d’un parent : il pourra choisir « je suis le parent ».')
          : f.role === 'parent' ? t('Parent : il ajoutera son enfant (ou le reliera à une fiche existante) à sa première connexion.')
            : f.role === 'coach' ? t('Coach : il gère l’équipe choisie (tu pourras lui en ajouter d’autres dans Membres).') : t('Admin : gère tout le club, comme toi.')}</p>
        <button className="btn volt" disabled={!ok} onClick={send}><Ico n="mail" />{t('Inviter')}</button>
      </div>
      <h3 className="group-title mt">{t('En attente')}</h3>
      {inv.loading ? <Skeleton n={2} /> : !pending.length ? <p className="hint">{t('Aucune invitation en attente.')}</p> : (
        <div className="group">
          {pending.map((i) => (
            <div key={i.id} className="row">
              <span className="grow"><span className="nm">{i.email}</span><span className="sub">{t(ROLE_LABEL[i.role])}{i.team_id && k.team(i.team_id) ? ` · ${k.team(i.team_id)!.cat}` : ''}</span></span>
              <button className="icon-btn" aria-label={t('Annuler')} onClick={async () => { await A.cancelInvitation(i.id); inv.reload(); }}><Ico n="close" /></button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Members({ clubId }: { clubId: string }) {
  const s = useSession();
  const k = useClub();
  const us = useAsync(() => A.usersOf(clubId), [clubId]);
  const [edit, setEdit] = useState<(A.ClubUser & { id: string }) | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  if (us.loading) return <Skeleton n={3} />;
  const order: A.Role[] = ['club_admin', 'coach', 'parent', 'player', 'super_admin'];
  return (
    <>
      {order.map((r) => {
        const l = (us.data ?? []).filter((u) => u.role === r);
        if (!l.length) return null;
        return (
          <section key={r}>
            <h3 className="group-title">{t(ROLE_LABEL[r])} · {l.length}</h3>
            <div className="group">
              {l.map((u) => (
                <button key={u.id} className="row" onClick={() => { setEdit(u); setSel(u.team_ids ?? []); }}>
                  <span className="grow"><span className="nm">{u.display_name || u.email}</span>
                    <span className="sub">{u.email}{u.role === 'coach' ? ` · ${(u.team_ids ?? []).map((id) => k.team(id)?.cat ?? id).join(', ') || t('aucune équipe')}` : ''}</span></span>
                  <span className="chev">›</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {edit && (
        <Sheet title={edit.display_name || edit.email || ''} onClose={() => setEdit(null)}>
          <div className="form">
            <p className="hint">{t(ROLE_LABEL[edit.role])} · {edit.email}</p>
            {edit.role === 'player' && <PlayerTeam clubId={clubId} uid={edit.id} name={edit.display_name || ''} onDone={() => { setEdit(null); us.reload(); }} />}
            {edit.role === 'coach' && (
              <>
                <h3 className="group-title">{t('Équipes coachées')}</h3>
                <div className="chips wrap">{(k.club?.teams ?? []).map((tm) => { const id = String(tm.id); return <button key={id} className={`chip${sel.includes(id) ? ' on' : ''}`} onClick={() => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])}>{tm.cat}</button>; })}</div>
                <button className="btn volt" onClick={async () => { try { await A.setCoachTeams(clubId, edit.id, edit.team_ids ?? [], sel); setEdit(null); us.reload(); } catch { s.toast(t('Accès refusé.')); } }}>{t('Enregistrer')}</button>
              </>
            )}
            {edit.uid !== s.user?.uid && <button className="btn danger mt" onClick={async () => { if (confirm(t('Retirer ce membre du club ? Son compte BeHoop reste actif.'))) { await A.removeMember(edit.id); setEdit(null); us.reload(); } }}>{t('Retirer du club')}</button>}
          </div>
        </Sheet>
      )}
    </>
  );
}

function Players({ clubId }: { clubId: string }) {
  const s = useSession();
  const k = useClub();
  const ps = useAsync(() => A.playersOfClub(clubId), [clubId]);
  const [edit, setEdit] = useState<A.Player | null>(null);
  const [team, setTeam] = useState('');
  const [add, setAdd] = useState({ open: false, prenom: '', nom: '', team: '' });
  if (ps.loading) return <Skeleton n={3} />;
  const groups = new Map<string, A.Player[]>();
  for (const p of ps.data ?? []) { const key = p.team_id ?? ''; (groups.get(key) ?? groups.set(key, []).get(key)!).push(p); }
  return (
    <>
      <button className="btn secondary" onClick={() => setAdd({ ...add, open: true })}><Ico n="userAdd" />{t('Ajouter un joueur')}</button>
      {!ps.data?.length && <Empty ill="users" title={t('Aucun joueur')} />}
      {[...groups].sort(([a], [b]) => (k.team(a)?.cat ?? 'zz').localeCompare(k.team(b)?.cat ?? 'zz')).map(([tid, l]) => (
        <section key={tid}>
          <h3 className="group-title mt">{tid ? `${k.team(tid)?.cat ?? tid}` : t('Sans équipe')} · {tn(l.length, '{n} joueur', '{n} joueurs')}</h3>
          <div className="group">
            {l.map((p) => (
              <button key={p.id} className="row" onClick={() => { setEdit(p); setTeam(p.team_id ?? ''); }}>
                <span className="grow"><span className="nm">{playerName(p)}</span><span className="sub">{p.account_uid ? t('a son compte') : p.parent_uids.length ? t('géré par un parent') : t('sans compte')}</span></span><span className="chev">›</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {edit && (
        <Sheet title={playerName(edit)} onClose={() => setEdit(null)}>
          <div className="form">
            <label className="lbl">{t('Équipe')}<TeamSelect value={team} onChange={setTeam} empty={t('Sans équipe')} /></label>
            <button className="btn volt" onClick={async () => { await A.movePlayer(edit.id, team || null); setEdit(null); ps.reload(); }}>{t('Enregistrer')}</button>
            <a className="btn secondary" href={`#/espace/hoopcamp/${edit.id}`}>{t('Voir son Hoop Camp')}</a>
            <button className="btn danger" onClick={async () => { if (confirm(t('Supprimer la fiche de ce joueur ?'))) { try { await A.deletePlayer(edit.id); setEdit(null); ps.reload(); } catch { s.toast(t('Accès refusé.')); } } }}>{t('Supprimer la fiche')}</button>
          </div>
        </Sheet>
      )}
      {add.open && (
        <Sheet title={t('Ajouter un joueur')} onClose={() => setAdd({ ...add, open: false })}>
          <div className="form">
            <input className="field" placeholder={t('Prénom')} value={add.prenom} onChange={(e) => setAdd({ ...add, prenom: e.target.value })} />
            <input className="field" placeholder={t('Nom (facultatif)')} value={add.nom} onChange={(e) => setAdd({ ...add, nom: e.target.value })} />
            <TeamSelect value={add.team} onChange={(v) => setAdd({ ...add, team: v })} empty={t('Sans équipe')} />
            <button className="btn volt" disabled={!add.prenom.trim()} onClick={async () => { await A.addPlayer(clubId, add.team || null, add.prenom.trim(), add.nom.trim()); setAdd({ open: false, prenom: '', nom: '', team: '' }); ps.reload(); }}>{t('Ajouter')}</button>
          </div>
        </Sheet>
      )}
    </>
  );
}

/** Équipe d'un joueur qui a son compte : sa fiche joueur dans le club (créée si elle manque) */
function PlayerTeam({ clubId, uid, name, onDone }: { clubId: string; uid: string; name: string; onDone: () => void }) {
  const s = useSession();
  const card = useAsync(() => A.myPlayerCards(uid).then((l) => l.find((p) => p.club_id === clubId) ?? null).catch(() => null), [uid]);
  const [team, setTeam] = useState<string | null>(null);
  if (card.loading) return <Skeleton n={1} h={44} />;
  const cur = team ?? card.data?.team_id ?? '';
  return (
    <>
      <label className="lbl">{t('Équipe')}<TeamSelect value={cur} onChange={setTeam} empty={t('Sans équipe')} /></label>
      <button className="btn volt" onClick={async () => {
        try {
          if (card.data) await A.movePlayer(card.data.id, cur || null);
          else await A.addPlayerCard(clubId, cur || null, uid, name.split(' ')[0] || name);
          s.toast(t('Enregistré.')); onDone();
        } catch { s.toast(t('Accès refusé.')); }
      }}>{t('Enregistrer')}</button>
    </>
  );
}
