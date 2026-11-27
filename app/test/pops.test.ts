import { describe, expect, it } from 'vitest';
import { PARS18, withDefaults } from '../src/lib/event';
import { boardPops, boardSnap } from '../src/lib/pops';
import type { Ctx } from '../src/lib/scoring';
import type { EventDoc, Group, MatchResult, Player, ScoreDoc } from '../src/lib/types';

const ctx = (ev: Partial<EventDoc>, players: Player[], groups: Group[], scores: Record<string, ScoreDoc>): Ctx =>
  ({ ev: withDefaults(ev), players, teams: [], groups, scores });
const res = (arr: string[]) => Object.fromEntries(arr.map((v, i) => ['h' + (i + 1), v as MatchResult]));
const holes = (arr: number[]) => Object.fromEntries(arr.map((v, i) => ['h' + (i + 1), v]).filter(([, v]) => v));

describe('live pop-ups', () => {
  const ps: Player[] = [{ id: 'a', name: 'Tyler Bisbee' }, { id: 'b', name: 'Sean Mansfield' }, { id: 'c', name: 'Will Hickey' }, { id: 'd', name: 'Sam DiNallo' }];
  const gs: Group[] = [{ id: 'm1', name: 'Match 1', aIds: ['a'], bIds: ['b'], order: 1 }, { id: 'm2', name: 'Match 2', aIds: ['c'], bIds: ['d'], order: 2 }];
  const ryder = (m1: string[], m2: string[]) => boardSnap(ctx({ format: 'ryder' }, ps, gs, { m1: { holes: res(m1) }, m2: { holes: res(m2) } }));
  const T = (ps: { text: string }[]) => ps.map(p => p.text);

  it('says nothing on the first look or when only the hole count moves', () => {
    expect(T(boardPops(null, ryder(['A'], [])))).toEqual([]);
    expect(T(boardPops(ryder(['A'], []), ryder(['A', 'H'], [])))).toEqual([]);
  });
  it('a lead change, a new margin, back to all square', () => {
    expect(T(boardPops(ryder(['A'], []), ryder(['A', 'A'], [])))).toEqual(['Match 1 · Bisbee 2 UP']);
    expect(T(boardPops(ryder(['A'], []), ryder(['A', 'B'], [])))).toEqual(['Match 1 · all square']);
    expect(T(boardPops(ryder(['A', 'B'], []), ryder(['A', 'B', 'B'], [])))).toEqual(['Match 1 · Mansfield 1 UP']);
  });
  it('a halved hole never pops up; the pop-up carries the side that is up', () => {
    expect(boardPops(ryder(['A', 'A'], []), ryder(['A', 'A', 'H'], []))).toEqual([]);
    expect(boardPops(ryder(['A'], []), ryder(['A', 'B', 'B'], []))).toEqual([{ text: 'Match 1 · Mansfield 1 UP', side: 'B' }]);
    expect(boardPops(ryder(['A'], []), ryder(['A', 'B'], []))).toEqual([{ text: 'Match 1 · all square' }]);
  });
  it('a match that just started is not announced', () => {
    expect(T(boardPops(ryder(['A'], []), ryder(['A'], ['B'])))).toEqual([]);
  });
  it('final and halved', () => {
    const won = Array(10).fill('A');
    expect(T(boardPops(ryder(Array(9).fill('A'), []), ryder(won, [])))).toEqual(['Match 1 final · Bisbee win 10&8']);
    const half = [...Array(9).fill('A'), ...Array(9).fill('B')];
    expect(T(boardPops(ryder(half.slice(0, 17), []), ryder(half, [])))).toEqual(['Match 1 halved']);
  });
  it('skips what the caller says (the scorer\'s own match)', () => {
    expect(T(boardPops(ryder(['A'], []), ryder(['A', 'A'], []), k => k === 'm:m1'))).toEqual([]);
  });
  it('more than three changes at once become one line', () => {
    const many: Group[] = [1, 2, 3, 4].map(i => ({ id: 'g' + i, name: 'Match ' + i, aIds: [], bIds: [], order: i }));
    const s = (v: string) => boardSnap(ctx({ format: 'ryder' }, [], many, Object.fromEntries(many.map(g => [g.id, { holes: res([v]) }]))));
    expect(T(boardPops(s('A'), s('B')))).toEqual(['Board caught up · 4 matches changed']);
  });
  it('stroke play: a new leader or a tie for the lead', () => {
    const sp: Player[] = [{ id: 'a', name: 'Al' }, { id: 'b', name: 'Bo' }];
    const st = (a: number[], b: number[]) => boardSnap(ctx({ format: 'stroke' }, sp, [], { a: { holes: holes(a) }, b: { holes: holes(b) } }));
    const p = PARS18;
    const s1 = st([p[0] - 1], [p[0]]);
    expect(T(boardPops(s1, st([p[0] - 1, p[1]], [p[0], p[1]])))).toEqual([]);
    expect(T(boardPops(s1, st([p[0] - 1, p[1] + 1], [p[0], p[1]])))).toEqual(['Tied for the lead · Al, Bo E']);
    expect(T(boardPops(s1, st([p[0] - 1, p[1] + 2], [p[0], p[1]])))).toEqual(['New leader · Bo E']);
  });
  it('skins boards have no pop-ups', () => {
    expect(boardSnap(ctx({ format: 'skins' }, [], [], {}))).toEqual({});
  });
});
