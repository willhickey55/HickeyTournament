/* Everything that reads or writes the database. Screens call these; they never touch the Api directly. */
import type { Api, Unsub, User } from './api/types';
import { OWNER_EMAIL } from './config';
import { DEFAULT_EVENT, PARS18, isRyder, sideName, splitOn, teamBall } from './lib/event';
import { byOrder, cardLabel, groupDone, playersIn, resultsCsv, roundOf, teamRows } from './lib/scoring';
import { byYear, entryFromBoard, type HistoryEntry } from './lib/history';
import { saveQueue } from './lib/savequeue';
import { liveAt, liveNow, revealed } from './lib/time';
import { boardPops, boardSnap, type BoardSnap, type Pop } from './lib/pops';
import type { EventDoc, Group, MatchResult, Player, Team } from './lib/types';
import { C, E, P, S, emit, groupById, iScore, scorersOf, teamById, toast, unitById, type Page } from './state';
import { sendTracker } from '../../shared/offline';

/* ---------- helpers ---------- */
export const id6 = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const newCode = () => String(Math.floor(1000 + Math.random() * 9000));
const api = () => S.api!;
const isDemo = () => S.api?.mode === 'demo';

/** Run a write; tell the person if it fails (offline writes are queued by Firebase and don't fail). */
export function q(fn: () => Promise<unknown>) { return reportFail(Promise.resolve().then(fn)); }
function reportFail(p: Promise<unknown>) {
  p.catch(e => {
    console.warn(e);
    if (e && e.code === 'permission-denied') toast('You don’t have permission to change that');
    else if (navigator.onLine) toast('Couldn’t save. Check your signal.');
  });
  return p;
}
const deb: Record<string, ReturnType<typeof setTimeout>> = {};
export function debounce(k: string, fn: () => void, ms = 500) { clearTimeout(deb[k]); deb[k] = setTimeout(fn, ms); }

const isOrgEmail = () => !!S.email && (S.email.toLowerCase() === OWNER_EMAIL || S.admins.map(e => String(e).toLowerCase()).includes(S.email.toLowerCase()));

/* ---------- subscriptions ---------- */
const subs = new Map<string, Unsub>();
const sub = (key: string, make: () => Unsub) => { if (!subs.has(key)) subs.set(key, make()); };
const unsub = (key: string) => { const f = subs.get(key); if (f) { try { f(); } catch (_) { /* already gone */ } subs.delete(key); } };

/* ---------- start ---------- */
/* One event at a time (Will, Oct 18): /event opens events/current.
   After an event, the exec exports the results and starts a new one, which erases the old one. */
export function start(a: Api) {
  S.api = a;
  // scores entered before a reload that still haven't reached the server
  if (a.waitPending) sends.earlier(a.waitPending());
  // Scores without signal wait on the phone (IndexedDB). Some private-browsing modes have no IndexedDB: then they
  // still send when signal comes back, but only while the page stays open, so the no-signal bar says so.
  try { const r = indexedDB.open('unhgolf-check'); r.onerror = () => { S.noDisk = true; emit(); }; r.onsuccess = () => { try { r.result.close(); } catch (_) { /* fine */ } }; }
  catch (_) { S.noDisk = true; }
  window.addEventListener('online', () => { S.online = true; toast('Back online. Syncing scores'); emit(); refresh(); });
  // Keep the board live on the course (Will, Oct 23: it stalled until a refresh): reopen the connection when the page
  // comes back after 20+ seconds away (screen locked, other app) and when signal returns. No timer: each reopen can
  // cost a few reads per phone, and the free plan has a daily read limit.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 20000) refresh();
  });
  window.addEventListener('pageshow', ev => { if ((ev as PageTransitionEvent).persisted) refresh(); });
  window.addEventListener('offline', () => { S.online = false; emit(); });
  // Never stay on "Loading…": if something hasn't arrived in 10 seconds, show what's there.
  setTimeout(() => { if (!S.shown) { S.shown = true; emit(); } }, 10000);
  setInterval(() => { if (E().visibility === 'scheduled') { S.clock++; syncSubs(); emit(); } }, 30000);
  startEventSubs();
  window.addEventListener('popstate', () => { const p: Page = /^\/history\/?$/.test(location.pathname) || location.hash === '#history' ? 'history' : 'live'; if (p !== S.page) { S.page = p; S.histEdit = null; if (p === 'history') watchHistory(); emit(); } });
  watchHistory(); // small (one doc per year): the live page shows last year's champions too
  a.onAuth(onAuth);
}

let lastRefresh = 0;
/** The board line's Reconnect button: reopen the connection now, even if it was reopened in the last minute. */
export function reconnectNow() { lastRefresh = 0; refresh(); }
/** Reopen the live connection (at most once a minute). Scores waiting to send stay saved on the phone. */
function refresh() {
  const a = S.api; if (!a || !a.reconnect || !navigator.onLine || Date.now() - lastRefresh < 60000) return;
  lastRefresh = Date.now();
  a.reconnect().catch(e => console.warn(e));
}

/* ---------- auth ---------- */
function onAuth(u: User | null) {
  if (!u) { S.failed = true; emit(); return; }
  S.uid = u.uid; S.email = u.email || ''; S.signedInGoogle = !u.isAnonymous;
  S.canOrg = isDemo() ? S.canOrg : isOrgEmail(); S.org = S.canOrg && !S.asPlayer;
  watchAdmins(); watchCourse();
  watchMember(); syncSubs(); migrateRoster(); ensureEvent();
  emit();
}
let unAdmins: Unsub | null = null;
/** The exec list (config/admins) is only readable by the exec, so it's watched only after a Google sign-in. */
function watchAdmins() {
  if (unAdmins) { unAdmins(); unAdmins = null; }
  if (isDemo()) { S.adminsReady = true; return; }
  if (!S.signedInGoogle) { S.admins = []; S.adminsReady = true; return; }
  const settle = () => {
    S.adminsReady = true;
    const was = S.org; S.canOrg = isOrgEmail(); S.org = S.canOrg && !S.asPlayer;
    if (!S.canOrg) toast('That account isn’t on the exec');
    if (was !== S.org) syncSubs();
    watchCourse(); migrateRoster(); ensureEvent(); emit();
  };
  unAdmins = api().watchDoc('config/admins', d => { S.admins = (d && d.organizers) || []; settle(); }, () => { S.admins = []; settle(); });
}
export async function signIn() { try { await api().signInGoogle(); } catch (e: any) { if (e && e.code !== 'auth/popup-closed-by-user') toast('Sign-in didn’t finish. Try again.'); } }
export async function signOut() { try { await api().signOut(); } catch (_) { /* ignore */ } }

/** Preview only: switch between the player and exec views. */
export function demoSwitch(as: 'player' | 'org') {
  S.demoAs = as; S.canOrg = as === 'org'; S.asPlayer = false; S.org = S.canOrg; S.email = S.org ? OWNER_EMAIL : '';
  S.view = 'home'; S.tab = 'board'; S.confirm = null; watchCourse(); syncSubs(); emit(); window.scrollTo(0, 0);
}
/** Preview only: switch the example event. */
export function demoLoad(kind: string) {
  S.demoKind = kind; S.view = 'home'; S.tab = 'board'; S.confirm = null; S.hole = null; S.review = false;
  (S.api as unknown as { load(k: string): void }).load(kind); window.scrollTo(0, 0);
}
export function setPlayerView(on: boolean) {
  S.asPlayer = on; S.org = S.canOrg && !S.asPlayer; S.view = 'home'; syncSubs(); window.scrollTo(0, 0);
  toast(S.org ? 'Exec view' : 'Player view: join your group to keep score'); emit();
}

/** The saved course (Settings → Use saved / Save current) is only used by the exec, so players' phones don't read it. */
function watchCourse() {
  if (!S.canOrg) return;
  sub('course', () => api().watchDoc('config/course', d => { S.savedCourse = d && Array.isArray(d.pars) ? { course: d.course || '', pars: d.pars } : null; emit(); }, () => {}));
}

/** A brand-new project has no event yet: the exec's first visit makes one. Only after the server confirms
    there's none: an exec phone with no signal can see "no event" from its cache, and must not overwrite it. */
let ensuringEvent = false;
function ensureEvent() {
  if (ensuringEvent || !(S.canOrg && S.evReady && !S.ev)) return;
  ensuringEvent = true;
  const doc = { ...DEFAULT_EVENT, ...(S.savedCourse ? { course: S.savedCourse.course, pars: S.savedCourse.pars } : {}), createdAt: Date.now() };
  api().createIfMissing('events/' + S.eid, doc).catch(e => console.warn(e)).finally(() => { ensuringEvent = false; });
}

function startEventSubs() {
  const a = api(), eid = S.eid;
  sub('ev:doc', () => a.watchDoc('events/' + eid, d => { S.ev = d; S.evReady = true; ensureEvent(); syncSubs(); armLive(); emit(); }, () => { S.evReady = true; emit(); }));
  sub('ev:groups', () => a.watchCol(P('groups'), null, ds => { S.groups = (ds as Group[]).sort(byOrder); S.groupsReady = true; S.dataAt = Date.now(); ensureCodes(); armLive(); noteBoard(); emit(); }, () => { S.groupsReady = true; emit(); }));
  sub('ev:roster', () => a.watchDoc(P('roster/main'), d => {
    S.rosterReady = true; S.rosterDoc = !!d;
    if (d) { unsub('ev:players'); unsub('ev:teams'); S.players = fromMap(d.players) as Player[]; S.teams = fromMap(d.teams) as Team[]; }
    else { if (!subs.has('ev:players')) { S.legacyP = false; S.legacyT = false; S.players = []; S.teams = []; } watchLegacyRoster(); }
    migrateRoster(); syncTeamGroups(); emit();
  }, () => { S.rosterReady = true; watchLegacyRoster(); emit(); }));
  if (a.watchSync) sub('ev:sync', () => a.watchSync!('events/' + eid, setLive));
  watchMember(); syncSubs();
}
/* Board status line (Will, Oct 28): "Live · last update 12:41 PM" or "Reconnecting…". Not live for under 3 seconds
   (normal while a page opens or reconnects) isn't shown. */
function setLive(live: boolean) {
  S.live = live;
  if (live) S.offSince = 0;
  else if (!S.offSince) { S.offSince = Date.now(); setTimeout(emit, 3100); }
  emit();
}
/* Live pop-ups (lib/pops.ts): compare the board with the last look and pop up what changed, only while the event
   is live, the board is on screen and this phone isn't on the scoring screen. A scorer doesn't get their own match. */
let lastSnap: BoardSnap | null = null, popId = 0;
function noteBoard() {
  const e = E(), next = boardSnap(C());
  const show = S.shown && liveNow(e, S.groups) && (S.org || revealed(e)) && document.visibilityState === 'visible' && S.view !== 'score';
  const lines = show ? boardPops(lastSnap, next, k => !!S.myGroup && k === 'm:' + S.myGroup && iScore(S.myGroup)) : [];
  lastSnap = next;
  lines.forEach(pushPop);
}
export function pushPop(p: Pop) {
  const id = ++popId; S.pops = [...S.pops.slice(-2), { id, ...p }]; emit();
  setTimeout(() => dropPop(id), 6000);
}
export function dropPop(id: number) { if (S.pops.some(p => p.id === id)) { S.pops = S.pops.filter(p => p.id !== id); emit(); } }
function watchMember() {
  unsub('ev:member'); if (!S.uid || !S.eid) return;
  sub('ev:member', () => api().watchDoc(P('members/' + S.uid), d => { S.myGroup = (d && d.groupId) || null; S.memberLoaded = true; syncSubs(); emit(); }, () => { S.memberLoaded = true; emit(); }));
}
/** Players only load their own group's scores until the leaderboard is shown; the exec loads everything. */
function syncSubs() {
  const a = S.api; if (!a || !S.eid) return;
  const wantAll = S.org || revealed(E());
  const key = wantAll ? 'ev:scores:all' : (S.myGroup ? 'ev:scores:g:' + S.myGroup : null);
  [...subs.keys()].filter(k => k.startsWith('ev:scores:') && k !== key).forEach(k => { unsub(k); S.scores = scoreQ.overlay({}); });
  if (!key) S.scoresReady = S.memberLoaded;
  else if (!subs.has(key)) S.scoresReady = false;
  if (key) sub(key, () => a.watchCol(P('scores'), wantAll ? null : ['groupId', '==', S.myGroup], ds => { S.scores = scoreQ.overlay(Object.fromEntries(ds.map(d => [d.id, d]))); S.scoresReady = true; S.dataAt = Date.now(); noteBoard(); emit(); }, () => { S.scoresReady = true; emit(); }));
  if (S.org) sub('ev:codes', () => a.watchCol(P('codes'), null, ds => { S.codes = Object.fromEntries(ds.map(d => [d.id, d.code])); S.codesLoaded = true; ensureCodes(); emit(); }, () => {}));
  else unsub('ev:codes');
}
/** A group without a code gets one, but only if the server agrees it has none (a phone with no signal could
    otherwise replace codes already handed out). The codes listener shows it once it's saved. */
const codePending = new Set<string>();
function ensureCodes() {
  if (!S.org || !S.codesLoaded || !S.eid) return;
  S.groups.filter(g => !S.codes[g.id] && !codePending.has(g.id)).forEach(g => {
    codePending.add(g.id);
    api().createIfMissing(P('codes/' + g.id), { code: newCode() }).catch(e => console.warn(e)).finally(() => codePending.delete(g.id));
  });
}
/** Re-render once when the page should switch to Live (10 minutes before the first tee time). */
let liveT: ReturnType<typeof setTimeout> | undefined;
function armLive() {
  clearTimeout(liveT);
  if (!S.ev) return;
  const t = liveAt(E(), S.groups);
  if (t > Date.now()) liveT = setTimeout(() => { S.clock++; emit(); }, t - Date.now() + 500);
}

/* ---------- roster: players + teams in one doc, events/{eid}/roster/main {players:{id:{}}, teams:{id:{}}}.
   Changes made in the same moment are saved together. Events from before the roster doc keep players/teams
   as separate docs until an exec opens them (migrateRoster copies them over). ---------- */
const fromMap = (m: Record<string, object> | undefined) => Object.keys(m || {}).sort().map(id => ({ id, ...(m as any)[id] }));
const toMap = (arr: { id: string }[]) => Object.fromEntries(arr.map(({ id, ...d }) => [id, d]));
let rosterPatch: Record<string, Record<string, object>> | null = null, rosterDels: string[] = [];
const fullRoster = () => ({ players: toMap(S.players), teams: toMap(S.teams) });
function flushRoster() {
  const patch = rosterPatch, dels = rosterDels; rosterPatch = null; rosterDels = [];
  // merged, never replaced: if this phone wrongly thinks there's no roster yet (no signal), nobody is lost
  if (!S.rosterDoc) { S.rosterDoc = true; q(() => api().set(P('roster/main'), fullRoster(), true)); return; }
  if (patch) q(() => api().set(P('roster/main'), patch, true));
  if (dels.length) q(() => api().delFields(P('roster/main'), dels));
}
export function rosterPut(kind: 'players' | 'teams', id: string, fields: object) {
  if (!rosterPatch && !rosterDels.length) Promise.resolve().then(flushRoster);
  rosterPatch = rosterPatch || {}; const k = rosterPatch[kind] || (rosterPatch[kind] = {}); k[id] = { ...(k[id] || {}), ...fields };
}
export function rosterDel(kind: 'players' | 'teams', id: string) {
  if (!rosterPatch && !rosterDels.length) Promise.resolve().then(flushRoster);
  if (rosterPatch && rosterPatch[kind]) delete rosterPatch[kind][id];
  rosterDels.push(kind + '.' + id);
}
function watchLegacyRoster() {
  sub('ev:players', () => api().watchCol(P('players'), null, ds => { if (S.rosterDoc) return; S.players = ds as Player[]; S.legacyP = true; migrateRoster(); emit(); }, () => {}));
  sub('ev:teams', () => api().watchCol(P('teams'), null, ds => { if (S.rosterDoc) return; S.teams = ds as Team[]; S.legacyT = true; migrateRoster(); emit(); }, () => {}));
}
function migrateRoster() {
  if (!S.canOrg || !S.eid || !S.rosterReady || S.rosterDoc || !S.legacyP || !S.legacyT) return;
  if (!S.players.length && !S.teams.length) return;
  S.rosterDoc = true; q(() => api().set(P('roster/main'), fullRoster(), true));
}

/* ---------- event settings ---------- */
const noId = (e: EventDoc & { id?: string }): EventDoc => { const { id: _id, ...rest } = e; return rest; };
export function saveEvent(patch: Partial<EventDoc>) {
  S.ev = noId({ ...E(), ...patch });
  q(() => api().set('events/' + S.eid, S.ev!, false));
  syncSubs(); armLive(); syncTeamGroups(); emit();
}

/** Split format with a scramble / alt-shot nine: the team enters its own score there, and the rules only let a
    group's scorer save a team that's in that group. So each team follows its players' group automatically (when its
    players are all in one group); the exec can still set it by hand in Field. Runs on the exec's page only. */
function syncTeamGroups() {
  if (!S.org || !S.rosterDoc || !splitOn(E()) || !teamBall(E())) return;
  for (const t of S.teams) {
    const gs = [...new Set(S.players.filter(p => p.teamId === t.id && p.groupId).map(p => p.groupId!))];
    if (gs.length === 1 && t.groupId !== gs[0]) { t.groupId = gs[0]; rosterPut('teams', t.id, { groupId: gs[0] }); }
  }
}
/** Typing in a settings box: update the screen now, save after a pause. */
export function editEvent(patch: Partial<EventDoc>) {
  S.ev = noId({ ...E(), ...patch }); emit();
  debounce('ev', () => { q(() => api().set('events/' + S.eid, S.ev!, false)); });
}
export function saveCourse() { const c = { course: E().course || '', pars: [...(E().pars || PARS18)] }; S.savedCourse = c; q(() => api().set('config/course', c, false)); toast('Course and pars saved'); emit(); }
export function useSavedCourse() { const c = S.savedCourse || { course: '', pars: PARS18 }; saveEvent({ course: c.course, pars: [...c.pars] }); toast('Saved course applied'); }
export function setPar(h: number, v: number) { const pars = [...(E().pars || PARS18)]; while (pars.length < 18) pars.push(4); pars[h - 1] = v; saveEvent({ pars }); }

/* Start a new event: erases this one completely (scores, players, teams, groups or matches, phone links)
   and resets every setting and the look. Only the course and pars stay. Export results first. */
const EVENT_SUBCOLS = ['scores', 'members', 'codes', 'players', 'teams', 'roster', 'groups'];
export async function startNewEvent() {
  if (!S.online) throw new Error('Connect to the internet before resetting.');
  flushScores(); await sends.settled();
  const a = api(), eid = S.eid, cur = E();
  toast('Erasing…');
  try {
    scoreQ.drop();
    for (const c of EVENT_SUBCOLS) await a.clearCol('events/' + eid + '/' + c);
    // The family tournament is the same event every June: keep its name, look, format, course and pars (Will, Nov 26).
    const keep = { name: cur.name, eyebrow: cur.eyebrow, tagline: cur.tagline || '', tabTitle: cur.tabTitle || '', bandColor: cur.bandColor, logo: cur.logo, logoImg: cur.logoImg || '', format: cur.format, holes: cur.holes };
    await a.set('events/' + eid, { ...DEFAULT_EVENT, ...keep, course: cur.course || DEFAULT_EVENT.course, pars: cur.pars || PARS18, createdAt: Date.now() }, false);
    Object.assign(S, { groups: [], players: [], teams: [], scores: {}, codes: {}, myGroup: null, view: 'home', tab: 'settings' });
    sends.reset(); lastScore.entry = null; submission.error = ''; toast('Erased. Set up the next event');
    emit(); window.scrollTo(0, 0);
  } catch (e) { console.warn(e); throw new Error('Reset incomplete. Some event data may already be cleared. Check your connection and retry.'); }
}

/* ---------- exec list ---------- */
export function addAdmin(email: string): boolean {
  const v = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(v)) { toast('Enter a full email address'); return false; }
  const list = [...new Set([...S.admins, v])]; S.admins = list;
  q(() => api().set('config/admins', { organizers: list }, false)); toast('Added to the exec'); emit(); return true;
}
export function removeAdmin(email: string) { const list = S.admins.filter(x => x !== email); S.admins = list; q(() => api().set('config/admins', { organizers: list }, false)); emit(); }

/* ---------- scores ---------- */
/* Stroke scores are saved after a 1-second pause in tapping (lib/savequeue.ts): fewer saves, and far fewer
   reads for every phone watching the leaderboard. Match play is one tap per hole, so it saves right away. */
/** Scores saved on this phone but not yet on the server: the "waiting to send" line on the score screens. */
type UndoEntry = { id: string; made: number; groupId: string; key: string; previous: number | MatchResult | null; value: number | MatchResult | null; hole: number; at: number; label: string };
export const lastScore = { entry: null as UndoEntry | null, busy: false, error: '' };
/** Undo is only offered for a few seconds after the tap, and only on the phone that made it (Will, Oct 28: "only the
    person who clicked the score, for that second"). After that, fix a hole by tapping it. */
export const UNDO_MS = 5000;
export const undoOpen = () => !!lastScore.entry && (lastScore.busy || Date.now() - lastScore.entry.made < UNDO_MS);
function rememberScore(id: string, groupId: string, key: string, value: number | MatchResult | null, hole: number, name = '') {
  const previous = S.scores[id]?.holes?.[key] ?? null;
  if (previous === value) return;
  const outcome = value === 'A' || value === 'B' ? sideName(E(), value) + ' won' : value === 'H' ? 'Halved' : value == null ? 'cleared' : String(value);
  // stroke scores say whose they were ("Hole 6 · Alex: 4"), like tryouts and the league (Will, Oct 28)
  const who = typeof value === 'number' && name ? ' · ' + name.split(' ')[0] : '';
  lastScore.entry = { made: Date.now(), id, groupId, key, previous, value, hole, at: 0, label: `Hole ${hole}${who}: ${outcome}` }; lastScore.error = ''; setTimeout(emit, UNDO_MS + 50);
}
export async function undoLastScore() {
  const u = lastScore.entry;
  if (!u || lastScore.busy || submission.busy || !undoOpen()) return;
  if (!S.online) { lastScore.error = 'Connect before undoing so we can check for changes from another phone.'; emit(); return; }
  if (!iScore(u.groupId) || E().locked || E().hold) { lastScore.error = 'This card is locked or scoring is closed. Ask the exec to reopen it.'; emit(); return; }
  lastScore.busy = true; emit();
  try {
    flushScores(); await sends.settled();
    if (!iScore(u.groupId) || E().locked || E().hold) throw new Error('The card is no longer open for scoring.');
    await api().undoScore(P('scores/' + u.id), u.key, u.value, u.previous, S.uid, u.at);
    scoreQ.drop(u.id);
    const cur = S.scores[u.id]; if (cur) S.scores[u.id] = { ...cur, holes: { ...cur.holes, [u.key]: u.previous } };
    S.hole = u.hole; lastScore.entry = null; lastScore.error = ''; toast('Last score undone');
  } catch (e) { lastScore.error = e instanceof Error ? e.message : 'Could not undo. Review the scorecard and try again.'; }
  finally { lastScore.busy = false; emit(); }
}
export const sends = sendTracker(() => emit());
const scoreQ = saveQueue((id, w) => {
  const groupId = unitById(id)?.groupId ?? w.groupId;
  const at = Date.now();
  const u = lastScore.entry; if (u && u.id === id && w.holes[u.key] === u.value) u.at = at;
  try { const p = api().set(P('scores/' + id), { groupId, holes: w.holes, updatedAt: at, by: S.uid }, true); sends.track(Object.keys(w.holes).length, p, Object.keys(w.holes).map(h => id + ':' + h)); reportFail(p); }
  catch (e) { reportFail(Promise.reject(e)); }
});
/** Save waiting scores now: before submitting, and whenever the page is hidden or closed. */
export const flushScores = () => scoreQ.flush();
export const queuedScores = () => scoreQ.size;
export const submission = { busy: false, error: "" };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushScores(); });
window.addEventListener('pagehide', flushScores);

export function setHole(uid: string, h: number, val: number | null) {
  if (submission.busy || lastScore.busy) return;
  const u = unitById(uid); if (!u) return;
  const cur = S.scores[uid] || {}; const prev = (cur.holes || {})['h' + h] ?? '';
  if (String(prev) === String(val ?? '') && !sends.failed) return;
  rememberScore(uid, u.groupId || '', 'h' + h, val, h, u.name || '');
  S.scores[uid] = { ...cur, groupId: u.groupId || '', holes: { ...(cur.holes || {}), ['h' + h]: val } };
  scoreQ.put(uid, u.groupId || '', 'h' + h, val);
  emit();
}
export function setMatchHole(g: Group, h: number, val: MatchResult | null) {
  if (submission.busy || lastScore.busy) return;
  rememberScore(g.id, g.id, 'h' + h, val, h);
  const cur = S.scores[g.id] || {}; S.scores[g.id] = { ...cur, groupId: g.id, holes: { ...(cur.holes || {}), ['h' + h]: val } };
  scoreQ.put(g.id, g.id, 'h' + h, val); scoreQ.flush(g.id);
  emit();
}

/** Match cards with a layout (9-hole, split at the turn, stroke play): results and strokes go through the save
    queue like stroke scores, so the two back-nine results on a hole (or four stroke scores) are about one save.
    `key` is resultKey()/strokeKey() from lib/scoring.ts. */
export function setCardHole(g: Group, key: string, val: MatchResult | number | null) {
  if (submission.busy || lastScore.busy) return;
  const cur = S.scores[g.id] || {}; if (((cur.holes || {})[key] ?? null) === val && !sends.failed) return;
  const sp = /^s\d+_(.+)$/.exec(key); // a stroke-play singles score on a card: say whose
  rememberScore(g.id, g.id, key, val, S.hole || 1, sp ? S.players.find(x => x.id === sp[1])?.name || '' : '');
  S.scores[g.id] = { ...cur, groupId: g.id, holes: { ...(cur.holes || {}), [key]: val } };
  scoreQ.put(g.id, g.id, key, val);
  emit();
}

/* ---------- player: join a group, keep score, submit ---------- */
export function joinGroup(gid: string, code: string) {
  const e = E();
  S.codeDraft = code;
  if (e.codes && !/^\d{4}$/.test(code)) { S.err = 'Enter the 4-digit group code from the exec.'; emit(); return; }
  if (!navigator.onLine) { S.err = 'You need signal to join a group. Try again in a moment.'; emit(); return; }
  S.err = ''; S.joining = true; emit();
  // moving to another match (next round): send any scores still waiting for the old one first
  if (S.myGroup && S.myGroup !== gid) flushScores();
  const was = S.myGroup;
  api().join(P('members/' + S.uid), gid, e.codes ? code : '').then(() => {
    S.joining = false; S.codeDraft = ''; S.myGroup = gid; S.pickRound = null; S.view = 'home'; toast('You’re in ' + (groupById(gid)?.name || 'your group')); syncSubs(); emit(); window.scrollTo(0, 0);
  }).catch(err => {
    S.joining = false; S.myGroup = was; S.view = 'confirm';
    S.err = err && err.code === 'permission-denied' ? (e.codes ? 'That code doesn’t match this group. Check with the exec.' : 'Couldn’t join that group.') : 'Couldn’t join. Check your signal and try again.';
    emit();
  });
}
export function claimScoring() {
  const g = groupById(S.myGroup); if (!g || g.submitted || scorersOf(g).includes(S.uid) || (E().hold && !S.canOrg)) return;
  g.scorers = [...scorersOf(g), S.uid]; q(() => api().addScorer(P('groups/' + g.id), S.uid));
  toast('You’re keeping score'); S.hole = null; S.view = 'score'; wake(); emit(); window.scrollTo(0, 0);
}
/* Submit (Will, Oct 28): goes through right away, even with no signal. Waiting scores are flushed first, and Firebase
   sends one phone's saves in order, so they reach the server before the submit does (and stay queued on the phone if
   the page is closed). The only block is a score that FAILED to save (rejected): Submit stays off until it's re-entered.
   If the submit itself is turned away (card locked), the card reopens on this phone with a message. */
export function submitScores() {
  const g = groupById(S.myGroup); if (!g || !groupDone(C(), g)) return;
  if (sends.failed) { submission.error = 'Some scores weren’t saved. Re-enter the holes shown above, then submit.'; emit(); return; }
  flushScores();
  const later = !S.online || sends.waiting() > 0;
  submission.error = ''; g.submitted = true; g.submittedAt = Date.now();
  const p = api().update(P('groups/' + g.id), { submitted: true, submittedAt: g.submittedAt });
  sends.track(1, p.then(() => {}, () => {}), ['submit:' + g.id]); // shown as waiting; a turned-away submit isn't a failed score
  p.catch(() => { const cur = groupById(g.id); if (cur) cur.submitted = false; submission.error = 'The submit didn’t go through. Check with the exec; the card may be locked.'; emit(); });
  toast(later ? 'Submitted · sends when you have signal' : 'Scores submitted'); S.view = 'home'; emit(); window.scrollTo(0, 0);
}

/* Keep the screen on while scoring. */
let lock: any = null;
export async function wake() { try { if (!lock && (navigator as any).wakeLock) { lock = await (navigator as any).wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch (_) { /* not supported */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.view === 'score') wake(); });

/* ---------- exec: field, groups, matches ---------- */
export function addPlayers(text: string): number {
  const names = text.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 100);
  names.forEach((n, i) => { const id = 'p' + id6() + i; const doc = { name: n.slice(0, 60), groupId: '', teamId: '', order: Date.now() + i, status: '' }; S.players.push({ id, ...doc }); rosterPut('players', id, doc); });
  if (names.length) toast(names.length + ' added');
  emit(); return names.length;
}
export function renamePlayer(id: string, name: string) { const p = S.players.find(x => x.id === id); if (!p) return; p.name = name; emit(); debounce('pn:' + id, () => rosterPut('players', id, { name })); }
export function renameTeam(id: string, name: string) { const t = teamById(id); if (!t) return; t.name = name; emit(); debounce('tn:' + id, () => rosterPut('teams', id, { name })); }
export function setPlayer(id: string, fields: Partial<Player>) { const p = S.players.find(x => x.id === id); if (!p) return; Object.assign(p, fields); rosterPut('players', id, fields); syncTeamGroups(); emit(); }
/** WD / DQ / playing. Saved in the roster doc (the old page wrote it to the old player docs). */
export function setStatus(id: string, status: string) {
  const u = unitById(id); if (!u) return; u.status = status;
  rosterPut(teamById(id) ? 'teams' : 'players', id, { status }); emit();
}
export function removePlayer(id: string) { scoreQ.drop(id); S.players = S.players.filter(p => p.id !== id); rosterDel('players', id); q(() => api().del(P('scores/' + id))); emit(); }
export function movePlayer(pid: string, gid: string) {
  const p = S.players.find(x => x.id === pid); if (!p) return; p.groupId = gid;
  rosterPut('players', pid, { groupId: gid }); syncTeamGroups();
  if (S.scores[pid]) { S.scores[pid].groupId = gid; q(() => api().set(P('scores/' + pid), { groupId: gid }, true)); }
  emit();
}
export function moveTeam(tid: string, gid: string) {
  const t = teamById(tid); if (!t) return; t.groupId = gid;
  rosterPut('teams', tid, { groupId: gid });
  if (S.scores[tid]) { S.scores[tid].groupId = gid; q(() => api().set(P('scores/' + tid), { groupId: gid }, true)); }
  emit();
}
export function addTeam() { const id = 't' + id6(); const doc = { name: 'Team ' + (S.teams.length + 1), groupId: '', order: Date.now() }; S.teams.push({ id, ...doc }); rosterPut('teams', id, doc); emit(); }
export function deleteTeam(tid: string) {
  S.players.filter(p => p.teamId === tid).forEach(p => { p.teamId = ''; rosterPut('players', p.id, { teamId: '' }); });
  scoreQ.drop(tid); S.teams = S.teams.filter(t => t.id !== tid); rosterDel('teams', tid); q(() => api().del(P('scores/' + tid))); emit();
}
export function teamsFromGroups() {
  S.groups.forEach((g, i) => {
    let t = S.teams.find(x => x.fromGroup === g.id);
    if (!t) { const id = 't' + id6(); t = { id, name: g.name.replace(/^Group/, 'Team'), groupId: g.id, order: Date.now() + i, fromGroup: g.id }; S.teams.push(t); const { id: _, ...doc } = t; rosterPut('teams', id, doc); }
    playersIn(C(), g.id).forEach(p => { p.teamId = t!.id; rosterPut('players', p.id, { teamId: t!.id }); });
  });
  toast('One team per group'); emit();
}
function newGroupDoc(n: number, order: number): Omit<Group, 'id'> {
  return { name: (isRyder(E()) ? 'Match ' : 'Group ') + n, tee: '', start: 1, scorers: [], submitted: false, order, ...(isRyder(E()) ? { mtype: 'singles' as const, aIds: [], bIds: [] } : {}) };
}
function putGroup(id: string, doc: Omit<Group, 'id'>) {
  S.groups.push({ id, ...doc }); const c = newCode(); S.codes[id] = c;
  q(() => api().set(P('codes/' + id), { code: c }, false)); q(() => api().set(P('groups/' + id), doc, false));
}
export function addGroup() {
  // a new Ryder match goes in the latest round, so building round 2 is just "+ Add match" again
  const doc = newGroupDoc(S.groups.length + 1, Date.now()), r = Math.max(1, ...S.groups.map(roundOf));
  putGroup('g' + id6(), isRyder(E()) && r > 1 ? { ...doc, round: r } : doc); emit();
}
/** Put players without a group into groups of 4, making new groups as needed. */
export function autofill() {
  const room = (g: Group) => 4 - S.players.filter(p => p.groupId === g.id).length;
  for (const p of S.players.filter(x => !x.groupId).sort(byOrder)) {
    let g = S.groups.find(x => room(x) > 0);
    if (!g) { const id = 'g' + id6(); putGroup(id, { ...newGroupDoc(S.groups.length + 1, Date.now() + S.groups.length), name: 'Group ' + (S.groups.length + 1) }); g = groupById(id)!; }
    movePlayer(p.id, g.id);
  }
  toast('Players placed in groups'); emit();
}
export function updateGroup(gid: string, fields: Partial<Group>, debounced = false) {
  const g = groupById(gid); if (!g) return; Object.assign(g, fields); emit();
  const save = () => q(() => api().update(P('groups/' + gid), fields));
  if (debounced) debounce('g:' + gid + Object.keys(fields).join(), save); else save();
}
export function setMatchPlayer(gid: string, k: 'A' | 'B', i: number, pid: string) {
  const g = groupById(gid); if (!g) return; const key = k === 'A' ? 'aIds' : 'bIds';
  const arr = [...(g[key] || [])]; arr[i] = pid; const clean = arr.filter((_, j) => j < 2).map(x => x || '');
  updateGroup(gid, { [key]: clean });
}
export function deleteGroup(gid: string) {
  playersIn(C(), gid).forEach(p => movePlayer(p.id, '')); S.teams.filter(t => t.groupId === gid).forEach(t => moveTeam(t.id, ''));
  S.groups = S.groups.filter(g => g.id !== gid);
  // A match's results live in scores/{match id}: delete them with the match, or every phone keeps reading them.
  scoreQ.drop(gid);
  if (S.scores[gid]) { delete S.scores[gid]; q(() => api().del(P('scores/' + gid))); }
  q(() => api().del(P('groups/' + gid))); q(() => api().del(P('codes/' + gid))); emit();
}
export function newGroupCode(gid: string) { const c = newCode(); S.codes[gid] = c; q(() => api().set(P('codes/' + gid), { code: c }, false)); toast('New code: ' + c); emit(); }
export function resetScorers(gid: string) { updateGroup(gid, { scorers: [] }); toast('Scorers reset'); }
export function resetPhones(gid: string) {
  const g = groupById(gid); if (!g) return; g.scorers = [];
  q(() => api().update(P('groups/' + gid), { scorers: [] }).then(() => api().clearMembers(P('members'), gid))).then(() => toast(g.name + ' phones reset'));
  emit();
}
export function reopenGroup(gid: string) { const g = groupById(gid); if (!g) return; updateGroup(gid, { submitted: false }); toast(g.name + ' reopened'); }

/* ---------- results file ---------- */
export function downloadCsv() {
  const e = E();
  const text = resultsCsv(C(), [sideName(e, 'A'), sideName(e, 'B')], g => cardLabel(e, g));
  const blob = new Blob([text], { type: 'text/csv' }); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = (e.name || 'event').replace(/[^\w-]+/g, '-') + '-results.csv';
  document.body.appendChild(a); a.click(); a.remove();
  if (isDemo()) toast('Downloads work on the real site');
}

/* ---------- history (Will, Nov 26) ---------- */
/* history/{id}: one doc per year (public read, exec write). Pictures in histphotos/{id} {data}, read only when a
   year's card shows one, so the History page stays a handful of small reads. */
export function watchHistory() {
  sub('history', () => api().watchCol('history', null, ds => { S.history = (ds as HistoryEntry[]).sort(byYear); S.histReady = true; emit(); }, () => { S.histReady = true; emit(); }));
}
/** Switch between the live page (/) and /history without reloading. */
export function goPage(p: Page) {
  if (S.page === p) return;
  flushScores();
  S.page = p; S.histEdit = null; S.confirm = null;
  try { history.pushState(null, '', p === 'history' ? (location.protocol === 'https:' ? '/history' : '#history') : (location.protocol === 'https:' ? '/' : location.pathname)); } catch (_) { /* preview iframe */ }
  if (p === 'history') watchHistory();
  emit(); window.scrollTo(0, 0);
}

const photoWatch = new Set<string>();
/** Load one year's picture (once per page). */
export function loadHistPhoto(id: string) {
  if (photoWatch.has(id)) return; photoWatch.add(id);
  const off = api().watchDoc('histphotos/' + id, d => { if (d && d.data) { S.histPhotos[id] = d.data; emit(); } off(); }, () => {});
}
export async function saveHistory(id: string | null, entry: Omit<HistoryEntry, 'id'>) {
  const hid = id || 'y' + entry.year + '_' + id6();
  const prev = S.history.find(h => h.id === hid);
  const doc = { ...entry, photo: prev?.photo || entry.photo || '', createdAt: prev?.createdAt || entry.createdAt || Date.now() };
  S.history = [...S.history.filter(h => h.id !== hid), { id: hid, ...doc } as HistoryEntry].sort(byYear); emit();
  await api().set('history/' + hid, doc, false);
  return hid;
}
export async function deleteHistory(id: string) {
  S.history = S.history.filter(h => h.id !== id); delete S.histPhotos[id]; S.histEdit = null; emit();
  await api().del('history/' + id); await api().del('histphotos/' + id);
  toast('Year removed');
}
export async function setHistPhoto(id: string, data: string) {
  const h = S.history.find(x => x.id === id); if (!h) return;
  S.histPhotos[id] = data; h.photo = data ? 'p' + Date.now() : ''; emit();
  if (data) await api().set('histphotos/' + id, { data }, false); else await api().del('histphotos/' + id);
  await api().update('history/' + id, { photo: h.photo });
}
/** Settings → "Save this year to history": the final team leaderboard becomes this year's entry. */
export async function saveYearToHistory(): Promise<string> {
  const c = C(), e = E();
  const rows = teamRows(c).map(r => ({ pos: r.pos, name: '', players: c.players.filter(p => p.teamId === r.u.id).sort(byOrder).map(p => p.name), strokes: r.strokes, rel: r.rel }));
  const year = +(e.date || '').slice(0, 4) || new Date().getFullYear();
  const entry = entryFromBoard(year, e.date, e.course, rows);
  if (!entry) throw new Error('No team scores yet: the leaderboard is empty.');
  const same = S.history.find(h => h.year === year);
  const id = await saveHistory(same ? same.id : null, same ? { ...entry, note: same.note || '', photo: same.photo || '' } : entry);
  return id;
}
