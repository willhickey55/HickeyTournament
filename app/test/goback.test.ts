import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backTracker } from '../../shared/goback';

describe('backTracker (Back to hole N after Next hole)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it('offers the hole just left, only on the hole moved to, for 5 seconds', () => {
    const onChange = vi.fn(), b = backTracker(onChange);
    expect(b.shown(5)).toBe(null);
    b.moved(4, 5);
    expect(b.shown(5)).toBe(4);
    expect(b.shown(6)).toBe(null);
    vi.advanceTimersByTime(4900);
    expect(b.shown(5)).toBe(4);
    vi.advanceTimersByTime(200);
    expect(b.shown(5)).toBe(null);
    expect(onChange).toHaveBeenCalled();
  });
  it('a new Next hole restarts it; clear hides it', () => {
    const b = backTracker(() => {});
    b.moved(4, 5); vi.advanceTimersByTime(3000); b.moved(5, 6);
    expect(b.shown(6)).toBe(5);
    vi.advanceTimersByTime(4000);
    expect(b.shown(6)).toBe(5);
    b.clear();
    expect(b.shown(6)).toBe(null);
  });
});
