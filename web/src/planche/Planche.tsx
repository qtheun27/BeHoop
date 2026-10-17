import type { CSSProperties } from 'react';
import type { MatchSettings, PlancheType } from '../../../shared/types';
import { quarterScores, resultLabel } from '../../../shared/scores';
import { prog, easeOut, easeOutBack, easeInOut, lerp, count, fadeUp, lighten, clamp } from './anim';
import './planche.css';

const AREAS: Record<number, { ar: string; c: string; r: string }> = {
  1: { ar: '"a"', c: '1fr', r: '1fr' },
  2: { ar: '"a" "b"', c: '1fr', r: '2fr 1fr' },
  3: { ar: '"a a" "a a" "b c"', c: '1fr 1fr', r: '1fr 1fr 1fr' },
  4: { ar: '"a a b" "a a c" "a a d"', c: '1fr 1fr 1fr', r: '1fr 1fr 1fr' },
  5: { ar: '"a a b" "a a c" "d e e"', c: '1fr 1fr 1fr', r: '1fr 1fr 1fr' },
  6: { ar: '"a a b" "a a c" "d e f"', c: '1fr 1fr 1fr', r: '1fr 1fr 1fr' },
};
const dotted = (d: string) => d.split('-').reverse().join('.');
const dayName = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'long' }).toUpperCase();
/** « Union Mons Hainaut » → « Union Mons<br>Hainaut » (comme la référence) pour les noms de 3 mots ou plus */
const twoLines = (n: string) => { const w = n.split(' '); if (w.length < 3 && n.length < 14) return n; const k = Math.ceil(w.length / 2); return <>{w.slice(0, k).join(' ')}<br />{w.slice(k).join(' ')}</>; };
const shortTeam = (n: string) => n.split(' ').slice(0, 2).join(' ');

function Logo({ s, ring, src, style }: { s: number; ring: string; src: string; style?: CSSProperties }) {
  return <div className="logo" style={{ '--s': `${s}px`, '--ring': ring, ...style } as CSSProperties}><img src={src} alt="" /></div>;
}
function Stripes({ st, opacity, t, slide }: { st: MatchSettings; opacity: number; t: number; slide?: boolean }) {
  const p = slide ? easeOut(prog(t, 0, 0.4)) : 1;
  return <div className="stripes" style={{ opacity, transform: `translateX(${(1 - p) * -900}px)`,
    background: `linear-gradient(115deg,transparent 0 58%,${st.away.color}e6 58% 62%,transparent 62% 63.2%,${st.home.color}d9 63.2% 64.4%,transparent 64.4%)` }} />;
}

export function Planche({ type, st, t }: { type: PlancheType; st: MatchSettings; t: number }) {
  const accent = lighten(st.away.color);
  const hrBg = `linear-gradient(90deg,${st.away.color},${st.home.color})`;
  const [fh, fa] = st.scores[3];

  if (type === 'wipe') {
    // Vague aux couleurs des clubs : couvre tout l'écran à t = 0,3 s, sort à 0,6 s.
    const x = t <= 0.3 ? lerp(-3700, -320, easeInOut(t / 0.3)) : lerp(-320, 2600, easeInOut((t - 0.3) / 0.3));
    return (
      <div className="pl wipe">
        <div className="wband" style={{ left: x, transform: 'skewX(-25deg)' }}>
          <div style={{ width: 1500, background: st.away.color }} /><div style={{ width: 28, background: '#fff' }} /><div style={{ width: 1500, background: st.home.color }} />
        </div>
      </div>
    );
  }

  if (type === 'pre') {
    const lh = easeOutBack(prog(t, 0.2, 0.6)), vs = prog(t, 0.6, 0.35);
    const vsScale = vs < 1 ? lerp(2.4, 1, easeOutBack(vs, 2.2)) : 1;
    const bar = easeOut(prog(t, 1.25, 0.45));
    return (
      <div className="pl pre">
        <div className="bgph" style={{ backgroundImage: st.photos.pre ? `url(${st.photos.pre})` : undefined, transform: `scale(${1.08 + 0.04 * clamp(t / 6)})` }} />
        <div className="court" /><Stripes st={st} opacity={0.55} t={t} slide /><div className="grain" />
        <div className="top" style={fadeUp(t, 0.1, 0.5, 20)}><div className="kick">Avant-match · Basket</div><div className="big" style={{ fontSize: 64, marginTop: 14, letterSpacing: '.04em' }}>Jour de match</div></div>
        <div className="pre-row">
          <div className="team"><Logo s={330} ring={st.home.color} src={st.home.logo} style={{ transform: `translateX(${(1 - lh) * -700}px)`, opacity: clamp(lh * 3) }} />
            <div className="tn" style={fadeUp(t, 0.95)}>{twoLines(st.home.name)}</div><div className="tag" style={fadeUp(t, 1.05)}>LOCAUX</div></div>
          <div className="vs" style={{ transform: `skewX(-8deg) scale(${vsScale})`, opacity: clamp(vs * 4) }}>VS</div>
          <div className="team"><Logo s={330} ring={st.away.color} src={st.away.logo} style={{ transform: `translateX(${(1 - lh) * 700}px)`, opacity: clamp(lh * 3) }} />
            <div className="tn" style={fadeUp(t, 0.95)}>{twoLines(st.away.name)}</div><div className="tag" style={fadeUp(t, 1.05)}>VISITEURS</div></div>
        </div>
        <div className="datebar" style={{ opacity: bar, transform: `translateX(-50%) translateY(${(1 - bar) * 40}px)` }}>
          <div className="d">{dayName(st.date)} {dotted(st.date)}</div><div style={{ background: st.away.color }}>{st.time.replace(':', 'H')}</div></div>
      </div>
    );
  }

  if (type === 'fin') {
    const qs = quarterScores(st.scores);
    const photos = st.photos.fin.length ? Array.from({ length: 8 }, (_, i) => st.photos.fin[i % st.photos.fin.length]) : [];
    const win = easeOut(prog(t, 1.6, 0.5));
    const winner = fh === fa ? null : fh > fa ? st.home : st.away;
    return (
      <div className="pl fin">
        <div className="mos" style={{ gridTemplateAreas: '"a b c d" "e f g h"', gridTemplateColumns: 'repeat(4,1fr)', gridTemplateRows: '1fr 1fr', transform: `scale(${1 + 0.06 * clamp(t / 8)})` }}>
          {photos.map((p, i) => <div key={i} style={{ gridArea: 'abcdefgh'[i] }}><i style={{ backgroundImage: `url(${p})` }} /></div>)}</div>
        <div className="veil" /><Stripes st={st} opacity={0.5} t={t} /><div className="grain" />
        <div className="c">
          <div className="kick" style={fadeUp(t, 0.1)}>{st.home.name} vs {st.away.name} · {dotted(st.date)}</div>
          <div className="big ft" style={fadeUp(t, 0.2, 0.5)}>Score final</div>
          <div className="sr">
            <Logo s={220} ring={st.home.color} src={st.home.logo} style={{ opacity: easeOut(prog(t, 0.4, 0.4)), transform: `scale(${lerp(0.7, 1, easeOutBack(prog(t, 0.4, 0.5)))})` }} />
            <div className={`v${fh > fa ? ' lead' : ''}`}>{count(t, 0.6, fh)}</div><div className="dash">–</div>
            <div className={`v${fa > fh ? ' lead' : ''}`}>{count(t, 0.6, fa)}</div>
            <Logo s={220} ring={st.away.color} src={st.away.logo} style={{ opacity: easeOut(prog(t, 0.4, 0.4)), transform: `scale(${lerp(0.7, 1, easeOutBack(prog(t, 0.4, 0.5)))})` }} />
          </div>
          <div className="win" style={{ background: winner?.color ?? '#3a3f4b', transform: `scaleX(${win})`, opacity: win > 0 ? 1 : 0 }}>
            <span style={{ opacity: easeOut(prog(t, 1.9, 0.3)) }}>{resultLabel(st.home.name, st.away.name, fh, fa)}</span></div>
          <table><tbody>
            <tr style={fadeUp(t, 2.1, 0.35, 16)}><th></th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th></tr>
            <tr style={fadeUp(t, 2.3, 0.35, 16)}><td>{shortTeam(st.home.name)}</td>{qs.map((q, i) => <td key={i}>{q[0]}</td>)}</tr>
            <tr style={fadeUp(t, 2.5, 0.35, 16)}><td>{shortTeam(st.away.name)}</td>{qs.map((q, i) => <td key={i}>{q[1]}</td>)}</tr>
          </tbody></table>
        </div>
      </div>
    );
  }

  // Fin du Nᵉ quart
  const n = +type.slice(1) as 1 | 2 | 3;
  const [h, a] = st.scores[n - 1];
  const part = quarterScores(st.scores)[n - 1];
  const photos = (st.photos[type as 'q1'] ?? []).slice(0, 6);
  const L = AREAS[Math.max(1, photos.length)] ?? AREAS[3];
  const panel = easeOut(prog(t, 0, 0.5));
  return (
    <div className="pl">
      <div className="court" /><Stripes st={st} opacity={0.6} t={t} /><div className="grain" />
      <div className="mos" style={{ gridTemplateAreas: L.ar, gridTemplateColumns: L.c, gridTemplateRows: L.r }}>
        {photos.map((p, i) => {
          const s = 0.3 + i * 0.12, ap = easeOut(prog(t, s, 0.35));
          return <div key={i} style={{ gridArea: 'abcdef'[i], opacity: ap, transform: `scale(${lerp(0.92, 1, ap)})` }}>
            <i style={{ backgroundImage: `url(${p})`, transform: `scale(${1 + 0.06 * clamp((t - s) / 4.5)})` }} /></div>;
        })}
      </div>
      <div className="panel" style={{ transform: `translateX(${(1 - panel) * -700}px)` }}>
        <div><div className="kick">Fin du</div><div className="big qt">{n}<sup>{n === 1 ? 'er' : 'e'}</sup> <span style={{ color: accent }}>quart</span></div></div>
        <div className="hr" style={{ background: hrBg }} />
        <div className="sc"><Logo s={110} ring={st.home.color} src={st.home.logo} /><div className="n">{twoLines(st.home.name)}</div><div className={`v${h > a ? ' lead' : ''}`}>{count(t, 0.4, h)}</div></div>
        <div className="sc"><Logo s={110} ring={st.away.color} src={st.away.logo} /><div className="n">{twoLines(st.away.name)}</div><div className={`v${a > h ? ' lead' : ''}`}>{count(t, 0.4, a)}</div></div>
        <div className="hr" style={{ background: hrBg }} />
        <div className="part">{n > 1 ? <>Score du quart-temps <b>{part[0]} – {part[1]}</b></> : `${st.home.name} vs ${st.away.name}`}</div>
      </div>
      <div className="foot">{dotted(st.date)} · {st.home.name.toUpperCase()} vs {st.away.name.toUpperCase()}</div>
    </div>
  );
}
