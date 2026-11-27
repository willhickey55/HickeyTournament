import { describe, expect, it } from 'vitest';
import { PARS18, withDefaults } from '../src/lib/event';
import { contestStatus, contestsOf, mstatus, skinsRows, teamLine, type Ctx } from '../src/lib/scoring';
import type { EventDoc, Group, MatchResult, Player, ScoreDoc, Team } from '../src/lib/types';
import { countingAt, matchWords, pointsWords, shortNames, shortSide, sideHole, sideLetters, skinAt, stabPts, strokeTotals, upLeft } from '../src/lib/words';

const ctx = (ev: Partial<EventDoc>, players: Player[] = [], teams: Team[] = [], groups: Group[] = [], scores: Record<string, ScoreDoc> = {}): Ctx => ({ ev: withDefaults(ev), players, teams, groups, scores });
const run = (seq: string, from = 1) => Object.fromEntries(seq.split('').map((v, i) => ['h' + (from + i), v])) as Record<string, MatchResult>;
const who = (k: 'A' | 'B') => (k === 'A' ? 'Blue' : 'White');

describe('scoring screen words', () => {
  it('shortens side names and picks grid letters', () => {
    expect(shortSide('Team Blue')).toBe('Blue');
    expect(shortSide('Wildcats')).toBe('Wildcats');
    expect(sideLetters('Team Blue', 'Team White')).toEqual({ A: 'B', B: 'W' });
    expect(sideLetters('Team Black', 'Team Blue')).toEqual({ A: 'A', B: 'B' });
  });
  it('says a match play status in words', () => {
    const g: Group = { id: 'm', name: 'M', mtype: 'fourball', aIds: ['a1', 'a2'], bIds: ['b1', 'b2'] };
    const st = (seq: string) => mstatus(ctx({ format: 'ryder' }, [], [], [g], { m: { holes: run(seq) } }), g);
    const w = (seq: string) => matchWords(st(seq), false, who, () => false);
    expect(w('')).toMatchObject({ big: 'Not started', dormie: false });
    expect(w('AHB')).toMatchObject({ big: 'All square', sub: 'thru 3' });
    expect(w('AAH')).toMatchObject({ big: 'Blue 2 up', sub: 'thru 3', up: 2, left: 15, dormie: false });
    expect(w('AAAAAHHHHH')).toMatchObject({ big: 'Blue 5 up', left: 8, dormie: false });
    expect(w('AAAAAHHHHHHHHH')).toMatchObject({ big: 'Blue win 5&4', sub: 'Final' });     // 5 up with 4 left = closed out
    expect(w('AAAAHHHHHHHHHH')).toMatchObject({ big: 'Blue 4 up', dormie: true, left: 4 });
    expect(w('BBBBBHHHHHHHHH')).toMatchObject({ big: 'White win 5&4', sub: 'Final' });
    expect(w('AHHHHHHHHHHHHHHHHH')).toMatchObject({ big: 'Blue win 1 up', sub: 'Final' });
    expect(w('AHHHHHHHHHHHHHHHHB')).toMatchObject({ big: 'Halved', sub: 'Final' });
    expect(matchWords(st('AAH'), false, () => 'Miller', () => true).big).toBe('Miller 2 up');
    expect(matchWords(st('AAAAAAAAAA'), false, () => 'Miller', () => true).big).toBe('Miller wins 10&8');
    expect(upLeft(st('AAAAAAAAAA'))).toEqual({ up: 10, left: 8 });
  });
  it('says stroke play and points in words', () => {
    const g: Group = { id: 'm', name: 'M', mtype: 'stroke', aIds: ['a'], bIds: ['b'], layout: 'front' };
    const ct = contestsOf(withDefaults({ format: 'ryder' }), g)[0];
    const c = ctx({ format: 'ryder' }, [], [], [g], { m: { holes: { s1_a: 4, s1_b: 6, s2_a: 5, s2_b: 4 } } });
    const st = contestStatus(c, g, ct);
    expect(matchWords(st, true, who, () => true)).toMatchObject({ big: 'Blue by 1', sub: 'thru 2' });
    expect(strokeTotals(c, 'm', ct)).toEqual({ a: 9, b: 10, thru: 2 });
    expect(sideHole(c, 'm', ['a'], 1)).toBe(4);
    expect(sideHole(c, 'm', ['a'], 3)).toBe(null);
    const sp: Group = { id: 's', name: 'S', mtype: 'fourball', layout: 'split', aIds: ['a1', 'a2'], bIds: ['b1', 'b2'] };
    expect(pointsWords(mstatus(ctx({ format: 'ryder' }, [], [], [sp], { s: { holes: run('AHA') } }), sp))).toEqual({ big: '1 – 0', sub: 'Points · thru 3' });
    expect(pointsWords(mstatus(ctx({ format: 'ryder' }, [], [], [sp], {}), sp)).sub).toBe('Points · not started');
  });
  it('finds the counting scores for a team on a hole', () => {
    const ps: Player[] = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id, teamId: 't' }));
    const t: Team = { id: 't', name: 'T' };
    const sc = { a: { holes: { h1: 5 } }, b: { holes: { h1: 3 } }, c: { holes: { h1: 4 } } };
    const team = countingAt(ctx({ format: 'team', countN: 2 }, ps, [t], [], sc), t, 1);
    expect(team).toMatchObject({ need: 2, got: 3, sum: 7, ok: true });
    expect(team.use.map(x => x.id)).toEqual(['b', 'c']);
    expect(countingAt(ctx({ format: 'bestball' }, ps, [t], [], sc), t, 1)).toMatchObject({ need: 1, sum: 3 });
    expect(countingAt(ctx({ format: 'team', countN: 2 }, ps, [t], [], { a: { holes: { h1: 5 } } }), t, 1).ok).toBe(false);
    // same per-hole number the team board uses
    const full = { a: { holes: { h1: 5 } }, b: { holes: { h1: 3 } }, c: { holes: { h1: 4 } }, d: { holes: { h1: 6 } } };
    const c = ctx({ format: 'team', countN: 2, holes: 18 }, ps, [t], [], full);
    expect(teamLine(c, t).strokes).toBe(countingAt(c, t, 1).sum);
  });
  it('counts skins and carry-overs the way the skins board does', () => {
    const ps: Player[] = ['a', 'b', 'c'].map(id => ({ id, name: id }));
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < 200; n++) {
      const scores: Record<string, ScoreDoc> = {};
      ps.forEach(p => { scores[p.id] = { holes: Object.fromEntries(PARS18.map((par, i) => ['h' + (i + 1), rnd() < .1 ? 0 : par + Math.floor(rnd() * 3) - 1]).filter(([, v]) => v)) }; });
      const c = ctx({ format: 'skins', skinsCarry: rnd() < .7 }, ps, [], [], scores);
      expect(skinAt(c, 19).carry).toBe(skinsRows(c).carry);
      // every decided hole's winner adds up to the board's skins
      const won: Record<string, number> = { a: 0, b: 0, c: 0 };
      for (let h = 1; h <= 18; h++) { const s = skinAt(c, h); if (s.decided && s.winner) won[s.winner] += s.worth; }
      for (const r of skinsRows(c).rows) expect(won[r.u.id]).toBe(r.skins);
    }
  });
  it('Stableford points and review column names', () => {
    const c = ctx({ format: 'stableford' });
    expect(stabPts(c, 1, 3)).toBe(3); expect(stabPts(c, 1, 4)).toBe(2); expect(stabPts(c, 1, 7)).toBe(0); expect(stabPts(c, 1, 0)).toBe(0);
    expect(shortNames(['Jake Miller', 'Jake Torres', 'Sam Okafor'])).toEqual(['Jake M.', 'Jake T.', 'Sam']);
  });
});
