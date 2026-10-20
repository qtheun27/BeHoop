// V2 — Score en direct (listener Firestore ciblé sur un match). Covoiturage : Carpool.tsx.
import { useEffect, useState } from 'react';
import { useSession } from '../lib/session';
import * as D from '../lib/db';
import { api } from '../lib/api';
import { Sheet } from '../ui/kit';
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

