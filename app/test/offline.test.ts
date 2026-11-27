import { describe, expect, it } from 'vitest';
import { sendTracker } from '../../shared/offline';
const deferred = () => { let resolve!: () => void, reject!: (e: Error) => void; const promise = new Promise<void>((a,b) => { resolve = a; reject = b; }); return {promise,resolve,reject}; };
const tick = () => new Promise(r => setTimeout(r, 0));
describe('server acknowledgment tracking', () => {
  it('counts a pending write immediately and waits before allowing submission', async () => {
    const t = sendTracker(() => {}), d = deferred(); t.track(1,d.promise,['p:h1']);
    expect(t.waiting()).toBe(1); let done = false; const barrier=t.settled().then(()=>{done=true;});
    await tick(); expect(done).toBe(false); d.resolve(); await barrier; expect(t.waiting()).toBe(0); expect(t.failed).toBe(0);
  });
  it('keeps failed fields visible and blocks submission until those fields are corrected', async () => {
    const t=sendTracker(()=>{}), d=deferred(); t.track(2,d.promise,['p:h1','p:h2']); d.reject(new Error('denied')); await tick();
    expect(t.failed).toBe(2); await expect(t.settled()).rejects.toThrow('Some scores');
    t.track(1,Promise.resolve(),['p:h1']); await tick(); expect(t.failedFields).toEqual(['p:h2']);
    t.track(1,Promise.resolve(),['p:h2']); await t.settled(); expect(t.failed).toBe(0);
  });
  it('does not let a late failure of an old write invalidate a newer confirmed value', async () => {
    const t=sendTracker(()=>{}), old=deferred(); t.track(1,old.promise,['p:h1']); t.track(1,Promise.resolve(),['p:h1']); await tick();
    old.reject(new Error('old failure')); await t.settled(); expect(t.failed).toBe(0);
  });
  it('does not let an old success hide a newer failure', async () => {
    const t=sendTracker(()=>{}), old=deferred(), latest=deferred(); t.track(1,old.promise,['p:h1']); t.track(1,latest.promise,['p:h1']);
    latest.reject(new Error('failure')); old.resolve(); await tick(); expect(t.failed).toBe(1);
  });
  it('includes writes recovered after a reload and preserves a failed recovery', async () => {
    const t=sendTracker(()=>{}), d=deferred(); t.earlier(d.promise); expect(t.old).toBe(true); d.reject(new Error('failure')); await tick();
    expect(t.old).toBe(false); expect(t.failed).toBe(1); await expect(t.settled()).rejects.toThrow();
  });
  it('shows "all sent" for a moment after the last save lands, then hides it', async () => {
    const t = sendTracker(() => {}, 30), d = deferred(); t.track(1, d.promise, ['p:h1']);
    expect(t.justSent).toBe(false); d.resolve(); await tick(); await tick();
    expect(t.justSent).toBe(true); await new Promise(r => setTimeout(r, 45)); expect(t.justSent).toBe(false);
  });
  it('never says "all sent" while a save failed or another is still waiting', async () => {
    const t = sendTracker(() => {}, 30), bad = deferred(), slow = deferred();
    t.track(1, bad.promise, ['p:h1']); t.track(1, slow.promise, ['p:h2']); bad.reject(new Error('denied')); await tick(); await tick();
    expect(t.justSent).toBe(false); slow.resolve(); await tick(); await tick(); expect(t.justSent).toBe(false);
  });
});
