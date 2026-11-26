// Animations de chargement BeHoop (logo animé : shared/emblem-anim.svg, le même que dans le coin des vidéos).
// CenterSvg (ouverture de l'appli) : les lignes du rond central se tracent, le logo arrive sur un disque clair,
// puis le ballon tourne et plonge dans l'arceau (swish). Copie statique dans web/index.html (écran avant le chargement).
// BallSvg (autres chargements) : le logo seul, même animation en boucle courte.
import emblem from '../../../shared/emblem-anim.svg?raw';

// Le dessin fait 296 × 342 : placé dans un carré, centré
const nested = (x: number, y: number, w: number) => emblem.replace('<svg ', `<svg x="${x}" y="${y}" width="${w}" height="${(w * 342) / 296}" `);
const CENTER = nested(70 - 27.7, 38, 55.4);

export const CenterSvg = ({ size = 150 }: { size?: number }) => (
  <svg className="cc-anim" width={size} height={size} viewBox="0 0 140 140" aria-hidden>
    <line className="cc-l" x1="0" y1="70" x2="140" y2="70" />
    <circle className="cc-o" cx="70" cy="70" r="48" />
    <circle className="cc-n" cx="70" cy="70" r="20" />
    <g className="cc-logo">
      <circle cx="70" cy="70" r="40" className="cc-disc" />
      <g dangerouslySetInnerHTML={{ __html: CENTER }} />
    </g>
  </svg>
);

const SMALL = nested(70 - 51.9, 10, 103.8);
export const BallSvg = ({ size = 72 }: { size?: number }) => (
  <svg className="ball-anim" width={size} height={size} viewBox="0 0 140 140" aria-hidden>
    <g dangerouslySetInnerHTML={{ __html: SMALL }} />
  </svg>
);
