// Animations de chargement BeHoop.
// CenterSvg (ouverture de l'appli) : les lignes du rond central se tracent, puis le logo BeHoop arrive sur un disque clair
// qui masque les lignes (logo bien lisible). Copie statique dans web/index.html (écran affiché avant le chargement de l'appli).
// BallSvg (autres chargements) : le ballon se dessine trait par trait, puis tourne.
export const CenterSvg = ({ size = 150 }: { size?: number }) => (
  <svg className="cc-anim" width={size} height={size} viewBox="0 0 140 140" aria-hidden>
    <line className="cc-l" x1="0" y1="70" x2="140" y2="70" />
    <circle className="cc-o" cx="70" cy="70" r="48" />
    <circle className="cc-n" cx="70" cy="70" r="20" />
    <g className="cc-logo">
      <circle cx="70" cy="70" r="40" className="cc-disc" />
      <image className="em-l" href="/icons/emblem-light.png" x="38" y="38" width="64" height="64" />
      <image className="em-d" href="/icons/emblem-dark.png" x="38" y="38" width="64" height="64" />
    </g>
  </svg>
);

export const BallSvg = ({ size = 72 }: { size?: number }) => (
  <svg className="ball-anim" width={size} height={size} viewBox="0 0 140 140" aria-hidden>
    <g>
      <circle className="ba-f" cx="70" cy="70" r="40" />
      <circle className="ba-b" cx="70" cy="70" r="40" />
      <path className="ba-s" d="M30 70h80M70 30v80" />
      <path className="ba-s" d="M42 42c12 14 12 42 0 56M98 42c-12 14-12 42 0 56" />
    </g>
  </svg>
);
