import { useEffect, useRef, useState } from 'react';
import { Planche } from './Planche';
import { DURATIONS } from './anim';
import type { MatchSettings, PlancheType } from '../../../shared/types';

/** Aperçu en direct d'une planche (animation jouée en boucle, réduite à la largeur de l'écran). */
export function PlanchePreview({ type, st, still }: { type: PlancheType; st: MatchSettings; still?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  const [t, setT] = useState(still ? DURATIONS[type] : 0);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / 1920));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (still) { setT(DURATIONS[type]); return; }
    let raf = 0; const t0 = performance.now(); const d = DURATIONS[type] + 1.5;
    const loop = () => { setT(((performance.now() - t0) / 1000) % d); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [type, still]);
  return <div ref={box} className="planche-frame"><div style={{ transform: `scale(${scale})` }}><Planche type={type} st={st} t={t} /></div></div>;
}
