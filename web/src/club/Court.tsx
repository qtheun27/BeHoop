// Terrain SVG partagé par le tableau Tactique et les démos Hoop Camp (1 m = 30 px, panier en x = 250).
// Une démo d'exercice (repère 100 × 100) est convertie en étapes de jetons, comme un schéma Tactique : même moteur d'animation.
import { useEffect, useRef, useState } from 'react';
import type { Demo, Exercise } from '../hoopcamp/types';
import type { Token } from './api';
import { t } from '../lib/i18n';
import { Ico } from '../ui/icons';

export type Mode = 'half' | 'full';
export type Scene = 'panier' | 'mur' | 'libre';
export const VIEW = { half: { w: 500, h: 470 }, full: { w: 500, h: 890 } } as const;

const L = { fill: 'none', stroke: 'var(--court-line)', strokeWidth: 3 } as const;
function HalfLines({ flip }: { flip?: boolean }) {
  const g = (
    <>
      <rect x="175" y="25" width="150" height="174" {...L} />
      <circle cx="250" cy="199" r="54" {...L} />
      <path d="M 52 25 L 52 114.5 A 202.5 202.5 0 0 0 448 114.5 L 448 25" {...L} />
      <path d="M 210 72 A 40 40 0 0 0 290 72" {...L} strokeWidth={2} />
      <line x1="220" y1="61" x2="280" y2="61" {...L} strokeWidth={4} />
      <circle cx="250" cy="72" r="9" fill="none" stroke="var(--court-hoop)" strokeWidth={3} />
    </>
  );
  return flip ? <g transform="translate(0 890) scale(1 -1)">{g}</g> : g;
}

/** Fond de terrain : demi-terrain, terrain complet, mur ou espace libre */
export function CourtSvg({ mode = 'half', scene = 'panier', children, onPointer, svgRef }: {
  mode?: Mode; scene?: Scene; children?: React.ReactNode; svgRef?: React.Ref<SVGSVGElement>;
  onPointer?: { down?: (e: React.PointerEvent<SVGSVGElement>) => void; move?: (e: React.PointerEvent<SVGSVGElement>) => void; up?: (e: React.PointerEvent<SVGSVGElement>) => void };
}) {
  const { w, h } = VIEW[mode];
  return (
    <svg ref={svgRef} className="court-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={t('Terrain')}
      onPointerDown={onPointer?.down} onPointerMove={onPointer?.move} onPointerUp={onPointer?.up} onPointerCancel={onPointer?.up}>
      <rect x="0" y="0" width={w} height={h} fill="var(--court-bg)" rx="18" />
      {scene === 'panier' && (mode === 'half' ? (
        <>
          <rect x="25" y="25" width="450" height="420" {...L} />
          <HalfLines />
          <line x1="25" y1="445" x2="475" y2="445" {...L} />
          <path d="M 196 445 A 54 54 0 0 1 304 445" {...L} />
        </>
      ) : (
        <>
          <rect x="25" y="25" width="450" height="840" {...L} />
          <line x1="25" y1="445" x2="475" y2="445" {...L} />
          <circle cx="250" cy="445" r="54" {...L} />
          <HalfLines /><HalfLines flip />
        </>
      ))}
      {scene === 'mur' && (
        <>
          <rect x="0" y="0" width={w} height="34" fill="var(--court-wall)" />
          {Array.from({ length: 12 }, (_, i) => <line key={i} x1={i * 45 + (i % 2 ? 0 : 22)} y1={i % 2 ? 0 : 17} x2={i * 45 + (i % 2 ? 0 : 22)} y2={i % 2 ? 17 : 34} stroke="var(--court-bg)" strokeWidth={2} />)}
          <line x1="0" y1="17" x2={w} y2="17" stroke="var(--court-bg)" strokeWidth={2} />
          <rect x="232" y="6" width="36" height="22" rx="3" fill="none" stroke="var(--court-hoop)" strokeWidth={3} />
        </>
      )}
      {scene === 'libre' && <rect x="25" y="25" width="450" height={h - 50} {...L} strokeDasharray="10 12" opacity={0.5} />}
      {children}
    </svg>
  );
}

/** Jeton : attaquant (numéro), défenseur (D), ballon, plot */
export function TokenG({ k, active }: { k: Token; active?: boolean }) {
  if (k.type === 'ball') return <g transform={`translate(${k.x} ${k.y})`} className="tk tk-ball"><circle r="11" /><path d="M -11 0 H 11 M 0 -11 V 11 M -7 -8 Q 0 0 -7 8 M 7 -8 Q 0 0 7 8" /></g>;
  return (
    <g transform={`translate(${k.x} ${k.y})`} className={`tk tk-${k.type}${active ? ' on' : ''}`}>
      <circle r={k.type === 'offense' ? 19 : 18} />
      <text y="6" textAnchor="middle">{k.label}</text>
    </g>
  );
}

/** Repère démo (0–100) → terrain */
const X = (x: number) => 25 + x * 4.5, Y = (y: number) => 25 + y * 4.2;
export interface Step { tokens: Token[]; t?: string; ms?: number }
/** Démo d'exercice → étapes de jetons (joueur « toi », ballon, 2e ballon) */
export function demoSteps(d: Demo): Step[] {
  return d.frames.map((f) => ({
    t: f.t, ms: f.ms,
    tokens: [
      { id: 'O1', type: 'offense', label: t('toi'), x: X(f.p[0]), y: Y(f.p[1]) },
      { id: 'BALL', type: 'ball', label: '', x: X((f.b ?? [f.p[0] + 4, f.p[1] + 3])[0]), y: Y((f.b ?? [f.p[0] + 4, f.p[1] + 3])[1]) },
      ...(f.b2 ? [{ id: 'B2', type: 'ball' as const, label: '', x: X(f.b2[0]), y: Y(f.b2[1]) }] : []),
    ],
  }));
}
export function DemoDecor({ d }: { d: Demo }) {
  return (
    <g className="decor">
      {d.cones?.map(([x, y], i) => <path key={i} className="cone" d={`M ${X(x)} ${Y(y) - 12} L ${X(x) + 10} ${Y(y) + 8} L ${X(x) - 10} ${Y(y) + 8} Z`} />)}
      {d.ladder && Array.from({ length: d.ladder.n }, (_, i) => <rect key={i} className="ladder" x={X(d.ladder!.x)} y={Y(d.ladder!.y) + i * 34} width={54} height={34} />)}
    </g>
  );
}

/** Lecture animée d'étapes (interpolation des jetons, boucle) */
export function Player({ steps, mode = 'half', scene = 'panier', decor, auto = true, trails = true }: { steps: Step[]; mode?: Mode; scene?: Scene; decor?: React.ReactNode; auto?: boolean; trails?: boolean }) {
  const [pos, setPos] = useState<Token[]>(steps[0]?.tokens ?? []);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(auto);
  const raf = useRef(0);
  useEffect(() => { setPos(steps[0]?.tokens ?? []); setI(0); }, [steps]);
  useEffect(() => {
    if (!playing || steps.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let step = i, t0 = performance.now(), wait = 0;
    const tick = (now: number) => {
      const next = (step + 1) % steps.length;
      const dur = next === 0 ? 400 : steps[next].ms ?? 900;
      if (wait) { if (now - wait < (next === 0 ? 900 : 250)) { raf.current = requestAnimationFrame(tick); return; } wait = 0; t0 = now; }
      const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const a = steps[step].tokens, b = steps[next].tokens;
      setPos(b.map((tb) => { const ta = a.find((x) => x.id === tb.id) ?? tb; return { ...tb, x: ta.x + (tb.x - ta.x) * e, y: ta.y + (tb.y - ta.y) * e }; }));
      if (k >= 1) { step = next; setI(next); wait = now; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, steps]); // eslint-disable-line react-hooks/exhaustive-deps
  const cap = steps[i]?.t ?? steps.slice(0, i + 1).reverse().find((s) => s.t)?.t;
  return (
    <div className={`demo ${mode}`}>
      <CourtSvg mode={mode} scene={scene}>
        {decor}
        {trails && steps.length > 1 && steps[0].tokens.filter((k) => k.type !== 'ball').map((k) => (
          <polyline key={k.id} className={`trail tr-${k.type}`} points={steps.map((s) => s.tokens.find((x) => x.id === k.id)).filter(Boolean).map((x) => `${x!.x},${x!.y}`).join(' ')} />
        ))}
        {pos.map((k) => <TokenG key={k.id} k={k} />)}
      </CourtSvg>
      <div className="demo-bar">
        {steps.length > 1 && <button className="icon-btn" onClick={() => setPlaying(!playing)} aria-label={playing ? t('Pause') : t('Lecture')}><Ico n={playing ? 'pause' : 'play'} /></button>}
        <span className="demo-cap">{cap ?? ''}</span>
        {steps.length > 1 && <span className="demo-n">{i + 1}/{steps.length}</span>}
      </div>
    </div>
  );
}

/** Une démo vue de dessus n'aide que si le joueur se déplace (course, slalom, échelle) ;
 *  pour un geste sur place (dribble, tir, montées de genoux), la vidéo l'explique mieux : pas de terrain. */
export const demoUseful = (d?: Demo) => !!d && (!!d.ladder || d.frames.some((f) => Math.hypot(f.p[0] - d.frames[0].p[0], f.p[1] - d.frames[0].p[1]) >= 15));

/** Démo animée d'un exercice Hoop Camp, seulement quand elle est utile */
export function ExerciseDemo({ e }: { e: Exercise }) {
  const d = e.demo;
  if (!d || !demoUseful(d)) return null;
  return <Player steps={demoSteps(d)} scene={d.scene} decor={<DemoDecor d={d} />} />;
}

/** Plots posés sur le terrain (repère du Playbook) */
export function Cones({ list }: { list: [number, number][] }) {
  return <g className="decor">{list.map(([x, y], i) => <path key={i} className="cone" d={`M ${x} ${y - 12} L ${x + 10} ${y + 8} L ${x - 10} ${y + 8} Z`} />)}</g>;
}
