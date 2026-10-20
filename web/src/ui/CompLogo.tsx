// Logo d'une compétition : médaillon rond à liseré doré (comme le rond central d'un terrain), sinon icône BeHoop.
import { compIcon, type Competition } from '../lib/data';
import { Ico } from './icons';

export function CompLogo({ c, size = 40 }: { c: Pick<Competition, 'id' | 'cat' | 'women' | 'youth' | 'logo' | 'dark'>; size?: number }) {
  const st = { width: size, height: size };
  const big = size >= 44 ? ' big' : '';
  return c.logo
    ? <span className={`comp-logo${c.dark ? ' dark' : ''}${big}`} style={st} aria-hidden><img src={c.logo} alt="" loading="lazy" /></span>
    : <span className={`comp-logo icon${big}`} style={st} aria-hidden><Ico n={compIcon(c)} /></span>;
}
