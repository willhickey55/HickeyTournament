/* Sliding tab highlight (Will, Oct 28). Every segmented control (.seg2), tab bar (.tabs) and the tryouts exec nav
   (.onav: tabs on phones, a sidebar on laptops) gets a highlight that
   slides to the tab you pick instead of jumping. The highlight is a pseudo-element on the container, moved with CSS
   variables (--sx/--sy/--sw/--sh) measured from the button with .on, so nothing is added to the DOM that Preact owns.
   Styles: the "Sliding tab highlight" block at the end of polish.css. Apps call initSlide() once at start. */
const SEL = '.seg2, .tabs, .onav';

export function initSlide() {
  if (typeof window === 'undefined') return;
  initPress();
  if (!('ResizeObserver' in window) || !('MutationObserver' in window)) return;
  const seen = new WeakSet<Element>();
  const ro = new ResizeObserver(() => queue());
  let raf = 0;

  function place(c: HTMLElement) {
    let on: HTMLElement | null = null;
    for (const k of Array.from(c.children)) if (k.classList.contains('on') && (k.tagName === 'BUTTON' || k.tagName === 'A')) { on = k as HTMLElement; break; }
    if (!on || !on.offsetWidth) { c.classList.remove('slid'); return; }
    const s = c.style;
    s.setProperty('--sx', on.offsetLeft + 'px'); s.setProperty('--sy', on.offsetTop + 'px');
    s.setProperty('--sw', on.offsetWidth + 'px'); s.setProperty('--sh', on.offsetHeight + 'px');
    if (!c.classList.contains('slid')) {
      // First time: jump straight to the spot (no slide in from the left), then allow sliding.
      c.classList.add('slid', 'snap');
      requestAnimationFrame(() => requestAnimationFrame(() => c.classList.remove('snap')));
    }
  }
  function queue() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      document.querySelectorAll<HTMLElement>(SEL).forEach(c => { if (!seen.has(c)) { seen.add(c); ro.observe(c); } place(c); });
    });
  }
  new MutationObserver(queue).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', queue);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queue).catch(() => {});
  queue();
}

/** Press effect (Will, Oct 28): buttons dip when tapped (polish.css "Press effect", under html.press). /scores calls
    only this (no sliding tabs there). iPhone Safari only shows :active on a page that listens for touchstart. */
export function initPress() {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.add('press');
  document.addEventListener('touchstart', () => {}, { passive: true });
}
