/* In-memory database with example events, for the preview build (no Firebase). Nothing is saved. */
import { DEFAULT_EVENT, PARS18 } from '../lib/event';
import { localDay } from '../lib/time';
import type { EventDoc } from '../lib/types';
import type { Api, Doc, User } from './types';

/** Preview only: with the browser offline, a save waits for signal like a real one does. */
const signal = () => navigator.onLine ? Promise.resolve() : new Promise<void>(r => addEventListener('online', () => r(), { once: true }));

import { DEMO_KINDS, type DemoKind } from './demokinds';
export type { DemoKind };
export function demoApi(): Api & { setUser(u: User): void; load(kind: DemoKind): void; writes: { path: string; data: object }[] } {
  const db: Record<string, any> = {};
  const L = new Set<() => void>();
  const colOf = (p: string) => p.split('/').slice(0, -1).join('/');
  const emit = () => setTimeout(() => L.forEach(f => f()), 0);
  const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  const merge = (a: any, b: any): any => { const o = { ...(a || {}) }; for (const k in b) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? merge(o[k], b[k]) : b[k]; return o; };
  let authCb: ((u: User | null) => void) | null = null;

  const api = {
    mode: 'demo' as const,
    undoScore: async (path: string, key: string, expected: number | string | null, previous: number | string | null, by: string, at: number) => {
      if (!navigator.onLine) throw new Error('Connect before undoing a saved score.');
      const data = db[path];
      if (!data || data.by !== by || data.updatedAt !== at || (data.holes?.[key] ?? null) !== expected) throw new Error('This score changed on another phone. Review the card instead.');
      db[path] = merge(data, { holes: { [key]: previous }, updatedAt: Date.now(), by }); emit();
    },
    /** Every save, for the browser tests (they count saves and play another phone through window.__demo). */
    writes: [] as { path: string; data: object }[],
    watchDoc: (p: string, cb: (d: Doc | null) => void) => { const f = () => cb(db[p] ? { id: p.split('/').pop()!, ...copy(db[p]) } : null); L.add(f); setTimeout(f, 0); return () => { L.delete(f); }; },
    watchCol: (c: string, w: any, cb: (d: Doc[]) => void) => {
      const f = () => cb(Object.keys(db).filter(k => colOf(k) === c).map(k => ({ id: k.split('/').pop()!, ...copy(db[k]) })).filter(d => !w || d[w[0]] === w[2]));
      L.add(f); setTimeout(f, 0); return () => { L.delete(f); };
    },
    watchSync: (_p: string, cb: (live: boolean) => void) => { const f = () => cb(navigator.onLine); addEventListener('online', f); addEventListener('offline', f); setTimeout(f, 0); return () => { removeEventListener('online', f); removeEventListener('offline', f); }; },
    getCol: async (c: string) => Object.keys(db).filter(k => colOf(k) === c).map(k => ({ id: k.split('/').pop()!, ...copy(db[k]) })),
    set: async (p: string, d: object, m?: boolean) => { api.writes.push({ path: p, data: copy(d) }); db[p] = m ? merge(db[p], copy(d)) : copy(d); emit(); await signal(); },
    // like Firebase: the change shows at once, the promise waits for signal (so preview tests see real submit behavior)
    update: async (p: string, d: object) => { api.writes.push({ path: p, data: copy(d) }); db[p] = merge(db[p], copy(d)); emit(); await signal(); },
    del: async (p: string) => { delete db[p]; emit(); },
    delFields: async (p: string, fields: string[]) => { fields.forEach(f => { const [a, b] = f.split('.'); if (db[p] && db[p][a]) delete db[p][a][b]; }); emit(); },
    createIfMissing: async (p: string, d: object) => { if (db[p]) return false; db[p] = copy(d); api.writes.push({ path: p, data: copy(d) }); emit(); return true; },
    addScorer: async (p: string, uid: string) => { const g = db[p]; g.scorers = [...new Set([...(g.scorers || []), uid])]; emit(); },
    join: async (p: string, gid: string, code: string) => {
      const eid = p.split('/')[1], need = db['events/' + eid]?.codes;
      if (need && (db[`events/${eid}/codes/${gid}`] || {}).code !== code) { const e: any = new Error('denied'); e.code = 'permission-denied'; throw e; }
      db[p] = { groupId: gid, at: Date.now() }; emit();
    },
    clearMembers: async (c: string, gid?: string) => { Object.keys(db).filter(k => colOf(k) === c && (!gid || db[k].groupId === gid)).forEach(k => delete db[k]); emit(); },
    clearCol: async (c: string) => { Object.keys(db).filter(k => colOf(k) === c).forEach(k => delete db[k]); emit(); },
    signInGoogle: async () => {}, signOut: async () => {},
    onAuth: (cb: (u: User | null) => void) => { authCb = cb; setTimeout(() => cb({ uid: 'demo-me', email: null, isAnonymous: true }), 0); },
    setUser: (u: User) => { authCb && authCb(u); },
    load: (kind: DemoKind) => { Object.keys(db).forEach(k => delete db[k]); seed(kind); emit(); },
  };

  /* example data, clearly marked as examples: one event at a time, like the real site */
  function seed(kind: DemoKind) {
    const today = localDay(new Date());
    const names = ['Example Golfer A', 'Example Golfer B', 'Example Golfer C', 'Example Golfer D', 'Example Golfer E', 'Example Golfer F', 'Example Golfer G', 'Example Golfer H'];
    db['config/admins'] = { organizers: [] };
    // example History years (made-up names, clearly examples)
    const T = (name: string, players: string[], score: number, toPar: number, pos: number) => ({ name, players, score, toPar, pos });
    const ex = (year: number, course: string, champ: any, field: any[], note = '') => { db['history/y' + year] = { year, date: year + '-06-14', course, champ, field, note, photo: '', createdAt: year }; };
    ex(2025, 'Example Country Club', T('Team Example A', ['Example Golfer A', 'Example Golfer B', 'Example Golfer C'], 62, -10, 1), [T('Team Example B', ['Example Golfer D', 'Example Golfer E', 'Example Golfer F'], 63, -9, 2), T('Team Example C', ['Example Golfer G', 'Example Golfer H', 'Example Golfer I'], 66, -6, 3)], 'Won it with a birdie on 18 (example).');
    ex(2024, 'Example Country Club', T('Team Example D', ['Example Golfer D', 'Example Golfer G', 'Example Golfer B'], 64, -8, 1), [T('Team Example E', ['Example Golfer A', 'Example Golfer E', 'Example Golfer H'], 68, -4, 2), T('Team Example F', ['Example Golfer C', 'Example Golfer F', 'Example Golfer I'], 70, -2, 3)]);
    ex(2023, 'Example Links', T('Team Example G', ['Example Golfer A', 'Example Golfer F', 'Example Golfer H'], 65, -7, 1), [T('Team Example H', ['Example Golfer B', 'Example Golfer D', 'Example Golfer I'], 65, -7, 2)], 'Playoff on the 1st hole (example).');
    ex(2021, 'Example Links', T('', ['Example Golfer A', 'Example Golfer D', 'Example Golfer E'], null as any, -5, 1), []);
    if (kind === 'layouts' || kind === 'ryder9') { seedLayouts(kind, today); return; }
    if (kind !== 'ryder' && kind !== 'bestball') { seedStroke(kind, today); return; }
    if (kind === 'ryder') {
      db['events/current'] = { ...DEFAULT_EVENT, name: 'Example Wildcat Cup', date: today, format: 'ryder', sideA: 'Team Blue', sideB: 'Team White', tagline: 'Inter-squad Ryder Cup', createdAt: 3 } as EventDoc;
      // 8 a side, each in one match like the real cup; 2 a side left over so the match pickers have someone to add
      const cup = 'ABCDEFGHIJKLMNOP'.split('').map(l => 'Example Golfer ' + l);
      db['events/current/roster/main'] = { players: Object.fromEntries(cup.map((name, i) => ['p' + (i + 1), { name, side: i < 8 ? 'A' : 'B', groupId: '', teamId: '', order: i, status: '' }])), teams: {} };
      [['m1', '12:30 PM', 'fourball', ['p1', 'p2'], ['p9', 'p10'], ['demo-me']], ['m2', '12:40 PM', 'foursomes', ['p3', 'p4'], ['p11', 'p12'], ['x']], ['m3', '12:50 PM', 'singles', ['p5'], ['p13'], []], ['m4', '1:00 PM', 'singles', ['p6'], ['p14'], []]]
        .forEach(([id, tee, mtype, aIds, bIds, sc], i) => { db['events/current/groups/' + id] = { name: 'Match ' + (i + 1), tee, start: 1, scorers: sc, submitted: false, order: i, mtype, aIds, bIds }; });
      // Round 2 (afternoon): round-1 players can play again, once each
      db['events/current/groups/m5'] = { name: 'Match 5', tee: '2:30 PM', start: 1, scorers: [], submitted: false, order: 4, mtype: 'singles', aIds: ['p1'], bIds: ['p11'], round: 2 };
      db['events/current/groups/m6'] = { name: 'Match 6', tee: '2:40 PM', start: 1, scorers: [], submitted: false, order: 5, mtype: 'singles', aIds: [], bIds: [], round: 2 };
      // Match 1 is split at the turn: four-ball on the front nine, then two singles matches on the back
      db['events/current/groups/m1'].layout = 'split'; db['events/current/groups/m1'].mtype2 = 'singles';
      db['events/current/scores/m1'] = { groupId: 'm1', holes: { h1: 'A', h2: 'H', h3: 'B', h4: 'A', h5: 'A' } };
      db['events/current/scores/m2'] = { groupId: 'm2', holes: { h1: 'B', h2: 'B', h3: 'H' } };
      // Matches 3 and 4 are finished (one each way), so the preview shows final results, winner edges and the count-up
      const run = (seq: string[]) => Object.fromEntries(seq.map((v, i) => ['h' + (i + 1), v]));
      db['events/current/scores/m3'] = { groupId: 'm3', holes: run(['A', 'A', 'H', 'A', ...Array(12).fill('H')]) };
      db['events/current/scores/m4'] = { groupId: 'm4', holes: run(['B', 'H', 'B', ...Array(14).fill('H')]) };
      db['events/current/groups/m3'].submitted = true; db['events/current/groups/m4'].submitted = true;
      db['events/current/members/demo-me'] = { groupId: 'm1' };
      return;
    }
    // Friday best ball: 2 groups of 4, 4 teams of 2, a custom main color
    const offs = [[0, 1, 0, -1, 0, 1, 0, 0], [1, 0, 0, 0, -1, 0, 1, 0], [0, 0, 1, 0, 0, 0, 0, 1], [1, 1, 0, 0, 0, -1, 0, 0], [0, 0, 0, 1, 0, 0, 1, 0], [-1, 0, 1, 0, 0, 0, 0, 1], [0, 1, 1, 0, 0, 0, 0, 0], [0, 0, 0, 0, 1, 1, 0, -1]];
    db['events/current'] = { ...DEFAULT_EVENT, name: 'Example Friday Best Ball', date: today, format: 'bestball', bandColor: '#8b0000', eyebrow: 'UNH Golf · Fall series', codes: true, createdAt: 2 } as EventDoc;
    db['events/current/roster/main'] = {
      players: Object.fromEntries(names.map((name, i) => ['p' + (i + 1), { name, groupId: i < 4 ? 'g1' : 'g2', teamId: 't' + (Math.floor(i / 2) + 1), side: '', order: i, status: '' }])),
      teams: Object.fromEntries([['t1', 'Team Birdie Machine'], ['t2', 'Team Fairway Finders'], ['t3', 'Team Sand Savers'], ['t4', 'Team Short Game']].map(([id, name], i) => [id, { name, groupId: '', order: i }])),
    };
    [['g1', 'Group 1', '1:00 PM', ['demo-me']], ['g2', 'Group 2', '1:10 PM', ['x']]].forEach(([id, name, tee, sc], i) => { db['events/current/groups/' + id] = { name, tee, start: 1, scorers: sc, submitted: false, order: i }; });
    names.forEach((_, i) => { const holes: Record<string, number> = {}; for (let h = 1; h <= 8; h++) holes['h' + h] = PARS18[h - 1] + offs[i][h - 1]; db['events/current/scores/p' + (i + 1)] = { groupId: i < 4 ? 'g1' : 'g2', holes }; });
    // no group yet: the player view starts at "Find your group" and asks for the group code (4821 for Group 1)
    db['events/current/codes/g1'] = { code: '4821' }; db['events/current/codes/g2'] = { code: '1937' };
  }
  /** One example per Ryder match layout; the demo phone can keep score for any of them (pick one in Find your match). */
  function seedLayouts(kind: 'layouts' | 'ryder9', today: string) {
    const nine = kind === 'ryder9';
    db['events/current'] = { ...DEFAULT_EVENT, name: nine ? 'Example Nine-Hole Cup' : 'Example Match Layouts', date: today, format: 'ryder', holes: nine ? 9 : 18, sideA: 'Team Blue', sideB: 'Team White', createdAt: 4 } as EventDoc;
    const first = ['Jake', 'Ryan', 'Sam', 'Ben', 'Alex', 'Chris', 'Matt', 'Tyler', 'Sean', 'Nick', 'Owen', 'Luke', 'Evan', 'Cole', 'Will', 'Dan'];
    const last = ['Miller', 'Torres', 'Okafor', 'Carter', 'Ruiz', 'Park', 'Doyle', 'Bisbee', 'Hughes', 'Grant', 'Walsh', 'Reed', 'Kim', 'Fox', 'Lane', 'Shaw',
      'Price', 'Ross', 'Bell', 'Hayes', 'Ford', 'Wade', 'Cruz', 'Moss', 'Nash', 'Pratt', 'Quinn', 'Rowe', 'Snow', 'Tate', 'Vance', 'York'];
    const ps = Array.from({ length: 32 }, (_, i) => ({ id: 'p' + (i + 1), name: `${first[i % 16]} ${last[i]}`, side: i < 16 ? 'A' : 'B' }));
    db['events/current/roster/main'] = { players: Object.fromEntries(ps.map((p, i) => [p.id, { name: p.name, side: p.side, groupId: '', teamId: '', order: i, status: '' }])), teams: {} };
    const A = ps.filter(p => p.side === 'A').map(p => p.id), B = ps.filter(p => p.side === 'B').map(p => p.id);
    let ai = 0, bi = 0;
    const run = (from: number, seq: string) => Object.fromEntries(seq.split('').map((v, i) => ['h' + (from + i), v]));
    const strokes = (from: number, pids: string[], rows: number[][]) => Object.fromEntries(rows.flatMap((r, i) => pids.map((pid, j) => ['s' + (from + i) + '_' + pid, PARS18[from + i - 1] + r[j]])));
    const ms: [string, object, object][] = nine ? [
      ['Singles', { mtype: 'singles' }, run(1, 'AHBA')],
      ['Four-ball', { mtype: 'fourball' }, run(1, 'BBHA')],
      ['Stroke play', { mtype: 'stroke' }, {}],
    ] : [
      ['Four-ball → Singles', { mtype: 'fourball', layout: 'split', mtype2: 'singles' }, run(1, 'AHBAHHBAH')],
      ['Four-ball → Stroke play', { mtype: 'fourball', layout: 'split', mtype2: 'stroke' }, { ...run(1, 'AHBAHHBAH')}],
      ['Four-ball → Stroke play singles', { mtype: 'fourball', layout: 'split', mtype2: 'strokesingles' }, run(1, 'BHAHBHHAB')],
      ['Front 9 · Four-ball', { mtype: 'fourball', layout: 'front' }, run(1, 'AAH')],
      ['Back 9 · Alternate shot (starts on 10)', { mtype: 'foursomes', layout: 'back', start: 10 }, run(10, 'BH')],
      ['Stroke play, all 18', { mtype: 'stroke' }, {}],
      ['Scramble, starts on 10', { mtype: 'scramble', start: 10 }, run(10, 'HAB')],
      ['Singles · match over', { mtype: 'singles' }, run(1, 'AAHAAHBAAHAHAAH')],
    ];
    ms.forEach(([label, f, holes], i) => {
      const k = (f as { mtype: string }).mtype !== 'singles' ? 2 : 1, a = A.slice(ai, ai += k), b = B.slice(bi, bi += k);
      db['events/current/groups/m' + (i + 1)] = { name: 'Match ' + (i + 1), tee: label, start: 1, scorers: ['demo-me'], submitted: false, order: i, aIds: a, bIds: b, ...f };
      // stroke play nines: a few holes of strokes for the four players
      const g = db['events/current/groups/m' + (i + 1)], st = g.layout === 'split' && g.mtype2 !== 'singles' ? 10 : g.mtype === 'stroke' ? 1 : 0;
      const sh = st ? (g.mtype2 === 'strokesingles' ? strokes(st, [a[0], b[0], a[1], b[1]], [[0, 1, 1, 0], [1, 0, 0, 0], [-1, 0, 0, 1]]) : strokes(st, [...a, ...b], [[0, 1, 1, 0], [1, 0, 0, 0], [-1, 0, 0, 1]])) : {};
      db['events/current/scores/m' + (i + 1)] = { groupId: 'm' + (i + 1), holes: { ...holes, ...sh } };
    });
    // no match yet: the preview opens on "Find your match", which lists every layout (pick the example again to try another)
  }
  /** One group of four scored by the demo phone, for each stroke-type format (five holes in; stroke play 17, so
      the last hole leads to Review scores). */
  function seedStroke(kind: DemoKind, today: string) {
    const fmt = (kind === 'split' ? 'bestball' : kind) as EventDoc['format'], ob = kind === 'scramble' || kind === 'altshot';
    const label = DEMO_KINDS.find(k => k[0] === kind)![1];
    db['events/current'] = { ...DEFAULT_EVENT, name: 'Example ' + label, date: today, format: fmt, ...(kind === 'split' ? { format2: 'scramble' } : {}), countN: 2, createdAt: 5 } as EventDoc;
    if (kind === 'scramble') { seedFamily(today); return; }
    const names = ['Alex Ruiz', 'Jake Miller', 'Sam Okafor', 'Ben Carter', 'Chris Park', 'Matt Doyle', 'Jordan Lee', 'Ryan Torres']; // the event name says Example
    const teamOf = (i: number) => (kind === 'team' ? 't' + (i < 4 ? 1 : 2) : 't' + (Math.floor(i / 2) + 1));
    const teamIds = kind === 'team' ? ['t1', 't2'] : ['t1', 't2', 't3', 't4'];
    const tname = (id: string) => { const ix = names.map((n, i) => [n, i] as const).filter(([, i]) => teamOf(i) === id).map(([n]) => n.split(' ').pop()); return kind === 'team' ? 'Team ' + id.slice(1) : ix.join(' & '); };
    const teamy = !['stroke', 'stableford', 'skins'].includes(kind);
    db['events/current/roster/main'] = {
      players: Object.fromEntries(names.map((name, i) => ['p' + (i + 1), { name, groupId: i < 4 ? 'g1' : 'g2', teamId: teamy ? teamOf(i) : '', side: '', order: i, status: '' }])),
      teams: teamy ? Object.fromEntries(teamIds.map((id, i) => [id, { name: tname(id), groupId: ob || kind === 'split' ? (i < 2 ? 'g1' : 'g2') : '', order: i }])) : {},
    };
    [['g1', 'Group 1', '1:00 PM', ['demo-me']], ['g2', 'Group 2', '1:10 PM', ['x']]].forEach(([id, name, tee, sc], i) => { db['events/current/groups/' + id] = { name, tee, start: 1, scorers: sc, submitted: false, order: i }; });
    const offs = [[0, 1, -1, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 1, 0, 0, 0], [1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2], [-1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 1, 0]];
    const upto = kind === 'stroke' ? 17 : 5;
    if (ob) teamIds.forEach((id, i) => { const holes: Record<string, number> = {}; for (let h = 1; h <= upto; h++) holes['h' + h] = PARS18[h - 1] + offs[i][h - 1]; db['events/current/scores/' + id] = { groupId: i < 2 ? 'g1' : 'g2', holes }; });
    else names.forEach((_, i) => { const holes: Record<string, number> = {}; for (let h = 1; h <= upto; h++) holes['h' + h] = PARS18[h - 1] + offs[i % 4][(h - 1 + i) % 17]; db['events/current/scores/p' + (i + 1)] = { groupId: i < 4 ? 'g1' : 'g2', holes }; });
    db['events/current/members/demo-me'] = { groupId: 'g1' };
  }
  /* The Hickey Tournament's real shape (Will, Nov 26): 4 teams of 3, one team per tee time, scramble. */
  function seedFamily(today: string) {
    db['events/current'] = { ...DEFAULT_EVENT, name: 'Example Scramble', date: today, format: 'scramble', createdAt: 5 } as EventDoc;
    const names = ['Alex Ruiz', 'Jake Miller', 'Tom Ruiz', 'Sam Okafor', 'Ben Carter', 'Lily Okafor', 'Chris Park', 'Matt Doyle', 'Grace Park', 'Jordan Lee', 'Ryan Torres', 'Emma Lee'];
    const tees = ['9:00 AM', '9:10 AM', '9:20 AM', '9:30 AM'];
    db['events/current/roster/main'] = {
      players: Object.fromEntries(names.map((name, i) => ['p' + (i + 1), { name, groupId: 'g' + (Math.floor(i / 3) + 1), teamId: 't' + (Math.floor(i / 3) + 1), side: '', order: i, status: '' }])),
      teams: Object.fromEntries([1, 2, 3, 4].map(k => ['t' + k, { name: 'Team ' + k, groupId: 'g' + k, order: k }])),
    };
    tees.forEach((tee, i) => { db['events/current/groups/g' + (i + 1)] = { name: 'Group ' + (i + 1), tee, start: 1, scorers: i === 0 ? ['demo-me'] : ['x'], submitted: false, order: i }; });
    const offs = [[0, -1, 0, 0, -1, 0, -1, 0, 0, -1], [-1, 0, 0, -1, 0, 0, 0, -1, 0], [0, 0, -1, 0, 0, 1, 0, 0, -1], [0, 0, 0, 0, 1, 0, 0, 0]];
    offs.forEach((o, i) => { const holes: Record<string, number> = {}; o.forEach((d, h) => { holes['h' + (h + 1)] = PARS18[h] + d; }); db['events/current/scores/t' + (i + 1)] = { groupId: 'g' + (i + 1), holes }; });
    db['events/current/members/demo-me'] = { groupId: 'g1' };
  }
  seed('scramble');
  (globalThis as any).__demo = { api, db };
  return api;
}
