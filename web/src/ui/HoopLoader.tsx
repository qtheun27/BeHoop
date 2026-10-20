// Animation BeHoop : le ballon tourne, entre dans le panier, le filet bouge (« swish »). Même dessin que l'écran
// d'ouverture de web/index.html (copie en HTML statique, avant le chargement de l'appli).
export const HoopSvg = ({ size = 96 }: { size?: number }) => (
  <svg className="hoop-anim" width={size} height={size * 1.1} viewBox="0 0 100 110" aria-hidden>
    <defs>
      <radialGradient id="hb-ball" cx="38%" cy="32%" r="70%"><stop offset="0" stopColor="#ffb25b" /><stop offset=".55" stopColor="#f26a1b" /><stop offset="1" stopColor="#c2410c" /></radialGradient>
    </defs>
    {/* Panneau et cercle (arrière) */}
    <rect className="hb-board" x="24" y="30" width="52" height="34" rx="5" />
    <rect className="hb-square" x="39" y="44" width="22" height="14" rx="2" />
    <ellipse className="hb-rim-back" cx="50" cy="64" rx="19" ry="5" />
    {/* Ballon */}
    <g className="hb-ball"><g className="hb-spin">
      <circle cx="50" cy="20" r="11" fill="url(#hb-ball)" />
      <path d="M39 20h22M50 9v22M42.5 12.5c4 5 4 10 0 15M57.5 12.5c-4 5-4 10 0 15" fill="none" stroke="#7c2d12" strokeWidth="1.3" strokeLinecap="round" opacity=".75" />
    </g></g>
    {/* Filet et cercle (avant) */}
    <g className="hb-net">
      <path d="M31 64l5 26M38 65.5l3 25M46 66.5l1.5 25M54 66.5l-1.5 25M62 65.5l-3 25M69 64l-5 26M32.5 72h35M34.5 80h31M37 88h26" fill="none" strokeWidth="1.6" strokeLinecap="round" />
    </g>
    <path className="hb-rim" d="M31 64a19 5 0 0 0 38 0" fill="none" strokeWidth="3.2" strokeLinecap="round" />
  </svg>
);
