// Accès enfant (moins de 13 ans compris) : créé et géré par le parent depuis son profil. L'enfant se connecte sur sa tablette ou
// son téléphone avec un code à usage unique (15 min), sans e-mail ni mot de passe. Il voit ses matchs et les photos, vidéos et
// Moments de son équipe ; il ne publie, ne commente, ne fait pas de covoiturage et ne rejoint aucune équipe.
import { useEffect, useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { api } from '../lib/api';
import { WORKER_URL } from '../lib/config';
import { useSession } from '../lib/session';
import { useAsync, Sheet, Screen } from '../ui/kit';
import { Ico } from '../ui/icons';
import { t } from '../lib/i18n';
import { haptic } from '../lib/util';
import { teamIndex, teamLabel } from '../lib/data';

interface Kid { id: string; name: string; teamIds: number[] }
interface ParentTeam { teamId: number; child: string }

function useTeamNames() {
  const idx = useAsync(() => teamIndex(), []).data;
  return (id: number) => { const e = idx?.get(id); return e ? `${e.club.short ?? e.club.name} · ${teamLabel(e.team)}` : `${t('Équipe')} ${id}`; };
}

/** Profil du parent : ses accès enfant (créer, donner un code, choisir les équipes, couper l'accès) */
export function KidsSection() {
  const s = useSession();
  const list = useAsync(() => api<{ kids: Kid[]; teams: ParentTeam[] }>('/child/list', {}), []);
  const name = useTeamNames();
  const [create, setCreate] = useState(false);
  const [code, setCode] = useState<{ kid: Kid; code: string; exp: number } | null>(null);
  const [edit, setEdit] = useState<Kid | null>(null);
  if (s.isChild || !list.data) return null;
  const { kids, teams } = list.data;
  const giveCode = async (k: Kid) => { try { const r = await api<{ code: string; exp: number }>('/child/code', { id: k.id }); setCode({ kid: k, ...r }); } catch { s.toast(t('Action impossible. Réessaie.')); } };
  const revoke = async (k: Kid) => { if (!confirm(t('Couper l’accès de {name} ? Il sera déconnecté de BeHoop.', { name: k.name }))) return;
    try { await api('/child/revoke', { id: k.id }); s.toast(t('Accès coupé')); list.reload(); } catch { s.toast(t('Action impossible. Réessaie.')); } };
  return (
    <>
      <div className="group-title"><Ico n="lock" />{t('Accès enfant')}</div>
      <div className="group">
        {kids.map((k) => (
          <div key={k.id} className="row kid-row"><div className="grow"><b>{k.name}</b><div className="sub">{k.teamIds.map(name).join(' · ')}</div></div>
            <button className="btn small" onClick={() => giveCode(k)}>{t('Code de connexion')}</button>
            <button className="btn small ghost" onClick={() => setEdit(k)} aria-label={t('Équipes de {name}', { name: k.name })}>{t('Équipes')}</button>
            <button className="btn small ghost" style={{ color: 'var(--red)' }} onClick={() => revoke(k)}>{t('Couper')}</button></div>))}
        <button className="row" onClick={() => setCreate(true)} disabled={!teams.length}>
          <div className="grow"><Ico n="plus" style={{ marginRight: 6 }} />{t('Créer l’accès de mon enfant')}
            <div className="sub">{teams.length ? t('Il verra ses matchs et les photos et vidéos de son équipe, sans pouvoir publier ni commenter.') : t('Rejoins d’abord l’équipe de ton enfant en tant que parent.')}</div></div><span className="chev">›</span></button>
      </div>
      {create && <KidSheet teams={teams} name={name} onClose={() => setCreate(false)} onDone={(k) => { setCreate(false); list.reload(); giveCode(k); }} />}
      {edit && <KidSheet kid={edit} teams={teams} name={name} onClose={() => setEdit(null)} onDone={() => { setEdit(null); list.reload(); }} />}
      {code && <CodeSheet {...code} onClose={() => setCode(null)} />}
    </>
  );
}

/** Créer un accès enfant, ou changer ses équipes */
function KidSheet({ kid, teams, name, onClose, onDone }: { kid?: Kid; teams: ParentTeam[]; name: (id: number) => string; onClose: () => void; onDone: (k: Kid) => void }) {
  const s = useSession();
  const [prenom, setPrenom] = useState(kid?.name ?? teams.find((x) => x.child)?.child ?? '');
  const [sel, setSel] = useState<number[]>(kid?.teamIds ?? teams.filter((x) => !prenom || !x.child || x.child.toLowerCase() === prenom.toLowerCase()).map((x) => x.teamId).slice(0, 1));
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true);
    try {
      if (kid) { await api('/child/teams', { id: kid.id, teamIds: sel }); onDone(kid); }
      else { const r = await api<{ id: string }>('/child/create', { name: prenom.trim(), teamIds: sel }); onDone({ id: r.id, name: prenom.trim(), teamIds: sel }); }
    } catch (e) { s.toast(String((e as Error).message || t('Action impossible. Réessaie.'))); } finally { setBusy(false); } };
  return (
    <Sheet title={kid ? t('Équipes de {name}', { name: kid.name }) : t('Accès de mon enfant')} onClose={onClose}>
      {!kid && <><label className="label" htmlFor="kn">{t('Prénom de ton enfant')}</label>
        <input id="kn" className="field" maxLength={30} value={prenom} onChange={(e) => setPrenom(e.target.value)} /></>}
      <div className="label">{t('Ses équipes')}</div>
      {teams.map((x) => <label key={x.teamId} className="check"><input type="checkbox" checked={sel.includes(x.teamId)}
        onChange={(e) => setSel((l) => (e.target.checked ? [...l, x.teamId] : l.filter((y) => y !== x.teamId)))} />{name(x.teamId)}{x.child ? ` (${x.child})` : ''}</label>)}
      {!kid && <div className="banner mt"><Ico n="lock" /><div style={{ fontSize: 14 }}>{t('Ton enfant verra ses matchs et les photos, vidéos et Moments de son équipe. Il pourra réagir avec 🏀 🔥 👏, mais ne pourra ni publier, ni commenter, ni contacter quelqu’un. Tu peux couper son accès à tout moment.')}</div></div>}
      <button className="btn mt" disabled={busy || !sel.length || (!kid && !prenom.trim())} onClick={save}>{kid ? t('Enregistrer') : t('Créer l’accès')}</button>
    </Sheet>
  );
}

/** Code à usage unique, à taper sur l'appareil de l'enfant (15 minutes) */
function CodeSheet({ kid, code, exp, onClose }: { kid: Kid; code: string; exp: number; onClose: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const left = Math.max(0, Math.round((exp - now) / 1000));
  return (
    <Sheet title={t('Connexion de {name}', { name: kid.name })} onClose={onClose}>
      <ol className="kid-steps">
        <li>{t('Sur la tablette ou le téléphone de {name}, ouvre behoop.be.', { name: kid.name })}</li>
        <li>{t('Touche « Se connecter », puis « J’ai un code enfant ».')}</li>
        <li>{t('Tape ce code :')}</li>
      </ol>
      <div className={`kid-code${left ? '' : ' off'}`} aria-label={code.split('').join(' ')}>{code.slice(0, 3)} {code.slice(3)}</div>
      <p className="center muted">{left ? t('Valable encore {m} min {s} s, une seule fois.', { m: Math.floor(left / 60), s: left % 60 }) : t('Code expiré : demandes-en un nouveau.')}</p>
    </Sheet>
  );
}

/** Écran de connexion : l'enfant tape le code donné par son parent */
export function KidCodeLogin({ onDone }: { onDone?: () => void }) {
  const [code, setCode] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); setErr('');
    try {
      const r = await fetch(`${WORKER_URL}/api/child/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      if (!r.ok) throw new Error(await r.text());
      const { token } = (await r.json()) as { token: string };
      await signInWithCustomToken(auth, token); haptic(); onDone?.();
    } catch { setErr(t('Ce code ne fonctionne pas. Demande un nouveau code à ton parent.')); } finally { setBusy(false); } };
  return (
    <div className="form">
      <p className="muted center" style={{ marginTop: 0 }}>{t('Ton parent te donne un code de 6 lettres et chiffres depuis son profil BeHoop.')}</p>
      <input className="field kid-input" value={code} maxLength={8} autoCapitalize="characters" autoComplete="one-time-code" inputMode="text" placeholder="ABC 123"
        onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label={t('Code enfant')} />
      {err && <div className="err mt">{err}</div>}
      <button className="btn mt" disabled={busy || code.replace(/[^A-Z0-9]/g, '').length !== 6} onClick={go}>{t('Entrer')}</button>
    </div>
  );
}

/** Profil d'un enfant : qui gère son accès, ses équipes, se déconnecter */
export function ChildProfile() {
  const s = useSession();
  const name = useTeamNames();
  return (
    <Screen title={t('Profil')}>
      <div className="group"><div className="row"><div className="grow"><div style={{ fontWeight: 700, fontSize: 18 }}>{s.profile?.displayName}</div>
        <div className="sub">{t('Accès enfant, géré par ton parent')}</div></div></div></div>
      <div className="group-title">{t('Mes équipes')}</div>
      <div className="group">{s.memberships.map((m) => <a key={m.teamId} className="row" href={`#/equipe/${m.teamId}`} style={{ color: 'inherit' }}><div className="grow">{name(m.teamId)}</div><span className="chev">›</span></a>)}</div>
      <p className="muted" style={{ fontSize: 14, margin: '12px 4px' }}>{t('Tu peux regarder les matchs, les photos et les vidéos de ton équipe, et encourager avec 🏀 🔥 👏. Si quelque chose te dérange, parles-en à ton parent ou utilise « Signaler ».')}</p>
      <button className="btn secondary" style={{ width: '100%' }} onClick={() => s.logout()}>{t('Se déconnecter')}</button>
    </Screen>
  );
}
