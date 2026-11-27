import { describe, expect, it } from 'vitest';
import { PARS18, fmtAt, formatLine, splitOn, withDefaults } from '../src/lib/event';
import {
  byRound, matchWith, roundOf,
  cardLabel, hasCardScores, playerPoints, recordOf, contestHasHole, contestStatus, contestsOf, cupState, fmtPar, fmtPts, groupDone, holeSeq, layoutOf, individualRows, line, mstatus, outsRows, rank, resultsCsv, skinsRows, teamLine, teamRows, unitsIn, type Ctx, unitsAt,
} from '../src/lib/scoring';
import type { EventDoc, Group, Player, ScoreDoc, Team } from '../src/lib/types';

/** Scores as an array of strokes from hole 1 (0 = not played). */
const holes = (arr: (number | string)[]) => Object.fromEntries(arr.map((v, i) => ['h' + (i + 1), v]).filter(([, v]) => v !== 0 && v !== ''));
const parRound = (deltas: number[] = []) => PARS18.map((p, i) => p + (deltas[i] || 0));

function ctx(ev: Partial<EventDoc>, players: Player[] = [], teams: Team[] = [], groups: Group[] = [], scores: Record<string, ScoreDoc> = {}): Ctx {
  return { ev: withDefaults(ev), players, teams, groups, scores };
}

describe('stroke play', () => {
  const players: Player[] = [{ id: 'a', name: 'Al' }, { id: 'b', name: 'Bo' }, { id: 'c', name: 'Cy' }, { id: 'd', name: 'Di', status: 'WD' }];
  const scores = {
    a: { holes: holes(parRound([1, 0, -1])) },          // even, 18 holes
    b: { holes: holes(PARS18.slice(0, 9).map((p, i) => p + (i === 0 ? -1 : 0))) }, // -1 thru 9
    c: { holes: holes(parRound([1])) },                 // +1
    d: { holes: holes([5, 5]) },
  };
  const c = ctx({ format: 'stroke' }, players, [], [], scores);

  it('adds strokes, score to par and holes played', () => {
    const l = line(c, players[0]);
    expect(l.strokes).toBe(72); expect(l.rel).toBe(0); expect(l.thru).toBe(18); expect(l.done).toBe(true);
    expect(line(c, players[1])).toMatchObject({ rel: -1, thru: 9, done: false });
  });
  it('ranks lowest first and leaves withdrawn players off the board', () => {
    const rows = individualRows(c);
    expect(rows.map(r => r.u.id)).toEqual(['b', 'a', 'c']);
    expect(rows.map(r => r.pos)).toEqual([1, 2, 3]);
    expect(outsRows(c).map(r => r.u.id)).toEqual(['d']);
  });
  it('shares a position on a tie (T2) and lists more holes played first', () => {
    const c2 = ctx({}, [{ id: 'x', name: 'Xi' }, { id: 'y', name: 'Yu' }, { id: 'z', name: 'Zo' }], [], [], {
      x: { holes: holes([3]) }, y: { holes: holes([4, 5]) }, z: { holes: holes([4]) },
    });
    const rows = individualRows(c2);
    expect(rows.map(r => [r.u.id, r.pos, r.tie])).toEqual([['x', 1, false], ['y', 2, true], ['z', 2, true]]);
  });
  it('9-hole events only count the first nine', () => {
    const c9 = ctx({ holes: 9 }, [players[0]], [], [], scores);
    expect(line(c9, players[0])).toMatchObject({ strokes: 36, rel: 0, thru: 9, done: true });
  });
  it('uses the event pars', () => {
    const c3 = ctx({ pars: Array(18).fill(3) }, [players[2]], [], [], { c: { holes: holes([4, 4]) } });
    expect(line(c3, players[2]).rel).toBe(2);
  });
  it('formats score to par', () => { expect([fmtPar(0), fmtPar(3), fmtPar(-2)]).toEqual(['E', '+3', '-2']); });
});

describe('stableford', () => {
  it('scores par 2, birdie 3, eagle 4, bogey 1, double 0 and ranks most points first', () => {
    const ps: Player[] = [{ id: 'a', name: 'Al' }, { id: 'b', name: 'Bo' }];
    // hole 1 par 4, hole 2 par 5, hole 3 par 3, hole 4 par 4, hole 5 par 4
    const c = ctx({ format: 'stableford' }, ps, [], [], { a: { holes: holes([4, 4, 2, 5, 6]) }, b: { holes: holes([3, 5, 3, 4, 4]) } });
    expect(line(c, ps[0]).pts).toBe(2 + 3 + 3 + 1 + 0);
    expect(line(c, ps[1]).pts).toBe(3 + 2 + 2 + 2 + 2);
    expect(individualRows(c).map(r => r.u.id)).toEqual(['b', 'a']);
  });
});

describe('team formats', () => {
  const teams: Team[] = [{ id: 't1', name: 'Team One' }, { id: 't2', name: 'Team Two' }];
  const players: Player[] = [
    { id: 'a', name: 'Al', teamId: 't1' }, { id: 'b', name: 'Bo', teamId: 't1' }, { id: 'c', name: 'Cy', teamId: 't1' },
    { id: 'd', name: 'Di', teamId: 't2' }, { id: 'e', name: 'Ed', teamId: 't2' },
  ];
  // hole 1 par 4, hole 2 par 5
  const scores = { a: { holes: holes([3, 6]) }, b: { holes: holes([5, 5]) }, c: { holes: holes([4, 7]) }, d: { holes: holes([4, 4]) }, e: { holes: holes([6]) } };

  it('best ball takes the single best score on each hole', () => {
    const c = ctx({ format: 'bestball' }, players, teams, [], scores);
    expect(teamLine(c, teams[0])).toMatchObject({ strokes: 3 + 5, rel: -1, thru: 2 });
    expect(teamLine(c, teams[1])).toMatchObject({ strokes: 4 + 4, rel: -1, thru: 2 });
  });
  it('team stroke play (best N per hole) only counts a hole once N scores are in', () => {
    const c = ctx({ format: 'team', countN: 2, countMode: 'hole' }, players, teams, [], scores);
    expect(teamLine(c, teams[0])).toMatchObject({ strokes: (3 + 4) + (5 + 6), rel: (7 - 8) + (11 - 10), thru: 2 });
    expect(teamLine(c, teams[1])).toMatchObject({ strokes: 10, rel: 2, thru: 1 });
  });
  it('team stroke play (best N rounds) adds the best player rounds', () => {
    const c = ctx({ format: 'team', countN: 2, countMode: 'round' }, players, teams, [], scores);
    const l = teamLine(c, teams[0]);
    // Al -1+1=0, Bo +1+0=+1, Cy 0+2=+2 → best two: 0 and +1
    expect(l.rel).toBe(1); expect(l.label).toBe('2/2'); expect(l.counting).toEqual(['a', 'b']);
  });
  it('shamble uses the count setting per hole', () => {
    const c = ctx({ format: 'shamble', countN: 1 }, players, teams, [], scores);
    expect(teamLine(c, teams[0]).strokes).toBe(8);
  });
  it('withdrawn players do not count for their team', () => {
    const c = ctx({ format: 'bestball' }, players.map(p => (p.id === 'a' ? { ...p, status: 'DQ' } : p)), teams, [], scores);
    expect(teamLine(c, teams[0]).strokes).toBe(4 + 5);
  });
  it('scramble and alternate shot score the team as one ball', () => {
    const c = ctx({ format: 'scramble' }, [], [...teams, { id: 't3', name: 'Out', status: 'WD' }], [{ id: 'g1', name: 'Group 1' }], { t1: { holes: holes([3, 4]) }, t2: { holes: holes([4]) } });
    expect(teamRows(c).map(r => [r.u.id, r.rel])).toEqual([['t1', -2], ['t2', 0]]);
    expect(outsRows(c).map(r => r.u.id)).toEqual(['t3']);
  });
  it('units in a group are teams for one-ball formats and players otherwise', () => {
    const tm: Team[] = [{ id: 't1', name: 'T', groupId: 'g' }];
    const ps: Player[] = [{ id: 'p', name: 'P', groupId: 'g' }];
    expect(unitsIn(ctx({ format: 'altshot' }, ps, tm), 'g').map(u => u.id)).toEqual(['t1']);
    expect(unitsIn(ctx({ format: 'stroke' }, ps, tm), 'g').map(u => u.id)).toEqual(['p']);
    expect(unitsIn(ctx({ format: 'ryder' }, ps, tm), 'g')).toEqual([]);
  });
});

describe('skins', () => {
  const ps: Player[] = [{ id: 'a', name: 'Al' }, { id: 'b', name: 'Bo' }, { id: 'c', name: 'Cy' }];
  const scores = { a: { holes: holes([4, 5, 2, 4]) }, b: { holes: holes([4, 5, 3, 3]) }, c: { holes: holes([4, 5, 3]) } };
  it('carries tied holes to the next decided hole', () => {
    const { rows, carry } = skinsRows(ctx({ format: 'skins', skinsCarry: true }, ps, [], [], scores));
    const a = rows.find(r => r.u.id === 'a')!;
    expect(a.skins).toBe(3); expect(a.won).toEqual([3]); expect(carry).toBe(0);
    // hole 4 isn't decided: Cy has no score yet
    expect(rows.find(r => r.u.id === 'b')!.skins).toBe(0);
  });
  it('without carry over, a tie wins nothing', () => {
    const { rows } = skinsRows(ctx({ format: 'skins', skinsCarry: false }, ps, [], [], scores));
    expect(rows.find(r => r.u.id === 'a')!.skins).toBe(1);
  });
  it('reports skins still carrying', () => {
    const { carry } = skinsRows(ctx({ format: 'skins' }, ps, [], [], { a: { holes: holes([4]) }, b: { holes: holes([4]) }, c: { holes: holes([4]) } }));
    expect(carry).toBe(1);
  });
});

describe('Ryder Cup match play', () => {
  const g = (id: string, res: string[], extra: Partial<Group> = {}): [Group, ScoreDoc] => [{ id, name: id, ...extra }, { holes: holes(res) }];
  const c1 = (res: string[], ev: Partial<EventDoc> = {}, extra: Partial<Group> = {}) => { const [gr, sc] = g('m', res, extra); return mstatus(ctx({ format: 'ryder', ...ev }, [], [], [gr], { m: sc }), gr); };

  it('shows a lead as "2 UP" and all square as "AS"', () => {
    expect(c1(['A', 'A', 'H'])).toMatchObject({ label: '2 UP', sub: 'Thru 3', lead: 'A', final: false, ja: 1, jb: 0 });
    expect(c1(['A', 'B'])).toMatchObject({ label: 'AS', lead: null, ja: 0.5, jb: 0.5 });
    expect(c1([])).toMatchObject({ label: '—', sub: 'Not started', thru: 0, ja: 0, jb: 0 });
  });
  it('ends the match once it is decided (3&2)', () => {
    const st = c1([...Array(16).fill('H').map((_, i) => (i < 3 ? 'B' : 'H'))]);
    expect(st).toMatchObject({ label: '3&2', final: true, lead: 'B', pb: 1, pa: 0, sub: 'Final' });
  });
  it('marks dormie', () => { expect(c1([...Array(15).fill('H'), 'A', 'A', 'A'].slice(0, 16).map((_, i) => (i < 2 ? 'A' : 'H')))).toMatchObject({ label: '2 UP', sub: 'Thru 16 · Dormie' }); });
  it('a match all square after 18 is halved for ½ each', () => {
    expect(c1(Array(18).fill('H'))).toMatchObject({ label: 'Halved', final: true, pa: 0.5, pb: 0.5 });
  });
  it('1 UP after the last hole', () => { expect(c1([...Array(17).fill('H'), 'A'])).toMatchObject({ label: '1 UP', final: true, pa: 1 }); });
  it('follows the starting hole (shotgun) and stops at a gap', () => {
    const st = c1(Array(18).fill(0).map((_, i) => (i === 9 ? 'A' : i === 10 ? 'A' : i === 0 ? 'B' : 0)) as string[], {}, { start: 10 });
    expect(st.seq[0]).toBe(10); expect(st.thru).toBe(2); expect(st.next).toBe(12);
    expect(holeSeq(withDefaults({ holes: 9 }), 7)).toEqual([7, 8, 9, 1, 2, 3, 4, 5, 6]);
  });
  it('9-hole matches', () => { expect(c1(['A', 'A', 'A', 'A', 'A'], { holes: 9 })).toMatchObject({ label: '5&4', final: true }); });

  it('adds up the cup, projected points, the number to win and the winner', () => {
    const ms = [g('m1', [...Array(18).fill('H').map((_, i) => (i < 4 ? 'A' : 'H'))].slice(0, 15), { order: 1 }), g('m2', Array(18).fill('H'), { order: 2 }), g('m3', ['B'], { order: 3 })];
    const c = ctx({ format: 'ryder' }, [], [], ms.map(m => m[0]), Object.fromEntries(ms.map(m => [m[0].id, m[1]])));
    const cs = cupState(c);
    expect(cs).toMatchObject({ A: 1.5, B: 0.5, JA: 1.5, JB: 1.5, n: 3, toWin: 2, winner: null, playing: 1, allFinal: false });
    expect(fmtPts(cs.A)).toBe('1½'); expect(fmtPts(0.5)).toBe('½'); expect(fmtPts(2)).toBe('2');
  });
  it('declares the winner once a side reaches the winning number', () => {
    const ms = [g('m1', Array(10).fill('A')), g('m2', Array(10).fill('A')), g('m3', [])];
    const cs = cupState(ctx({ format: 'ryder' }, [], [], ms.map(m => m[0]), Object.fromEntries(ms.map(m => [m[0].id, m[1]]))));
    expect(cs.winner).toBe('A'); expect(cs.playing).toBe(1);
  });
  it('a cup with every match final and level is halved', () => {
    const ms = [g('m1', Array(10).fill('A')), g('m2', Array(10).fill('B'))];
    const cs = cupState(ctx({ format: 'ryder' }, [], [], ms.map(m => m[0]), Object.fromEntries(ms.map(m => [m[0].id, m[1]]))));
    expect(cs).toMatchObject({ winner: null, halved: true, allFinal: true });
  });
  it('a group is done when the match is decided', () => {
    const [gr, sc] = g('m', Array(10).fill('A'));
    expect(groupDone(ctx({ format: 'ryder' }, [], [], [gr], { m: sc }), gr)).toBe(true);
  });
});

describe('rank()', () => {
  it('sorts by name when everything else is equal', () => {
    const r = rank([{ u: { id: '1', name: 'Zed' }, key: 0, thru: 3, strokes: 0, rel: 0, pts: 0, done: false }, { u: { id: '2', name: 'Abe' }, key: 0, thru: 3, strokes: 0, rel: 0, pts: 0, done: false }], false);
    expect(r.map(x => x.u.name)).toEqual(['Abe', 'Zed']);
  });
});

describe('results export', () => {
  it('lists matches for the Ryder Cup', () => {
    const c = ctx({ format: 'ryder' }, [{ id: 'p1', name: 'Al' }, { id: 'p2', name: 'Bo' }], [], [{ id: 'm', name: 'Match 1', aIds: ['p1'], bIds: ['p2'] }], { m: { holes: holes(Array(10).fill('A')) } });
    const csv = resultsCsv(c, ['Blue', 'White'], () => 'Singles');
    expect(csv.split('\n')[1]).toBe('"1","All","Singles","Al","Bo","10&8 Final","Blue","1-0"');
  });
  it('adds a Round column (and sorts by round) only when there are several rounds', () => {
    const ps = [{ id: 'p1', name: 'Al' }, { id: 'p2', name: 'Bo' }];
    const gs = [{ id: 'm2', name: 'Match 2', aIds: ['p1'], bIds: ['p2'], order: 1, round: 2 }, { id: 'm1', name: 'Match 1', aIds: ['p1'], bIds: ['p2'], order: 0 }];
    const rows = resultsCsv(ctx({ format: 'ryder' }, ps, [], gs), ['Blue', 'White'], () => 'Singles').split('\n');
    expect(rows[0].startsWith('"Round","Match"')).toBe(true);
    expect(rows[1].startsWith('"1","1",')).toBe(true);
    expect(rows[2].startsWith('"2","2",')).toBe(true);
  });
  it('a split match gets one line for the front nine and one per back-nine match', () => {
    const ps = [{ id: 'a1', name: 'Al' }, { id: 'a2', name: 'Ann' }, { id: 'b1', name: 'Bo' }, { id: 'b2', name: 'Bea' }];
    const g = { id: 'm', name: 'Match 1', mtype: 'fourball' as const, layout: 'split' as const, aIds: ['a1', 'a2'], bIds: ['b1', 'b2'] };
    const c = ctx({ format: 'ryder' }, ps, [], [g], { m: { holes: { h1: 'A', h10: 'B', h10_2: 'H' } } });
    const rows = resultsCsv(c, ['Blue', 'White'], () => 'Four-ball').split('\n').slice(1, 4);
    expect(rows).toEqual(['"1","Front 9","Four-ball","Al & Ann","Bo & Bea","1 UP Thru 1",""', '"1","Back 9","Singles","Al","Bo","1 UP Thru 1",""', '"1","Back 9","Singles","Ann","Bea","AS Thru 1",""'].map(r => r + ',""'));
  });
  it('lists teams then individuals for best ball', () => {
    const c = ctx({ format: 'bestball' }, [{ id: 'a', name: 'Al', teamId: 't' }], [{ id: 't', name: 'T' }], [], { a: { holes: holes([3]) } });
    const csv = resultsCsv(c, ['A', 'B'], () => '');
    expect(csv).toContain('"Teams"'); expect(csv).toContain('"Individual"'); expect(csv).toContain('"1","Al","-1","3","1","3"');
  });
});

describe('Ryder Cup: matches split at the turn (Will, Oct 19)', () => {
  const players: Player[] = [{ id: 'a1', name: 'Tyler', side: 'A' }, { id: 'a2', name: 'Will', side: 'A' }, { id: 'b1', name: 'Sean', side: 'B' }, { id: 'b2', name: 'Sam', side: 'B' }];
  const card = (o: Partial<Group> = {}): Group => ({ id: 'm1', name: 'Match 1', order: 0, mtype: 'fourball', aIds: ['a1', 'a2'], bIds: ['b1', 'b2'], ...o });
  const res = (o: Record<string, string | number>) => ({ m1: { groupId: 'm1', holes: o as ScoreDoc['holes'] } });
  const run = (o: Record<string, string | number>, g = card({ layout: 'split' })) => ctx({ format: 'ryder' }, players, [], [g], res(o));

  it('no layout = one 18-hole match worth 1 point, exactly as before', () => {
    const c = ctx({ format: 'ryder' }, players, [], [card()], res({ h1: 'A' }));
    expect(contestsOf(c.ev, card())).toEqual([{ part: 'all', type: 'fourball', a: ['a1', 'a2'], b: ['b1', 'b2'], pts: 1, holes: holeSeq(c.ev, 1), suffix: '' }]);
    expect(mstatus(c, card())).toMatchObject({ label: '1 UP', sub: 'Thru 1', total: 1, ja: 1 });
  });

  it('split: front four-ball, then two back-nine singles (straight or crossed)', () => {
    const cs = contestsOf(withDefaults({ format: 'ryder' }), card({ layout: 'split' }));
    expect(cs.map(x => [x.part, x.type, x.a.join(), x.b.join(), x.holes[0], x.holes.length, x.suffix])).toEqual([
      ['front', 'fourball', 'a1,a2', 'b1,b2', 1, 9, ''], ['back', 'singles', 'a1', 'b1', 10, 9, ''], ['back', 'singles', 'a2', 'b2', 10, 9, '_2']]);
    const x = contestsOf(withDefaults({ format: 'ryder' }), card({ layout: 'split', cross: true }));
    expect(x.slice(1).map(ct => ct.a[0] + '-' + ct.b[0])).toEqual(['a1-b2', 'a2-b1']);
  });

  it('a group starting on 10 plays the back nine first, and the formats stay with the holes', () => {
    const cs = contestsOf(withDefaults({ format: 'ryder' }), card({ layout: 'split', start: 10 }));
    expect(cs[0].holes).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]); expect(cs[1].holes).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it('9-hole matches close out over 9 holes (5&4 is possible)', () => {
    const o = { h1: 'A', h2: 'A', h3: 'A', h4: 'A', h5: 'A' };
    const st = contestStatus(run(o), card({ layout: 'split' }), contestsOf(withDefaults({ format: 'ryder' }), card({ layout: 'split' }))[0]);
    expect(st).toMatchObject({ final: true, label: '5&4', pa: 1 });
  });

  it('adds up the card: front won, back singles split = 2 of 3 points, Final', () => {
    const o: Record<string, string> = {};
    for (let h = 1; h <= 9; h++) o['h' + h] = h <= 5 ? 'A' : 'H';
    for (let h = 10; h <= 18; h++) { o['h' + h] = 'A'; o['h' + h + '_2'] = 'B'; }
    const c = run(o), st = mstatus(c, card({ layout: 'split' }));
    expect(st).toMatchObject({ final: true, pa: 2, pb: 1, total: 3, label: '2–1', sub: 'Final' });
    const cup = cupState(c); expect(cup).toMatchObject({ A: 2, B: 1, n: 3, toWin: 2, winner: 'A' });
    expect(groupDone(c, card({ layout: 'split' }))).toBe(true);
  });

  it('counts holes done only when every contest on that hole has its result', () => {
    const o: Record<string, string> = {};
    for (let h = 1; h <= 9; h++) o['h' + h] = 'H';
    o.h10 = 'A'; // first singles only
    const st = mstatus(run(o), card({ layout: 'split' }));
    expect(st).toMatchObject({ thru: 9, next: 10, final: false, label: '1½–½' }); // front halved (½ each) + first singles 1 UP; second not started
    o.h10_2 = 'B';
    expect(mstatus(run(o), card({ layout: 'split' }))).toMatchObject({ thru: 10, next: 11 });
  });

  it('a back-nine singles match that is already decided does not hold up the card', () => {
    const o: Record<string, string> = {};
    for (let h = 1; h <= 9; h++) o['h' + h] = 'A';
    for (let h = 10; h <= 14; h++) { o['h' + h] = 'A'; o['h' + h + '_2'] = 'H'; } // first singles won 5&4
    o.h15_2 = 'B';
    const st = mstatus(run(o), card({ layout: 'split' }));
    expect(st.thru).toBe(15); expect(st.next).toBe(16);
  });

  it('stroke-play back nine: each side adds both partners, lower total wins', () => {
    const g = card({ layout: 'split', mtype2: 'stroke' }), o: Record<string, string | number> = {};
    for (let h = 10; h <= 18; h++) { o['s' + h + '_a1'] = 4; o['s' + h + '_a2'] = 5; o['s' + h + '_b1'] = 4; o['s' + h + '_b2'] = 4; }
    const ct = contestsOf(withDefaults({ format: 'ryder' }), g)[1];
    expect(ct.type).toBe('stroke');
    expect(contestStatus(run(o, g), g, ct)).toMatchObject({ final: true, lead: 'B', label: 'Won by 9', pb: 1 });
    delete o.s18_b2;
    expect(contestStatus(run(o, g), g, ct)).toMatchObject({ final: false, thru: 8, label: 'By 8', sub: 'Thru 8', jb: 1 });
    expect(contestHasHole(run(o, g), g, ct, 18)).toBe(false);
  });

  it('stroke play tied over the nine is halved', () => {
    const g = card({ layout: 'back', mtype: 'stroke', aIds: ['a1'], bIds: ['b1'] }), o: Record<string, number> = {};
    for (let h = 10; h <= 18; h++) { o['s' + h + '_a1'] = 4; o['s' + h + '_b1'] = 4; }
    expect(mstatus(run(o, g), g)).toMatchObject({ final: true, label: 'Halved', pa: 0.5, pb: 0.5 });
  });

  it('points per match: 2-point matches and ½-point matches', () => {
    const o: Record<string, string> = {};
    for (let h = 1; h <= 9; h++) o['h' + h] = 'A';
    for (let h = 10; h <= 18; h++) { o['h' + h] = 'H'; o['h' + h + '_2'] = 'H'; }
    expect(mstatus(run(o, card({ layout: 'split', pts: 2 })), card({ layout: 'split', pts: 2 }))).toMatchObject({ pa: 4, pb: 2, total: 6 });
    expect(mstatus(run(o, card({ layout: 'split', pts: 0.5 })), card({ layout: 'split', pts: 0.5 }))).toMatchObject({ pa: 1, pb: 0.5, total: 1.5 });
  });

  it('back-nine singles need two players a side; otherwise the back nine keeps the same pairs', () => {
    const cs = contestsOf(withDefaults({ format: 'ryder' }), card({ layout: 'split', aIds: ['a1'], bIds: ['b1'], mtype: 'singles' }));
    expect(cs.length).toBe(2); expect(cs[1]).toMatchObject({ type: 'singles', a: ['a1'], b: ['b1'] });
    expect(contestsOf(withDefaults({ format: 'ryder' }), card({ layout: 'split', mtype2: 'foursomes' }))[1]).toMatchObject({ type: 'foursomes', a: ['a1', 'a2'] });
  });

  it('scramble is match play: one result per hole per pair, like alternate shot', () => {
    const g = card({ layout: 'split', mtype2: 'scramble' }), cs = contestsOf(withDefaults({ format: 'ryder' }), g);
    expect(cs[1]).toMatchObject({ type: 'scramble', a: ['a1', 'a2'], b: ['b1', 'b2'], suffix: '' });
    expect(cardLabel(withDefaults({ format: 'ryder' }), g)).toBe('Four-ball → Scramble');
    const o: Record<string, string> = {}; for (let h = 10; h <= 18; h++) o['h' + h] = h <= 12 ? 'B' : 'H';
    expect(contestStatus(run(o, g), g, cs[1])).toMatchObject({ final: true, lead: 'B', label: '3&2', pb: 1 });
  });

  it('a 9-hole event ignores the layout (one match)', () => {
    expect(layoutOf(withDefaults({ format: 'ryder', holes: 9 }), card({ layout: 'split' }))).toBe('all');
  });

  it('labels and cup totals with a mix of old and split matches', () => {
    const e = withDefaults({ format: 'ryder' });
    expect(cardLabel(e, card())).toBe('Four-ball'); expect(cardLabel(e, card({ layout: 'split' }))).toBe('Four-ball → Singles');
    expect(cardLabel(e, card({ layout: 'back', mtype: 'stroke' }))).toBe('Back 9 · Stroke play');
    const g2: Group = { id: 'm2', name: 'Match 2', order: 1, mtype: 'singles', aIds: ['a1'], bIds: ['b1'] };
    const c = ctx({ format: 'ryder' }, players, [], [card({ layout: 'split' }), g2], {});
    expect(cupState(c)).toMatchObject({ n: 4, toWin: 2.5 });
  });
});

describe('Ryder Cup: stroke play singles and player points (Will, Oct 19)', () => {
  const players: Player[] = [{ id: 'a1', name: 'Tyler', side: 'A' }, { id: 'a2', name: 'Will', side: 'A' }, { id: 'b1', name: 'Sean', side: 'B' }, { id: 'b2', name: 'Sam', side: 'B' }];
  const g: Group = { id: 'm1', name: 'Match 1', order: 0, mtype: 'fourball', layout: 'split', mtype2: 'strokesingles', aIds: ['a1', 'a2'], bIds: ['b1', 'b2'] };
  const o: Record<string, string | number> = {};
  for (let h = 1; h <= 9; h++) o['h' + h] = 'A';                                  // front four-ball: Tyler & Will win 9 UP... closes 5&4
  for (let h = 10; h <= 18; h++) { o[`s${h}_a1`] = 4; o[`s${h}_b1`] = 5; o[`s${h}_a2`] = 5; o[`s${h}_b2`] = 5; }
  const c = ctx({ format: 'ryder' }, players, [], [g], { m1: { groupId: 'm1', holes: o as ScoreDoc['holes'] } });

  it('stroke play singles: two 1 v 1 stroke matches on the back nine, lower total wins', () => {
    const cs = contestsOf(c.ev, g);
    expect(cs.slice(1).map(ct => [ct.type, ct.a[0], ct.b[0]])).toEqual([['stroke', 'a1', 'b1'], ['stroke', 'a2', 'b2']]);
    expect(contestStatus(c, g, cs[1])).toMatchObject({ final: true, lead: 'A', label: 'Won by 9' });
    expect(contestStatus(c, g, cs[2])).toMatchObject({ final: true, lead: null, label: 'Halved' });
    expect(cardLabel(c.ev, g)).toBe('Four-ball → Stroke play singles');
  });

  it('player points: partners split, singles full, halves half, adds up to the cup score', () => {
    const pp = playerPoints(c);
    const by = Object.fromEntries(pp.map(r => [r.p.name, [r.pts, recordOf(r)]]));
    expect(by).toEqual({ Tyler: [1.5, '2–0–0'], Will: [1, '1–0–1'], Sean: [0, '0–2–0'], Sam: [0.5, '0–1–1'] });
    const cup = cupState(c), sum = (k: string) => pp.filter(r => r.side === k).reduce((t, r) => t + r.pts, 0);
    expect([sum('A'), sum('B')]).toEqual([cup.A, cup.B]);
    expect(pp[0].p.name).toBe('Tyler');
  });

  it('points show to the quarter (a halved four-ball is ¼ each)', () => {
    expect([0, 0.25, 0.5, 0.75, 1, 1.25, 2.5, 6.5].map(fmtPts)).toEqual(['0', '¼', '½', '¾', '1', '1¼', '2½', '6½']);
    const fb: Group = { id: 'm9', name: 'Match 9', order: 0, mtype: 'fourball', aIds: ['a1', 'a2'], bIds: ['b1', 'b2'] };
    const hv = playerPoints(ctx({ format: 'ryder' }, players, [], [fb], { m9: { groupId: 'm9', holes: holes(Array(18).fill('H')) } }));
    expect(hv.map(r => [r.p.name, fmtPts(r.pts), recordOf(r)])).toEqual([['Sam', '¼', '0–0–1'], ['Sean', '¼', '0–0–1'], ['Tyler', '¼', '0–0–1'], ['Will', '¼', '0–0–1']]);
  });

  it('matches still being played are counted as live, not as points', () => {
    const o2 = { h1: 'A' as const }, c2 = ctx({ format: 'ryder' }, players, [], [g], { m1: { groupId: 'm1', holes: o2 } });
    expect(playerPoints(c2).find(r => r.p.id === 'a1')).toMatchObject({ pts: 0, live: 1, w: 0 });
  });

  it('results export lists player points', () => {
    const csv = resultsCsv(c, ['Blue', 'White'], () => 'x');
    expect(csv).toContain('"Player points"'); expect(csv).toContain('"Tyler","Blue","2","0","0","1½"');
  });
});

describe('match setup lock (Oct 20)', () => {
  const g: Group = { id: 'm1', name: 'Match 1', layout: 'split', mtype: 'fourball', aIds: ['a', 'b'], bIds: ['c', 'd'] };
  it('is locked once anything is scored, and not before (cleared holes do not count)', () => {
    expect(hasCardScores(ctx({ format: 'ryder' }, [], [], [g], {}), g)).toBe(false);
    expect(hasCardScores(ctx({ format: 'ryder' }, [], [], [g], { m1: { holes: { h1: null } } }), g)).toBe(false);
    expect(hasCardScores(ctx({ format: 'ryder' }, [], [], [g], { m1: { holes: { h10_2: 'H' } } }), g)).toBe(true);
    expect(hasCardScores(ctx({ format: 'ryder' }, [], [], [g], { m1: { holes: { s10_a: 4 } } }), g)).toBe(true);
  });
});

describe('split format by nine for team events (Will, Oct 19)', () => {
  const players: Player[] = [{ id: 'a', name: 'Al', teamId: 't1', groupId: 'g1' }, { id: 'b', name: 'Bo', teamId: 't1', groupId: 'g1' }, { id: 'c', name: 'Cy', teamId: 't2', groupId: 'g1' }, { id: 'd', name: 'Di', teamId: 't2', groupId: 'g1' }];
  const teams: Team[] = [{ id: 't1', name: 'One', groupId: 'g1' }, { id: 't2', name: 'Two', groupId: 'g1' }];
  const front = (arr: number[]) => holes([...arr, 0, 0, 0, 0, 0, 0, 0, 0, 0].slice(0, 9));
  const back = (arr: number[]) => Object.fromEntries(arr.map((v, i) => ['h' + (i + 10), v]).filter(([, v]) => v));
  const P = PARS18;
  const scores = {
    a: { holes: front(P.slice(0, 9).map((p, i) => p + (i === 0 ? -1 : 0))) },  // -1 on the front
    b: { holes: front(P.slice(0, 9).map(p => p + 1)) },                        // +9
    c: { holes: front(P.slice(0, 9)) },                                       // E
    d: { holes: front(P.slice(0, 9)) },
    t1: { holes: back(P.slice(9).map((p, i) => p - (i < 2 ? 1 : 0))) },        // scramble -2
    t2: { holes: back(P.slice(9, 13)) },                                       // E thru 4
  };
  const c = ctx({ format: 'bestball', format2: 'scramble' }, players, teams, [{ id: 'g1', name: 'Group 1' }], scores);

  it('formats belong to hole numbers', () => {
    expect(fmtAt(c.ev, 9)).toBe('bestball'); expect(fmtAt(c.ev, 10)).toBe('scramble');
    expect(splitOn(withDefaults({ format: 'bestball', format2: 'bestball' }))).toBe(false);
    expect(splitOn(withDefaults({ format: 'bestball', format2: 'scramble', holes: 9 }))).toBe(false);
    expect(splitOn(withDefaults({ format: 'stroke', format2: 'scramble' }))).toBe(false); // individual formats can't split
  });

  it('team total = best ball front + scramble back, with each nine shown', () => {
    const t1 = teamLine(c, teams[0]);
    expect(t1).toMatchObject({ rel: -3, thru: 18, done: true, nines: [-1, -2] });
    expect(teamLine(c, teams[1])).toMatchObject({ rel: 0, thru: 13, done: false, nines: [0, 0] });
    expect(teamRows(c).map(r => [r.u.name, r.pos])).toEqual([['One', 1], ['Two', 2]]);
  });

  it('players only count the best-ball nine; teams only the scramble nine', () => {
    expect(line(c, players[0])).toMatchObject({ rel: -1, thru: 9, done: true });
    expect(line(c, teams[0])).toMatchObject({ rel: -2, thru: 9, done: true });
    expect(individualRows(c)[0]).toMatchObject({ pos: 1, rel: -1 });
  });

  it('who scores on each hole, and when the group is done', () => {
    expect(unitsAt(c, 'g1', 3).map(u => u.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(unitsAt(c, 'g1', 12).map(u => u.id)).toEqual(['t1', 't2']);
    expect(groupDone(c, { id: 'g1', name: 'Group 1' })).toBe(false); // team Two isn't finished
  });

  it('scramble front, team stroke back (best 2 per hole)', () => {
    const c2 = ctx({ format: 'scramble', format2: 'team', countN: 2 }, players, teams, [], {
      t1: { holes: front(P.slice(0, 9)) }, a: { holes: back(P.slice(9).map(p => p - 1)) }, b: { holes: back(P.slice(9)) },
    });
    expect(teamLine(c2, teams[0])).toMatchObject({ rel: -9, thru: 18, nines: [0, -9] });
  });

  it('format line', () => {
    expect(formatLine(c.ev)).toBe('Best ball → Scramble · 18 holes');
  });
});

describe('rounds (one match per player per round)', () => {
  const g = (id: string, aIds: string[], bIds: string[], round?: number) => ({ id, name: id, aIds, bIds, round }) as Group;
  const ms = [g('m1', ['a1', 'a2'], ['b1', 'b2']), g('m2', ['a3'], ['b3']), g('m3', ['a1'], ['b1'], 2), g('m4', [], [], 2)];
  it('roundOf: missing or junk = round 1', () => {
    expect(roundOf({})).toBe(1); expect(roundOf({ round: 2 })).toBe(2); expect(roundOf({ round: 0 })).toBe(1);
  });
  it('finds a player in another match of the same round only', () => {
    expect(matchWith(ms, 'a1', 'm2', 'A', 0)).toBe(0);   // a1 is in m1, same round as m2
    expect(matchWith(ms, 'a1', 'm4', 'A', 0)).toBe(2);   // round 2: a1 is in m3
    expect(matchWith(ms, 'a3', 'm4', 'A', 0)).toBe(-1);  // a3 only plays round 1, free in round 2
  });
  it("the slot being edited doesn't count, but the other slot of the same match does", () => {
    expect(matchWith(ms, 'a1', 'm1', 'A', 0)).toBe(-1);
    expect(matchWith(ms, 'a1', 'm1', 'A', 1)).toBe(0);
  });
  it('byRound sorts by round, then list order', () => {
    const order = [g('x', [], [], 2), g('y', [], []), g('z', [], [], 2)].map((m, i) => ({ ...m, order: i }));
    expect(order.sort(byRound).map(m => m.id)).toEqual(['y', 'x', 'z']);
  });
});
