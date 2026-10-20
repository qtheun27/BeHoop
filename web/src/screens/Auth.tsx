import { useEffect, useMemo, useState } from 'react';
import {
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { loadIndex, loadComps, normalize, teamLabel, type Club, type Competition } from '../lib/data';
import { CompLogo } from '../ui/CompLogo';
import { Sheet, Disc, Skeleton } from '../ui/kit';
import { haptic, shortName, store } from '../lib/util';
import { enableNotifications } from '../lib/push';
import { t } from '../lib/i18n';
import { Ico } from '../ui/icons';

const msg = (e: any): string => {
  const c = String(e?.code ?? '');
  if (c.includes('popup-closed') || c.includes('cancelled')) return '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return t('E-mail ou mot de passe incorrect.');
  if (c.includes('email-already-in-use')) return t('Un compte existe déjà avec cet e-mail : connecte-toi.');
  if (c.includes('weak-password')) return t('Mot de passe trop court (6 caractères minimum).');
  if (c.includes('invalid-email')) return t('Adresse e-mail invalide.');
  if (c.includes('network')) return t('Pas de connexion internet.');
  return t('Une erreur est survenue. Réessaie.');
};

/** Feuille de connexion / inscription, déclenchée par une action (Suivre, Réagir, Publier). */
export function AuthSheet({ onClose, finishOnly }: { onClose: () => void; finishOnly?: boolean }) {
  const s = useSession();
  const [mode, setMode] = useState<'lien' | 'mdp'>('lien');
  const [email, setEmail] = useState(store.get('behoop.email', ''));
  const [pwd, setPwd] = useState('');
  const [creating, setCreating] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // Étape 2 : profil (prénom, nom, âge, CGU)
  const [first, setFirst] = useState(''); const [last, setLast] = useState('');
  const [age, setAge] = useState(false); const [cgu, setCgu] = useState(false);

  // Connexion réussie avec un profil existant : on ferme la feuille et on rejoue l'action demandée
  useEffect(() => {
    if (s.user && s.profile && !finishOnly) { const then = s.authSheet; onClose(); if (typeof then === 'function') then(); }
  }, [s.user, s.profile]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (s.user) { const n = s.user.displayName?.split(' ') ?? []; setFirst((f) => f || n[0] || ''); setLast((l) => l || n.slice(1).join(' ')); }
  }, [s.user]);

  const run = async (f: () => Promise<unknown>) => { setErr(t('')); setBusy(true); try { await f(); } catch (e) { setErr(msg(e)); } finally { setBusy(false); } };
  const google = () => run(async () => {
    const p = new GoogleAuthProvider();
    try { await signInWithPopup(auth, p); } catch (e: any) { if (String(e?.code).includes('popup-blocked')) await signInWithRedirect(auth, p); else throw e; }
    await s.refresh();
  });
  const link = () => run(async () => {
    store.set('behoop.email', email);
    await sendSignInLinkToEmail(auth, email, { url: `${location.origin}/app/#/fil`, handleCodeInApp: true });
    setSent(true);
  });
  const password = () => run(async () => {
    if (creating) await createUserWithEmailAndPassword(auth, email, pwd); else await signInWithEmailAndPassword(auth, email, pwd);
    await s.refresh();
  });
  const finish = () => run(async () => {
    if (!s.user) return;
    const p = await D.createProfile(s.user.uid, shortName(`${first} ${last}`));
    s.setProfile(p); haptic();
    const then = s.authSheet; onClose(); if (typeof then === 'function') then();
  });

  if (s.user && !s.profile) {
    return (
      <Sheet title={t('Crée ton profil')} onClose={finishOnly ? () => {} : onClose}>
        <p className="muted">{t('Ton nom s’affiche ainsi :')} <b>{shortName(`${first || t('Prénom')} ${last || t('Nom')}`)}</b></p>
        <label className="label" htmlFor="fn">{t('Prénom')}</label><input id="fn" className="field" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" />
        <label className="label" htmlFor="ln">{t('Nom')}</label><input id="ln" className="field" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
        <label className="check"><input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} />{t('J’ai 13 ans ou plus.')}</label>
        <label className="check"><input type="checkbox" checked={cgu} onChange={(e) => setCgu(e.target.checked)} />
          <span>{t('J’accepte les')} <a href="#/legal/cgu" target="_blank">{t('conditions d’utilisation')}</a>, {t('la')} <a href="#/legal/confidentialite" target="_blank">{t('politique de confidentialité')}</a> {t('et la')} <a href="#/legal/charte" target="_blank">{t('charte')}</a>.</span></label>
        {err && <div className="err">{err}</div>}
        <button className="btn mt" disabled={!first.trim() || !last.trim() || !age || !cgu || busy} onClick={finish}>{t('Continuer')}</button>
        <button className="btn ghost mt" onClick={() => s.logout()}>{t('Se déconnecter')}</button>
      </Sheet>
    );
  }
  return (
    <Sheet title={t('Connexion')} onClose={onClose}>
      <p className="center muted" style={{ marginTop: 0 }}>{t('Suis tes clubs, réagis aux résultats et publie les photos et vidéos de tes matchs.')}</p>
      <button className="btn secondary" onClick={google} disabled={busy} style={{ color: 'var(--text)' }}>
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>
        {t('Continuer avec Google')}
      </button>
      <div className="center muted" style={{ margin: '18px 0', fontSize: 14 }}>{t('ou avec ton e-mail')}</div>
      <div className="seg" role="tablist">
        <button className={mode === 'lien' ? 'on' : ''} onClick={() => setMode('lien')}>{t('Lien magique')}</button>
        <button className={mode === 'mdp' ? 'on' : ''} onClick={() => setMode('mdp')}>{t('Mot de passe')}</button>
      </div>
      {sent ? (
        <div className="center"><div className="ill-tile" aria-hidden><Ico n="mail" /></div><h3>{t('Regarde tes e-mails')}</h3><p className="muted">{t('Clique sur le lien envoyé à')} <b>{email}</b> {t('depuis ce téléphone pour te connecter.')}</p></div>
      ) : (
        <>
          <input className="field" type="email" inputMode="email" autoComplete="email" placeholder="ton@email.be" value={email} onChange={(e) => setEmail(e.target.value)} aria-label={t('E-mail')} />
          {mode === 'mdp' && <input className="field" style={{ marginTop: 10 }} type="password" autoComplete={creating ? 'new-password' : 'current-password'} placeholder={t('Mot de passe')} value={pwd} onChange={(e) => setPwd(e.target.value)} aria-label={t('Mot de passe')} />}
          {err && <div className="err mt">{err}</div>}
          <button className="btn mt" disabled={busy || !/.+@.+\..+/.test(email) || (mode === 'mdp' && pwd.length < 6)} onClick={mode === 'lien' ? link : password}>
            {mode === 'lien' ? t('Recevoir le lien') : creating ? t('Créer mon compte') : t('Se connecter')}
          </button>
          {mode === 'mdp' && (
            <div className="hstack mt" style={{ justifyContent: 'space-between' }}>
              <button className="btn ghost small" onClick={() => setCreating(!creating)}>{creating ? t('J’ai déjà un compte') : t('Créer un compte')}</button>
              <button className="btn ghost small" onClick={() => run(async () => { await sendPasswordResetEmail(auth, email); setErr(t('E-mail de réinitialisation envoyé.')); })}>{t('Mot de passe oublié')}</button>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

/** Termine la connexion par lien magique au retour sur l'appli. */
export async function completeEmailLink() {
  if (!isSignInWithEmailLink(auth, location.href)) return;
  let email = store.get('behoop.email', '');
  if (!email) email = prompt(t('Confirme ton adresse e-mail')) ?? '';
  if (email) await signInWithEmailLink(auth, email, location.href).catch(() => {});
  history.replaceState(null, '', '/app/#/fil');
}
completeEmailLink();

/** Onboarding (3 écrans) : clubs → équipes → notifications. */
const tr = t;
export function Onboarding() {
  const s = useSession();
  const [step, setStep] = useState(0);
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [teams, setTeams] = useState<number[]>([]);
  const [comps, setComps] = useState<Competition[]>([]);
  const [pickedComps, setPickedComps] = useState<string[]>([]);
  useEffect(() => { loadIndex().then((i) => setClubs(i.clubs)); loadComps().then((c) => setComps(c.filter((x) => x.rank < 20).slice(0, 8))).catch(() => {}); }, []);
  const list = useMemo(() => {
    if (!clubs) return [];
    const n = normalize(q);
    return clubs.filter((c) => !n || normalize(`${c.name} ${c.city}`).includes(n)).slice(0, 40);
  }, [clubs, q]);
  const done = async () => {
    if (!s.user) return;
    for (const c of picked) {
      await D.follow(s.user.uid, 'club', c);
      const all = clubs!.find((x) => x.id === c)!.teams.map((t) => t.id);
      const muted = teams.length ? all.filter((t) => !teams.includes(t)) : [];
      if (muted.length) await D.setMuted(s.user.uid, c, muted);
    }
    for (const c of pickedComps) await D.followComp(s.user.uid, c);
    await D.updateProfile(s.user.uid, { onboarded: true });
    await s.refresh(); location.hash = '/fil';
  };
  return (
    <main className="screen no-tabs">
      <div className="dots" style={{ justifyContent: 'center', margin: '16px 0' }} aria-label={t('Étape {n} sur 3', { n: step + 1 })}>
        {[0, 1, 2].map((i) => <i key={i} style={{ width: 28, height: 4, borderRadius: 2, background: i <= step ? 'var(--accent)' : 'var(--bg3)' }} />)}
      </div>
      {step === 0 && <>
        <h1 className="large-title">{t('Tes clubs')}</h1>
        <p className="muted">{t('Choisis les compétitions et les clubs que tu veux suivre : leurs résultats et leurs actus arriveront dans ton fil.')}</p>
        {comps.length > 0 && <><div className="group-title">{t('Compétitions')}</div>
          <div className="chips" style={{ flexWrap: 'wrap' }}>{comps.map((c) => { const on = pickedComps.includes(c.id); return (
            <button key={c.id} className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => { haptic(); setPickedComps((p) => on ? p.filter((x) => x !== c.id) : [...p, c.id]); }}><CompLogo c={c} size={22} /> {c.name}</button>); })}</div>
          <div className="group-title">{t('Clubs')}</div></>}
        <div className="search"><input className="field" placeholder={t('Rechercher un club ou une ville')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {!clubs ? <Skeleton h={56} n={6} /> : <div className="group">{list.map((c) => (
          <button key={c.id} className="row" onClick={() => { haptic(); setPicked((p) => p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]); }} aria-pressed={picked.includes(c.id)}>
            <Disc src={c.logo} name={c.name} size={36} ring={c.c1} /><div className="grow"><div className="ellipsis">{c.name}</div><div className="sub">{c.city} · {c.province}</div></div>
            <span style={{ width: 22, color: 'var(--accent)' }}>{picked.includes(c.id) && <Ico n="check" size={22} />}</span>
          </button>))}</div>}
        <div style={{ position: 'sticky', bottom: 'calc(var(--safe-b) + 12px)' }}><button className="btn" disabled={!picked.length && !pickedComps.length} onClick={() => setStep(picked.length ? 1 : 2)}>{t('Continuer')} ({picked.length + pickedComps.length})</button>
          <button className="btn ghost" onClick={() => setStep(2)}>{t('Plus tard')}</button></div>
      </>}
      {step === 1 && <>
        <h1 className="large-title">{t('Tes équipes')}</h1>
        <p className="muted">{t('Laisse tout décoché pour suivre toutes les équipes de tes clubs, ou choisis celles qui t\'intéressent.')}</p>
        {picked.map((cid) => { const c = clubs!.find((x) => x.id === cid)!; return (
          <div key={cid}><div className="group-title">{c.name}</div><div className="group">{c.teams.map((t) => (
            <label key={t.id} className="row"><div className="grow">{teamLabel(t)} <span className="sub">{t.ag === 'jeunes' ? `· ${tr('Jeunes')}` : ''}</span></div>
              <input type="checkbox" className="switch" checked={teams.includes(t.id)} onChange={() => setTeams((x) => x.includes(t.id) ? x.filter((y) => y !== t.id) : [...x, t.id])} /></label>))}</div></div>); })}
        <button className="btn" onClick={() => setStep(2)}>{t('Continuer')}</button>
      </>}
      {step === 2 && <div className="center" style={{ paddingTop: 40 }}>
        <div className="ill-tile" aria-hidden><Ico n="bell" /></div>
        <h1 className="large-title">{t('Ne rate rien')}</h1>
        <p className="muted">{t('Rappel 2 h avant les matchs, résultats finaux, nouvelles vidéos. Tu peux tout régler dans ton profil.')}</p>
        <button className="btn mt" onClick={async () => { await enableNotifications(s.user!.uid).catch(() => {}); await done(); }}>{t('Activer les notifications')}</button>
        <button className="btn ghost" onClick={done}>{t('Pas maintenant')}</button>
      </div>}
    </main>
  );
}
