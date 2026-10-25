// Hoop Camp côté joueur (et parent qui démarre / suit le camp de son enfant) :
// séance du jour (durée calculée), fiches d'exercice avec démo animée et chrono, cases à cocher, note, progrès.
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../lib/session';
import { t, tn } from '../lib/i18n';
import { api } from '../lib/api';
import { Sheet, Skeleton, Empty } from '../ui/kit';
import { Ico } from '../ui/icons';
import { EXERCISES, BY_ID } from '../hoopcamp/library';
import { PROGRAMS, program as findProgram } from '../hoopcamp/programs';
import { generate, historyFrom, stats, today, addDays, daysBetween, fmtDur, fmtDose, ratingOf, phaseOf, feasible, alternativesFor, LEVELS, BADGES, type DayLog } from '../hoopcamp/engine';
import { AGES, EQUIPMENT, GOALS, FAMILIES, type Age, type Equip, type Exercise, type Family, type Goal, type Phase, type Program, type Rating, type TrainingProfile } from '../hoopcamp/types';
import * as A from './api';
import { useClub, ageOfTeam, playerName } from './ctx';
import { ExerciseDemo } from './Court';
import { VideoHelp } from './VideoHelp';
import { Timer } from './Timer';

export const FAMILY_LABEL: Record<Family, string> = {
  echauffement: 'Échauffement', mobilite: 'Mobilité', maniement: 'Maniement de balle', dribble: 'Dribble', tir_mecanique: 'Tir sans panier',
  tir: 'Tir au panier', finition: 'Finitions', passe: 'Passes', appuis: 'Appuis', defense: 'Défense', physique: 'Physique',
  coordination: 'Corde et coordination', retour_calme: 'Retour au calme', tete: 'Basket dans la tête',
};
const PHASE_LABEL: Record<Phase, string> = { echauffement: 'Échauffement', technique: 'Technique', application: 'Mise en situation', physique: 'Physique et coordination', retour: 'Retour au calme' };
export const RATING_LABEL: Record<Rating, string> = { revoir: 'À revoir', correct: 'Correct', maitrise: 'Maîtrisé' };
const EQUIP_LABEL: Record<Equip, string> = { ballon: 'Ballon', ballon2: '2e ballon', mur: 'Mur', corde: 'Corde à sauter', plots: 'Plots (ou bouteilles)', tennis: 'Balle de tennis',
  echelle: 'Échelle de rythme (ou craie)', elastique: 'Élastique', banc: 'Banc', miroir: 'Miroir ou vitre' };
const GOAL_LABEL: Record<Goal, string> = { main_faible: 'Main faible', dribble: 'Dribble', tir: 'Tir', finition: 'Finitions', passe: 'Passes', defense: 'Défense',
  physique: 'Physique', coordination: 'Coordination', jeu: 'Comprendre le jeu' };
const HANDS = new Set<Family>(['maniement', 'dribble', 'tir_mecanique', 'tir', 'finition', 'passe']);

/** Programme réel d'un joueur : personnalisé par le coach, sinon programme prêt à l'emploi */
/** Hoop Camp ouvert depuis le Vestiaire (joueurs, parents : #/camp/…) ou depuis l'Espace Club (coachs : #/espace/…) */
export const campBase = () => (location.hash.startsWith('#/espace') ? '#/espace' : '#/camp');
export const programOf = (c: A.Camp | null): Program | null => c?.program ? c.program.custom ?? findProgram(c.program.id) ?? null : null;

/** Tout ce qu'il faut pour le Hoop Camp d'un joueur : profil, programme, journées (temps réel, hors ligne), séance du jour */
export function useCamp(p: A.Player | undefined) {
  const [camp, setCamp] = useState<A.Camp | null | undefined>(undefined);
  const [days, setDays] = useState<DayLog[] | undefined>(undefined);
  const date = today();
  useEffect(() => { if (!p) return; setCamp(undefined); return A.watchCamp(p.id, setCamp); }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!p) return; setDays(undefined); return A.watchDays(p.id, addDays(date, -120), setDays); }, [p?.id, date]); // eslint-disable-line react-hooks/exhaustive-deps
  const prog = programOf(camp ?? null);
  const out = useMemo(() => {
    if (!camp?.profile || !prog || !days) return null;
    const past = days.filter((d) => d.date < date);
    const stored = days.find((d) => d.date === date);
    const prev = [...past].sort((a, b) => b.date.localeCompare(a.date))[0];
    const day: DayLog = stored ?? { date, program: prog.id, items: generate({ profile: camp.profile, program: prog, history: historyFrom(past), date, prev: prev?.items.map((i) => i.ex), library: EXERCISES }).items };
    const start = camp.program?.start ?? date;
    const dayN = daysBetween(start, date) + 1;
    return { day, exists: !!stored, st: stats(days, date, EXERCISES), dayN, ended: !!prog.days && dayN > prog.days };
  }, [camp, prog, days, date]);
  return { camp, days, prog, loading: camp === undefined || (days === undefined && !!camp), ...out, date };
}

// ---------- Carte d'accueil ----------
export function HoopCampCard({ p, viewer }: { p: A.Player; viewer: 'player' | 'parent' }) {
  const c = useCamp(p);
  const href = `${campBase()}/hoopcamp/${p.id}`;
  if (c.loading) return <div className="hc-card skel" style={{ height: 150 }} />;
  if (!c.camp?.profile || !c.prog) return (
    <a className="hc-card hc-start" href={href}>
      <div className="hc-kick"><Ico n="bolt" />Hoop Camp</div>
      <h3>{viewer === 'player' ? t('Crée ton programme d’entraînement') : t('Démarrer un Hoop Camp pour {n}', { n: p.prenom })}</h3>
      <p>{t('Des séances courtes à faire à la maison, avec chrono et démos. Un adulte valide le soir.')}</p>
      <span className="btn small volt">{t('C’est parti')} ›</span>
    </a>
  );
  const done = c.day ? c.day.items.filter((i) => c.day!.checks?.[i.ex]).length : 0, total = c.day?.items.length ?? 0;
  const sec = c.day?.items.reduce((n, i) => n + i.sec, 0) ?? 0;
  return (
    <a className="hc-card" href={href}>
      <div className="hc-kick"><Ico n="bolt" />{t('Hoop Camp du jour')}{viewer === 'parent' && <span className="who">· {p.prenom}</span>}</div>
      <div className="hc-row">
        <div className="hc-ring" style={{ '--p': total ? done / total : 0 } as React.CSSProperties}><b>{done}/{total}</b></div>
        <div className="grow">
          <h3>{c.ended ? t('Programme terminé 🎉') : `${c.prog.emoji} ${t(c.prog.name)}`}</h3>
          <p>{fmtDur(sec)} · {c.prog.days ? t('jour {n}/{d}', { n: Math.min(c.dayN ?? 1, c.prog.days), d: c.prog.days }) : t('jour {n}', { n: c.dayN ?? 1 })}</p>
          <div className="hc-meta"><span className="lvl">{c.st?.levelName}</span>{!!c.st?.streak && <span>🔥 {tn(c.st.streak, '{n} jour', '{n} jours')}</span>}{!!c.st?.pending && <span className="pend">{tn(c.st.pending, '{n} à valider', '{n} à valider')}</span>}</div>
        </div>
      </div>
    </a>
  );
}

// ---------- Page Hoop Camp ----------
export function HoopCampPage({ pid }: { pid: string }) {
  const s = useSession();
  const k = useClub();
  const [p, setP] = useState<A.Player | null | undefined>(() => k.players.find((x) => x.id === pid));
  useEffect(() => { if (!p) A.getPlayer(pid).then(setP).catch(() => setP(null)); }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = useCamp(p ?? undefined);
  const [tab, setTab] = useState<'jour' | 'progres' | 'biblio'>('jour');
  const [edit, setEdit] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [self, setSelf] = useState(false);
  useEffect(() => { if (p) A.canSelfRate(p).then(setSelf); }, [p]);
  if (p === null) return <Empty ill="lock" title={t('Accès refusé.')} />;
  if (!p || c.loading) return <Skeleton n={3} />;
  const uid = s.user!.uid;
  const isSelf = p.account_uid === uid;
  const isParent = p.parent_uids.includes(uid);
  const canCheck = isSelf || (isParent && !p.account_uid);
  const canValidate = isParent || k.me?.role === 'coach';
  const team = k.team(p.team_id);
  // Profil et programme : le joueur lui-même, un parent lié ou le coach de son équipe
  const isCoach = k.me?.role === 'coach' && !!p.team_id && (k.me.team_ids ?? []).includes(p.team_id);
  const canSetup = isSelf || isParent || isCoach;
  if ((!c.camp?.profile || !c.prog) && !canSetup) return <Empty ill="lock" title={t('{n} n’a pas encore commencé de Hoop Camp', { n: p.prenom })}
    text={k.me?.role === 'coach' ? t('Envoie-lui un programme depuis ton équipe : il le démarrera avec son profil.') : t('Le joueur ou son parent le démarre depuis son compte. Pour essayer, invite-toi comme parent avec une autre adresse ou utilise le QR code de l’équipe.')} />;
  if (!c.camp?.profile || !c.prog || (edit && canSetup)) return <Setup p={p} camp={c.camp ?? null} defAge={ageOfTeam(team) ?? 'U14'} by={uid} from={isSelf ? 'player' : isParent ? 'parent' : 'coach'} onDone={() => setEdit(false)} onCancel={c.camp?.profile ? () => setEdit(false) : undefined} />;
  const { day, st } = c;
  const exists = !!c.exists;
  if (!day || !st) return <Skeleton n={3} />;
  const prof = c.camp.profile;
  const toggle = async (ex: string, on: boolean) => {
    await A.toggleCheck(p.id, day, ex, on, p.team_id, exists);
    const n = day.items.filter((i) => (i.ex === ex ? on : day.checks?.[i.ex])).length;
    const key = `hc-done-${p.id}-${day.date}`;
    if (on && n === day.items.length && !localStorage.getItem(key)) {
      try { localStorage.setItem(key, '1'); } catch { /* */ }
      api('/notify/hoopcamp', { event: 'done', playerId: p.id, count: n }).catch(() => {});
      s.toast(t('Séance terminée ! Un adulte va la valider ce soir.'));
    }
  };
  const phases = [...new Set(day.items.map((i) => i.phase))];
  const done = day.items.filter((i) => day.checks?.[i.ex]).length;
  const sec = day.items.reduce((n, i) => n + i.sec, 0);
  const lvl = LEVELS[st.level], next = st.nextXp;
  return (
    <>
      <section className="hc-hero">
        <div className="hc-hero-top">
          <div>
            <div className="hc-kick"><Ico n="bolt" />Hoop Camp{!isSelf && <span className="who"> · {playerName(p)}</span>}</div>
            <h2>{c.prog.emoji} {t(c.prog.name)}</h2>
            <p>{c.ended ? t('Programme terminé : bravo ! Continue avec le même ou choisis-en un autre.') : c.prog.days ? t('Jour {n} sur {d}', { n: c.dayN!, d: c.prog.days }) : t('Jour {n}', { n: c.dayN! })}
              {c.camp.program?.from === 'coach' && <> · {t('envoyé par ton coach')}</>}</p>
          </div>
          {canSetup && <button className="icon-btn" onClick={() => setEdit(true)} aria-label={t('Réglages')}><Ico n="edit" /></button>}
        </div>
        <div className="hc-stats">
          <div><b>{Math.round(sec / 60)} min</b><span>{t('aujourd’hui')}</span></div>
          <div><b>{done}/{day.items.length}</b><span>{t('exercices')}</span></div>
          <div><b>🔥 {st.streak}</b><span>{t('série')}</span></div>
          <div><b>{lvl.name}</b><span>{st.xp} XP</span></div>
        </div>
        <div className="xpbar" aria-label={t('Points')}><i style={{ width: `${next ? Math.min(100, ((st.xp - lvl.xp) / (next - lvl.xp)) * 100) : 100}%` }} /></div>
      </section>

      <div className="seg work-seg" role="tablist">
        {([['jour', 'Aujourd’hui'], ['progres', 'Mes progrès'], ['biblio', 'Exercices']] as const).map(([id, l]) => <button key={id} role="tab" className={tab === id ? 'on' : ''} aria-selected={tab === id} onClick={() => setTab(id)}>{t(l)}</button>)}
      </div>

      {tab === 'jour' && (
        <>
          {!canCheck && <p className="hint">{isParent ? t('{n} coche ses exercices sur son téléphone ; toi, tu valides le soir.', { n: p.prenom }) : t('Le joueur coche ses exercices ; tu valides le soir.')}</p>}
          {canValidate && st.pending > 0 && <a className="btn volt" href={`${campBase()}/valider/${p.id}`}>{tn(st.pending, '{n} exercice à valider', '{n} exercices à valider')} ›</a>}
          {phases.map((ph) => (
            <section key={ph} className="hc-phase">
              <h3 className="group-title">{t(PHASE_LABEL[ph])}</h3>
              <div className="group">
                {day.items.filter((i) => i.phase === ph).map((it) => {
                  const e = BY_ID.get(it.ex); if (!e) return null;
                  const on = !!day.checks?.[it.ex], r = ratingOf(day, it.ex);
                  return (
                    <div key={it.ex} className={`hc-item${on ? ' done' : ''}`}>
                      <button className="hc-check" disabled={!canCheck} aria-pressed={on} aria-label={on ? t('Décocher') : t('Cocher')} onClick={() => toggle(it.ex, !on)}><Ico n="check" /></button>
                      <button className="grow hc-open" onClick={() => setOpen(it.ex)}>
                        <span className="nm">{e.name}{it.kind === 'new' && <em className="tag new">{t('nouveau')}</em>}{it.kind === 'review' && <em className="tag rev">{t('révision')}</em>}</span>
                        <span className="sub">{fmtDose(it.dose)} · {fmtDur(it.sec)}</span>
                        {on && <Status r={r} />}
                      </button>
                      <span className="chev">›</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <Note p={p} day={day} exists={exists} readOnly={!canCheck} />
          {self && isSelf && <SelfRate p={p} day={day} />}
        </>
      )}
      {tab === 'progres' && <Progress st={st} />}
      {tab === 'biblio' && <Library prof={prof} onOpen={setOpen} />}

      {open && BY_ID.get(open) && (
        <ExerciseSheet e={BY_ID.get(open)!} prof={prof} item={day.items.find((i) => i.ex === open)}
          checked={!!day.checks?.[open]} canCheck={canCheck && day.items.some((i) => i.ex === open)}
          onCheck={() => toggle(open, true)} onClose={() => setOpen(null)} onOpen={setOpen} />
      )}
    </>
  );
}

function Status({ r }: { r?: ReturnType<typeof ratingOf> }) {
  if (!r) return <span className="status wait">⏳ {t('en attente de validation')}</span>;
  return <span className={`status r-${r.r}`}>{t(RATING_LABEL[r.r])}{r.self ? ` · ${t('auto-évaluation')}` : r.name ? ` · ${r.name}` : ''}{r.msg ? ` — « ${r.msg} »` : ''}</span>;
}

function Note({ p, day, exists, readOnly }: { p: A.Player; day: DayLog; exists: boolean; readOnly: boolean }) {
  const [v, setV] = useState(day.note ?? '');
  useEffect(() => setV(day.note ?? ''), [day.note]);
  if (readOnly && !day.note) return null;
  return (
    <section className="hc-phase">
      <h3 className="group-title">{t('Ma note du jour')}</h3>
      <textarea className="field" rows={3} value={v} readOnly={readOnly} maxLength={1000} placeholder={t('Ex. : j’ai regardé mon match, mon crossover main gauche passe mieux quand je reste bas.')}
        onChange={(e) => setV(e.target.value)} onBlur={() => v !== (day.note ?? '') && A.saveNote(p.id, day, v, p.team_id, exists)} />
    </section>
  );
}

/** Auto-évaluation : seulement quand personne ne peut valider (ni parent, ni coach) — clairement indiquée */
function SelfRate({ p, day }: { p: A.Player; day: DayLog }) {
  const todo = day.items.filter((i) => day.checks?.[i.ex] && !ratingOf(day, i.ex));
  if (!todo.length) return null;
  return (
    <section className="hc-phase">
      <h3 className="group-title">{t('Auto-évaluation')}</h3>
      <p className="hint">{t('Personne n’est lié à ton compte pour valider : note-toi honnêtement. Ces notes comptent moitié moins de points.')}</p>
      <div className="group">
        {todo.map((i) => (
          <div key={i.ex} className="row"><span className="grow">{BY_ID.get(i.ex)?.name}</span><RateButtons onRate={(r) => A.selfRate(p.id, day.date, i.ex, r)} /></div>
        ))}
      </div>
    </section>
  );
}
export function RateButtons({ value, onRate }: { value?: Rating; onRate: (r: Rating) => void }) {
  return (
    <div className="rate">
      {(['revoir', 'correct', 'maitrise'] as Rating[]).map((r) => <button key={r} className={`r-${r}${value === r ? ' on' : ''}`} aria-pressed={value === r} onClick={() => onRate(r)}>{t(RATING_LABEL[r])}</button>)}
    </div>
  );
}

// ---------- Fiche d'exercice ----------
export function ExerciseSheet({ e, prof, item, checked, canCheck, onCheck, onClose, onOpen }: {
  e: Exercise; prof?: TrainingProfile; item?: { dose: import('../hoopcamp/types').Dose; sec: number }; checked?: boolean; canCheck?: boolean;
  onCheck?: () => void; onClose: () => void; onOpen?: (id: string) => void;
}) {
  const dose = item?.dose ?? e.dose[e.minAge]!;
  const prog = e.progression ? BY_ID.get(e.progression) : undefined, reg = e.regression ? BY_ID.get(e.regression) : undefined;
  const alts = prof && !feasible(e, prof) ? alternativesFor(e, prof, EXERCISES) : [];
  return (
    <Sheet title={e.name} onClose={onClose}>
      <div className="ex-sheet">
        <div className="ex-tags"><span className="tag fam">{t(FAMILY_LABEL[e.family])}</span><span className="tag">{'★'.repeat(e.level)}</span>{e.game && <span className="tag">🎲 {t('jeu')}</span>}</div>
        <p className="ex-goal">{e.goal}</p>
        <ExerciseDemo e={e} />
        <VideoHelp refId={`h-${e.id}`} query={e.name} />
        <div className="ex-dose"><b>{fmtDose(dose)}</b><span>{fmtDur(item?.sec ?? 0) !== '0 s' ? fmtDur(item!.sec) : ''}</span></div>
        {!e.untimed && <Timer dose={dose} hand={prof?.hand} hands={HANDS.has(e.family) || !!e.weakHand} onDone={() => { if (canCheck && !checked) onCheck?.(); }} />}
        <h4>{t('Mise en place')}</h4><p>{e.setup}</p>
        <h4>{t('Étapes')}</h4><ol>{e.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
        <div className="ex-tip"><b>💡 {t('Le truc du coach')}</b><p>{e.tip}</p></div>
        <h4>{t('À éviter')}</h4><ul className="ex-err">{e.errors.map((x, i) => <li key={i}>{x}</li>)}</ul>
        {e.safety && <div className="ex-safe"><Ico n="alert" />{e.safety}</div>}
        {e.variants?.map((v, i) => <p key={i} className="hint">↔ {v}</p>)}
        {alts.length > 0 && <p className="hint">{t('Pas faisable chez toi ? Essaie plutôt :')} {alts.map((a) => <button key={a.id} className="linklike" onClick={() => onOpen?.(a.id)}>{a.name}</button>)}</p>}
        {(prog || reg) && (
          <div className="ex-links">
            {reg && <button className="btn small secondary" onClick={() => onOpen?.(reg.id)}>‹ {t('Plus facile')} : {reg.name}</button>}
            {prog && <button className="btn small secondary" onClick={() => onOpen?.(prog.id)}>{t('Plus dur')} : {prog.name} ›</button>}
          </div>
        )}
        {canCheck && <button className="btn volt mt" disabled={checked} onClick={() => { onCheck?.(); onClose(); }}>{checked ? `✓ ${t('Fait')}` : t('J’ai fini cet exercice')}</button>}
      </div>
    </Sheet>
  );
}

// ---------- Progrès ----------
function Progress({ st }: { st: ReturnType<typeof stats> }) {
  const fams = FAMILIES.filter((f) => st.families[f]);
  const max = Math.max(1, ...fams.map((f) => st.families[f]!.done));
  return (
    <>
      <section className="hc-phase">
        <h3 className="group-title">{t('Mes 4 dernières semaines')}</h3>
        <div className="cal28">
          {st.calendar.map((d) => <span key={d.date} className={`v${d.v}`} title={d.date}>{+d.date.slice(8)}</span>)}
        </div>
        <p className="hint"><span className="dot v1" /> {t('entraîné')} · <span className="dot v2" /> {t('entraîné et validé')} · {t('Record : {n} jours d’affilée', { n: st.best })}</p>
      </section>
      <section className="hc-phase">
        <h3 className="group-title">{t('Niveaux')}</h3>
        <div className="levels">{LEVELS.map((l, i) => <span key={l.name} className={i <= st.level ? 'on' : ''}>{l.name}<small>{l.xp} XP</small></span>)}</div>
        <p className="hint">{t('Cocher rapporte 5 points. Une validation rapporte bien plus : Correct 15, Maîtrisé 30.')}</p>
      </section>
      <section className="hc-phase">
        <h3 className="group-title">{t('Badges')}</h3>
        <div className="badges">{BADGES.map((b) => <div key={b.id} className={st.badges.includes(b.id) ? 'on' : ''}><span>{b.emoji}</span><b>{b.name}</b><small>{b.text}</small></div>)}</div>
      </section>
      {fams.length > 0 && (
        <section className="hc-phase">
          <h3 className="group-title">{t('Par famille')}</h3>
          <div className="group fams">
            {fams.map((f) => { const x = st.families[f]!; return (
              <div key={f} className="fam"><span>{t(FAMILY_LABEL[f])}</span><div className="bar"><i style={{ width: `${(x.done / max) * 100}%` }} /><i className="m" style={{ width: `${(x.mastered / max) * 100}%` }} /></div><small>{x.done} · ⭐{x.mastered}</small></div>
            ); })}
          </div>
        </section>
      )}
    </>
  );
}

// ---------- Bibliothèque ----------
export function Library({ prof, onOpen }: { prof?: TrainingProfile; onOpen: (id: string) => void }) {
  const [f, setF] = useState<Family | 'all'>('all');
  const [mine, setMine] = useState(!!prof);
  const list = EXERCISES.filter((e) => (f === 'all' || e.family === f) && (!mine || !prof || feasible(e, prof)));
  return (
    <>
      <div className="chips">
        <button className={`chip${f === 'all' ? ' on' : ''}`} onClick={() => setF('all')}>{t('Tout')}</button>
        {FAMILIES.map((x) => <button key={x} className={`chip${f === x ? ' on' : ''}`} onClick={() => setF(x)}>{t(FAMILY_LABEL[x])}</button>)}
      </div>
      {prof && <label className="toggle-line"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> {t('Seulement ce que je peux faire chez moi')}</label>}
      <div className="group">
        {list.map((e) => (
          <button key={e.id} className="row" onClick={() => onOpen(e.id)}>
            <span className="grow"><span className="nm">{e.name}</span><span className="sub">{t(FAMILY_LABEL[e.family])} · {e.minAge}–{e.maxAge} · {'★'.repeat(e.level)}</span></span><span className="chev">›</span>
          </button>
        ))}
      </div>
      <p className="hint">{tn(list.length, '{n} exercice', '{n} exercices')}</p>
    </>
  );
}

// ---------- Profil d'entraînement + choix du programme ----------
function Setup({ p, camp, defAge, by, from, onDone, onCancel }: { p: A.Player; camp: A.Camp | null; defAge: Age; by: string; from: 'player' | 'parent' | 'coach'; onDone: () => void; onCancel?: () => void }) {
  const s = useSession();
  const [f, setF] = useState<TrainingProfile>(camp?.profile ?? { age: defAge, level: 2, hand: 'droite', basket: 'aucun', space: 'moyen', surface: 'exterieur', equip: ['ballon', 'mur', 'plots'], minutes: 30, days: 4, goals: ['dribble'] });
  const [prog, setProg] = useState(camp?.program?.id ?? (AGES.indexOf(defAge) <= 1 ? 'petits' : 'camp-1'));
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const up = <K extends keyof TrainingProfile>(k: K, v: TrainingProfile[K]) => setF({ ...f, [k]: v });
  const tog = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const progs = PROGRAMS.filter((x) => (!x.minAge || AGES.indexOf(f.age) >= AGES.indexOf(x.minAge)) && (!x.maxAge || AGES.indexOf(f.age) <= AGES.indexOf(x.maxAge)));
  const coachProg = camp?.program?.from === 'coach' ? camp.program : null;
  const save = async () => {
    setBusy(true);
    try {
      const keep = camp?.program && camp.program.id === prog;
      await A.setCamp(p.id, { profile: f, program: keep ? camp!.program : { id: prog, name: findProgram(prog)?.name ?? prog, start: today(), end: null, from, by } });
      onDone();
    } catch (e) { console.error(e); s.toast(t('Impossible d’enregistrer. Réessaie.')); } finally { setBusy(false); }
  };
  const opt = <T extends string | number>(v: T, cur: T, set: (x: T) => void, label: string) => <button key={String(v)} className={`chip${cur === v ? ' on' : ''}`} onClick={() => set(v)}>{t(label)}</button>;
  return (
    <div className="setup">
      <section className="hc-hero small">
        <div className="hc-kick"><Ico n="bolt" />Hoop Camp</div>
        <h2>{from === 'player' ? t('Ton profil d’entraînement') : t('Profil d’entraînement de {n}', { n: p.prenom })}</h2>
        <p>{[t('Qui es-tu ?'), t('Où t’entraînes-tu ?'), t('Combien de temps ?'), t('Choisis ton programme')][step]}</p>
      </section>
      <div className="wiz-dots" aria-hidden>{[0, 1, 2, 3].map((n) => <i key={n} className={n <= step ? 'on' : ''} />)}</div>
      {step === 0 && <div className="wiz-step">
      <h3 className="group-title">{t('Catégorie')}</h3>
      <div className="chips wrap">{AGES.map((a) => opt(a, f.age, (x) => up('age', x), a === 'U21' ? 'U21 / Seniors' : a))}</div>
      <h3 className="group-title">{t('Niveau')}</h3>
      <div className="chips wrap">{([[1, 'Débutant'], [2, 'Intermédiaire'], [3, 'Avancé']] as const).map(([v, l]) => opt(v, f.level, (x) => up('level', x as 1 | 2 | 3), l))}</div>
      <h3 className="group-title">{t('Main forte')}</h3>
      <div className="chips wrap">{opt('droite', f.hand, (x) => up('hand', x as 'droite'), 'Droitier')}{opt('gauche', f.hand, (x) => up('hand', x as 'gauche'), 'Gaucher')}</div>
      </div>}
      {step === 1 && <div className="wiz-step">
      <h3 className="group-title">{t('Panier')}</h3>
      <div className="chips wrap">{([['aucun', 'Pas de panier'], ['panier', 'Un panier'], ['terrain', 'Un terrain complet']] as const).map(([v, l]) => opt(v, f.basket, (x) => up('basket', x as TrainingProfile['basket']), l))}</div>
      {f.basket !== 'aucun' && <label className="toggle-line"><input type="checkbox" checked={!!f.adjustable} onChange={(e) => up('adjustable', e.target.checked)} /> {t('Hauteur réglable')}</label>}
      <h3 className="group-title">{t('Espace')}</h3>
      <div className="chips wrap">{([['petit', 'Petit (sur place)'], ['moyen', 'Moyen (10 m pour courir)'], ['grand', 'Grand (terrain, salle)']] as const).map(([v, l]) => opt(v, f.space, (x) => up('space', x as TrainingProfile['space']), l))}</div>
      <h3 className="group-title">{t('Sol')}</h3>
      <div className="chips wrap">{([['interieur', 'Intérieur'], ['exterieur', 'Extérieur dur'], ['herbe', 'Herbe']] as const).map(([v, l]) => opt(v, f.surface, (x) => up('surface', x as TrainingProfile['surface']), l))}</div>
      <h3 className="group-title">{t('Matériel')}</h3>
      <div className="chips wrap">{EQUIPMENT.map((q) => <button key={q} className={`chip${f.equip.includes(q) ? ' on' : ''}`} onClick={() => up('equip', tog(f.equip, q))}>{t(EQUIP_LABEL[q])}</button>)}</div>
      </div>}
      {step === 2 && <div className="wiz-step">
      <h3 className="group-title">{t('Temps par jour')}</h3>
      <div className="chips wrap">{([15, 30, 45, 60] as const).map((m) => opt(m, f.minutes, (x) => up('minutes', x as TrainingProfile['minutes']), `${m} min`))}</div>
      <h3 className="group-title">{t('Jours par semaine')}</h3>
      <div className="chips wrap">{[2, 3, 4, 5, 6, 7].map((d) => <button key={d} className={`chip${f.days === d ? ' on' : ''}`} onClick={() => up('days', d)}>{d}</button>)}</div>
      <h3 className="group-title">{t('Ce que je veux travailler')}</h3>
      <div className="chips wrap">{GOALS.map((g) => <button key={g} className={`chip${f.goals.includes(g) ? ' on' : ''}`} onClick={() => up('goals', tog(f.goals, g))}>{t(GOAL_LABEL[g])}</button>)}</div>

      </div>}
      {step === 3 && <div className="wiz-step">
      <h3 className="group-title">{t('Programme')}</h3>
      {coachProg && <p className="hint">{t('Ton coach t’a envoyé « {p} ». Tu peux le garder ou en choisir un autre.', { p: coachProg.custom?.name ?? findProgram(coachProg.id)?.name ?? coachProg.name })}</p>}
      <div className="progs">
        {coachProg?.custom && <ProgCard pr={coachProg.custom} on={prog === coachProg.id} onPick={() => setProg(coachProg.id)} />}
        {progs.map((x) => <ProgCard key={x.id} pr={x} on={prog === x.id} onPick={() => setProg(x.id)} />)}
      </div>
      </div>}
      <div className="setup-actions">
        {step > 0 ? <button className="btn secondary" onClick={() => setStep(step - 1)}>‹ {t('Retour')}</button> : onCancel && <button className="btn secondary" onClick={onCancel}>{t('Annuler')}</button>}
        {step < 3 ? <button className="btn volt" disabled={step === 1 && !f.equip.length} onClick={() => { setStep(step + 1); window.scrollTo(0, 0); }}>{t('Suivant')} ›</button>
          : <button className="btn volt" disabled={busy || !f.equip.length} onClick={save}>{camp?.profile ? t('Enregistrer') : t('Lancer mon Hoop Camp')}</button>}
      </div>
    </div>
  );
}
export function ProgCard({ pr, on, onPick }: { pr: Program; on: boolean; onPick: () => void }) {
  return (
    <button className={`prog${on ? ' on' : ''}`} onClick={onPick} aria-pressed={on}>
      <span className="em">{pr.emoji}</span>
      <span className="grow"><b>{t(pr.name)}</b><small>{t(pr.desc)}</small><small className="len">{pr.days ? tn(pr.days, '{n} jour', '{n} jours') : t('sans fin')} · {t('{n} séances / semaine', { n: pr.perWeek })}</small></span>
    </button>
  );
}
export { EXERCISES, phaseOf };
