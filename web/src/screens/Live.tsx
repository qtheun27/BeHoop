// V2 — Score en direct (listener Firestore ciblé sur un match) et covoiturage.
import { useEffect, useState } from 'react';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { api } from '../lib/api';
import { Sheet, Empty } from '../ui/kit';
import { haptic } from '../lib/util';
import type { Game } from '../lib/data';
import { t } from '../lib/i18n';
import { Ico } from '../ui/icons';

export interface LiveScore { home: number; away: number; quarter: number; status: 'live' | 'final'; updatedBy: string; updatedByName: string; updatedAt: unknown;
  history: { home: number; away: number; quarter: number; by: string; at: number }[]; gameId: number; teamIds: number[] }

export function useLive(gameId: number | null) {
  const [l, set] = useState<LiveScore | null>(null);
  useEffect(() => (gameId ? D.watchDoc<LiveScore>(`liveScores/${gameId}`, set) : undefined), [gameId]);
  return l;
}

/** Pastille LIVE sur la page Équipe pour le match du jour. */
export function LiveBadge({ teamId, games }: { teamId: number; games: Game[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const g = games.find((x) => x.d === today && (x.h === teamId || x.a === teamId) && x.hs === null);
  const l = useLive(g?.id ?? null);
  if (!l || l.status !== 'live') return null;
  return <a className="pill live" href="#/matchs"><Ico n="live" />LIVE {l.home}–{l.away}</a>;
}

export function LiveScoreSheet({ g, home, away, onClose }: { g: Game; home: string; away: string; onClose: () => void }) {
  const s = useSession();
  const l = useLive(g.id);
  const [h, setH] = useState(0), [a, setA] = useState(0), [q, setQ] = useState(1);
  useEffect(() => { if (l) { setH(l.home); setA(l.away); setQ(l.quarter); } }, [l]);
  const save = async (status: 'live' | 'final', nh = h, na = a, nq = q) => {
    if (!s.user || !s.profile) return;
    haptic();
    const entry = { home: nh, away: na, quarter: nq, by: s.profile.displayName, at: Date.now() };
    const data = { gameId: g.id, teamIds: [g.h, g.a], home: nh, away: na, quarter: nq, status, updatedBy: s.user.uid, updatedByName: s.profile.displayName,
      updatedAt: D.serverTimestamp(), history: [...(l?.history ?? []), entry].slice(-200) };
    await D.setDoc(D.doc(D.db, 'liveScores', String(g.id)), data); // le dernier qui écrit gagne, historique conservé
    await D.setDoc(D.doc(D.db, 'posts', `live-${g.id}`), {
      type: 'live', authorUid: s.user.uid, authorName: s.profile.displayName, clubId: null, teamIds: [g.h, g.a], targets: [`t:${g.h}`, `t:${g.a}`],
      visibility: 'public', teamIdPrivate: null, hidden: false, reactions: {}, createdAt: D.serverTimestamp(),
      payload: { gameId: g.id, date: g.d, competition: g.sn, home: { id: g.h, name: home, score: nh }, away: { id: g.a, name: away, score: na }, quarter: nq, updatedByName: s.profile.displayName, status },
    }, { merge: true });
    if (status === 'final') { api('/notify/live-final', { gameId: g.id }).catch(() => {}); s.toast(t('Score final envoyé')); onClose(); }
  };
  const add = (side: 'h' | 'a', n: number) => { const nh = side === 'h' ? Math.max(0, h + n) : h, na = side === 'a' ? Math.max(0, a + n) : a; setH(nh); setA(na); save('live', nh, na); };
  const Side = ({ name, v, side }: { name: string; v: number; side: 'h' | 'a' }) => (
    <div className="center" style={{ flex: 1 }}>
      <div className="ellipsis" style={{ fontWeight: 600 }}>{name}</div>
      <div style={{ fontFamily: 'Anton', fontSize: 64, lineHeight: 1.1 }}>{v}</div>
      <div className="hstack" style={{ justifyContent: 'center', gap: 6 }}>{[1, 2, 3].map((n) => <button key={n} className="btn small" onClick={() => add(side, n)}>+{n}</button>)}</div>
      <button className="btn ghost small" onClick={() => add(side, -1)}>−1</button>
    </div>
  );
  return (
    <Sheet title={t('Score en direct')} onClose={onClose}>
      {l && <p className="muted center" style={{ fontSize: 14 }}>{t('Mis à jour par {name}', { name: l.updatedByName })}</p>}
      <div className="hstack" style={{ alignItems: 'flex-start' }}><Side name={home} v={h} side="h" /><Side name={away} v={a} side="a" /></div>
      <div className="seg mt">{[1, 2, 3, 4].map((n) => <button key={n} className={q === n ? 'on' : ''} onClick={() => { setQ(n); save('live', h, a, n); }}>Q{n}</button>)}</div>
      <button className="btn" onClick={() => save('live')}>{t('Enregistrer')}</button>
      <button className="btn secondary mt" onClick={() => confirm(t('Score final {h}–{a} ?', { h, a })) && save('final')}>{t('Fin du match')}</button>
      {l?.history?.length ? <details className="mt"><summary className="muted">{t('Historique')} ({l.history.length})</summary>{[...l.history].reverse().slice(0, 30).map((x, i) => <div key={i} className="muted" style={{ fontSize: 14 }}>Q{x.quarter} · {x.home}–{x.away} · {x.by}</div>)}</details> : null}
    </Sheet>
  );
}

/* ---------- Covoiturage ---------- */
interface Offer { id: string; kind: 'offer' | 'seek'; driverUid: string; driverName: string; seats: number; from: string; time: string; teamIdPrivate: number | null;
  requests: Record<string, { status: 'pending' | 'accepted' | 'refused'; name: string }> }

export function CarpoolSheet({ g, youthTeam, onClose }: { g: Game; youthTeam: number | null; onClose: () => void }) {
  const s = useSession();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [form, setForm] = useState<'' | 'offer' | 'seek'>('');
  const [seats, setSeats] = useState(3), [from, setFrom] = useState(''), [time, setTime] = useState(''), [phone, setPhone] = useState('');
  const col = D.collection(D.db, 'carpools', String(g.id), 'offers');
  const allowed = !youthTeam || s.privateTeams.includes(youthTeam);
  useEffect(() => {
    if (!allowed) return;
    const q = youthTeam ? D.query(col, D.where('teamIdPrivate', '==', youthTeam)) : D.query(col, D.where('teamIdPrivate', '==', null));
    return D.onSnapshot(q, (x) => setOffers(x.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Offer, 'id'>) }))), () => setOffers([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.id, allowed]);
  if (!allowed) return <Sheet title={t('Covoiturage')} onClose={onClose}><Empty ill="lock" title={t('Réservé à l\'Équipe')} text={t('Pour les matchs de jeunes, le covoiturage est réservé aux membres de l\'Équipe.')} /></Sheet>;
  const create = async () => {
    const ref = D.doc(col);
    await D.setDoc(ref, { kind: form, driverUid: s.user!.uid, driverName: s.profile!.displayName, seats: form === 'offer' ? seats : 0, from, time, teamIdPrivate: youthTeam, requests: {}, gameDate: g.d, createdAt: D.serverTimestamp() });
    await D.setDoc(D.doc(D.db, 'carpools', String(g.id), 'offers', ref.id, 'contacts', s.user!.uid), { phone, name: s.profile!.displayName });
    setForm(''); s.toast(t('Publié'));
  };
  const ask = async (o: Offer) => {
    await D.updateDoc(D.doc(col, o.id), { [`requests.${s.user!.uid}`]: { status: 'pending', name: s.profile!.displayName } });
    if (phone) await D.setDoc(D.doc(D.db, 'carpools', String(g.id), 'offers', o.id, 'contacts', s.user!.uid), { phone, name: s.profile!.displayName });
    api('/notify/carpool', { gameId: g.id, offerId: o.id }).catch(() => {}); s.toast(t('Demande envoyée'));
  };
  const decide = (o: Offer, uid: string, status: 'accepted' | 'refused') => D.updateDoc(D.doc(col, o.id), { [`requests.${uid}.status`]: status });
  return (
    <Sheet title={t('Covoiturage')} onClose={onClose}>
      {offers === null ? null : offers.length === 0 && !form ? <Empty ill="car" title={t('Personne pour l\'instant')} text={t('Propose des places ou indique que tu en cherches une.')} /> : null}
      {offers?.map((o) => {
        const me = o.driverUid === s.user?.uid, r = o.requests?.[s.user?.uid ?? ''];
        const accepted = Object.values(o.requests ?? {}).filter((x) => x.status === 'accepted').length;
        return (
          <div key={o.id} className="group" style={{ padding: 14 }}>
            <b><Ico n={o.kind === 'offer' ? 'car' : 'userAdd'} style={{ marginRight: 6, color: 'var(--accent)' }} />{o.kind === 'offer' ? t('{name} propose {n} place(s)', { name: o.driverName, n: o.seats - accepted }) : t('{name} cherche une place', { name: o.driverName })}</b>
            <div className="muted">{t('Départ de {from} à {time}', { from: o.from || '—', time: o.time || '—' })}</div>
            {me ? Object.entries(o.requests ?? {}).map(([uid, x]) => (
              <div key={uid} className="hstack mt"><span style={{ flex: 1 }}>{x.name} · {x.status === 'pending' ? t('en attente') : x.status === 'accepted' ? t('accepté') : t('refusé')}</span>
                {x.status === 'pending' && <><button className="btn small" onClick={() => decide(o, uid, 'accepted')}>{t('Accepter')}</button><button className="btn small danger" onClick={() => decide(o, uid, 'refused')}>{t('Refuser')}</button></>}
                {x.status === 'accepted' && <Contact gameId={g.id} offerId={o.id} uid={uid} />}</div>))
              : r ? <div className="mt">{r.status === 'accepted' ? <><Ico n="checkCircle" style={{ color: '#1f9d55' }} /> {t('Accepté')} · <Contact gameId={g.id} offerId={o.id} uid={o.driverUid} /></> : r.status === 'pending' ? <><Ico n="hourglass" /> {t('Demande en attente')}</> : t('Demande refusée')}</div>
                : <button className="btn small mt" onClick={() => ask(o)}>{o.kind === 'offer' ? t('Demander une place') : t('Proposer de l’emmener')}</button>}
          </div>);
      })}
      {form ? (
        <div className="stack">
          {form === 'offer' && <><label className="label">{t('Places disponibles')}</label><div className="stepper"><button onClick={() => setSeats(Math.max(1, seats - 1))}>−</button><input value={seats} readOnly aria-label={t('Places')} /><button onClick={() => setSeats(seats + 1)}>+</button></div></>}
          <input className="field" placeholder={t('Commune de départ')} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className="field" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t('Heure de départ')} />
          <input className="field" type="tel" placeholder={t('Téléphone (visible seulement après acceptation)')} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button className="btn" disabled={!from} onClick={create}>{t('Publier')}</button>
        </div>
      ) : (
        <div className="hstack mt"><button className="btn" onClick={() => setForm('offer')}>{t('Je propose des places')}</button><button className="btn secondary" onClick={() => setForm('seek')}>{t('Je cherche une place')}</button></div>
      )}
      <p className="muted center" style={{ fontSize: 13 }}>{t('Rappel envoyé la veille du match.')}</p>
    </Sheet>
  );
}
function Contact({ gameId, offerId, uid }: { gameId: number; offerId: string; uid: string }) {
  const [c, set] = useState<{ phone?: string } | null>(null);
  useEffect(() => { D.getDoc(D.doc(D.db, 'carpools', String(gameId), 'offers', offerId, 'contacts', uid)).then((x) => set(x.exists() ? x.data() : {})).catch(() => set({})); }, [gameId, offerId, uid]);
  return c?.phone ? <a href={`tel:${c.phone}`}><Ico n="phone" /> {c.phone}</a> : <span className="muted">{t('pas de téléphone')}</span>;
}
