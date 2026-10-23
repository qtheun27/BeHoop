// Chrono Hoop Camp : séries, repos, bips, « change de main / de côté », écran allumé (Wake Lock).
import { useEffect, useRef, useState } from 'react';
import type { Dose } from '../hoopcamp/types';
import { fmtDur } from '../hoopcamp/engine';
import { t } from '../lib/i18n';
import { Ico } from '../ui/icons';

let ctx: AudioContext | null = null;
/** Bip court (fréquence, durée) — le contexte audio est créé au premier appui (exigence des navigateurs) */
export function beep(f = 880, ms = 140, n = 1) {
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + i * (ms + 90) / 1000;
      o.frequency.value = f; o.type = 'square'; g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
      o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + ms / 1000 + 0.02);
    }
  } catch { /* pas de son */ }
  navigator.vibrate?.(n > 1 ? [80, 60, 80] : 60);
}

function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: any = null, gone = false;
    const get = () => (navigator as any).wakeLock.request('screen').then((l: any) => { if (gone) l.release(); else lock = l; }).catch(() => {});
    get();
    const vis = () => document.visibilityState === 'visible' && get();
    document.addEventListener('visibilitychange', vis);
    return () => { gone = true; lock?.release?.(); document.removeEventListener('visibilitychange', vis); };
  }, [on]);
}

type Phase = 'ready' | 'count' | 'work' | 'reps' | 'rest' | 'done';

/** hands : les deux côtés sont les deux mains (dribble, passe…) ; sinon côté gauche / droit (jambes, étirements) */
export function Timer({ dose, onDone, hand = 'droite', hands }: { dose: Dose; onDone: () => void; hand?: 'droite' | 'gauche'; hands?: boolean }) {
  const timed = !!dose.work;
  const [ph, setPh] = useState<Phase>('ready');
  const [set, setSet] = useState(1);
  const [side, setSide] = useState(0);
  const [left, setLeft] = useState(0);
  const end = useRef(0);
  useWakeLock(ph !== 'ready' && ph !== 'done');

  const startWork = (s: number, sd: number) => {
    setSet(s); setSide(sd);
    if (timed) { end.current = Date.now() + dose.work! * 1000; setLeft(dose.work!); setPh('work'); beep(1175, 220); }
    else { setPh('reps'); beep(1175, 160); }
  };
  const afterWork = (s: number, sd: number) => {
    if (dose.perSide && sd === 0) { beep(660, 160, 2); startWork(s, 1); return; }
    if (s >= dose.sets) { setPh('done'); beep(1320, 180, 3); onDone(); return; }
    if (dose.rest) { end.current = Date.now() + dose.rest * 1000; setLeft(dose.rest); setPh('rest'); beep(520, 260); }
    else startWork(s + 1, 0);
  };
  useEffect(() => {
    if (ph !== 'work' && ph !== 'rest' && ph !== 'count') return;
    const id = setInterval(() => {
      const l = Math.max(0, Math.ceil((end.current - Date.now()) / 1000));
      setLeft(l);
      if ((ph === 'rest' || ph === 'count') && l > 0 && l <= 3) beep(880, 90);
      if (l === 0) { clearInterval(id); if (ph === 'work') afterWork(set, side); else startWork(ph === 'count' ? 1 : set + 1, 0); }
    }, 250);
    return () => clearInterval(id);
  }, [ph, set, side]); // eslint-disable-line react-hooks/exhaustive-deps

  const weak = hand === 'droite' ? t('main gauche') : t('main droite');
  const strong = hand === 'droite' ? t('main droite') : t('main gauche');
  const sideLabel = !dose.perSide ? '' : hands ? (side === 0 ? strong : weak) : side === 0 ? t('Premier côté') : t('Change de côté');
  const total = timed ? dose.work! : dose.rest;
  const pct = ph === 'work' ? left / dose.work! : ph === 'rest' ? left / (dose.rest || 1) : ph === 'count' ? left / 5 : 1;
  return (
    <div className={`timer ph-${ph}`}>
      <div className="timer-ring" style={{ '--p': pct } as React.CSSProperties}>
        <div className="timer-in">
          {ph === 'ready' && <><b>{dose.sets > 1 ? t('{n} séries', { n: dose.sets }) : t('1 série')}</b><span>{timed ? fmtDur(total) : t('{n} rép.', { n: dose.reps ?? 0 })}{dose.perSide ? ` × 2 ${t('côtés')}` : ''}</span></>}
          {ph === 'count' && <><b className="big">{left}</b><span>{t('Prêt ?')}</span></>}
          {ph === 'work' && <><b className="big">{left}</b><span>{t('Série {s}/{n}', { s: set, n: dose.sets })}</span></>}
          {ph === 'reps' && <><b className="big">{dose.reps}</b><span>{t('rép. · série {s}/{n}', { s: set, n: dose.sets })}</span></>}
          {ph === 'rest' && <><b className="big">{left}</b><span>{t('Repos')}</span></>}
          {ph === 'done' && <><Ico n="checkCircle" /><span>{t('Bravo !')}</span></>}
        </div>
      </div>
      {sideLabel && (ph === 'work' || ph === 'reps') && <div className="timer-side">{side === 1 ? '🔁 ' : ''}{hands && side === 1 ? t('Change de main : {h}', { h: weak }) : sideLabel}</div>}
      <div className="timer-actions">
        {ph === 'ready' && <button className="btn" onClick={() => { beep(880, 60); end.current = Date.now() + 5000; setLeft(5); setPh('count'); }}><Ico n="play" />{t('Démarrer le chrono')}</button>}
        {ph === 'reps' && <button className="btn" onClick={() => afterWork(set, side)}>{dose.perSide && side === 0 ? t('Fait · change de côté') : t('Série faite')}</button>}
        {(ph === 'work' || ph === 'rest' || ph === 'count') && <button className="btn secondary" onClick={() => { if (ph === 'work') afterWork(set, side); else startWork(ph === 'count' ? 1 : set + 1, 0); }}>{t('Passer')}</button>}
        {ph === 'done' && <button className="btn secondary" onClick={() => setPh('ready')}>{t('Recommencer')}</button>}
      </div>
    </div>
  );
}
