import type { EventDoc, FormatKey, MatchType, Side } from './types';

/* A standard par 72 until the exec sets the real course's pars (Settings → Round). */
export const PARS18 = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 5, 3, 4, 4];

export const FORMATS: Record<FormatKey, { label: string; short: string; team: boolean; desc: string }> = {
  stroke: { label: 'Stroke play', short: 'Stroke play', team: false, desc: 'Everyone plays their own ball. Lowest score wins.' },
  stableford: { label: 'Stableford', short: 'Stableford', team: false, desc: 'Points per hole: par 2, birdie 3, eagle 4, bogey 1, double or worse 0. Most points wins.' },
  team: { label: 'Team stroke play', short: 'Team stroke', team: true, desc: 'Everyone plays their own ball. The team counts its best scores.' },
  bestball: { label: 'Best ball', short: 'Best ball', team: true, desc: 'Everyone plays their own ball. The team takes the single best score on each hole.' },
  scramble: { label: 'Scramble', short: 'Scramble', team: true, desc: 'The team plays one ball and enters one score per hole.' },
  shamble: { label: 'Shamble', short: 'Shamble', team: true, desc: 'Everyone tees off, the team picks the best drive, then each player plays their own ball in. The team counts its best scores on each hole.' },
  altshot: { label: 'Alternate shot', short: 'Alt shot', team: true, desc: 'Partners play one ball, taking turns. One score per team.' },
  skins: { label: 'Skins', short: 'Skins', team: false, desc: 'The lowest score on a hole wins a skin, but only if nobody ties it. Holes are decided once every player has a score.' },
  ryder: { label: 'Ryder Cup', short: 'Ryder Cup', team: true, desc: 'Two sides play head-to-head matches (singles, four-ball or alternate shot), hole by hole. 1 point per match won, ½ for a halved match.' },
};

export const MTYPES: Record<MatchType, string> = { singles: 'Singles', fourball: 'Four-ball', foursomes: 'Alternate shot', scramble: 'Scramble', stroke: 'Stroke play', strokesingles: 'Stroke play singles' };

/* Team colors (Ryder Cup format) */
export const SW: Record<string, { c: string; on: string; el: string; ed: string; bar: string; n: string }> = {
  royal: { c: '#003594', on: '#ffffff', el: '#003594', ed: 'rgba(187,188,188,.7)', bar: '#3d7be8', n: 'Blue' },
  navy: { c: '#041e42', on: '#ffffff', el: '#041e42', ed: 'rgba(187,188,188,.7)', bar: '#7f9cc9', n: 'Navy' },
  white: { c: '#ffffff', on: '#041e42', el: '#041e42', ed: '#ffffff', bar: '#ffffff', n: 'White' },
  gray: { c: '#bbbcbc', on: '#041e42', el: '#8d8f8f', ed: '#bbbcbc', bar: '#bbbcbc', n: 'Gray' },
  black: { c: '#000000', on: '#ffffff', el: '#000000', ed: 'rgba(187,188,188,.7)', bar: '#000000', n: 'Black' },
  red: { c: '#c8102e', on: '#ffffff', el: '#c8102e', ed: 'rgba(255,255,255,.75)', bar: '#e4344a', n: 'Red' },
};

export const DEFAULT_EVENT: EventDoc = {
  name: 'The Hickey Tournament', date: '', course: 'Crosswinds Golf Club', holes: 18, pars: PARS18, format: 'scramble', colorA: 'royal', colorB: 'white',
  countN: 2, countMode: 'hole', showIndividual: true, skinsCarry: true, sideA: 'Team Blue', sideB: 'Team White',
  visibility: 'live', revealAt: 0, show: 'full', codes: false, messaging: true, locked: false, listed: true, createdAt: 0,
  eyebrow: 'Hickey Tournament', bandColor: '#14532d', logo: 'none',
};

/** The event with every missing field filled in. */
export const withDefaults = (e: Partial<EventDoc> | null | undefined): EventDoc => ({ ...DEFAULT_EVENT, ...(e || {}) } as EventDoc);
export const fmtOf = (e: EventDoc): FormatKey => (e.format in FORMATS ? e.format : 'stroke');
export const isRyder = (e: EventDoc) => fmtOf(e) === 'ryder';
export const isTeam = (e: EventDoc) => FORMATS[fmtOf(e)].team;
export const oneBall = (e: EventDoc) => ['scramble', 'altshot'].includes(fmtOf(e));
export const nH = (e: EventDoc) => (+e.holes === 9 ? 9 : 18);

/* Split formats (Will, Oct 19): a team event can play the back nine in another team format, e.g. best ball on the
   front, scramble on the back. The format belongs to the hole number (a group starting on 10 plays the back-nine
   format first). Teams stay the same all round. */
export const TEAM_FORMATS: FormatKey[] = ['team', 'bestball', 'scramble', 'shamble', 'altshot'];
export const splitOn = (e: EventDoc) => nH(e) === 18 && TEAM_FORMATS.includes(fmtOf(e)) && !!e.format2 && TEAM_FORMATS.includes(e.format2) && e.format2 !== fmtOf(e);
/** The format played on hole h. */
export const fmtAt = (e: EventDoc, h: number): FormatKey => (splitOn(e) && h >= 10 ? e.format2! : fmtOf(e));
/** One score per team on hole h (scramble, alternate shot). */
export const oneBallAt = (e: EventDoc, h: number) => ['scramble', 'altshot'].includes(fmtAt(e, h));
const allHoles = (e: EventDoc) => Array.from({ length: nH(e) }, (_, i) => i + 1);
/** Teams enter their own scores somewhere in the round (so teams need a group). */
export const teamBall = (e: EventDoc) => allHoles(e).some(h => oneBallAt(e, h));
/** Players enter their own scores somewhere in the round (so there's an individual board). */
export const playerBall = (e: EventDoc) => allHoles(e).some(h => !oneBallAt(e, h));
export const parOf = (e: EventDoc, h: number) => +((e.pars || PARS18)[h - 1]) || 4;
export const sideName = (e: EventDoc, k: Side) => (k === 'A' ? e.sideA : e.sideB) || (k === 'A' ? 'Team Blue' : 'Team White');

/** The one-line format summary under the event name. */
export function formatLine(e: EventDoc) {
  const f = fmtOf(e);
  const extra = f === 'team' ? ` · best ${+e.countN || 2} ${e.countMode === 'round' ? 'rounds' : 'per hole'}`
    : f === 'shamble' ? ` · best ${+e.countN || 2} per hole`
    : f === 'ryder' ? ` · ${sideName(e, 'A')} vs ${sideName(e, 'B')}` : '';
  if (splitOn(e)) {
    const f2 = e.format2!, cnt = [f, f2].some(x => x === 'team' || x === 'shamble') ? ` · best ${+e.countN || 2} per hole` : '';
    return `${FORMATS[f].label} → ${FORMATS[f2].label}${cnt} · 18 holes`;
  }
  return `${FORMATS[f].label}${extra} · ${nH(e)} holes`;
}
