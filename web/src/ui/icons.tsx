// Jeu d'icônes BeHoop : traits de 1,8 sur une grille 24×24, comme la barre d'onglets (Icons dans kit.tsx).
// Partout dans l'appli à la place des émojis : onglets, filtres, titres de section, états vides, badges.
import type { CSSProperties, ReactNode } from 'react';

const P = {
  news: 'M4 4h13v16H6a2 2 0 0 1-2-2zM17 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h3',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  calendarAdd: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M12 13v5M9.5 15.5h5',
  standings: 'M3 21h18M5 21v-6h4v6M10 21V9h4v12M15 21v-9h4v9',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  userAdd: 'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M19 8v6M16 11h6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  stats: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  ball: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3v18M5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l3 3 5-6',
  car: 'M4 16v-3.5L6 7h12l2 5.5V16zM4 16v2.5M20 16v2.5M7.5 12.5h.01M16.5 12.5h.01',
  phone: 'M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  video: 'M3 7h13v10H3zM16 10.5l5-3v9l-5-3',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
  club: 'M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  europe: 'M12 3.5h.01M16.25 4.64h.01M19.36 7.75h.01M20.5 12h.01M19.36 16.25h.01M16.25 19.36h.01M12 20.5h.01M7.75 19.36h.01M4.64 16.25h.01M3.5 12h.01M4.64 7.75h.01M7.75 4.64h.01',
  flag: 'M5 21V4M5 4h12l-2.5 4L17 12H5',
  women: 'M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 14v7M9 18h6',
  youth: 'M12 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM9 22l.5-7.5M15 22l-.5-7.5M6 10.5 9 9h6l3 1.5M9 9v5.5h6V9',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  hourglass: 'M6 2h12M6 22h12M7 2c0 6 10 6 10 10S7 16 7 22M17 2c0 6-10 6-10 10s10 4 10 10',
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M8 5v14M16 5v14',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  folder: 'M3 6h6l2 2h10v11H3z',
  device: 'M7 2h10v20H7zM11 18h2',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
  eyeOff: 'M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3 3.5M6.5 7.5C4.2 9.1 3 12 3 12s4 6 9 6a9 9 0 0 0 4-.9',
  scoreboard: 'M5 3h14v18H5zM8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
} as const;
export type IconName = keyof typeof P | 'live';

/** Icône en ligne (taille du texte par défaut) */
export function Ico({ n, size, style, className = '' }: { n: IconName; size?: number; style?: CSSProperties; className?: string }) {
  const st = size ? { width: size, height: size, ...style } : style;
  if (n === 'live') return <svg className={`ico ${className}`} style={st} viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="6" fill="#e5322d" /></svg>;
  const solid = n === 'play';
  const dots = n === 'europe';
  return (
    <svg className={`ico ${className}`} style={st} viewBox="0 0 24 24" fill={solid ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={dots ? 2.6 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={P[n]} /></svg>
  );
}

/** Libellé avec icône (onglets, filtres, titres de section) */
export const IcoLabel = ({ n, children }: { n: IconName; children: ReactNode }) => <><Ico n={n} />{children}</>;
