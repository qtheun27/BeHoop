// Espace coach d'une équipe : joueurs, entraînements, Hoop Camp (envoyer un programme, assiduité, classement facultatif).
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../lib/session';
import { t, tn, locale } from '../lib/i18n';
import { api } from '../lib/api';
import { loadClub, type Game } from '../lib/data';
import { Sheet, Skeleton, Empty, useAsync } from '../ui/kit';
import { Ico } from '../ui/icons';
import { PROGRAMS } from '../hoopcamp/programs';
import { BY_ID, EXERCISES } from '../hoopcamp/library';
import { addDays, today, stats, ratingOf, type DayLog } from '../hoopcamp/engine';
import { GOALS, type Goal, type Program } from '../hoopcamp/types';
import * as A from './api';
import { useClub, playerName } from './ctx';
import { ProgCard } from './HoopCamp';
import { pendingOf } from './Validate';
import { TrainingSheet, planMin } from './Prep';
import qrcode from 'qrcode-generator';

const GOAL_FR: Record<Goal, string> = { main_faible: 'Main faible', dribble: 'Dribble', tir: 'Tir', finition: 'Finitions', passe: 'Passes', defense: 'Défense',
  physique: 'Physique', coordination: 'Coordination', jeu: 'Comprendre le jeu' };
export const fmtDay = (d: string) => new Date(`${d}T12:00`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });

export function TeamSpace({ teamId }: { teamId: string }) {
  const k = useClub();
  const tm = k.team(teamId);
  const [tab, setTab] = useState<'joueurs' | 'entrainements' | 'hoopcamp'>('hoopcamp');
  const players = useAsync(() => A.playersOfTeam(teamId), [teamId]);
  const canEdit = k.me?.role === 'coach' ? (k.me.team_ids ?? []).includes(teamId) : k.me?.role === 'club_admin' || k.me?.role === 'super_admin';
  return (
    <>
      <section className="hc-hero small">
        <div className="hc-kick"><Ico n="users" />{t('Mon équipe')}</div>
        <h2>{tm?.cat ?? teamId}</h2>
        <p><a href={`#/equipe/${teamId}`}>{t('Voir l’équipe sur BeHoop (matchs, classement)')} ›</a></p>
      </section>
      <NextGame teamId={teamId} />
      <div className="seg work-seg" role="tablist">
        {([['hoopcamp', 'Hoop Camp'], ['joueurs', 'Joueurs'], ['entrainements', 'Entraînements']] as const).map(([id, l]) => <button key={id} role="tab" className={tab === id ? 'on' : ''} aria-selected={tab === id} onClick={() => setTab(id)}>{t(l)}</button>)}
      </div>
      {tab === 'joueurs' && <Roster teamId={teamId} players={players.data} reload={players.reload} canEdit={canEdit} />}
      {tab === 'entrainements' && <Trainings teamIds={[teamId]} canEdit={canEdit} />}
      {tab === 'hoopcamp' && (players.data ? <TeamCamp teamId={teamId} players={players.data} canEdit={canEdit} /> : <Skeleton n={2} />)}
    </>
  );
}

/** Prochain match de l'équipe (données BeHoop) */
export function NextGame({ teamId }: { teamId: string }) {
  const k = useClub();
  const [g, setG] = useState<Game | null>(null);
  useEffect(() => {
    if (!k.club) return;
    loadClub(k.club.id).then((d) => setG(d.games.filter((x) => (String(x.h) === teamId || String(x.a) === teamId) && x.d >= today() && x.hs == null).sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t))[0] ?? null)).catch(() => {});
  }, [k.club, teamId]);
  if (!g) return null;
  return (
    <a className="next-game" href={`#/match/${g.s}/${g.id}`}>
      <Ico n="scoreboard" />
      <span className="grow"><b>{g.hn} – {g.an}</b><small>{fmtDay(g.d)} · {g.t} · {g.v}</small></span>
      <span className="chev">›</span>
    </a>
  );
}

function Roster({ teamId, players, reload, canEdit }: { teamId: string; players?: A.Player[]; reload: () => void; canEdit: boolean }) {
  const s = useSession();
  const k = useClub();
  const [add, setAdd] = useState(false);
  const [qr, setQr] = useState(false);
  const [f, setF] = useState({ prenom: '', nom: '' });
  if (!players) return <Skeleton n={2} />;
  return (
    <>
      {!players.length && <Empty ill="users" title={t('Aucun joueur pour l’instant')} text={t('Les joueurs apparaissent quand l’admin du club les invite, ou ajoute-les ici.')} />}
      <div className="group">
        {players.sort((a, b) => playerName(a).localeCompare(playerName(b))).map((p) => (
          <a key={p.id} className="row" href={`#/espace/hoopcamp/${p.id}`}>
            <span className="grow"><span className="nm">{playerName(p)}</span><span className="sub">{p.account_uid ? t('a son compte') : p.parent_uids.length ? t('géré par un parent') : t('sans compte')}</span></span>
            <span className="chev">›</span>
          </a>
        ))}
      </div>
      {canEdit && <button className="btn volt mt" onClick={() => setQr(true)}><Ico n="userAdd" />{t('Inviter avec un QR code')}</button>}
      {canEdit && <button className="btn secondary mt" onClick={() => setAdd(true)}><Ico n="userAdd" />{t('Ajouter un joueur')}</button>}
      {qr && <QrSheet teamId={teamId} onClose={() => setQr(false)} />}
      <p className="hint">{t('Le QR code permet aux joueurs et aux parents de rejoindre l’équipe eux-mêmes, sans invitation par e-mail.')}</p>
      {add && (
        <Sheet title={t('Ajouter un joueur')} onClose={() => setAdd(false)}>
          <div className="form">
            <input className="field" placeholder={t('Prénom')} value={f.prenom} onChange={(e) => setF({ ...f, prenom: e.target.value })} />
            <input className="field" placeholder={t('Nom (facultatif)')} value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} />
            <button className="btn volt" disabled={!f.prenom.trim()} onClick={async () => {
              try { await A.addPlayer(k.me!.club_id, teamId, f.prenom.trim(), f.nom.trim()); setAdd(false); setF({ prenom: '', nom: '' }); reload(); } catch { s.toast(t('Accès refusé.')); }
            }}>{t('Ajouter')}</button>
          </div>
        </Sheet>
      )}
    </>
  );
}

// ---------- Entraînements ----------
export function Trainings({ teamIds, canEdit }: { teamIds: string[]; canEdit: boolean }) {
  const k = useClub();
  const tr = useAsync(() => A.trainingsOf(teamIds, today()), [teamIds.join()]);
  // Ouvrir un entraînement : le modifier et préparer son déroulé ; « new » : en créer un
  const [open, setOpen] = useState<A.Training | 'new' | null>(null);
  return (
    <>
      {tr.loading ? <Skeleton n={2} /> : !tr.data?.length ? <Empty ill="calendar" title={t('Aucun entraînement prévu')} /> : (
        <div className="group">
          {tr.data.map((x) => {
            const n = x.plan?.length ?? 0;
            const body = (
              <>
                <span className="date-chip"><b>{+x.date.slice(8)}</b><small>{new Date(`${x.date}T12:00`).toLocaleDateString(locale(), { month: 'short' })}</small></span>
                <span className="grow"><span className="nm">{x.focus || t('Entraînement')}{teamIds.length > 1 && k.team(x.team_id) ? ` · ${k.team(x.team_id)!.cat}` : ''}</span>
                  <span className="sub">{x.start_time}{x.end_time ? `–${x.end_time}` : ''}{x.location ? ` · ${x.location}` : ''}{x.notes ? ` · ${x.notes}` : ''}</span>
                  {canEdit && <span className={`prep-pill${n ? ' ok' : ''}`}>{n ? `✓ ${tn(n, '{n} exercice', '{n} exercices')} · ${planMin(x.plan)} min` : t('À préparer')}</span>}</span>
                {canEdit && <span className="chev">›</span>}
              </>
            );
            return canEdit ? <button key={x.id} className="row" onClick={() => setOpen(x)}>{body}</button> : <div key={x.id} className="row">{body}</div>;
          })}
        </div>
      )}
      {canEdit && <button className="btn secondary mt" onClick={() => setOpen('new')}><Ico n="calendarAdd" />{t('Ajouter un entraînement')}</button>}
      {open && <TrainingSheet tr={open === 'new' ? undefined : open} teamIds={teamIds} onClose={() => setOpen(null)} onSaved={() => tr.reload()} />}
    </>
  );
}

// ---------- Hoop Camp de l'équipe ----------
function TeamCamp({ teamId, players, canEdit }: { teamId: string; players: A.Player[]; canEdit: boolean }) {
  const k = useClub();
  const as = useAsync(() => A.assignsOf(k.me!.club_id, teamId), [teamId]);
  const [send, setSend] = useState(false);
  const from = addDays(today(), -28);
  const days = useAsync(async () => Object.fromEntries(await Promise.all(players.map(async (p) => [p.id, await A.daysSince(p.id, from).catch(() => [] as DayLog[])] as const))), [players.map((p) => p.id).join()]);
  return (
    <>
      {canEdit && <button className="btn volt" onClick={() => setSend(true)}><Ico n="bolt" />{t('Envoyer un programme')}</button>}
      {(as.data ?? []).sort((a, b) => b.start.localeCompare(a.start)).map((a) => <AssignCard key={a.id} a={a} players={players} days={days.data} canEdit={canEdit} reload={as.reload} />)}
      <h3 className="group-title mt">{t('Assiduité (4 dernières semaines)')}</h3>
      {!days.data ? <Skeleton n={2} /> : <Attendance players={players} days={days.data} from={from} />}
      <p className="hint">{t('Pas de classement public entre les enfants : chacun voit seulement ses propres progrès, sauf si tu actives le classement d’un programme.')}</p>
      {send && <SendSheet teamId={teamId} players={players} onClose={() => setSend(false)} onSent={() => { setSend(false); as.reload(); }} />}
    </>
  );
}

function Attendance({ players, days, from }: { players: A.Player[]; days: Record<string, DayLog[]>; from: string }) {
  const rows = players.map((p) => {
    const d = days[p.id] ?? [];
    const trained = d.filter((x) => x.items.some((i) => x.checks?.[i.ex]));
    const done = trained.reduce((n, x) => n + x.items.filter((i) => x.checks?.[i.ex]).length, 0);
    return { p, n: trained.length, done, pending: pendingOf(d), last: trained.map((x) => x.date).sort().pop() };
  }).sort((a, b) => b.n - a.n);
  // Exercices qui posent problème : le plus souvent notés « À revoir » dans l'équipe
  const hard = new Map<string, number>();
  for (const l of Object.values(days)) for (const d of l) for (const i of d.items) if (ratingOf(d, i.ex)?.r === 'revoir') hard.set(i.ex, (hard.get(i.ex) ?? 0) + 1);
  const top = [...hard].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const weeks = Math.max(1, Math.round((Date.now() - Date.parse(from)) / 6048e5));
  return (
    <>
      <div className="group">
        {rows.map((r) => (
          <div key={r.p.id} className="row">
            <a className="grow" href={`#/espace/hoopcamp/${r.p.id}`}><span className="nm">{playerName(r.p)}</span>
              <span className="sub">{tn(r.n, '{n} jour', '{n} jours')} · {tn(r.done, '{n} exercice', '{n} exercices')}{r.last ? ` · ${t('dernier : {d}', { d: fmtDay(r.last) })}` : ''}</span></a>
            <span className="att-bar" title={t('{n} jours / semaine', { n: (r.n / weeks).toFixed(1) })}><i style={{ width: `${Math.min(100, (r.n / (weeks * 5)) * 100)}%` }} /></span>
            {r.pending > 0 && <a className="pill-pend" href={`#/espace/valider/${r.p.id}`} aria-label={t('À valider')}>{r.pending}</a>}
          </div>
        ))}
      </div>
      {top.length > 0 && (
        <>
          <h3 className="group-title mt">{t('Exercices qui posent problème')}</h3>
          <div className="group">{top.map(([id, n]) => <div key={id} className="row"><span className="grow">{BY_ID.get(id)?.name ?? id}</span><span className="sub">{tn(n, '{n} « À revoir »', '{n} « À revoir »')}</span></div>)}</div>
          <p className="hint">{t('Idée : reprends-les à l’entraînement collectif (filtre « Exercices » du tableau Tactique).')}</p>
        </>
      )}
    </>
  );
}

function AssignCard({ a, players, days, canEdit, reload }: { a: A.Assign; players: A.Player[]; days?: Record<string, DayLog[]>; canEdit: boolean; reload: () => void }) {
  const targets = players.filter((p) => !a.player_ids.length || a.player_ids.includes(p.id));
  const active = !a.end || a.end >= today();
  const inRange = (d: DayLog) => d.date >= a.start && (!a.end || d.date <= a.end);
  const board = useMemo(() => (a.ranking && days ? targets.map((p) => ({ name: p.prenom, xp: stats((days[p.id] ?? []).filter(inRange), today(), EXERCISES).xp })).sort((x, y) => y.xp - x.xp) : null), [a, days]); // eslint-disable-line react-hooks/exhaustive-deps
  // Le classement (prénom + points) est publié pour les joueurs seulement si le coach l'a activé
  useEffect(() => { if (canEdit && board && JSON.stringify(board) !== JSON.stringify(a.board ?? [])) A.updateAssign(a.id, { board }).catch(() => {}); }, [board]); // eslint-disable-line react-hooks/exhaustive-deps
  const trained = days ? targets.filter((p) => (days[p.id] ?? []).some((d) => inRange(d) && d.items.some((i) => d.checks?.[i.ex]))).length : 0;
  return (
    <div className={`assign${active ? '' : ' past'}`}>
      <div className="assign-top">
        <span className="em">{a.program.emoji}</span>
        <span className="grow"><b>{a.title}</b><small>{fmtDay(a.start)}{a.end ? ` → ${fmtDay(a.end)}` : ''} · {a.player_ids.length ? tn(a.player_ids.length, '{n} joueur', '{n} joueurs') : t('toute l’équipe')}</small></span>
        {canEdit && <button className="icon-btn" aria-label={t('Supprimer')} onClick={async () => { if (confirm(t('Retirer ce programme de la liste ? Les joueurs gardent leurs séances.'))) { await A.deleteAssign(a.id); reload(); } }}><Ico n="close" /></button>}
      </div>
      <div className="assign-stats"><span>{t('{n}/{m} joueurs ont commencé', { n: trained, m: targets.length })}</span>
        {canEdit && <label className="toggle-line"><input type="checkbox" checked={a.ranking} onChange={async (e) => { await A.updateAssign(a.id, { ranking: e.target.checked, ...(e.target.checked ? {} : { board: [] }) }); reload(); }} /> {t('Classement d’équipe')}</label>}</div>
      {board && <ol className="board">{board.slice(0, 10).map((b, i) => <li key={i}><span>{b.name}</span><b>{b.xp} XP</b></li>)}</ol>}
    </div>
  );
}

function SendSheet({ teamId, players, onClose, onSent }: { teamId: string; players: A.Player[]; onClose: () => void; onSent: () => void }) {
  const s = useSession();
  const k = useClub();
  const [base, setBase] = useState(PROGRAMS[0]);
  const [title, setTitle] = useState(PROGRAMS[0].name);
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(addDays(today(), PROGRAMS[0].days - 1));
  const [goals, setGoals] = useState<Goal[]>(PROGRAMS[0].goals);
  const [minutes, setMinutes] = useState<0 | 15 | 30 | 45 | 60>(0);
  const [who, setWho] = useState<string[]>([]);
  const [ranking, setRanking] = useState(false);
  const [busy, setBusy] = useState(false);
  const pick = (p: Program) => { setBase(p); setTitle(p.name); setGoals(p.goals); setEnd(p.days ? addDays(start, p.days - 1) : ''); };
  const go = async () => {
    setBusy(true);
    try {
      const custom: Program = { ...base, name: title.trim() || base.name, goals, days: end ? Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1) : 0, ...(minutes ? { minutes } : {}) };
      const ref = await A.createAssign({ club_id: k.me!.club_id, team_id: teamId, title: custom.name, program: custom, start, end: end || null, player_ids: who, ranking, created_by: s.user!.uid });
      const targets = players.filter((p) => !who.length || who.includes(p.id));
      for (const p of targets) await A.sendProgram(p.id, { id: base.id, name: custom.name, start, end: end || null, from: 'coach', by: s.user!.uid, assign: ref.id, custom }).catch(() => {});
      api('/notify/hoopcamp', { event: 'assign', assignId: ref.id }).catch(() => {});
      s.toast(tn(targets.length, 'Programme envoyé à {n} joueur', 'Programme envoyé à {n} joueurs'));
      onSent();
    } catch { s.toast(t('Accès refusé.')); } finally { setBusy(false); }
  };
  return (
    <Sheet title={t('Envoyer un programme')} onClose={onClose}>
      <div className="form">
        <div className="progs">{PROGRAMS.filter((p) => p.id !== 'libre').map((p) => <ProgCard key={p.id} pr={p} on={base.id === p.id} onPick={() => pick(p)} />)}</div>
        <label className="lbl">{t('Nom affiché aux joueurs')}<input className="field" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="two"><label className="lbl">{t('Début')}<input className="field" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="lbl">{t('Fin')}<input className="field" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></label></div>
        <h3 className="group-title">{t('Accents')}</h3>
        <div className="chips wrap">{GOALS.map((g) => <button key={g} className={`chip${goals.includes(g) ? ' on' : ''}`} onClick={() => setGoals(goals.includes(g) ? goals.filter((x) => x !== g) : [...goals, g])}>{t(GOAL_FR[g])}</button>)}</div>
        <h3 className="group-title">{t('Temps par jour')}</h3>
        <div className="chips wrap">{([0, 15, 30, 45, 60] as const).map((m) => <button key={m} className={`chip${minutes === m ? ' on' : ''}`} onClick={() => setMinutes(m)}>{m ? `${m} min` : t('Au choix du joueur')}</button>)}</div>
        <h3 className="group-title">{t('Pour qui ?')}</h3>
        <div className="chips wrap">
          <button className={`chip${!who.length ? ' on' : ''}`} onClick={() => setWho([])}>{t('Toute l’équipe')}</button>
          {players.map((p) => <button key={p.id} className={`chip${who.includes(p.id) ? ' on' : ''}`} onClick={() => setWho(who.includes(p.id) ? who.filter((x) => x !== p.id) : [...who, p.id])}>{p.prenom}</button>)}
        </div>
        <label className="toggle-line"><input type="checkbox" checked={ranking} onChange={(e) => setRanking(e.target.checked)} /> {t('Afficher un classement d’équipe (prénoms et points)')}</label>
        <button className="btn volt" disabled={busy || !players.length} onClick={go}>{t('Envoyer')}</button>
        {!players.length && <p className="hint">{t('Ajoute d’abord des joueurs à l’équipe.')}</p>}
      </div>
    </Sheet>
  );
}

/** QR code d'équipe : scanné par un joueur ou un parent, il ouvre « Rejoindre » dans l'appli (valable 60 jours) */
function QrSheet({ teamId, onClose }: { teamId: string; onClose: () => void }) {
  const s = useSession();
  const k = useClub();
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    A.createJoinCode({ club_id: k.me!.club_id, club_name: k.club?.name, team_id: teamId, created_by: s.user!.uid }).then(setCode).catch(() => s.toast(t('Accès refusé.')));
  }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps
  const url = code ? `${location.origin}/app/#/espace/rejoindre/${code}` : '';
  const svg = useMemo(() => { if (!url) return ''; const q = qrcode(0, 'M'); q.addData(url); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }, [url]);
  return (
    <Sheet title={t('QR code de l’équipe')} onClose={onClose}>
      <div className="form qr-box">
        {!code ? <Skeleton n={1} h={240} /> : <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />}
        {code && <p className="mono" style={{ textAlign: 'center' }}>{code}</p>}
        <p className="hint">{t('À montrer à l’entraînement ou à partager dans le groupe des parents. Chacun choisit « je suis le joueur » ou « je suis le parent ». Valable 60 jours.')}</p>
        {code && <button className="btn secondary" onClick={() => (navigator.share ? navigator.share({ title: k.club?.name ?? 'BeHoop', url }).catch(() => {}) : navigator.clipboard.writeText(url).then(() => s.toast(t('Lien copié.'))))}>{t('Partager le lien')}</button>}
      </div>
    </Sheet>
  );
}
