/* All the scoring math, as pure functions of the event data (unit-tested in test/scoring.test.ts).
   Same rules as the old events page: nothing here reads the database or the screen. */
import { MTYPES, fmtAt, fmtOf, nH, oneBall, oneBallAt, parOf, playerBall, splitOn } from './event';
import type { EventDoc, Group, MatchLayout, MatchResult, MatchType, Player, ScoreDoc, Side, Team, Unit } from './types';

export interface Ctx { ev: EventDoc; players: Player[]; teams: Team[]; groups: Group[]; scores: Record<string, ScoreDoc> }

export interface Line { u: Unit; strokes: number; rel: number; pts: number; thru: number; done: boolean; label?: string; counting?: string[]; nines?: [number, number] }
export interface Row extends Line { key: number; pos: number; tie: boolean; skins?: number; won?: number[] }

export const byOrder = (a: { order?: number }, b: { order?: number }) => (+(a.order || 0)) - (+(b.order || 0));

/** Ryder rounds: a match's round (missing = 1). Matches sort by round, then by their order. */
export const roundOf = (g: Pick<Group, 'round'>) => Math.max(1, Math.floor(+(g.round || 1)) || 1);
export const byRound = (a: Group, b: Group) => roundOf(a) - roundOf(b) || byOrder(a, b);
/**
 * Which other match in the same round already has this player, as its index in `ms` (-1 if none).
 * The slot being edited (gid, side k, place i) doesn't count, so a player can stay where they are.
 */
export function matchWith(ms: Group[], pid: string, gid: string, k: 'A' | 'B', i: number): number {
  const round = roundOf(ms.find(g => g.id === gid) || {});
  return ms.findIndex(g => roundOf(g) === round && (['A', 'B'] as const).some(kk =>
    ((kk === 'A' ? g.aIds : g.bIds) || []).some((x, j) => x === pid && !(g.id === gid && kk === k && j === i))));
}
export const fmtPar = (n: number) => (n === 0 ? 'E' : n > 0 ? '+' + n : '' + n);
/** Points to the nearest quarter: 1½, ¼ (a halved four-ball split between partners), 2¾. */
export const fmtPts = (n: number) => {
  const q = Math.round(n * 4), w = Math.floor(q / 4), f = ['', '¼', '½', '¾'][q % 4];
  return (w || !f ? String(w) : '') + f;
};

export const unitHoles = (c: Ctx, id: string) => (c.scores[id] || {}).holes || {};

/** The holes where this unit enters its own score: every hole, or with a split format only the nine where
    players (or, for a team, the team) play their own ball. */
export function ownHoles(c: Ctx, u: Unit): number[] {
  const hs = Array.from({ length: nH(c.ev) }, (_, i) => i + 1);
  if (!splitOn(c.ev)) return hs;
  const team = c.teams.some(t => t.id === u.id);
  return hs.filter(h => oneBallAt(c.ev, h) === team);
}

/** Strokes, score to par, Stableford points and holes played for one player (or one-ball team). */
export function line(c: Ctx, u: Unit): Line {
  const h = unitHoles(c, u.id), own = ownHoles(c, u); let strokes = 0, rel = 0, thru = 0, pts = 0;
  for (const i of own) {
    const v = +(h['h' + i] as number);
    if (v > 0) { const p = parOf(c.ev, i); strokes += v; rel += v - p; pts += Math.max(0, 2 + p - v); thru++; }
  }
  return { u, strokes, rel, pts, thru, done: own.length > 0 && thru === own.length };
}

/** A team's score from its players' own balls (team stroke play, best ball, shamble). */
export function teamLine(c: Ctx, t: Team): Line {
  const members = c.players.filter(p => p.teamId === t.id && !p.status);
  const e = c.ev, f = fmtOf(e);
  const X = f === 'bestball' ? 1 : Math.max(1, +e.countN || 1); // team + shamble use countN
  if (f === 'team' && e.countMode === 'round' && !splitOn(e)) { // a split round always counts per hole
    const ls = members.map(p => line(c, p)).filter(l => l.thru > 0).sort((a, b) => a.rel - b.rel || b.thru - a.thru);
    const cnt = ls.slice(0, X);
    return {
      u: t, rel: cnt.reduce((a, l) => a + l.rel, 0), strokes: cnt.reduce((a, l) => a + l.strokes, 0), pts: 0, thru: cnt.length,
      label: `${cnt.length}/${Math.min(X, members.length) || X}`,
      done: members.length > 0 && members.every(p => line(c, p).done), counting: cnt.map(l => l.u.id),
    };
  }
  const split = splitOn(e), nines: [number, number] = [0, 0]; let rel = 0, strokes = 0, thru = 0;
  for (let i = 1; i <= nH(e); i++) {
    // with a split format each hole is counted the way its own nine is played
    const fi = fmtAt(e, i), Xi = fi === 'bestball' ? 1 : Math.max(1, +e.countN || 1);
    let s = 0, k = 1, got = false;
    if (split && oneBallAt(e, i)) { const v = +(unitHoles(c, t.id)['h' + i] as number); if (v > 0) { s = v; got = true; } }
    else {
      k = split ? Math.min(Xi, members.length || Xi) : Math.min(X, members.length || X);
      const vals = members.map(p => +(unitHoles(c, p.id)['h' + i] as number)).filter(v => v > 0).sort((a, b) => a - b);
      if (members.length && vals.length >= k) { s = vals.slice(0, k).reduce((a, b) => a + b, 0); got = true; }
    }
    if (got) { const d = s - k * parOf(e, i); strokes += s; rel += d; thru++; nines[i <= 9 ? 0 : 1] += d; }
  }
  return { u: t, rel, strokes, pts: 0, thru, done: thru === nH(e), ...(split ? { nines } : {}) };
}

/** Sort and number rows: ties share a position (T2), more holes played breaks nothing but sorts first. */
export function rank(rows: (Line & { key: number; skins?: number; won?: number[] })[], desc: boolean): Row[] {
  rows.sort((a, b) => (desc ? (b.key - a.key || b.thru - a.thru) : (a.key - b.key || b.thru - a.thru)) || String(a.u.name).localeCompare(b.u.name));
  let pos = 0, prev: number | null = null;
  const out = rows as Row[];
  out.forEach((r, i) => { if (prev === null || r.key !== prev) { pos = i + 1; prev = r.key; } r.pos = pos; });
  out.forEach(r => { r.tie = out.filter(x => x.pos === r.pos).length > 1; });
  return out;
}

export function individualRows(c: Ctx): Row[] {
  const stab = fmtOf(c.ev) === 'stableford';
  return rank(c.players.filter(p => !p.status).map(p => line(c, p)).filter(r => r.thru > 0).map(r => ({ ...r, key: stab ? r.pts : r.rel })), stab);
}
export function teamRows(c: Ctx): Row[] {
  const rows = oneBall(c.ev) && !splitOn(c.ev) ? c.teams.filter(t => !t.status).map(t => line(c, t)) : c.teams.map(t => teamLine(c, t));
  return rank(rows.filter(r => r.thru > 0).map(r => ({ ...r, key: r.rel })), false);
}
/** Withdrawn / disqualified players (or one-ball teams), listed under the board. */
export const outsRows = (c: Ctx): Line[] => (oneBall(c.ev) && !splitOn(c.ev) ? c.teams.filter(t => t.status).map(t => line(c, t)) : c.players.filter(p => p.status).map(p => line(c, p)));

export function skinsRows(c: Ctx): { rows: Row[]; carry: number } {
  const act = c.players.filter(p => !p.status); const won: Record<string, number> = {}, holes: Record<string, number[]> = {}; let carry = 0;
  act.forEach(p => { won[p.id] = 0; holes[p.id] = []; });
  for (let h = 1; h <= nH(c.ev); h++) {
    const v = act.map(p => [p, +(unitHoles(c, p.id)['h' + h] as number) || 0] as const);
    if (!act.length || v.some(x => !x[1])) continue;
    const lo = Math.min(...v.map(x => x[1])); const w = v.filter(x => x[1] === lo);
    if (w.length === 1) { won[w[0][0].id] += 1 + carry; holes[w[0][0].id].push(h); carry = 0; } else if (c.ev.skinsCarry) carry++;
  }
  const rows = rank(act.map(p => line(c, p)).filter(r => r.thru > 0).map(r => ({ ...r, key: won[r.u.id], skins: won[r.u.id], won: holes[r.u.id] })), true);
  return { rows, carry };
}

/* ---- Ryder Cup: each group is a match; scores/{groupId}.holes = 'A' | 'B' | 'H' ---- */
export const mPlayers = (c: Ctx, g: Group, k: Side) => ((k === 'A' ? g.aIds : g.bIds) || []).map(id => c.players.find(p => p.id === id)).filter(Boolean) as Player[];
export const mNames = (c: Ctx, g: Group, k: Side) => mPlayers(c, g, k).map(p => p.name).join(' & ') || 'TBD';

/** Hole order for a group, starting from its starting hole and wrapping around. */
export function holeSeq(e: EventDoc, start?: number) { const n = nH(e), s = Math.min(n, Math.max(1, +(start || 1))); return Array.from({ length: n }, (_, i) => ((s - 1 + i) % n) + 1); }

export interface MatchStatus { thru: number; lead: Side | null; final: boolean; label: string; sub: string; pa: number; pb: number; ja: number; jb: number; seq: number[]; next: number | null; total: number }

/* A Ryder Cup match card can hold more than one contest (Will, Oct 19): e.g. 2 v 2 four-ball on the front nine,
   then the same four play two 1 v 1 matches on the back. The foursome stays one card (one scorer phone, one code);
   each contest has its own holes, players and points. A card with no layout set is one contest over every hole,
   worth 1 point: exactly the old behavior. */
export interface Contest {
  part: 'all' | 'front' | 'back';
  type: MatchType;
  a: string[]; b: string[];
  pts: number;
  holes: number[];   // in play order (from the card's starting hole)
  suffix: string;    // result key suffix: '' -> h12, '_2' -> h12_2 (the second back-nine singles)
}
const ids = (v?: string[]) => (v || []).filter(Boolean);
export const layoutOf = (e: EventDoc, g: Group): MatchLayout => (nH(e) === 18 && g.layout && ['front', 'back', 'split'].includes(g.layout) ? g.layout : 'all');

export function contestsOf(e: EventDoc, g: Group): Contest[] {
  const seq = holeSeq(e, g.start), lay = layoutOf(e, g), pts = +(g.pts ?? 1) > 0 ? +(g.pts ?? 1) : 1;
  const a = ids(g.aIds), b = ids(g.bIds), t1: MatchType = g.mtype || 'singles';
  const part = (p: 'front' | 'back') => seq.filter(h => (p === 'front' ? h <= 9 : h >= 10));
  if (lay === 'all') return [{ part: 'all', type: t1, a, b, pts, holes: seq, suffix: '' }];
  if (lay === 'front' || lay === 'back') return [{ part: lay, type: t1, a, b, pts, holes: part(lay), suffix: '' }];
  const out: Contest[] = [{ part: 'front', type: t1, a, b, pts, holes: part('front'), suffix: '' }];
  const t2: MatchType = g.mtype2 || 'singles', back = part('back');
  // singles / stroke play singles from a 2 v 2: two 1 v 1 matches (stroke play singles: lower nine-hole total wins)
  const one: MatchType = t2 === 'strokesingles' ? 'stroke' : t2;
  if ((t2 === 'singles' || t2 === 'strokesingles') && a.length >= 2 && b.length >= 2) {
    const [b1, b2] = g.cross ? [b[1], b[0]] : [b[0], b[1]];
    out.push({ part: 'back', type: one, a: [a[0]], b: [b1], pts, holes: back, suffix: '' }, { part: 'back', type: one, a: [a[1]], b: [b2], pts, holes: back, suffix: '_2' });
  } else out.push({ part: 'back', type: one, a, b, pts, holes: back, suffix: '' });
  return out;
}
/** Where a contest's result for hole h is saved in scores/{match id}.holes. */
export const resultKey = (ct: Contest, h: number) => 'h' + h + ct.suffix;
/** Where a player's strokes on hole h are saved, for stroke-play contests. */
export const strokeKey = (h: number, pid: string) => 's' + h + '_' + pid;
export const PARTS: Record<Contest['part'], string> = { all: '', front: 'Front 9', back: 'Back 9' };

/** One contest's standing: match play (hole won/lost/halved) or stroke play (each side's total over its holes). */
export function contestStatus(c: Ctx, g: Group, ct: Contest): MatchStatus {
  const h = unitHoles(c, g.id), seq = ct.holes, n = seq.length, P = ct.pts;
  let diff = 0, thru = 0, closed = false;
  if (ct.type === 'stroke') {
    const who = [...ct.a, ...ct.b];
    for (let k = 0; k < n && who.length; k++) {
      const v = who.map(pid => +(h[strokeKey(seq[k], pid)] as number) || 0);
      if (v.some(x => !x)) break;
      thru = k + 1; diff += v.slice(ct.a.length).reduce((x, y) => x + y, 0) - v.slice(0, ct.a.length).reduce((x, y) => x + y, 0);
    }
  } else {
    for (let k = 0; k < n; k++) {
      const v = h[resultKey(ct, seq[k])] as MatchResult | undefined;
      if (v !== 'A' && v !== 'B' && v !== 'H') break;
      thru = k + 1; if (v === 'A') diff++; else if (v === 'B') diff--;
      if (Math.abs(diff) > n - thru) { closed = true; break; }
    }
  }
  const left = n - thru, lead: Side | null = diff > 0 ? 'A' : diff < 0 ? 'B' : null, final = n > 0 && (closed || thru === n);
  let label: string, sub: string, pa = 0, pb = 0;
  if (thru === 0) { label = '—'; sub = 'Not started'; }
  else if (final) {
    if (!lead) { label = 'Halved'; pa = pb = P / 2; }
    else { label = ct.type === 'stroke' ? `Won by ${Math.abs(diff)}` : left > 0 ? `${Math.abs(diff)}&${left}` : `${Math.abs(diff)} UP`; if (lead === 'A') pa = P; else pb = P; }
    sub = 'Final';
  } else if (ct.type === 'stroke') { label = lead ? `By ${Math.abs(diff)}` : 'Level'; sub = `Thru ${thru}`; }
  else { label = lead ? `${Math.abs(diff)} UP` : 'AS'; sub = `Thru ${thru}` + (lead && Math.abs(diff) === left ? ' · Dormie' : ''); }
  let ja = pa, jb = pb;
  if (!final && thru > 0) { if (!lead) { ja = jb = P / 2; } else if (lead === 'A') ja = P; else jb = P; }
  return { thru, lead, final, label, sub, pa, pb, ja, jb, seq, next: final ? null : seq[thru] ?? null, total: P };
}

/** Is this hole still to be played for this contest (not after the match was decided)? */
export const contestLive = (st: MatchStatus, h: number) => !st.final || st.seq.indexOf(h) < st.thru;
/** Has this contest got everything it needs for hole h? */
export function contestHasHole(c: Ctx, g: Group, ct: Contest, h: number) {
  const hs = unitHoles(c, g.id);
  return ct.type === 'stroke' ? [...ct.a, ...ct.b].every(pid => +(hs[strokeKey(h, pid)] as number) > 0) : ['A', 'B', 'H'].includes(hs[resultKey(ct, h)] as string);
}

/** A whole match card: one contest = that contest's status (the old behavior); several = points added up. */
export function mstatus(c: Ctx, g: Group): MatchStatus {
  const cts = contestsOf(c.ev, g);
  if (cts.length === 1) return contestStatus(c, g, cts[0]);
  const st = cts.map(ct => contestStatus(c, g, ct)), sum = (f: (x: MatchStatus) => number) => st.reduce((t, x) => t + f(x), 0);
  const pa = sum(x => x.pa), pb = sum(x => x.pb), ja = sum(x => x.ja), jb = sum(x => x.jb), total = sum(x => x.total);
  const final = st.every(x => x.final), seq = cardHoles(c.ev, g);
  // holes done = holes in play order where every contest playing that hole has its result (or is already decided)
  let thru = 0;
  for (const h of seq) { if (cts.every((ct, i) => !ct.holes.includes(h) || !contestLive(st[i], h) || contestHasHole(c, g, ct, h))) thru++; else break; }
  const lead: Side | null = ja > jb ? 'A' : jb > ja ? 'B' : null;
  const started = st.some(x => x.thru > 0);
  return {
    thru, lead, final, seq, total, pa, pb, ja, jb,
    label: started ? `${fmtPts(final ? pa : ja)}–${fmtPts(final ? pb : jb)}` : '—',
    sub: final ? 'Final' : started ? `Thru ${thru}` : 'Not started',
    next: final ? null : seq[thru] ?? null,
  };
}
/** Has anything been scored on this match card? Then its setup is locked (see MatchLayoutFields), because results
    are saved per contest and changing the setup would hand them to different matches. */
export const hasCardScores = (c: Ctx, g: Group) => Object.values(unitHoles(c, g.id)).some(v => v !== null && v !== undefined && String(v) !== '');

/** The holes a match card plays, in play order. */
export const cardHoles = (e: EventDoc, g: Group) => { const hs = new Set(contestsOf(e, g).flatMap(ct => ct.holes)); return holeSeq(e, g.start).filter(h => hs.has(h)); };
/** "Four-ball", "Front 9 · Four-ball", "Four-ball → Singles". */
export function cardLabel(e: EventDoc, g: Group) {
  const t = (m?: MatchType) => MTYPES[m || 'singles'] || 'Singles', lay = layoutOf(e, g);
  return lay === 'all' ? t(g.mtype) : lay === 'split' ? `${t(g.mtype)} → ${t(g.mtype2 || 'singles')}` : `${PARTS[lay]} · ${t(g.mtype)}`;
}
export const namesOf = (c: Ctx, pids: string[]) => pids.map(id => c.players.find(p => p.id === id)?.name).filter(Boolean).join(' & ') || 'TBD';

/** Player points (Will, Oct 19): every match a player is in, won / lost / halved, and points. A pair splits its
    match's points (a four-ball win = ½ each; a halved four-ball = ¼ each), so the players add up to the team score.
    Only finished matches count; `live` = matches still being played. */
export interface PlayerPoints { p: Player; side: Side; pts: number; w: number; l: number; h: number; live: number }
export function playerPoints(c: Ctx): PlayerPoints[] {
  const out = new Map<string, PlayerPoints>();
  for (const g of [...c.groups].sort(byOrder)) for (const ct of contestsOf(c.ev, g)) {
    const st = contestStatus(c, g, ct);
    ([['A', ct.a], ['B', ct.b]] as const).forEach(([k, pids]) => pids.forEach(id => {
      const p = c.players.find(x => x.id === id); if (!p) return;
      const r = out.get(id) || { p, side: k, pts: 0, w: 0, l: 0, h: 0, live: 0 }; out.set(id, r);
      if (!st.final) { if (st.thru > 0) r.live++; return; }
      const mine = (k === 'A' ? st.pa : st.pb) / pids.length;
      r.pts += mine; if (!st.lead) r.h++; else if (st.lead === k) r.w++; else r.l++;
    }));
  }
  return [...out.values()].sort((x, y) => y.pts - x.pts || y.w - x.w || x.p.name.localeCompare(y.p.name));
}
/** "2–0–1" (won–lost–halved). */
export const recordOf = (r: PlayerPoints) => `${r.w}–${r.l}–${r.h}`;

export interface CupState { ms: Group[]; st: MatchStatus[]; A: number; B: number; JA: number; JB: number; n: number; toWin: number; winner: Side | null; allFinal: boolean; playing: number; halved: boolean }

/** n = points on offer (1 per match unless a match is worth more, and each back-nine singles counts). */
export function cupState(c: Ctx): CupState {
  const ms = [...c.groups].sort(byOrder), st = ms.map(g => mstatus(c, g));
  const sum = (f: (x: MatchStatus) => number) => st.reduce((s, x) => s + f(x), 0);
  const A = sum(x => x.pa), B = sum(x => x.pb), JA = sum(x => x.ja), JB = sum(x => x.jb);
  const n = sum(x => x.total), toWin = n ? n / 2 + 0.5 : 0, winner: Side | null = n ? (A >= toWin ? 'A' : B >= toWin ? 'B' : null) : null;
  const allFinal = ms.length > 0 && st.every(x => x.final), playing = st.filter(x => !x.final).length;
  return { ms, st, A, B, JA, JB, n, toWin, winner, allFinal, playing, halved: allFinal && !winner };
}

/** Is every hole in for this group (or is the match decided)? */
export function groupDone(c: Ctx, g: Group | undefined): boolean {
  if (!g) return false;
  if (fmtOf(c.ev) === 'ryder') return mstatus(c, g).final;
  const us = unitsIn(c, g.id);
  return us.length > 0 && us.every(u => line(c, u).done);
}

/** The scoring units in a group: players, or teams in a scramble / alternate shot. Ryder matches have none.
    With a split format: the players, then the teams (each enters scores on its own nine). */
export const unitsIn = (c: Ctx, gid: string): Unit[] => {
  if (fmtOf(c.ev) === 'ryder') return [];
  const ps = c.players.filter(p => p.groupId === gid).sort(byOrder), ts = c.teams.filter(t => t.groupId === gid).sort(byOrder);
  if (splitOn(c.ev)) return [...ps, ...ts];
  return oneBall(c.ev) ? ts : ps;
};
/** Who enters a score on hole h in this group. */
export const unitsAt = (c: Ctx, gid: string, h: number): Unit[] => (splitOn(c.ev) ? unitsIn(c, gid).filter(u => c.teams.some(t => t.id === u.id) === oneBallAt(c.ev, h)) : unitsIn(c, gid));
export const playersIn = (c: Ctx, gid: string) => c.players.filter(p => p.groupId === gid).sort(byOrder);

/** Name for a stroke relative to par, used on the scoring screen. */
export const scoreName = (d: number) => (d === 0 ? 'Par' : d === -1 ? 'Birdie' : d === -2 ? 'Eagle' : d === 1 ? 'Bogey' : d === 2 ? 'Double' : fmtPar(d));

/** Results as CSV text (same columns as the old export). */
export function resultsCsv(c: Ctx, sideNames: [string, string], typeName: (g: Group) => string): string {
  const n = nH(c.ev), f = fmtOf(c.ev), cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`, out: string[] = [];
  const block = (title: string, rows: (Line & { pos?: number; tie?: boolean })[], kind: string) => {
    out.push(cell(title));
    out.push(['Pos', 'Name', kind === 'pts' ? 'Points' : 'To par', 'Strokes', 'Thru', ...Array.from({ length: n }, (_, i) => 'H' + (i + 1))].map(cell).join(','));
    rows.forEach(r => { const h = unitHoles(c, r.u.id); out.push([r.pos ? (r.tie ? 'T' : '') + r.pos : (r.u.status || ''), r.u.name, kind === 'pts' ? r.pts : (r.thru ? fmtPar(r.rel) : ''), r.strokes || '', r.thru, ...Array.from({ length: n }, (_, i) => h['h' + (i + 1)] || '')].map(cell).join(',')); });
    out.push('');
  };
  if (f === 'ryder') {
    // one line per contest: a match split at the turn gives its front nine and each back-nine match a line
    // a Round column only once there's more than one round, so a one-round cup's spreadsheet is unchanged
    const multi = new Set(c.groups.map(roundOf)).size > 1;
    out.push([...(multi ? ['Round'] : []), 'Match', 'Holes', 'Type', sideNames[0], sideNames[1], 'Result', 'Winner', 'Points'].map(cell).join(','));
    const num = new Map([...c.groups].sort(byOrder).map((g, i) => [g.id, i + 1]));
    [...c.groups].sort(multi ? byRound : byOrder).forEach(g => contestsOf(c.ev, g).forEach(ct => {
      const st = contestStatus(c, g, ct), all = ct.part === 'all';
      out.push([...(multi ? [roundOf(g)] : []), num.get(g.id), all ? 'All' : PARTS[ct.part], all ? typeName(g) : MTYPES[ct.type], all ? mNames(c, g, 'A') : namesOf(c, ct.a), all ? mNames(c, g, 'B') : namesOf(c, ct.b),
        st.label + ' ' + st.sub, st.final ? (st.lead ? sideNames[st.lead === 'A' ? 0 : 1] : 'Halved') : '', st.final ? `${fmtPts(st.pa)}-${fmtPts(st.pb)}` : ''].map(cell).join(','));
    }));
    out.push('', cell('Player points'), ['Player', 'Side', 'Won', 'Lost', 'Halved', 'Points'].map(cell).join(','));
    playerPoints(c).forEach(r => out.push([r.p.name, sideNames[r.side === 'A' ? 0 : 1], r.w, r.l, r.h, fmtPts(r.pts)].map(cell).join(',')));
  } else if (f === 'skins') block('Skins', skinsRows(c).rows, 'par');
  else if (FORMAT_TEAM(f)) block('Teams', teamRows(c), 'team');
  if (playerBall(c.ev) && f !== 'ryder' && f !== 'skins') block('Individual', [...individualRows(c), ...outsRows(c)], f === 'stableford' ? 'pts' : 'par');
  return out.join('\n');
}
const FORMAT_TEAM = (f: string) => ['team', 'bestball', 'scramble', 'shamble', 'altshot'].includes(f);
