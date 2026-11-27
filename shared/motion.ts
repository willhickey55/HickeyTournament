/* Screen changes (Will, Oct 28): when a player moves to another screen (your match, scoring, a league match, posting a
   round) the page slides in instead of swapping instantly: from the right going deeper, from the left coming back.
   On the scoring screens the next hole slides in from the right, the previous one from the left.
   Only the <main> part moves (the header stays put). Exec screens don't use this (Will: keep them no-nonsense).
   Styles: "Screen changes" block in polish.css. Skipped with reduced motion (the CSS has no animation then). */
let last: { key: string; depth: number; step: number | null } | null = null;
const ends = new WeakMap<HTMLElement, (ev: AnimationEvent) => void>();

/** Call on every render of the app. key: which screen is showing ('' = don't animate, e.g. exec). depth: how deep it
    is (home 0, a sub-page 1, scoring 2). step: the hole number on a scoring screen, so hole changes slide too.
    No hooks (this file sits outside the apps' node_modules); the class is set on the next frame, after the render. */
export function useScreen(key: string, depth: number, step?: number | null) {
  const prev = last, now = { key, depth, step: step ?? null };
  last = now;
  if (!prev || !key || !prev.key) return;
  let dir: 'fwd' | 'back' | null = null;
  if (prev.key !== key) dir = depth < prev.depth ? 'back' : 'fwd';
  else if (now.step != null && prev.step != null && now.step !== prev.step) dir = now.step < prev.step ? 'back' : 'fwd';
  if (!dir) return;
  requestAnimationFrame(() => {
    const m = document.querySelector<HTMLElement>('#app main');
    if (!m) return;
    m.classList.remove('scr-fwd', 'scr-back');
    void m.offsetWidth; // restart the animation
    m.classList.add('scr-' + dir);
    // Only the slide's own end counts: animationend bubbles, so a small animation inside the page finishing mid-slide
    // used to end the slide early. One listener per <main>, replaced when a new slide starts (a restarted slide is
    // cancelled, not ended, so the old listener would otherwise stay behind).
    const old = ends.get(m);
    if (old) m.removeEventListener('animationend', old);
    const end = (ev: AnimationEvent) => {
      if (ev.target !== m || !/^scr(fwd|back)$/.test(ev.animationName)) return;
      m.classList.remove('scr-fwd', 'scr-back');
      m.removeEventListener('animationend', end);
      ends.delete(m);
    };
    ends.set(m, end);
    m.addEventListener('animationend', end);
  });
}

/** Marks the page while an exec screen is showing (`html.exec`), so the player-only look in polish.css (the calmer
    sentence-case labels) leaves exec screens plain (Will, Oct 28: "no nonsense and basic"). Call on every render. */
export function markExec(exec: boolean) {
  document.documentElement.classList.toggle('exec', exec);
}
