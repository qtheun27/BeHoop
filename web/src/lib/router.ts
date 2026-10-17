import { useEffect, useState } from 'react';
// Routage par hash (/app/#/fil) : compatible GitHub Pages sans réécriture d'URL.
export function useRoute(): string[] {
  const get = () => (location.hash.replace(/^#\/?/, '') || 'fil').split('?')[0].split('/').map(decodeURIComponent);
  const [r, set] = useState(get);
  useEffect(() => { const on = () => { set(get()); window.scrollTo(0, 0); }; window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  return r;
}
export const go = (path: string) => { location.hash = '/' + path; };
export const qs = () => new URLSearchParams(location.hash.split('?')[1] ?? '');
