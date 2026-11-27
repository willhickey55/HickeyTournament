import { beforeEach, describe, expect, it } from 'vitest';
import { saveQueue, type Waiting } from '../src/lib/savequeue';

/* A pretend clock, so the tests control exactly when the 1-second pause ends. */
function clock() {
  let now = 0, n = 0; const due = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    set: (fn: () => void, ms: number) => { const id = ++n; due.set(id, { at: now + ms, fn }); return id; },
    clear: (id: unknown) => { due.delete(id as number); },
    tick(ms: number) {
      const end = now + ms;
      for (;;) {
        const next = [...due.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; due.delete(next[0]); next[1].fn();
      }
      now = end;
    },
  };
}

describe('score save queue', () => {
  let t: ReturnType<typeof clock>, saved: [string, Waiting][], Q: ReturnType<typeof saveQueue>;
  beforeEach(() => { t = clock(); saved = []; Q = saveQueue((id, w) => saved.push([id, JSON.parse(JSON.stringify(w))]), 1000, t); });

  it('saves once after a pause, with the last value', () => {
    Q.put('p1', 'g1', 'h1', 4); t.tick(300); Q.put('p1', 'g1', 'h1', 5); t.tick(300); Q.put('p1', 'g1', 'h1', 6);
    t.tick(999); expect(saved).toEqual([]);
    t.tick(1); expect(saved).toEqual([['p1', { groupId: 'g1', holes: { h1: 6 } }]]);
    t.tick(5000); expect(saved.length).toBe(1);
  });

  it('keeps every hole when a scorer moves on before the pause ends', () => {
    Q.put('p1', 'g1', 'h1', 5); t.tick(200); Q.put('p1', 'g1', 'h2', 4); t.tick(200); Q.put('p1', 'g1', 'h3', 3);
    t.tick(1000);
    expect(saved).toEqual([['p1', { groupId: 'g1', holes: { h1: 5, h2: 4, h3: 3 } }]]);
  });

  it('keeps players in a group separate', () => {
    Q.put('p1', 'g1', 'h1', 5); Q.put('p2', 'g1', 'h1', 4); Q.put('p3', 'g1', 'h1', 6);
    t.tick(1000);
    expect(saved.map(s => s[0]).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(Object.fromEntries(saved.map(([id, w]) => [id, w.holes.h1]))).toEqual({ p1: 5, p2: 4, p3: 6 });
  });

  it('clearing a hole (null) is saved too', () => {
    Q.put('p1', 'g1', 'h1', 5); t.tick(1000); Q.put('p1', 'g1', 'h1', null); t.tick(1000);
    expect(saved[1]).toEqual(['p1', { groupId: 'g1', holes: { h1: null } }]);
  });

  it('flush saves everything waiting right away (Submit, page hidden or closed), and only once', () => {
    Q.put('p1', 'g1', 'h18', 5); Q.put('p2', 'g1', 'h18', 4);
    Q.flush();
    expect(saved.length).toBe(2); expect(Q.size).toBe(0);
    t.tick(5000); expect(saved.length).toBe(2);
    Q.flush(); expect(saved.length).toBe(2);
  });

  it('drop forgets a removed player without saving', () => {
    Q.put('p1', 'g1', 'h1', 5); Q.put('p2', 'g1', 'h1', 4);
    Q.drop('p1'); t.tick(1000);
    expect(saved.map(s => s[0])).toEqual(['p2']);
    expect(Q.overlay({})).toEqual({ p2: { id: 'p2', groupId: 'g1', holes: { h1: 4 } } });
    Q.drop(); expect(Q.overlay({})).toEqual({});
  });

  it('a live update that arrives mid-pause does not undo the waiting score', () => {
    Q.put('p1', 'g1', 'h3', 6);
    // another phone's save comes in: the database still has the old 5 for p1, and p2 changed
    const live = { p1: { groupId: 'g1', holes: { h1: 4, h2: 5, h3: 5 } }, p2: { groupId: 'g1', holes: { h3: 4 } } };
    const shown = Q.overlay<{ groupId?: string; holes: Record<string, number> }>(live);
    expect(shown.p1.holes).toEqual({ h1: 4, h2: 5, h3: 6 });
    expect(shown.p2.holes).toEqual({ h3: 4 });
    expect(live.p1.holes.h3).toBe(5); // the database copy is left alone
  });

  it('a first score shows even before the player has a score card in the database', () => {
    Q.put('p9', 'g2', 'h1', 4);
    expect(Q.overlay({})).toEqual({ p9: { id: 'p9', groupId: 'g2', holes: { h1: 4 } } });
  });

  it('a just-saved score stays shown until the database echoes it back', () => {
    Q.put('p1', 'g1', 'h3', 6); t.tick(1000);
    // an update that was already on its way, without the save
    expect(Q.overlay({ p1: { holes: { h3: 5 } } }).p1.holes!.h3).toBe(6);
    // the save arrives: nothing is laid on top any more, so a later change from another phone shows
    expect(Q.overlay({ p1: { holes: { h3: 6 } } }).p1.holes!.h3).toBe(6);
    expect(Q.overlay({ p1: { holes: { h3: 7 } } }).p1.holes!.h3).toBe(7);
  });

  it('two quick saves of the same hole: the newer one wins on screen', () => {
    Q.put('p1', 'g1', 'h3', 5); t.tick(1000);
    Q.put('p1', 'g1', 'h3', 6); t.tick(1000);
    expect(Q.overlay({ p1: { holes: { h3: 5 } } }).p1.holes!.h3).toBe(6);
    expect(Q.overlay({ p1: { holes: { h3: 6 } } }).p1.holes!.h3).toBe(6);
    expect(Q.overlay({ p1: { holes: { h3: 4 } } }).p1.holes!.h3).toBe(4);
  });

  it('gives up laying a saved score on top after 5 seconds (another phone may have changed it)', () => {
    Q.put('p1', 'g1', 'h3', 6); t.tick(1000);
    t.tick(5001);
    expect(Q.overlay({ p1: { holes: { h3: 7 } } }).p1.holes!.h3).toBe(7);
  });

  it('tapping + three times from a stale live update still counts from what is on screen', () => {
    // what setHole does: read the shown value, add one, put it
    let shown: Record<string, any> = Q.overlay({ p1: { holes: { h1: 4 } } });
    const tap = () => { const v = (shown.p1.holes.h1 || 0) + 1; Q.put('p1', 'g1', 'h1', v); shown = Q.overlay(shown); };
    tap(); shown = Q.overlay({ p1: { holes: { h1: 4 } } }); // stale live update between taps
    tap(); shown = Q.overlay({ p1: { holes: { h1: 4 } } });
    tap(); t.tick(1000);
    expect(saved).toEqual([['p1', { groupId: 'g1', holes: { h1: 7 } }]]);
  });

  it('uses the newest group if the player is moved while a score waits', () => {
    Q.put('p1', 'g1', 'h1', 4); Q.put('p1', 'g2', 'h2', 5); t.tick(1000);
    expect(saved[0][1].groupId).toBe('g2');
  });
});
