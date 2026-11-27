/* Scores wait for a pause in tapping before they're saved, so +, +, + on one hole is one save, not three
   (each save is read again by every phone watching the leaderboard). Waiting scores:
   - show on this phone right away (the caller updates the screen itself),
   - stay on top of live updates from other phones until the database has them (overlay),
   - are saved at once before Submit and when the page is hidden or closed (flush).
   The same file is in events-app and tryouts-app; keep them identical. */
type Val = number | string | null;   // strokes, or a match result (A / B / H) on a match card
type Holes = Record<string, Val>;
type ScoreLike = { id?: string; groupId?: string; holes?: Record<string, unknown> };
export interface Waiting { groupId: string; holes: Holes }
interface Timers { set(fn: () => void, ms: number): unknown; clear(t: unknown): void; now(): number }
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: t => clearTimeout(t as ReturnType<typeof setTimeout>), now: () => Date.now() };

export const SAVE_PAUSE_MS = 1000;
/** A saved score stays on top until a live update includes it (normally within milliseconds), or this long. */
const SENT_KEEP_MS = 5000;

export function saveQueue(write: (id: string, w: Waiting) => void, ms = SAVE_PAUSE_MS, timers: Timers = realTimers) {
  const waiting = new Map<string, Waiting>();
  const timer = new Map<string, unknown>();
  const sent: { id: string; groupId: string; holes: Holes; at: number }[] = [];
  const stop = (id: string) => { if (timer.has(id)) { timers.clear(timer.get(id)); timer.delete(id); } };
  const save = (id: string) => {
    stop(id); const w = waiting.get(id); waiting.delete(id); if (!w) return;
    // A newer save of the same hole replaces an older one that the database hasn't echoed back yet.
    for (let i = sent.length - 1; i >= 0; i--) {
      if (sent[i].id !== id) continue;
      Object.keys(w.holes).forEach(h => delete sent[i].holes[h]);
      if (!Object.keys(sent[i].holes).length) sent.splice(i, 1);
    }
    sent.push({ id, groupId: w.groupId, holes: { ...w.holes }, at: timers.now() });
    write(id, w);
  };
  return {
    /** One hole for one player/team. Restarts that player's pause. */
    put(id: string, groupId: string, hole: string, val: Val) {
      const w = waiting.get(id) || { groupId, holes: {} };
      w.groupId = groupId; w.holes[hole] = val; waiting.set(id, w);
      stop(id); timer.set(id, timers.set(() => save(id), ms));
    },
    /** Save now: one player/team, or everything waiting. */
    flush(id?: string) { (id ? [id] : [...waiting.keys()]).forEach(save); },
    /** Forget without saving (the player was removed, or the event erased). */
    drop(id?: string) {
      (id ? [id] : [...waiting.keys()]).forEach(k => { stop(k); waiting.delete(k); });
      for (let i = sent.length - 1; i >= 0; i--) if (!id || sent[i].id === id) sent.splice(i, 1);
    },
    /** Live scores from the database with this phone's waiting (and just-saved) scores laid on top. */
    overlay<T extends ScoreLike>(scores: Record<string, T>): Record<string, T> {
      const now = timers.now();
      for (let i = sent.length - 1; i >= 0; i--) {
        const s = sent[i], have: Record<string, unknown> = (scores[s.id] || {}).holes || {};
        if (now - s.at > SENT_KEEP_MS || Object.keys(s.holes).every(h => (have[h] ?? null) === s.holes[h])) sent.splice(i, 1);
      }
      if (!waiting.size && !sent.length) return scores;
      const out: Record<string, ScoreLike> = { ...scores };
      const lay = (id: string, holes: Holes, groupId: string) => { const cur = out[id] || {}; out[id] = { ...cur, id, groupId: cur.groupId || groupId, holes: { ...(cur.holes || {}), ...holes } }; };
      sent.forEach(s => lay(s.id, s.holes, s.groupId));
      waiting.forEach((w, id) => lay(id, w.holes, w.groupId));
      return out as Record<string, T>;
    },
    get size() { return waiting.size; },
  };
}
