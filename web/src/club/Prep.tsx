// Séances : créer ou modifier un entraînement, et préparer son déroulé (exercices de la bibliothèque, du club ou libres,
// durées modifiables, ordre, notes). Le plan est enregistré dans l'entraînement (trainings/{id}.plan).
import { useState } from 'react';
import { useSession } from '../lib/session';
import { t, tn } from '../lib/i18n';
import { Sheet, useAsync } from '../ui/kit';
import { Ico } from '../ui/icons';
import { DRILL_BY_ID } from '../drills/library';
import { THEMES, THEME_LABEL, type Age } from '../drills/types';
import { BY_ID } from '../hoopcamp/library';
import { addDays, doseFor, exSec, today } from '../hoopcamp/engine';
import { useClub, teamName } from './ctx';
import { DrillList, DrillSheet, useTeamAge } from './Library';
import { ExerciseSheet } from './HoopCamp';
import * as A from './api';

const mins = (a?: string, b?: string) => { if (!a || !b) return 0; const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number); return Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1)); };
const key = () => Math.random().toString(36).slice(2, 9);
export const planMin = (p?: A.PlanItem[]) => (p ?? []).reduce((n, x) => n + (x.min || 0), 0);

/** Créer (tr absent) ou modifier un entraînement ; « Préparer » ouvre le plan de séance */
export function TrainingSheet({ tr, teamIds, onClose, onSaved }: { tr?: A.Training; teamIds: string[]; onClose: () => void; onSaved: () => void }) {
  const s = useSession();
  const k = useClub();
  const [f, setF] = useState({ team_id: tr?.team_id ?? teamIds[0] ?? '', date: tr?.date ?? today(), start_time: tr?.start_time ?? '18:00', end_time: tr?.end_time ?? '19:30',
    location: tr?.location ?? '', notes: tr?.notes ?? '', weeks: 1 });
  const [cur, setCur] = useState<A.Training | undefined>(tr);
  const [prep, setPrep] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async (thenPrep: boolean) => {
    setBusy(true);
    try {
      const data = { team_id: f.team_id, date: f.date, start_time: f.start_time, end_time: f.end_time, location: f.location || undefined, notes: f.notes || undefined };
      if (cur) { await A.updateTraining(cur.id, data); setCur({ ...cur, ...data }); }
      else {
        let first: A.Training | undefined;
        for (let w = 0; w < f.weeks; w++) {
          const d = { ...data, date: addDays(f.date, 7 * w), created_by: s.user!.uid };
          const ref = await A.addTraining(d);
          if (!w) first = { id: ref.id, ...d };
        }
        setCur(first);
      }
      onSaved();
      if (thenPrep) setPrep(true); else onClose();
    } catch { s.toast(t('Accès refusé.')); } finally { setBusy(false); }
  };
  if (prep && cur) return <PlanEditor tr={cur} onClose={() => { setPrep(false); onClose(); }} onSaved={(p) => { setCur(p); onSaved(); }} />;
  const n = cur?.plan?.length ?? 0;
  return (
    <Sheet title={cur ? t('Entraînement') : t('Nouvel entraînement')} onClose={onClose}>
      <div className="form">
        {teamIds.length > 1 && <label className="lbl">{t('Équipe')}<select className="field" value={f.team_id} onChange={(e) => setF({ ...f, team_id: e.target.value })}>{teamIds.map((id) => <option key={id} value={id}>{teamName(k.team(id)) || id}</option>)}</select></label>}
        <label className="lbl">{t('Date')}<input className="field" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <div className="two"><label className="lbl">{t('Début')}<input className="field" type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></label>
          <label className="lbl">{t('Fin')}<input className="field" type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} /></label></div>
        <input className="field" placeholder={t('Lieu (salle)')} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
        <input className="field" placeholder={t('Note (facultatif)')} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        {!cur && <label className="lbl">{t('Répéter chaque semaine')}<select className="field" value={f.weeks} onChange={(e) => setF({ ...f, weeks: +e.target.value })}>{[1, 2, 4, 8, 12].map((w) => <option key={w} value={w}>{w === 1 ? t('Non') : tn(w, '{n} semaine', '{n} semaines')}</option>)}</select></label>}
        {cur && (
          <button className="prep-card" onClick={() => setPrep(true)}>
            <Ico n="edit" />
            <span className="grow"><b>{n ? t('Modifier la préparation') : t('Préparer l’entraînement')}</b>
              <small>{n ? `${tn(n, '{n} exercice', '{n} exercices')} · ${planMin(cur.plan)} / ${mins(cur.start_time, cur.end_time)} min${cur.focus ? ` · ${cur.focus}` : ''}` : t('Choisis tes exercices dans la bibliothèque et règle leur durée.')}</small></span>
            <span className="chev">›</span>
          </button>
        )}
        <button className="btn volt" disabled={busy || !f.team_id} onClick={() => save(false)}>{t('Enregistrer')}</button>
        {!cur && <button className="btn secondary" disabled={busy || !f.team_id} onClick={() => save(true)}><Ico n="edit" />{t('Enregistrer et préparer')}</button>}
        {cur && <button className="btn danger" onClick={async () => { if (confirm(t('Supprimer cet entraînement ?'))) { await A.deleteTraining(cur.id).catch(() => s.toast(t('Accès refusé.'))); onSaved(); onClose(); } }}>{t('Supprimer')}</button>}
      </div>
    </Sheet>
  );
}

const defaultMin = (ref: string, age: Age | null) => {
  if (ref.startsWith('d:')) return DRILL_BY_ID.get(ref.slice(2))?.min ?? 10;
  const e = BY_ID.get(ref.slice(2));
  return e ? Math.max(5, Math.round(exSec(e, doseFor(e, age ?? e.minAge)) / 60)) : 10;
};
const titleOf = (ref: string) => (ref.startsWith('d:') ? DRILL_BY_ID.get(ref.slice(2))?.name : BY_ID.get(ref.slice(2))?.name) ?? ref;

/** Préparation de la séance : liste ordonnée d'exercices, durées modifiables, total comparé à la durée prévue */
function PlanEditor({ tr, onClose, onSaved }: { tr: A.Training; onClose: () => void; onSaved: (t: A.Training) => void }) {
  const s = useSession();
  const k = useClub();
  const age = useTeamAge(tr.team_id);
  const [plan, setPlan] = useState<A.PlanItem[]>(tr.plan ?? []);
  const [focus, setFocus] = useState(tr.focus ?? '');
  const [add, setAdd] = useState(false);
  const [open, setOpen] = useState<A.PlanItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const total = planMin(plan), dur = mins(tr.start_time, tr.end_time);
  const upd = (n: A.PlanItem[]) => { setPlan(n); setDirty(true); };
  const set = (i: number, p: Partial<A.PlanItem>) => upd(plan.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => { const n = [...plan]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); upd(n); };
  const save = async () => {
    setBusy(true);
    try { await A.updateTraining(tr.id, { plan, focus: focus.trim() }); setDirty(false); onSaved({ ...tr, plan, focus: focus.trim() }); s.toast(t('Séance enregistrée.')); onClose(); }
    catch { s.toast(t('Accès refusé.')); } finally { setBusy(false); }
  };
  const close = () => { if (!dirty || confirm(t('Quitter sans enregistrer ?'))) onClose(); };
  const toggle = (ref: string) => {
    const i = plan.findIndex((x) => x.ref === ref);
    if (i >= 0) upd(plan.filter((_, j) => j !== i));
    else { upd([...plan, { key: key(), ref, title: titleOf(ref), min: defaultMin(ref, age) }]); s.toast(t('Ajouté à la séance')); }
  };
  return (
    <Sheet title={t('Séance')} onClose={close} right={<button className="btn small volt" disabled={busy} onClick={save}>{t('Enregistrer')}</button>}>
      <div className="form plan">
        <p className="hint" style={{ margin: 0 }}>{teamName(k.team(tr.team_id))} · {tr.date.split('-').reverse().join('/')} · {tr.start_time}–{tr.end_time}</p>
        <input className="field" placeholder={t('Objectif de la séance (ex. : défense sur écran)')} maxLength={120} value={focus} onChange={(e) => { setFocus(e.target.value); setDirty(true); }} />
        <div className={`plan-total${dur && total > dur ? ' over' : ''}`}>
          <span><b>{total}</b> / {dur || '—'} min</span>
          {dur > 0 && <span className="bar"><i style={{ width: `${Math.min(100, (total / dur) * 100)}%` }} /></span>}
          <small>{!dur ? '' : total > dur ? t('{n} min de trop', { n: total - dur }) : total < dur ? t('{n} min libres', { n: dur - total }) : t('Pile à l’heure')}</small>
        </div>
        {!plan.length && <p className="hint">{t('Ajoute des exercices de la bibliothèque, de ton club, ou un bloc libre (match, discours…).')}</p>}
        <ol className="plan-list">
          {plan.map((x, i) => {
            const start = plan.slice(0, i).reduce((n, y) => n + y.min, 0);
            return (
              <li key={x.key}>
                <div className="pl-top">
                  <span className="pl-time">{start}′</span>
                  <button className="pl-name" onClick={() => setOpen(x)}>{x.title}</button>
                  <button className="icon-btn" aria-label={t('Retirer')} onClick={() => upd(plan.filter((_, j) => j !== i))}><Ico n="close" /></button>
                </div>
                <div className="pl-ctl">
                  <span className="stepper">
                    <button aria-label={t('Moins')} onClick={() => set(i, { min: Math.max(1, x.min - 1) })}>−</button>
                    <input type="number" inputMode="numeric" min={1} max={120} value={x.min} onChange={(e) => set(i, { min: Math.max(1, Math.min(120, +e.target.value || 1)) })} aria-label={t('Minutes')} />
                    <button aria-label={t('Plus')} onClick={() => set(i, { min: Math.min(120, x.min + 1) })}>+</button>
                    <small>min</small>
                  </span>
                  <span className="pl-move">
                    <button className="icon-btn" disabled={!i} aria-label={t('Monter')} onClick={() => move(i, -1)}>↑</button>
                    <button className="icon-btn" disabled={i === plan.length - 1} aria-label={t('Descendre')} onClick={() => move(i, 1)}>↓</button>
                  </span>
                </div>
                <input className="field small" placeholder={t('Consigne pour ce bloc (facultatif)')} maxLength={200} value={x.note ?? ''} onChange={(e) => set(i, { note: e.target.value || undefined })} />
              </li>
            );
          })}
        </ol>
        <button className="btn volt" onClick={() => setAdd(true)}><Ico n="plus" />{t('Ajouter un exercice')}</button>
        <button className="btn secondary" onClick={() => { const title = prompt(t('Nom du bloc (ex. : match 5c5, discours)')); if (title?.trim()) upd([...plan, { key: key(), title: title.trim().slice(0, 80), min: 10 }]); }}><Ico n="plus" />{t('Bloc libre')}</button>
      </div>
      {add && <Picker age={age} picked={new Set(plan.map((x) => x.ref ?? ''))} onToggle={toggle} onAddClub={(d) => { upd([...plan, { key: key(), ref: `c:${d.id}`, title: d.name, min: d.min, ...(d.desc ? { note: d.desc.slice(0, 200) } : {}) }]); s.toast(t('Ajouté à la séance')); }} onClose={() => setAdd(false)} />}
      {open?.ref?.startsWith('d:') && DRILL_BY_ID.get(open.ref.slice(2)) && <DrillSheet d={DRILL_BY_ID.get(open.ref.slice(2))!} onClose={() => setOpen(null)} />}
      {open?.ref?.startsWith('h:') && BY_ID.get(open.ref.slice(2)) && <ExerciseSheet e={BY_ID.get(open.ref.slice(2))!} onClose={() => setOpen(null)} />}
    </Sheet>
  );
}

/** Choisir des exercices : bibliothèque (collectif + Hoop Camp) ou exercices du club ; création d'un exercice du club */
function Picker({ age, picked, onToggle, onAddClub, onClose }: { age: Age | null; picked: Set<string>; onToggle: (ref: string) => void; onAddClub: (d: A.ClubDrill) => void; onClose: () => void }) {
  const s = useSession();
  const k = useClub();
  const [tab, setTab] = useState<'lib' | 'club'>('lib');
  const mine = useAsync(() => (k.me ? A.clubDrills(k.me.club_id) : Promise.resolve([])), [k.me?.club_id]);
  const [f, setF] = useState({ name: '', theme: 'collectif', min: 10, desc: '' });
  const [create, setCreate] = useState(false);
  return (
    <Sheet title={t('Ajouter un exercice')} onClose={onClose} right={<button className="btn small volt" onClick={onClose}>{t('OK')}</button>}>
      <div className="form">
        <div className="seg work-seg">
          <button className={tab === 'lib' ? 'on' : ''} onClick={() => setTab('lib')}>{t('Bibliothèque')}</button>
          <button className={tab === 'club' ? 'on' : ''} onClick={() => setTab('club')}>{t('Mes exercices')}</button>
        </div>
        {tab === 'lib' && <><p className="hint" style={{ margin: 0 }}>{t('Touche un exercice pour l’ajouter (ou le retirer).')}</p><DrillList age={age} onPick={onToggle} picked={picked} /></>}
        {tab === 'club' && (
          <>
            <div className="group">
              {(mine.data ?? []).map((d) => (
                <div key={d.id} className="row">
                  <button className="grow linkrow" onClick={() => onAddClub(d)}><span className="nm">{d.name}</span><span className="sub">{t(THEME_LABEL[d.theme as keyof typeof THEME_LABEL] ?? d.theme)} · {d.min} min</span></button>
                  <button className="icon-btn" aria-label={t('Supprimer')} onClick={async () => { if (confirm(t('Supprimer cet exercice du club ?'))) { await A.deleteClubDrill(d.id).catch(() => s.toast(t('Accès refusé.'))); mine.reload(); } }}><Ico n="close" /></button>
                </div>
              ))}
              {!mine.loading && !mine.data?.length && <div className="row"><span className="grow sub">{t('Aucun exercice du club pour l’instant.')}</span></div>}
            </div>
            {!create ? <button className="btn secondary" onClick={() => setCreate(true)}><Ico n="plus" />{t('Créer un exercice')}</button> : (
              <>
                <input className="field" placeholder={t('Nom de l’exercice')} maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                <div className="two">
                  <select className="field" value={f.theme} onChange={(e) => setF({ ...f, theme: e.target.value })}>{THEMES.map((th) => <option key={th} value={th}>{t(THEME_LABEL[th])}</option>)}</select>
                  <label className="lbl-inline"><input className="field" type="number" inputMode="numeric" min={1} max={120} value={f.min} onChange={(e) => setF({ ...f, min: Math.max(1, Math.min(120, +e.target.value || 1)) })} /> min</label>
                </div>
                <textarea className="field" rows={4} maxLength={2000} placeholder={t('Déroulement, consignes, matériel…')} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} />
                <button className="btn volt" disabled={!f.name.trim()} onClick={async () => {
                  try {
                    const d = { club_id: k.me!.club_id, name: f.name.trim(), theme: f.theme, min: f.min, desc: f.desc.trim(), created_by: s.user!.uid };
                    const ref = await A.addClubDrill(d);
                    onAddClub({ id: ref.id, ...d }); setCreate(false); setF({ name: '', theme: 'collectif', min: 10, desc: '' }); mine.reload();
                  } catch { s.toast(t('Accès refusé.')); }
                }}>{t('Créer et ajouter à la séance')}</button>
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
