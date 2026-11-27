/* Checks the new scoring code against the old events page's (frozen in test/legacy-scoring.js) on random
   events: both must give the same leaderboards, skins and Ryder Cup results. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FORMATS, withDefaults } from '../src/lib/event';
import { cupState, individualRows, outsRows, skinsRows, teamRows, type Ctx } from '../src/lib/scoring';
import type { FormatKey, Group, Player, Team } from '../src/lib/types';

function oldEngine() {
  const body = readFileSync(new URL('./legacy-scoring.js', import.meta.url), 'utf8').replace(/const app = document[^\n]*\n/, '').replace(/const S = \{[\s\S]*?\n\};\n/, '');
  // eslint-disable-next-line no-new-func
  return new Function('S', 'LOCK_FORMAT', 'localStorage', body + '\nreturn {individualRows,teamRows,outsRows,skinsRows,cupState};');
}

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

function randomEvent(format: FormatKey) {
  const holes = rnd() < 0.3 ? 9 : 18;
  const ev = withDefaults({ format, holes, countN: 1 + Math.floor(rnd() * 3), countMode: rnd() < 0.5 ? 'hole' : 'round', skinsCarry: rnd() < 0.7 });
  const groups: Group[] = Array.from({ length: 1 + Math.floor(rnd() * 4) }, (_, i) => ({ id: 'g' + i, name: 'Group ' + (i + 1), order: i, start: rnd() < 0.3 ? 1 + Math.floor(rnd() * holes) : 1 }));
  const teams: Team[] = Array.from({ length: 2 + Math.floor(rnd() * 3) }, (_, i) => ({ id: 't' + i, name: 'Team ' + i, groupId: pick(groups).id, order: i, status: rnd() < 0.1 ? 'WD' : '' }));
  const players: Player[] = Array.from({ length: 2 + Math.floor(rnd() * 9) }, (_, i) => ({ id: 'p' + i, name: 'P' + (i % 4), teamId: pick(teams).id, groupId: pick(groups).id, side: pick(['A', 'B'] as const), order: i, status: rnd() < 0.1 ? pick(['WD', 'DQ']) : '' }));
  groups.forEach(g => { g.aIds = [pick(players).id]; g.bIds = [pick(players).id]; });
  const scores: Ctx['scores'] = {};
  const fill = (id: string, gid: string) => { const h: Record<string, number> = {}; const upto = Math.floor(rnd() * (holes + 3)); for (let i = 1; i <= Math.min(holes, upto); i++) if (rnd() < 0.95) h['h' + i] = 2 + Math.floor(rnd() * 6); scores[id] = { groupId: gid, holes: h }; };
  if (format === 'ryder') groups.forEach(g => { const h: Record<string, string> = {}; const upto = Math.floor(rnd() * (holes + 2)); for (let i = 1; i <= Math.min(holes, upto); i++) h['h' + i] = pick(['A', 'B', 'H']); scores[g.id] = { groupId: g.id, holes: h as any }; });
  else { players.forEach(p => fill(p.id, p.groupId!)); teams.forEach(t => fill(t.id, t.groupId!)); }
  return { ev, players, teams, groups, scores };
}

const strip = (rows: any[]) => [...rows].sort((x, y) => (x.pos || 0) - (y.pos || 0) || String(x.u.id).localeCompare(y.u.id)).map(r => ({ id: r.u.id, pos: r.pos, tie: r.tie, rel: r.rel, strokes: r.strokes, pts: r.pts || 0, thru: r.thru, done: r.done, skins: r.skins, label: r.label }));

describe('same results as the old events page', () => {
  const make = oldEngine();
  for (const format of Object.keys(FORMATS) as FormatKey[]) {
    it(format, () => {
      for (let n = 0; n < 150; n++) {
        const d = randomEvent(format);
        const S = { ev: d.ev, players: d.players, teams: d.teams, groups: d.groups, scores: d.scores };
        const old = make(S, '', null);
        const c: Ctx = d;
        if (format === 'ryder') {
          const a = old.cupState(), b = cupState(c);
          expect({ A: b.A, B: b.B, JA: b.JA, JB: b.JB, winner: b.winner, st: b.st.map(x => [x.label, x.sub]) }).toEqual({ A: a.A, B: a.B, JA: a.JA, JB: a.JB, winner: a.winner, st: a.st.map((x: any) => [x.label, x.sub]) });
        } else if (format === 'skins') {
          const a = old.skinsRows(), b = skinsRows(c);
          expect(strip(b.rows)).toEqual(strip(a.rows)); expect(b.carry).toBe(a.carry);
        } else {
          expect(strip(individualRows(c))).toEqual(strip(old.individualRows()));
          expect(strip(outsRows(c))).toEqual(strip(old.outsRows()));
          if (FORMATS[format].team) expect(strip(teamRows(c))).toEqual(strip(old.teamRows()));
        }
      }
    });
  }
});
