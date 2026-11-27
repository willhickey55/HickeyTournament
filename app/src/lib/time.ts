/* Dates and the event's place in time, by the phone's clock. `now` is passed in so tests can pick the day. */
import type { EventDoc, Group } from './types';

const p2 = (n: number) => String(n).padStart(2, '0');
export const localDay = (t: Date) => `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}`;

export function fmtDate(d: string) { return d ? new Date(d + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : ''; }
export function fmtWhen(ms: number) { return ms ? new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : ''; }
export function fmtAgo(ms: number, now = Date.now()) {
  const s = Math.max(0, (now - ms) / 1000 | 0);
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return new Date(ms).toLocaleDateString();
}

/** 'before' | 'today' | 'after' the event day. No date counts as today. */
export function dayPhase(e: Pick<EventDoc, 'date'> | null, now = new Date()): 'before' | 'today' | 'after' {
  if (!e || !e.date) return 'today';
  const today = localDay(now);
  return e.date > today ? 'before' : e.date < today ? 'after' : 'today';
}

/** Earliest tee time typed on a group/match ("12:30 PM", "1:00"): {txt as typed, mins after midnight}. */
export function teeInfo(groups: Group[]): { txt: string; mins: number | null } {
  let best: number | null = null, txt = '';
  groups.forEach(g => {
    const m = /(\d{1,2})(?::(\d{2}))?\s*([ap])?/i.exec(g.tee || ''); if (!m) return;
    let h = +m[1] % 12; const ap = (m[3] || '').toLowerCase();
    if (ap === 'p' || (!ap && h < 7)) h += 12;
    const v = h * 60 + (+m[2] || 0);
    if (best == null || v < best) { best = v; txt = String(g.tee).trim(); }
  });
  return { txt, mins: best };
}

/** On event day the page goes Live 10 minutes before the first tee time. 0 = no tee time (Live all day). */
export function liveAt(e: EventDoc, groups: Group[], now = new Date()) {
  const { mins } = teeInfo(groups);
  if (mins == null || dayPhase(e, now) !== 'today') return 0;
  const d = new Date(now); d.setHours(0, mins - 10, 0, 0); return d.getTime();
}
export const liveNow = (e: EventDoc, groups: Group[], now = new Date()) => dayPhase(e, now) === 'today' && now.getTime() >= liveAt(e, groups, now);

export function revealed(e: EventDoc, now = Date.now()) {
  return e.visibility === 'live' || e.visibility === 'published' || (e.visibility === 'scheduled' && !!e.revealAt && now >= e.revealAt);
}

/** Status pill on the events list. */
export function evStatus(e: Pick<EventDoc, 'date' | 'locked'>, now = new Date()): [string, string] {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const d = e.date ? new Date(e.date + 'T12:00') : null;
  if (e.locked) return ['Final', 'past'];
  if (d && d < today) return ['Final', 'past'];
  if (d && d > new Date(today.getTime() + 86400000)) return ['Upcoming', ''];
  return ['Today', 'live'];
}

/** The header chip: [text, on?]. Same rules as the old page (Upcoming · Today · Live · Final · Results). */
export function chip(e: EventDoc, groups: Group[], now = new Date()): [string, boolean] {
  if (e.locked) return ['Final', false];
  const ph = dayPhase(e, now), tee = teeInfo(groups).txt;
  if (ph === 'before') {
    const md = new Date(e.date + 'T12:00').toLocaleDateString([], { month: 'short', day: 'numeric' });
    return [`Upcoming · ${md}${tee ? ' · ' + tee : ''}`, false];
  }
  if (ph === 'after' && (e.visibility === 'live' || revealed(e, now.getTime()))) return ['Final', false];
  if (ph === 'today' && !liveNow(e, groups, now)) return [`Today · ${tee}`, false];
  if (e.visibility === 'live') return ['Live', true];
  if (revealed(e, now.getTime())) return ['Results posted', true];
  if (e.visibility === 'scheduled' && e.revealAt) return [`Results ${fmtWhen(e.revealAt)}`, false];
  return ['Leaderboard hidden', false];
}

/** What players see while no matches are posted: the exec's own message, or the default. */
export const noMatchMsg = (e: Pick<EventDoc, 'date' | 'noMatchTitle' | 'noMatchText'>): [string, string] => [
  (e.noMatchTitle || '').trim() || 'Pairings coming soon',
  (e.noMatchTitle || e.noMatchText) ? (e.noMatchText || '').trim() : `Matches will be posted here before ${fmtDate(e.date) || 'the event'}.`,
];

export const todayISO = (now = new Date()) => localDay(now);
