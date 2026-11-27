/* Live pop-ups for people watching the board (Will, Oct 28): when a match changes hands, goes final or is halved, or
   a stroke-play leader changes, a small pop-up says so. Pure: boardSnap() boils the board down to one line per thing
   worth announcing, boardPops() compares two snapshots. No extra reads: it runs on the data the board already has.
   actions.ts (noteBoard) decides when to show them (event live, board visible, not while scoring). */
import { fmtOf, isRyder, isTeam, sideName } from './event';
import { byRound, fmtPar, individualRows, mPlayers, mstatus, teamRows, type Ctx } from './scoring';

export type BoardSnap = Record<string, { sig: string; text: string; side?: 'A' | 'B' }>;
/** One pop-up: its line and, for a Ryder match with a leader, the side that's up (the pop-up takes that side's color). */
export type Pop = { text: string; side?: 'A' | 'B' };

const last = (n: string) => (n || '').trim().split(/\s+/).pop() || n;

export function boardSnap(c: Ctx): BoardSnap {
  const e = c.ev, out: BoardSnap = {};
  if (isRyder(e)) {
    [...c.groups].sort(byRound).forEach((g, i) => {
      const st = mstatus(c, g), n = `Match ${i + 1}`;
      if (!st.thru && !st.final) { out['m:' + g.id] = { sig: '-', text: '' }; return; }
      const side = (k: 'A' | 'B') => mPlayers(c, g, k).map(p => last(p.name)).join(' & ') || sideName(e, k);
      const text = st.final
        ? (st.lead ? `${n} final · ${side(st.lead)} win ${st.label}` : `${n} halved`)
        : (st.lead ? `${n} · ${side(st.lead)} ${st.label}` : `${n} · all square`);
      // The sig only changes when the result does (a hole won, the match ends): a halved hole leaves lead and margin
      // as they were, so it never pops up.
      out['m:' + g.id] = { sig: [st.lead || '', st.label, st.final ? 1 : 0].join('|'), text, side: st.lead || undefined };
    });
    return out;
  }
  if (fmtOf(e) === 'skins') return out;
  const rows = isTeam(e) ? teamRows(c) : individualRows(c), top = rows.filter(r => r.pos === 1);
  if (!top.length) return out;
  const sc = fmtOf(e) === 'stableford' ? `${top[0].pts} pts` : fmtPar(top[0].rel), names = top.map(r => r.u.name);
  const text = top.length === 1 ? `New leader · ${names[0]} ${sc}`
    : top.length <= 3 ? `Tied for the lead · ${names.join(', ')} ${sc}` : `${top.length} tied for the lead at ${sc}`;
  out.lead = { sig: top.map(r => r.u.id).sort().join(','), text };
  return out;
}

/** What changed from prev to next, as pop-up lines. Nothing on the first look (prev null), for things that only
    just appeared, or for a match's first hole. skip(key): leave out (e.g. the scorer's own match). More than 3 changes at once (the page catching
    up after being away) become one line. */
export function boardPops(prev: BoardSnap | null, next: BoardSnap, skip?: (key: string) => boolean): Pop[] {
  if (!prev) return [];
  const ch = Object.keys(next).filter(k => prev[k] && prev[k].sig !== '-' && prev[k].sig !== next[k].sig && next[k].text && !(skip && skip(k)));
  if (ch.length > 3) return [{ text: `Board caught up · ${ch.length} matches changed` }];
  return ch.map(k => next[k].side ? { text: next[k].text, side: next[k].side } : { text: next[k].text });
}
