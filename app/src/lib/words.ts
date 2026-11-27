/* Words and small live numbers for the scoring screens (Nov 21 redesign). Pure: reads the same data as
   lib/scoring.ts and never changes how anything is scored (unit-tested in test/words.test.ts). */
import { fmtAt, fmtOf, nH, parOf } from './event';
import { fmtPts, strokeKey, unitHoles, type Contest, type Ctx, type MatchStatus } from './scoring';
import type { Side, Team } from './types';

/** "Team Blue" -> "Blue" (the header plate and buttons say just the color). */
export const shortSide = (name: string) => String(name || '').replace(/^team\s+/i, '').trim() || name;
export const lastName = (full: string) => String(full || '').trim().split(/\s+/).pop() || '';
export const firstName = (full: string) => String(full || '').trim().split(/\s+/)[0] || '';

/** One letter per side for the hole grid (B / W); A / B if both sides start with the same letter. */
export function sideLetters(a: string, b: string): Record<Side, string> {
  const la = (shortSide(a)[0] || 'A').toUpperCase(), lb = (shortSide(b)[0] || 'B').toUpperCase();
  return la === lb ? { A: 'A', B: 'B' } : { A: la, B: lb };
}

/** How far up, and holes left, from a contest's status (its label is "2 UP", "AS", "3&2", "By 4", ...). */
export function upLeft(st: MatchStatus): { up: number; left: number } {
  const left = Math.max(0, st.seq.length - st.thru), m = /(\d+)/.exec(st.label || '');
  return { up: st.lead && m ? +m[1] : 0, left };
}

export interface Words { big: string; sub: string; dormie: boolean; up: number; left: number }
/**
 * A contest's standing in words: "Blue 2 up", "All square", "Blue win 4&3", "Miller wins 2 up", "Halved",
 * stroke play "Blue by 3" / "Level" / "Blue win by 3". `who(k)` names a side; `one(k)` = that side is one player.
 */
export function matchWords(st: MatchStatus, stroke: boolean, who: (k: Side) => string, one: (k: Side) => boolean): Words {
  const { up, left } = upLeft(st), win = (k: Side) => (one(k) ? 'wins' : 'win');
  if (!st.thru) return { big: 'Not started', sub: '', dormie: false, up, left };
  if (st.final) {
    if (!st.lead) return { big: 'Halved', sub: 'Final', dormie: false, up, left };
    const by = stroke ? `by ${up}` : left > 0 ? `${up}&${left}` : `${up} up`;
    return { big: `${who(st.lead)} ${win(st.lead)} ${by}`, sub: 'Final', dormie: false, up, left };
  }
  if (stroke) return { big: st.lead ? `${who(st.lead)} by ${up}` : 'Level', sub: `thru ${st.thru}`, dormie: false, up, left };
  return { big: st.lead ? `${who(st.lead)} ${up} up` : 'All square', sub: `thru ${st.thru}`, dormie: !!st.lead && up === left && left > 0, up, left };
}

/** A card with several matches: the points, "1 – 0", with "Points · thru 9" / "Points · final". */
export function pointsWords(st: MatchStatus): { big: string; sub: string } {
  if (st.sub === 'Not started') return { big: '0 – 0', sub: 'Points · not started' };
  const a = st.final ? st.pa : st.ja, b = st.final ? st.pb : st.jb;
  return { big: `${fmtPts(a)} – ${fmtPts(b)}`, sub: st.final ? 'Points · final' : `Points · thru ${st.thru}` };
}

/** Stroke-play contest on a match card: each side's strokes over the holes played so far (every player in). */
export function strokeTotals(c: Ctx, gid: string, ct: Contest): { a: number; b: number; thru: number } {
  const hs = unitHoles(c, gid); let a = 0, b = 0, thru = 0;
  for (const h of ct.holes) {
    const v = [...ct.a, ...ct.b].map(pid => +(hs[strokeKey(h, pid)] as number) || 0);
    if (!v.length || v.some(x => !x)) break;
    thru++; a += v.slice(0, ct.a.length).reduce((x, y) => x + y, 0); b += v.slice(ct.a.length).reduce((x, y) => x + y, 0);
  }
  return { a, b, thru };
}

/** This side's strokes on one hole (null until every player on the side has one). */
export function sideHole(c: Ctx, gid: string, pids: string[], h: number): number | null {
  const hs = unitHoles(c, gid), v = pids.map(pid => +(hs[strokeKey(h, pid)] as number) || 0);
  return v.length && v.every(x => x > 0) ? v.reduce((x, y) => x + y, 0) : null;
}

/** Team formats (team stroke play, shamble, best ball): the scores that count on hole h right now.
    need = how many count (best ball 1, else countN); `use` = the lowest `need` scores entered. */
export function countingAt(c: Ctx, t: Team, h: number): { need: number; got: number; total: number; use: { id: string; v: number }[]; sum: number; ok: boolean } {
  const e = c.ev, members = c.players.filter(p => p.teamId === t.id && !p.status);
  const need = Math.min(fmtAt(e, h) === 'bestball' ? 1 : Math.max(1, +e.countN || 1), members.length || 1);
  const vs = members.map(p => ({ id: p.id, v: +(unitHoles(c, p.id)['h' + h] as number) || 0 })).filter(x => x.v > 0).sort((a, b) => a.v - b.v);
  const use = vs.slice(0, need);
  return { need, got: vs.length, total: members.length, use, sum: use.reduce((s, x) => s + x.v, 0), ok: vs.length >= need };
}

/** Skins on hole h, the same way skinsRows counts them (every active player in the event, carry-overs if on).
    worth = skins this hole is worth; decided once every player has a score; winner = the one low score. */
export function skinAt(c: Ctx, h: number): { worth: number; carry: number; decided: boolean; lo: number; winner: string | null } {
  const act = c.players.filter(p => !p.status), val = (pid: string, x: number) => +(unitHoles(c, pid)['h' + x] as number) || 0;
  let carry = 0;
  for (let x = 1; x < Math.min(h, nH(c.ev) + 1); x++) {
    const v = act.map(p => val(p.id, x));
    if (!act.length || v.some(n => !n)) continue;
    const lo = Math.min(...v);
    if (v.filter(n => n === lo).length === 1) carry = 0; else if (c.ev.skinsCarry) carry++;
  }
  const v = act.map(p => ({ id: p.id, n: val(p.id, h) })), decided = act.length > 0 && v.every(x => x.n > 0);
  const lo = decided ? Math.min(...v.map(x => x.n)) : 0, w = decided ? v.filter(x => x.n === lo) : [];
  return { worth: 1 + carry, carry, decided, lo, winner: w.length === 1 ? w[0].id : null };
}

/** Stableford points for a score on hole h (par 2, birdie 3, ...; double or worse 0). */
export const stabPts = (c: Ctx, h: number, v: number) => (v > 0 ? Math.max(0, 2 + parOf(c.ev, h) - v) : 0);
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const isStab = (c: Ctx) => fmtOf(c.ev) === 'stableford';

/** Column names for the review card: first names, with the last initial when two players share one. */
export function shortNames(names: string[]): string[] {
  const f = names.map(firstName);
  return names.map((n, i) => (f.filter(x => x === f[i]).length > 1 && lastName(n) !== f[i] ? `${f[i]} ${lastName(n)[0]}.` : f[i] || n));
}
