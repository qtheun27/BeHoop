// Covoiturage d'un match (carpools/{match}/offers) : annonces « je propose des places » / « je cherche une place ».
// Demande → le conducteur accepte ou refuse (le passager est prévenu) ; on ne peut pas dépasser les places.
// Le téléphone (enregistré une fois dans le profil, privé) n'est montré qu'aux personnes acceptées (règles Firestore).
// Matchs de jeunes : réservé aux membres de l'Équipe. Rappel la veille à 18 h (ops/notify.ts).
import { useEffect, useState } from 'react';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { api } from '../lib/api';
import { Sheet, Empty } from '../ui/kit';
import { haptic, mapsUrl } from '../lib/util';
import type { Game } from '../lib/data';
import { t } from '../lib/i18n';
import { Ico } from '../ui/icons';

type Req = { status: 'pending' | 'accepted' | 'refused'; name: string };
interface Offer { id: string; kind: 'offer' | 'seek'; driverUid: string; driverName: string; seats: number; from: string; meet?: string; time: string;
  teamIdPrivate: number | null; requests: Record<string, Req> }
type Ev = 'request' | 'withdrawn' | 'accepted' | 'refused' | 'cancelled';

const col = (g: number) => D.collection(D.db, 'carpools', String(g), 'offers');
const q = (g: number, team: number | null) => D.query(col(g), D.where('teamIdPrivate', '==', team));
const accepted = (o: Offer) => Object.values(o.requests ?? {}).filter((x) => x.status === 'accepted').length;
const free = (o: Offer) => Math.max(0, o.seats - accepted(o));
const notify = (gameId: number, offerId: string, event: Ev, to?: string) => api('/notify/carpool', { gameId, offerId, event, to }).catch(() => {});

/** Heure du match moins m minutes (« 20:30 », 60 → « 19:30 ») */
function minus(time: string, m: number) {
  const [h, mi] = time.split(':').map(Number); if (Number.isNaN(h)) return '';
  const x = (h * 60 + (mi || 0) - m + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
}

/** Peut-on voir le covoiturage de ce match ? Jeunes : seulement les membres de l'Équipe */
export function useCarpoolAccess(youthTeam: number | null) {
  const s = useSession();
  return !!s.user && (!youthTeam || s.privateTeams.includes(youthTeam));
}

/** Résumé pour les cartes de match : places libres et personnes qui cherchent */
export function CarpoolBadge({ g, youthTeam }: { g: Game; youthTeam: number | null }) {
  const ok = useCarpoolAccess(youthTeam);
  const [n, setN] = useState<{ seats: number; seek: number } | null>(null);
  useEffect(() => {
    if (!ok) return;
    D.getDocs(q(g.id, youthTeam)).then((x) => {
      const l = x.docs.map((d) => d.data() as Offer);
      setN({ seats: l.filter((o) => o.kind === 'offer').reduce((a, o) => a + free(o), 0), seek: l.filter((o) => o.kind === 'seek').length });
    }).catch(() => {});
  }, [g.id, youthTeam, ok]);
  if (!n || (!n.seats && !n.seek)) return null;
  return <span className="pill car-pill"><Ico n="car" />{n.seats ? t('{n} place(s) dispo', { n: n.seats }) : t('{n} cherche(nt) une place', { n: n.seek })}</span>;
}

export function CarpoolSheet({ g, youthTeam, onClose }: { g: Game; youthTeam: number | null; onClose: () => void }) {
  const s = useSession();
  const me = s.user?.uid ?? '';
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [form, setForm] = useState<'' | 'offer' | 'seek'>('');
  const [edit, setEdit] = useState<Offer | null>(null);
  const suggested = g.t ? minus(g.t, 60) : '';
  const [seats, setSeats] = useState(3), [from, setFrom] = useState(''), [meet, setMeet] = useState(''), [time, setTime] = useState(suggested);
  const [phone, setPhone] = useState(s.profile?.phone ?? '');
  const allowed = useCarpoolAccess(youthTeam);
  useEffect(() => {
    if (!allowed) return;
    return D.onSnapshot(q(g.id, youthTeam), (x) => setOffers(x.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Offer, 'id'>) }))), () => setOffers([]));
  }, [g.id, youthTeam, allowed]);
  if (!allowed) return <Sheet title={t('Covoiturage')} onClose={onClose}><Empty ill="lock" title={t('Réservé à l\'Équipe')} text={t('Pour les matchs de jeunes, le covoiturage est réservé aux membres de l\'Équipe.')} /></Sheet>;

  const run = async (f: () => Promise<unknown>, ok?: string) => { try { await f(); haptic(); if (ok) s.toast(ok); } catch { s.toast(t('Action impossible. Réessaie.')); } };
  /** Téléphone : gardé dans le profil (privé) pour ne plus le retaper, et copié pour cette annonce */
  const savePhone = async (offerId: string) => {
    await D.setDoc(D.doc(D.db, 'myCarpools', me, 'items', offerId), { game: g.id }); // effacé avec le compte (Worker)
    const p = phone.trim();
    if (p !== (s.profile?.phone ?? '')) { await D.updateProfile(me, { phone: p }); s.setProfile({ ...s.profile!, phone: p }); }
    if (p) await D.setDoc(D.doc(D.db, 'carpools', String(g.id), 'offers', offerId, 'contacts', me), { phone: p, name: s.profile!.displayName });
  };
  const open = (k: 'offer' | 'seek', o?: Offer) => {
    setForm(k); setEdit(o ?? null);
    setSeats(o?.seats || 3); setFrom(o?.from ?? ''); setMeet(o?.meet ?? ''); setTime(o?.time || suggested);
  };
  const save = () => run(async () => {
    if (edit) {
      await D.updateDoc(D.doc(col(g.id), edit.id), { seats: form === 'offer' ? Math.max(seats, accepted(edit)) : 0, from, meet, time });
      await savePhone(edit.id);
    } else {
      const ref = D.doc(col(g.id));
      await D.setDoc(ref, { kind: form, driverUid: me, driverName: s.profile!.displayName, seats: form === 'offer' ? seats : 0, from, meet, time,
        teamIdPrivate: youthTeam, requests: {}, gameDate: g.d, createdAt: D.serverTimestamp() });
      await savePhone(ref.id);
    }
    setForm(''); setEdit(null);
  }, edit ? t('Annonce modifiée') : t('Publié'));
  const remove = (o: Offer) => confirm(t('Supprimer ton annonce ? Les personnes acceptées seront prévenues.')) && run(async () => {
    if (Object.keys(o.requests ?? {}).length) await notify(g.id, o.id, 'cancelled');
    await D.deleteDoc(D.doc(D.db, 'carpools', String(g.id), 'offers', o.id, 'contacts', me)).catch(() => {});
    await D.deleteDoc(D.doc(col(g.id), o.id));
  }, t('Annonce supprimée'));
  const ask = (o: Offer) => s.requireAuth() && run(async () => {
    await D.updateDoc(D.doc(col(g.id), o.id), { [`requests.${me}`]: { status: 'pending', name: s.profile!.displayName } });
    await savePhone(o.id);
    notify(g.id, o.id, 'request');
  }, t('Demande envoyée'));
  const withdraw = (o: Offer) => run(async () => {
    await notify(g.id, o.id, 'withdrawn');
    await D.updateDoc(D.doc(col(g.id), o.id), { [`requests.${me}`]: D.deleteField() });
  }, t('Demande annulée'));
  const decide = (o: Offer, uid: string, status: 'accepted' | 'refused') => run(async () => {
    await D.updateDoc(D.doc(col(g.id), o.id), { [`requests.${uid}.status`]: status });
    notify(g.id, o.id, status, uid);
  });

  const mine = (offers ?? []).filter((o) => o.driverUid === me);
  return (
    <Sheet title={t('Covoiturage')} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>{g.hn} – {g.an}{g.t ? ` · ${g.t}` : ''}{g.v ? ` · ${g.v}` : ''}</p>
      {offers !== null && offers.length === 0 && !form && <Empty ill="car" title={t('Personne pour l\'instant')} text={t('Propose des places ou indique que tu en cherches une.')} />}
      {!form && offers?.map((o) => {
        const isMe = o.driverUid === me, r = o.requests?.[me], left = free(o), full = o.kind === 'offer' && left === 0;
        return (
          <div key={o.id} className="group car-offer">
            <div className="hstack" style={{ alignItems: 'flex-start', gap: 10 }}>
              <span className="car-ico"><Ico n={o.kind === 'offer' ? 'car' : 'userAdd'} /></span>
              <div className="grow" style={{ minWidth: 0 }}>
                <b>{o.kind === 'offer' ? (full ? t('{name} · complet', { name: o.driverName }) : t('{name} propose {n} place(s)', { name: o.driverName, n: left })) : t('{name} cherche une place', { name: o.driverName })}</b>
                <div className="muted" style={{ fontSize: 14 }}>{t('Départ de {from} à {time}', { from: o.from || '—', time: o.time || '—' })}</div>
                {o.meet && <a className="car-meet" href={mapsUrl(`${o.meet} ${o.from}`)} target="_blank" rel="noopener"><Ico n="pin" />{o.meet}</a>}
              </div>
              {isMe && <><button className="icon-btn" aria-label={t('Modifier')} onClick={() => open(o.kind, o)}><Ico n="edit" /></button>
                <button className="icon-btn" aria-label={t('Supprimer')} onClick={() => remove(o)} style={{ color: 'var(--red)' }}><Ico n="close" /></button></>}
            </div>
            {isMe ? Object.entries(o.requests ?? {}).map(([uid, x]) => (
              <div key={uid} className="hstack mt" style={{ flexWrap: 'wrap', gap: 8 }}><span style={{ flex: 1 }}>{x.name} · {x.status === 'pending' ? t('en attente') : x.status === 'accepted' ? t('accepté') : t('refusé')}</span>
                {x.status === 'pending' && <><button className="btn small" disabled={full} onClick={() => decide(o, uid, 'accepted')}>{t('Accepter')}</button><button className="btn small danger" onClick={() => decide(o, uid, 'refused')}>{t('Refuser')}</button></>}
                {x.status === 'accepted' && <Contact gameId={g.id} offerId={o.id} uid={uid} />}</div>))
              : r ? <div className="hstack mt" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ flex: 1 }}>{r.status === 'accepted' ? <><Ico n="checkCircle" style={{ color: '#1f9d55' }} /> {t('Accepté')} · <Contact gameId={g.id} offerId={o.id} uid={o.driverUid} /></> : r.status === 'pending' ? <><Ico n="hourglass" /> {t('Demande en attente')}</> : t('Demande refusée')}</span>
                  {r.status !== 'refused' && <button className="btn small secondary" onClick={() => withdraw(o)}>{t('Annuler ma demande')}</button>}</div>
                : full ? null : <button className="btn small mt" onClick={() => ask(o)}>{o.kind === 'offer' ? t('Demander une place') : t('Proposer de l’emmener')}</button>}
          </div>);
      })}
      {form ? (
        <div className="stack">
          <b>{edit ? t('Modifier mon annonce') : form === 'offer' ? t('Je propose des places') : t('Je cherche une place')}</b>
          {form === 'offer' && <><label className="label">{t('Places disponibles')}</label><div className="stepper"><button onClick={() => setSeats(Math.max(edit ? Math.max(1, accepted(edit)) : 1, seats - 1))}>−</button><input value={seats} readOnly aria-label={t('Places')} /><button onClick={() => setSeats(Math.min(8, seats + 1))}>+</button></div></>}
          <input className="field" placeholder={t('Commune de départ')} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className="field" placeholder={t('Point de rendez-vous (facultatif) : parking, place…')} value={meet} onChange={(e) => setMeet(e.target.value)} />
          <label className="label">{t('Heure de départ')}</label>
          <input className="field" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t('Heure de départ')} />
          {g.t && <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>{[45, 60, 90].map((m) => (
            <button key={m} className={`chip${time === minus(g.t, m) ? ' on' : ''}`} onClick={() => setTime(minus(g.t, m))}>{minus(g.t, m)} · {t('{m} min avant', { m })}</button>))}</div>}
          <label className="label">{t('Ton téléphone')}</label>
          <input className="field" type="tel" autoComplete="tel" placeholder="0470 12 34 56" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <p className="muted" style={{ fontSize: 13, margin: 0 }}><Ico n="lock" /> {t('Visible seulement par les personnes que tu acceptes (ou qui t’acceptent). Gardé dans ton profil pour la prochaine fois.')}</p>
          <div className="hstack" style={{ gap: 8 }}><button className="btn" disabled={!from.trim()} onClick={save}>{edit ? t('Enregistrer') : t('Publier')}</button><button className="btn secondary" onClick={() => { setForm(''); setEdit(null); }}>{t('Annuler')}</button></div>
        </div>
      ) : (
        <div className="hstack mt" style={{ flexWrap: 'wrap', gap: 8 }}>
          {!mine.some((o) => o.kind === 'offer') && <button className="btn" onClick={() => s.requireAuth() && open('offer')}>{t('Je propose des places')}</button>}
          {!mine.some((o) => o.kind === 'seek') && <button className="btn secondary" onClick={() => s.requireAuth() && open('seek')}>{t('Je cherche une place')}</button>}
        </div>
      )}
      <p className="muted center" style={{ fontSize: 13 }}>{t('Rappel envoyé la veille du match.')}</p>
    </Sheet>
  );
}

function Contact({ gameId, offerId, uid }: { gameId: number; offerId: string; uid: string }) {
  const [c, set] = useState<{ phone?: string } | null>(null);
  useEffect(() => { D.getDoc(D.doc(D.db, 'carpools', String(gameId), 'offers', offerId, 'contacts', uid)).then((x) => set(x.exists() ? x.data() : {})).catch(() => set({})); }, [gameId, offerId, uid]);
  return c?.phone ? <a href={`tel:${c.phone.replace(/\s/g, '')}`}><Ico n="phone" /> {c.phone}</a> : <span className="muted">{t('pas de téléphone')}</span>;
}
