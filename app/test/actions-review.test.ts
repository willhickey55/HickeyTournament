import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.stubGlobal('window', { addEventListener: vi.fn(), scrollTo: vi.fn() });
vi.stubGlobal('document', { addEventListener: vi.fn(), visibilityState: 'visible' });
vi.stubGlobal('navigator', { onLine: true });
const { S } = await import('../src/state');
const { DEFAULT_EVENT } = await import('../src/lib/event');
const { sends, submitScores, submission, setMatchHole, undoLastScore, lastScore, flushScores, undoOpen, UNDO_MS } = await import('../src/actions');
const deferred = () => { let resolve!: () => void, reject!: (e: Error) => void; const promise=new Promise<void>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; };
const tick=()=>new Promise(r=>setTimeout(r,0));
beforeEach(()=>{
  sends.reset(); submission.busy=false; submission.error=''; lastScore.entry=null; lastScore.busy=false;
  S.uid='me';S.myGroup='g';S.online=true;S.view='score';S.ev={...DEFAULT_EVENT,format:'ryder',holes:18,locked:false,hold:false};
  S.groups=[{id:'g',name:'Match 1',scorers:['me'],aIds:['a'],bIds:['b'],mtype:'singles'}];
  S.players=[{id:'a',name:'A'},{id:'b',name:'B'}];
  S.scores={g:{groupId:'g',holes:Object.fromEntries(Array.from({length:10},(_,i)=>['h'+(i+1),'A']))}};
  S.api={mode:'demo',set:vi.fn().mockResolvedValue(undefined),update:vi.fn().mockResolvedValue(undefined),undoScore:vi.fn().mockResolvedValue(undefined)} as any;
});
describe('score submission and Undo',()=>{
  it('submits right away while a score is still waiting for signal (Will, Oct 28)',async()=>{
    const score=deferred();sends.track(1,score.promise,['g:h10']);S.online=false;
    submitScores();expect(S.api!.update).toHaveBeenCalledTimes(1);expect(S.view).toBe('home');expect(S.groups[0].submitted).toBe(true);expect(S.toast).toContain('when you have signal');
    score.resolve();await tick();
  });
  it('does not submit over a failed score write',async()=>{
    sends.track(1,Promise.reject(new Error('denied')),['g:h10']);await tick();submitScores();
    expect(S.api!.update).not.toHaveBeenCalled();expect(submission.error).not.toBe('');expect(S.view).toBe('score');
  });
  it('reopens the card with a message when the submit is turned away, and can submit again later',async()=>{
    S.api!.update=vi.fn().mockRejectedValue(new Error('denied'));submitScores();await tick();await tick();
    expect(S.groups[0].submitted).toBe(false);expect(submission.error).not.toBe('');expect(sends.failed).toBe(0);
    S.api!.update=vi.fn().mockResolvedValue(undefined);S.view='score';submitScores();expect(S.api!.update).toHaveBeenCalledTimes(1);
  });
  it('Undo restores the prior value and returns to its hole',async()=>{
    S.scores={g:{groupId:'g',holes:{h1:'H'}}};setMatchHole(S.groups[0],1,'A');flushScores();await sends.settled();S.hole=2;
    await undoLastScore();expect(S.api!.undoScore).toHaveBeenCalledWith('events/current/scores/g','h1','A','H','me',expect.any(Number));expect(S.scores.g.holes!.h1).toBe('H');expect(S.hole).toBe(1);
  });
  it('Undo does not replace a conflicting score or operate on a locked card',async()=>{
    S.scores={g:{groupId:'g',holes:{h1:'H'}}};setMatchHole(S.groups[0],1,'A');await sends.settled();
    S.api!.undoScore=vi.fn().mockRejectedValue(new Error('This score changed on another phone.'));
    await undoLastScore();expect(S.scores.g.holes!.h1).toBe('A');expect(lastScore.error).toContain('another phone');
    (S.api!.undoScore as any).mockClear();S.groups[0].submitted=true;await undoLastScore();expect(S.api!.undoScore).not.toHaveBeenCalled();
  });
});
describe('Undo only right after the tap (Will, Oct 28)',()=>{
  it('is offered for a few seconds, then not at all',async()=>{
    S.scores={g:{groupId:'g',holes:{h1:'H'}}};const t0=Date.now();const now=vi.spyOn(Date,'now').mockReturnValue(t0);
    setMatchHole(S.groups[0],1,'A');flushScores();await sends.settled();expect(undoOpen()).toBe(true);
    now.mockReturnValue(t0+UNDO_MS+1);expect(undoOpen()).toBe(false);await undoLastScore();expect(S.api!.undoScore).not.toHaveBeenCalled();
    now.mockRestore();
  });
});
