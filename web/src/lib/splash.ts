// Écran d'ouverture (web/index.html) : on en profite pour charger les données principales, et on le retire
// seulement quand le logo est affiché en entier (au moins un tour d'animation, jamais coupé en plein milieu).
import { loadIndex, loadComps, loadNews } from './data';

const CYCLE = 2800, LOGO_SHOWN = 2250, MAX_WAIT = 7000;
let done = false;

export function hideSplash() {
  const el = document.getElementById('bh-splash');
  if (!el || done) return;
  done = true;
  const prefetch = Promise.allSettled([loadIndex(), loadComps(), loadNews()]);
  const cap = new Promise((r) => setTimeout(r, MAX_WAIT));
  Promise.race([prefetch, cap]).then(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const anim = el.querySelector('.cc-logo')?.getAnimations?.()[0];
    const t = typeof anim?.currentTime === 'number' ? anim.currentTime : performance.now();
    // prochain instant « logo affiché » (au moins le premier tour complet)
    const k = Math.max(0, Math.ceil((t - LOGO_SHOWN) / CYCLE));
    const wait = reduce ? 0 : k * CYCLE + LOGO_SHOWN - t;
    setTimeout(() => {
      el.querySelectorAll<SVGElement>('.cc-anim *').forEach((n) => { n.style.animationPlayState = 'paused'; });
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    }, Math.max(0, wait));
  });
}
