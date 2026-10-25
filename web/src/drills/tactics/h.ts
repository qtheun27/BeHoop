// Écriture compacte des tactiques : positions nommées sur le demi-terrain (repère du Playbook : 500 × 470, panier en (250, 72),
// y croissant en s'éloignant du panier), défense individuelle placée automatiquement entre chaque attaquant et le panier.
import type { Age, Frame, PlayCat, Tactic, Tok } from '../types';

export const SPOTS: Record<string, [number, number]> = {
  top: [250, 330], ls: [150, 305], rs: [350, 305], lw: [75, 215], rw: [425, 215], lc: [45, 55], rc: [455, 55],
  le: [180, 200], re: [320, 200], lb: [165, 110], rb: [335, 110], lsc: [105, 85], rsc: [395, 85], hp: [250, 205], mp: [250, 150],
  lwh: [130, 160], rwh: [370, 160], back: [250, 420], lback: [130, 410], rback: [370, 410], rim: [250, 72], lrim: [215, 80], rrim: [285, 80],
  // Remises en jeu : sous le panier (fond) et sur le côté
  ob: [250, 12], obl: [150, 12], obr: [350, 12], sol: [12, 300], sor: [488, 300], solh: [12, 400], sorh: [488, 400],
  // Zones défensives
  z2l: [195, 235], z2r: [305, 235], z3l: [125, 120], z3m: [250, 105], z3r: [375, 120], z1t: [250, 280], z1m: [250, 180], z1l: [110, 190], z1r: [390, 190], z1b: [250, 90],
};
const HOOP: [number, number] = [250, 72];
const pt = (s: string): [number, number] => { if (SPOTS[s]) return SPOTS[s]; const [x, y] = s.split(',').map(Number); if (Number.isNaN(x) || Number.isNaN(y)) throw new Error(`position inconnue : ${s}`); return [x, y]; };
const pts = (s: string) => s.trim().split(/\s+/).filter(Boolean).map((x) => pt(x.includes('@') ? x.split('@')[1] : x));
/** Numéros affichés : « 5@hp » = joueur n° 5 placé au poste haut ; sinon 1, 2, 3… dans l'ordre */
const labels = (s: string) => s.trim().split(/\s+/).filter(Boolean).map((x, i) => (x.includes('@') ? x.split('@')[0] : String(i + 1)));

/** Une étape : attaquants (positions dans l'ordre 1 à n), porteur du ballon (n° du joueur, 0 = tir au panier, ou une position),
 *  légende, défense : 'auto' (individuelle), 'none', ou positions explicites (zone) */
export type F = [o: string, ball: number | string, t: string, d?: string];

export function frames(list: F[], full = false): Frame[] {
  const hoop: [number, number] = HOOP;
  return list.map(([o, ball, t, d = 'auto']) => {
    const op = pts(o);
    const lb = labels(o);
    const tokens: Tok[] = op.map(([x, y], i) => ({ id: `O${i + 1}`, type: 'offense', label: lb[i], x, y }));
    const dp = d === 'none' ? [] : d === 'auto' ? op.map(([x, y]) => [x + (hoop[0] - x) * 0.24, y + (hoop[1] - y) * 0.24] as [number, number]) : pts(d);
    dp.forEach(([x, y], i) => tokens.push({ id: `D${i + 1}`, type: 'defense', label: `D${i + 1}`, x: Math.round(x), y: Math.round(y) }));
    const b = typeof ball === 'number' ? (ball === 0 ? hoop : [op[ball - 1][0] + 16, op[ball - 1][1] + 14]) : pt(ball);
    // Ballon collé au porteur, sans sortir du terrain dessiné
    tokens.push({ id: 'BALL', type: 'ball', label: '', x: Math.round(Math.min(492, Math.max(8, b[0]))), y: Math.round(Math.min((full ? 890 : 470) - 8, Math.max(8, b[1]))) });
    return { tokens, t };
  });
}

export const T = (id: string, name: string, cat: PlayCat, minAge: Age, desc: string, keys: string[], list: F[], mode: 'half' | 'full' = 'half'): Tactic =>
  ({ id, name, cat, minAge, mode, desc, keys, frames: frames(list, mode === 'full') });
