// Bibliothèques du coach : exercices d'entraînement collectif, tactiques animées, et vidéos d'explication.
// Utilisées par le Playbook (consultation) et par la préparation des séances (choix des exercices).
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { Sheet } from '../ui/kit';
import { Ico } from '../ui/icons';
import { DRILLS } from '../drills/library';
import { TACTICS } from '../drills/tactics';
import { THEMES, THEME_LABEL, CATS, CAT_LABEL, ageRange, ageLabel, fitsAge, type Age, type Drill, type Tactic, type Theme, type PlayCat } from '../drills/types';
import { EXERCISES } from '../hoopcamp/library';
import { Player } from './Court';
import { FAMILY_LABEL } from './HoopCamp';
import { useClub, ageOfTeam } from './ctx';
import { VideoHelp } from './VideoHelp';

export function DrillSheet({ d, onClose, onAdd }: { d: Drill; onClose: () => void; onAdd?: () => void }) {
  return (
    <Sheet title={d.name} onClose={onClose}>
      <div className="ex-sheet">
        <div className="ex-tags"><span className="tag fam">{t(THEME_LABEL[d.theme])}</span><span className="tag">{ageRange(d.minAge, d.maxAge)}</span><span className="tag">{d.min} min</span><span className="tag">{d.players}</span></div>
        <p className="ex-goal">{d.goal}</p>
        <VideoHelp refId={`d-${d.id}`} query={d.name} />
        <h4>{t('Mise en place')}</h4><p>{d.setup}{d.equip && d.equip !== 'aucun' ? ` · ${t('Matériel')} : ${d.equip}` : ''}</p>
        <h4>{t('Déroulement')}</h4><ol>{d.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
        <div className="ex-tip"><b>💡 {t('Points clés')}</b><ul>{d.points.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        {d.variants?.map((v, i) => <p key={i} className="hint">↔ {v}</p>)}
        {onAdd && <button className="btn volt mt" onClick={onAdd}><Ico n="plus" />{t('Ajouter à la séance')}</button>}
      </div>
    </Sheet>
  );
}

export function TacticSheet({ x, onClose, onCopy }: { x: Tactic; onClose: () => void; onCopy?: () => void }) {
  return (
    <Sheet title={x.name} onClose={onClose}>
      <div className="ex-sheet">
        <div className="ex-tags"><span className="tag fam">{t(CAT_LABEL[x.cat])}</span><span className="tag">{t('dès {a}', { a: ageLabel(x.minAge) })}</span></div>
        <p className="ex-goal">{x.desc}</p>
        <Player key={x.id} steps={x.frames} mode={x.mode} />
        <div className="ex-tip"><b>💡 {t('Points clés')}</b><ul>{x.keys.map((k, i) => <li key={i}>{k}</li>)}</ul></div>
        <VideoHelp refId={`t-${x.id}`} query={x.name} />
        {onCopy && <button className="btn secondary mt" onClick={onCopy}><Ico n="edit" />{t('Copier dans mes schémas pour l’adapter')}</button>}
      </div>
    </Sheet>
  );
}

/** Âge de l'équipe choisie (filtre par défaut des bibliothèques) */
export function useTeamAge(teamId?: string | null): Age | null {
  const k = useClub();
  return ageOfTeam(k.team(teamId ?? k.teamIds[0])) ?? null;
}

/** Liste filtrable des exercices collectifs (et des exercices individuels Hoop Camp) */
export function DrillList({ age, onPick, picked }: { age: Age | null; onPick: (ref: string) => void; picked?: Set<string> }) {
  const [theme, setTheme] = useState<Theme | 'hc' | ''>('');
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const qq = q.trim().toLowerCase();
  const drills = useMemo(() => DRILLS.filter((d) => (all || fitsAge(d, age)) && (!theme || d.theme === theme) && (!qq || `${d.name} ${d.goal}`.toLowerCase().includes(qq))), [age, theme, qq, all]);
  const hc = useMemo(() => (theme === 'hc' ? EXERCISES.filter((e) => (all || fitsAge(e, age)) && (!qq || `${e.name} ${e.goal}`.toLowerCase().includes(qq))) : []), [age, theme, qq, all]);
  return (
    <>
      <input className="field" placeholder={t('Chercher un exercice')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips mt">
        <button className={`chip${!theme ? ' on' : ''}`} onClick={() => setTheme('')}>{t('Tous')}</button>
        {THEMES.map((th) => <button key={th} className={`chip${theme === th ? ' on' : ''}`} onClick={() => setTheme(th)}>{t(THEME_LABEL[th])}</button>)}
        <button className={`chip${theme === 'hc' ? ' on' : ''}`} onClick={() => setTheme('hc')}>{t('Individuel (Hoop Camp)')}</button>
      </div>
      {age && <label className="toggle-line"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> {t('Montrer aussi les exercices d’autres âges (équipe : {a})', { a: ageLabel(age) })}</label>}
      <div className="group mt">
        {theme !== 'hc' && drills.map((d) => (
          <button key={d.id} className="row" onClick={() => onPick(`d:${d.id}`)}>
            <span className="grow"><span className="nm">{d.name}</span><span className="sub">{t(THEME_LABEL[d.theme])} · {ageRange(d.minAge, d.maxAge)} · {d.min} min</span></span>
            {picked?.has(`d:${d.id}`) ? <Ico n="check" /> : <span className="chev">›</span>}
          </button>
        ))}
        {hc.map((e) => (
          <button key={e.id} className="row" onClick={() => onPick(`h:${e.id}`)}>
            <span className="grow"><span className="nm">{e.name}</span><span className="sub">{t(FAMILY_LABEL[e.family])} · {ageRange(e.minAge, e.maxAge)}</span></span>
            {picked?.has(`h:${e.id}`) ? <Ico n="check" /> : <span className="chev">›</span>}
          </button>
        ))}
        {!drills.length && !hc.length && <div className="row"><span className="grow sub">{t('Aucun exercice avec ces filtres.')}</span></div>}
      </div>
    </>
  );
}

/** Liste des tactiques par catégorie */
export function TacticList({ age, onOpen }: { age: Age | null; onOpen: (x: Tactic) => void }) {
  const [cat, setCat] = useState<PlayCat | ''>('');
  const list = TACTICS.filter((x) => (!cat || x.cat === cat) && (!age || fitsAge(x, age)));
  return (
    <>
      <div className="chips">
        <button className={`chip${!cat ? ' on' : ''}`} onClick={() => setCat('')}>{t('Toutes')}</button>
        {CATS.map((c) => <button key={c} className={`chip${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>{t(CAT_LABEL[c])}</button>)}
      </div>
      <div className="group mt">
        {list.map((x) => (
          <button key={x.id} className="row" onClick={() => onOpen(x)}>
            <span className="grow"><span className="nm">{x.name}</span><span className="sub">{t(CAT_LABEL[x.cat])} · {t('dès {a}', { a: ageLabel(x.minAge) })} · {x.mode === 'full' ? t('Terrain complet') : t('Demi-terrain')}</span></span>
            <span className="chev">›</span>
          </button>
        ))}
        {!list.length && <div className="row"><span className="grow sub">{t('Aucune tactique pour cet âge dans cette catégorie.')}</span></div>}
      </div>
    </>
  );
}
