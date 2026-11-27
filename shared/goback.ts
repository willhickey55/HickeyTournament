/** "Back to hole N" (Will, Oct 29): on stroke-play scoring screens there's no Undo (+ / − fixes a score), but for a few
    seconds after Next hole the scorer gets a button back to the hole they just left. Plain module (no preact), used by
    events-app Player.tsx (stroke/team formats) and tryouts-app player/Day.tsx. */
export function backTracker(onChange: () => void, MS = 5000) {
  let st: { from: number; to: number; until: number } | null = null;
  let t: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { st = null; clearTimeout(t); };
  return {
    /** The scorer tapped Next hole: from the hole they left to the one now showing. */
    moved(from: number, to: number) { clear(); st = { from, to, until: Date.now() + MS }; t = setTimeout(() => { st = null; onChange(); }, MS + 50); },
    /** The hole to go back to while `hole` is the one they moved to and the few seconds aren't up, else null. */
    shown(hole: number) { return st && st.to === hole && Date.now() < st.until ? st.from : null; },
    clear,
  };
}
