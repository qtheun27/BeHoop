// Logo d'une compétition : logo officiel sur pastille claire ou sombre, sinon icône BeHoop.
import { compIcon, type Competition } from '../lib/data';
import { Ico } from './icons';

export function CompLogo({ c, size = 40 }: { c: Pick<Competition, 'id' | 'cat' | 'women' | 'youth' | 'logo' | 'dark'>; size?: number }) {
  const st = { width: size, height: size };
  return c.logo
    ? <span className={`comp-logo${c.dark ? ' dark' : ''}`} style={st} aria-hidden><img src={c.logo} alt="" loading="lazy" /></span>
    : <span className="comp-logo icon" style={st} aria-hidden><Ico n={compIcon(c)} /></span>;
}
