import { useEffect, useReducer } from 'preact/hooks';
import type { Api } from './api/types';
import { withDefaults } from './lib/event';
import type { Ctx } from './lib/scoring';
import type { EventDoc, Group, Player, ScoreDoc, Team } from './lib/types';
import type { HistoryEntry } from './lib/history';

export type View = 'home' | 'pick' | 'confirm' | 'score' | 'edit';
export type Tab = 'board' | 'field' | 'groups' | 'scores' | 'look' | 'settings';

/** Which page: the live tournament (/) or the history of past years (/history). */
export type Page = 'live' | 'history';
const pathPage = (): Page => (typeof location !== 'undefined' && /^\/history\/?$/.test(location.pathname) || (typeof location !== 'undefined' && location.hash === '#history') ? 'history' : 'live');

export const S = {
  api: null as Api | null,
  page: pathPage(),
  history: [] as HistoryEntry[],
  histReady: false,
  histEdit: null as string | null,     // exec editing a year: its id, 'new', or null
  histPhotos: {} as Record<string, string>, // loaded pictures by year id
  failed: false,            // couldn't connect at all
  uid: '',
  email: '',
  signedInGoogle: false,
  admins: [] as string[],
  adminsReady: false,       // the exec list arrived (only waited for after a Google sign-in)
  canOrg: false,            // signed in as exec
  asPlayer: false,          // exec looking at the player view
  org: false,               // showing the exec view right now
  demoAs: 'player' as 'player' | 'org',
  demoKind: 'scramble' as string,

  savedCourse: null as null | { course: string; pars: number[] },

  // the event: there is one at a time, events/current (Will, Oct 18)
  eid: 'current',
  ev: null as Partial<EventDoc> | null,
  evReady: false,
  groups: [] as Group[],
  groupsReady: false,
  scoresReady: false,       // the first scores snapshot arrived (or this phone doesn't load scores)
  shown: false,             // everything arrived once; later reloads of a piece don't blank the page again
  players: [] as Player[],
  teams: [] as Team[],
  scores: {} as Record<string, ScoreDoc>,
  rosterDoc: false,
  rosterReady: false,
  legacyP: false,
  legacyT: false,
  myGroup: null as string | null,
  memberLoaded: false,
  codes: {} as Record<string, string>,
  codesLoaded: false,

  // screen
  view: 'home' as View,
  tab: 'board' as Tab,
  hole: null as number | null,
  review: false,            // stroke formats: the Review scores screen (the whole card) before Submit
  editId: '',
  pickId: '',
  pickRound: null as number | null, // Ryder rounds: which round's matches "Find your match" shows
  codeDraft: '',
  joining: false,
  confirm: null as string | null,
  err: '',
  toast: '',
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  noDisk: false,            // this browser can't keep data on the phone (some private modes): unsent scores need the page open
  clock: 0,                 // bumps when the page should re-check the time (Live switch, scheduled results)
  live: null as boolean | null, // connected to the server right now (null = not known yet); see watchSync
  offSince: 0,              // when the page stopped being live (the board line waits 3 s before saying so)
  dataAt: 0,                // when the last scores / matches snapshot arrived
  pops: [] as { id: number; text: string; side?: 'A' | 'B' }[], // live pop-ups on the board (lib/pops.ts)
};

/** Has everything the first screen needs arrived? Until then the page shows a plain loading state, not the
    built-in defaults ("The Hickey Tournament") that would flash before the real event replaces them. */
export function pageReady() {
  if (!S.shown) S.shown = S.failed || (!!S.uid && S.adminsReady && S.evReady && (!S.ev || (S.groupsReady && S.rosterReady && S.memberLoaded && S.scoresReady)));
  return S.shown;
}

/** The open event with defaults filled in. */
export const E = (): EventDoc => withDefaults(S.ev);
/** Everything the scoring math needs. */
export const C = (): Ctx => ({ ev: E(), players: S.players, teams: S.teams, groups: S.groups, scores: S.scores });

const subs = new Set<() => void>();
/** "A & B", "A, B & C". */
export const joinNames = (ns: string[]) => (ns.length < 3 ? ns.join(' & ') : ns.slice(0, -1).join(', ') + ' & ' + ns[ns.length - 1]);
/** No team names in the family tournament (Will, Nov 26): a team is shown as its players everywhere. The stored name
    ("Team 1") is kept as `base` and only shows while the team has nobody in it. Runs before every render. */
/** First names: it's a family, most last names match. A first name two players share gets the last initial
    ("Tom H."), and a name two players share entirely stays whole. */
function shortName(n: string) {
  const parts = n.trim().split(/\s+/), first = parts[0] || n;
  const same = S.players.filter(p => (p.name.trim().split(/\s+/)[0] || '') === first);
  if (same.length < 2 || parts.length < 2) return first;
  const ini = first + ' ' + parts[parts.length - 1].charAt(0) + '.';
  return same.filter(p => { const q = p.name.trim().split(/\s+/); return q[0] + ' ' + (q[q.length - 1] || '').charAt(0) + '.' === ini; }).length < 2 ? ini : n.trim();
}
export function nameTeams() {
  for (const t of S.teams as (Team & { base?: string })[]) {
    if (t.base === undefined) t.base = t.name;
    const ps = S.players.filter(p => p.teamId === t.id && !p.status).sort((a, b) => (+(a.order || 0)) - (+(b.order || 0))).map(p => shortName(p.name));
    t.name = ps.length ? joinNames(ps) : t.base;
  }
}
export function emit() { nameTeams(); subs.forEach(f => f()); }
export function useApp() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  // Re-render once right after subscribing, in case data arrived between the first paint and now.
  useEffect(() => { const f = () => force(undefined as never); subs.add(f); f(); return () => { subs.delete(f); }; }, []);
}

let toastT: ReturnType<typeof setTimeout> | undefined;
export function toast(m: string) {
  S.toast = m; emit();
  clearTimeout(toastT);
  toastT = setTimeout(() => { S.toast = ''; emit(); }, 2600);
}

export const groupById = (id: string | null | undefined) => S.groups.find(g => g.id === id);
export const teamById = (id: string | null | undefined) => S.teams.find(t => t.id === id);
export const unitById = (id: string) => S.players.find(x => x.id === id) || S.teams.find(x => x.id === id);
export const scorersOf = (g: Group | undefined) => (Array.isArray(g && g.scorers) ? g!.scorers! : []);
/** Can this phone enter scores for the group right now? */
export const iScore = (gid: string | null) => !!gid && !E().locked && scorersOf(groupById(gid)).includes(S.uid) && !groupById(gid)?.submitted;
export const P = (path: string) => 'events/' + S.eid + '/' + path;
/** The event's link (the home page's Team event button points here too). */
export const EVENT_PATH = '/event';
