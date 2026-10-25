// Tableau Tactique : schémas du club (phases de jeu et exercices), étapes animées. Même format que l'ancien module (plays).
// Bibliothèques : tactiques animées (drills/tactics) et exercices collectifs + individuels Hoop Camp (drills/library, hoopcamp/library).
import { useRef, useState } from 'react';
import { useSession } from '../lib/session';
import { t, tn } from '../lib/i18n';
import { Skeleton, Empty, useAsync } from '../ui/kit';
import { Ico } from '../ui/icons';
import { EXERCISES, BY_ID } from '../hoopcamp/library';
import * as A from './api';
import { useClub } from './ctx';
import { CourtSvg, TokenG, Player, VIEW, type Mode, type Step } from './Court';
import { ExerciseSheet } from './HoopCamp';
import { DrillList, DrillSheet, TacticList, TacticSheet, useTeamAge } from './Library';
import { DRILLS, DRILL_BY_ID } from '../drills/library';
import { TACTICS } from '../drills/tactics';
import type { Tactic } from '../drills/types';

const PLACES_O = [{ x: 250, y: 380 }, { x: 100, y: 300 }, { x: 400, y: 300 }, { x: 170, y: 160 }, { x: 330, y: 160 }];
const PLACES_D = [{ x: 250, y: 330 }, { x: 130, y: 270 }, { x: 370, y: 270 }, { x: 190, y: 170 }, { x: 310, y: 170 }];
const roster = (o: number, d: number): A.Token[] => [
  ...PLACES_O.slice(0, o).map((p, i) => ({ id: `O${i + 1}`, type: 'offense' as const, label: String(i + 1), ...p })),
  ...PLACES_D.slice(0, d).map((p, i) => ({ id: `D${i + 1}`, type: 'defense' as const, label: `D${i + 1}`, ...p })),
  { id: 'BALL', type: 'ball', label: '', x: 250, y: 402 },
];

export function Tactique() {
  const s = useSession();
  const k = useClub();
  const plays = useAsync(() => (k.me ? A.playsOf(k.me.club_id) : Promise.resolve([])), [k.me?.club_id]);
  // Trois rayons : mes schémas (dessinés par le club), la bibliothèque de tactiques animées, la bibliothèque d'exercices
  const [tab, setTab] = useState<'mine' | 'tactiques' | 'exercices'>('mine');
  const [f, setF] = useState<'tous' | 'tactique' | 'exercice'>('tous');
  const [open, setOpen] = useState<A.Play | 'new' | null>(null);
  const [tac, setTac] = useState<Tactic | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const editor = k.me?.role === 'coach' || k.me?.role === 'club_admin' || k.me?.role === 'super_admin';
  const age = useTeamAge();
  if (open) return <Board play={open === 'new' ? null : open} editor={editor} onClose={(changed) => { setOpen(null); if (changed) plays.reload(); }} />;
  const mine = (plays.data ?? []).filter((p) => f === 'tous' || p.type === f)
    // Joueurs et parents : schémas du club pour leur(s) équipe(s) et schémas sans équipe
    .filter((p) => editor || !p.team_id || k.teamIds.includes(String(p.team_id)));
  const copy = async (x: Tactic) => {
    try {
      const id = await A.savePlay({ title: x.name, type: 'tactique', team_id: null, notes: x.keys.join(' · '), courtMode: x.mode, steps: x.frames.map((fr, n) => ({ step: n + 1, tokens: fr.tokens })), club_id: k.me!.club_id, created_by: s.user!.uid });
      setTac(null); await plays.reload(); s.toast(t('Copiée dans tes schémas.')); setTab('mine'); void id;
    } catch { s.toast(t('Accès refusé.')); }
  };
  const ex = pick?.startsWith('h:') ? BY_ID.get(pick.slice(2)) : undefined;
  const dr = pick?.startsWith('d:') ? DRILL_BY_ID.get(pick.slice(2)) : undefined;
  return (
    <>
      <section className="hc-hero small">
        <div className="hc-kick"><Ico n="edit" />Playbook</div>
        <h2>{t('Schémas, tactiques et exercices')}</h2>
        <p>{editor ? t('Tes schémas, {n} tactiques animées et {m} exercices prêts à l’emploi.', { n: TACTICS.length, m: DRILLS.length + EXERCISES.length }) : t('Revois les systèmes de ton équipe, animés étape par étape.')}</p>
      </section>
      <div className="seg work-seg" role="tablist">
        {([['mine', 'Mes schémas'], ['tactiques', 'Tactiques'], ['exercices', 'Exercices']] as const).map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{t(l)}</button>)}
      </div>
      {tab === 'mine' && (
        <>
          <div className="chips">
            {([['tous', 'Tous'], ['tactique', 'Tactique'], ['exercice', 'Exercices']] as const).map(([id, l]) => <button key={id} className={`chip${f === id ? ' on' : ''}`} onClick={() => setF(id)}>{t(l)}</button>)}
          </div>
          {editor && <button className="btn volt" onClick={() => setOpen('new')}><Ico n="plus" />{t('Nouveau schéma')}</button>}
          {plays.loading ? <Skeleton n={2} /> : !mine.length ? <Empty ill="edit" title={t('Aucun schéma pour l’instant')} text={editor ? t('Dessine le tien, ou copie une tactique de la bibliothèque pour l’adapter.') : undefined} /> : (
            <div className="group mt">
              {mine.map((p) => (
                <button key={p.id} className="row" onClick={() => setOpen(p)}>
                  <span className="grow"><span className="nm">{p.title || t('Sans titre')}</span>
                    <span className="sub">{p.type === 'exercice' ? t('Exercice') : t('Tactique')} · {p.courtMode === 'full' ? t('Terrain complet') : t('Demi-terrain')} · {tn(p.steps?.length ?? 1, '{n} étape', '{n} étapes')}{p.team_id && k.team(p.team_id) ? ` · ${k.team(p.team_id)!.cat}` : ''}</span></span>
                  <span className="chev">›</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {tab === 'tactiques' && <TacticList age={null} onOpen={setTac} />}
      {tab === 'exercices' && <DrillList age={age} onPick={setPick} />}
      {tac && <TacticSheet x={tac} onClose={() => setTac(null)} onCopy={editor ? () => copy(tac) : undefined} />}
      {dr && <DrillSheet d={dr} onClose={() => setPick(null)} />}
      {ex && <ExerciseSheet e={ex} onClose={() => setPick(null)} onOpen={(id) => setPick(`h:${id}`)} />}
    </>
  );
}

function Board({ play, editor, onClose }: { play: A.Play | null; editor: boolean; onClose: (changed: boolean) => void }) {
  const s = useSession();
  const k = useClub();
  const [title, setTitle] = useState(play?.title ?? '');
  const [type, setType] = useState<A.Play['type']>(play?.type ?? 'tactique');
  const [team, setTeam] = useState(play?.team_id ?? (k.me?.role === 'coach' ? k.teamIds[0] ?? '' : ''));
  const [notes, setNotes] = useState(play?.notes ?? '');
  const [mode, setMode] = useState<Mode>(play?.courtMode ?? 'half');
  const [steps, setSteps] = useState<A.Token[][]>(play?.steps?.length ? play.steps.map((x) => x.tokens) : [roster(5, 5)]);
  const [i, setI] = useState(0);
  const [watch, setWatch] = useState(!editor || !!play);
  const [busy, setBusy] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const toks = steps[i] ?? [];
  const pt = (e: React.PointerEvent) => { const m = svg.current!.getScreenCTM()!.inverse(); const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m); return { x: p.x, y: p.y }; };
  const setToks = (n: A.Token[]) => setSteps(steps.map((x, j) => (j === i ? n : x)));
  const onPointer = {
    down: (e: React.PointerEvent<SVGSVGElement>) => {
      const p = pt(e);
      const hit = [...toks].reverse().find((k2) => Math.hypot(k2.x - p.x, k2.y - p.y) < 26);
      if (!hit) return;
      drag.current = { id: hit.id, dx: p.x - hit.x, dy: p.y - hit.y };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    move: (e: React.PointerEvent<SVGSVGElement>) => {
      const d = drag.current; if (!d) return;
      const p = pt(e), { w, h } = VIEW[mode];
      setToks(toks.map((k2) => (k2.id === d.id ? { ...k2, x: Math.max(12, Math.min(w - 12, p.x - d.dx)), y: Math.max(12, Math.min(h - 12, p.y - d.dy)) } : k2)));
    },
    up: () => { drag.current = null; },
  };
  const count = (type2: 'offense' | 'defense') => toks.filter((x) => x.type === type2).length;
  const resize = (o: number, d: number) => setSteps(steps.map((st) => {
    const base = roster(o, d);
    return base.map((b) => st.find((x) => x.id === b.id) ?? b);
  }));
  const save = async () => {
    setBusy(true);
    try {
      await A.savePlay({ id: play?.id, title: title.trim() || t('Sans titre'), type, team_id: team || null, notes, courtMode: mode, steps: steps.map((tokens, n) => ({ step: n + 1, tokens })), club_id: k.me!.club_id, created_by: play?.created_by ?? s.user!.uid });
      onClose(true);
    } catch { s.toast(t('Accès refusé.')); } finally { setBusy(false); }
  };
  const animSteps: Step[] = steps.map((tokens) => ({ tokens }));
  return (
    <>
      <div className="board-top">
        <button className="btn small secondary" onClick={() => onClose(false)}>‹ {t('Schémas')}</button>
        {editor && <div className="seg mini">{('edit watch'.split(' ') as ('edit' | 'watch')[]).map((m) => <button key={m} className={(m === 'watch') === watch ? 'on' : ''} onClick={() => setWatch(m === 'watch')}>{m === 'watch' ? t('Animer') : t('Dessiner')}</button>)}</div>}
      </div>
      {watch ? (
        <>
          <h2 className="board-title">{title || t('Sans titre')}</h2>
          <Player key={steps.length + mode} steps={animSteps} mode={mode} />
          {notes && <p className="hc-note">{notes}</p>}
        </>
      ) : (
        <>
          <input className="field" placeholder={t('Titre du schéma')} value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="board-tools">
            <div className="seg mini">{('tactique exercice'.split(' ') as A.Play['type'][]).map((x) => <button key={x} className={type === x ? 'on' : ''} onClick={() => setType(x)}>{x === 'tactique' ? t('Tactique') : t('Exercice')}</button>)}</div>
            <div className="seg mini">{('half full'.split(' ') as Mode[]).map((x) => <button key={x} className={mode === x ? 'on' : ''} onClick={() => setMode(x)}>{x === 'half' ? t('Demi-terrain') : t('Terrain complet')}</button>)}</div>
          </div>
          <div className="board-tools">
            <label className="lbl-inline">{t('Attaque')}<select value={count('offense')} onChange={(e) => resize(+e.target.value, count('defense'))}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
            <label className="lbl-inline">{t('Défense')}<select value={count('defense')} onChange={(e) => resize(count('offense'), +e.target.value)}>{[0, 1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
            <select className="field small" value={team} onChange={(e) => setTeam(e.target.value)} aria-label={t('Équipe')}>
              <option value="">{t('Tout le club')}</option>
              {(k.me?.role === 'coach' ? k.teamIds : (k.club?.teams ?? []).map((x) => String(x.id))).map((id) => <option key={id} value={id}>{k.team(id)?.cat ?? id}</option>)}
            </select>
          </div>
          <div className="board-wrap">
            <CourtSvg mode={mode} svgRef={svg} onPointer={onPointer}>
              {i > 0 && steps[i - 1].map((p) => { const c = toks.find((x) => x.id === p.id); return c && (c.x !== p.x || c.y !== p.y) ? <line key={p.id} className={`trail tr-${p.type}`} x1={p.x} y1={p.y} x2={c.x} y2={c.y} /> : null; })}
              {toks.map((x) => <TokenG key={x.id} k={x} />)}
            </CourtSvg>
          </div>
          <div className="steps">
            <button className="icon-btn" disabled={i === 0} onClick={() => setI(i - 1)} aria-label={t('Étape précédente')}><Ico n="chevLeft" /></button>
            <span>{t('Étape {n}/{m}', { n: i + 1, m: steps.length })}</span>
            <button className="icon-btn" disabled={i >= steps.length - 1} onClick={() => setI(i + 1)} aria-label={t('Étape suivante')}><Ico n="chevRight" /></button>
            <button className="btn small secondary" onClick={() => { const n = [...steps.slice(0, i + 1), toks.map((x) => ({ ...x })), ...steps.slice(i + 1)]; setSteps(n); setI(i + 1); }}><Ico n="plus" />{t('Étape')}</button>
            {steps.length > 1 && <button className="btn small danger" onClick={() => { setSteps(steps.filter((_, j) => j !== i)); setI(Math.max(0, i - 1)); }}>{t('Retirer')}</button>}
          </div>
          <p className="hint">{t('Glisse les joueurs et le ballon. Ajoute une étape pour chaque mouvement.')}</p>
          <textarea className="field" rows={3} placeholder={t('Consignes (facultatif)')} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="setup-actions">
            {play && <button className="btn danger" onClick={async () => { if (confirm(t('Supprimer ce schéma ?'))) { await A.deletePlay(play.id).catch(() => s.toast(t('Accès refusé.'))); onClose(true); } }}>{t('Supprimer')}</button>}
            <button className="btn volt" disabled={busy} onClick={save}>{t('Enregistrer')}</button>
          </div>
        </>
      )}
    </>
  );
}
