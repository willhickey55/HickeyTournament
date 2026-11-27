/* Scoring screens (score.css): every size follows the phone. --H / --W on <html> = the window's height / width
   in px; score.css turns them into clamp() sizes with a floor and a ceiling (taps never under 44px).
   Plain function, no preact (src/shared can't import it). Call once at startup; safe to call again. */
let on = false;
export function scoreSizes(el: HTMLElement = document.documentElement) {
  const set = () => { el.style.setProperty('--H', Math.round(innerHeight) + 'px'); el.style.setProperty('--W', Math.round(innerWidth) + 'px'); };
  set();
  if (!on) { on = true; addEventListener('resize', set); addEventListener('orientationchange', set); }
}
