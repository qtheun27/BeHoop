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
  // L'écran d'en dessous doit être prêt : sinon, au fondu, on voit apparaître plus bas l'animation de chargement de la page
  // (impression que le logo « descend »). On attend qu'aucun chargement ne soit affiché dans l'appli.
  const settled = () => new Promise<void>((r) => {
    const t0 = Date.now();
    const tick = () => (!document.querySelector('#root .loader, #root .skel') || Date.now() - t0 > 4000 ? r() : setTimeout(tick, 120));
    tick();
  });
  Promise.race([prefetch.then(settled), cap]).then(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const anim = el.querySelector('.cc-logo')?.getAnimations?.()[0];
    const t = typeof anim?.currentTime === 'number' ? anim.currentTime : performance.now();
    // prochain instant « logo affiché » (au moins le premier tour complet)
    const k = Math.max(0, Math.ceil((t - LOGO_SHOWN) / CYCLE));
    const wait = reduce ? 0 : k * CYCLE + LOGO_SHOWN - t;
    let extra = 0;
    const fade = () => {
      // Encore un chargement visible dessous (page lente) : un tour de plus, deux au maximum
      if (!reduce && extra < 2 && document.querySelector('#root .loader, #root .skel')) { extra++; setTimeout(fade, CYCLE); return; }
      el.querySelectorAll<SVGElement>('.cc-anim *').forEach((n) => { n.style.animationPlayState = 'paused'; });
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    };
    setTimeout(fade, Math.max(0, wait));
  });
}
