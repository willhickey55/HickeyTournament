/** Server acknowledgment tracking shared by the scoring apps. Failed fields remain
 * visible until a newer write of that field succeeds; never replay stale writes.
 * `justSent` (Will, Oct 28): true for SHOW_MS after the last waiting save reached the server with nothing failed, so
 * the score screens show "✓ All scores sent" for a moment and then hide the line. */
export function sendTracker(onChange: () => void, SHOW_MS = 1500) {
  const pending = new Set<Promise<unknown>>();
  const latest = new Map<string, number>();
  const failures = new Set<string>();
  let serial = 0, any = false, old = false, doneAt = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const tracker = {
    track(n: number, save: Promise<unknown>, fields?: string[]) {
      if (!n) return;
      const version = ++serial, keys = fields || ['write:' + version];
      keys.forEach(k => latest.set(k, version));
      any = true; pending.add(save); onChange();
      save.then(() => { keys.forEach(k => { if (latest.get(k) === version) failures.delete(k); }); }, () => {
        keys.forEach(k => { if (latest.get(k) === version) failures.add(k); });
      }).finally(() => {
        pending.delete(save);
        if (!pending.size && !failures.size) { doneAt = Date.now(); clearTimeout(timer); timer = setTimeout(onChange, SHOW_MS + 50); }
        onChange();
      });
    },
    earlier(done: Promise<unknown>) {
      old = true; any = true;
      tracker.track(1, done, ['previous-session']);
      done.then(() => {}, () => {}).finally(() => { old = false; onChange(); });
    },
    waiting(_offline = false) { return pending.size; },
    get old() { return old; },
    get any() { return any; },
    get failed() { return failures.size; },
    get failedFields() { return [...failures]; },
    get justSent() { return !pending.size && !failures.size && Date.now() - doneAt < SHOW_MS; },
    async settled() {
      while (pending.size) await Promise.allSettled([...pending]);
      if (failures.size) throw new Error('Some scores could not be saved. Review and re-enter the affected scores before submitting.');
    },
    reset() { if (pending.size) throw new Error('Wait for pending scores before resetting.'); failures.clear(); latest.clear(); any = false; doneAt = 0; onChange(); },
  };
  return tracker;
}
