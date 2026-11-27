import { describe, expect, it } from 'vitest';
import { withDefaults } from '../src/lib/event';
import { lightBand, themeVars } from '../src/lib/look';
import { chip, dayPhase, evStatus, liveAt, noMatchMsg, revealed, teeInfo } from '../src/lib/time';

const at = (s: string) => new Date(s + 'T15:00:00');

describe('look', () => {
  it('turns the main color into readable header colors', () => {
    expect(themeVars({})).toEqual({});
    expect(themeVars({ bandColor: 'nope' })).toEqual({});
    expect(themeVars({ bandColor: '#8B0000' })).toMatchObject({ '--band': '#8b0000', '--onband': '#ffffff' });
    expect(themeVars({ bandColor: '#ffd700' })).toMatchObject({ '--band': '#ffd700', '--onband': '#041e42' });
    expect(lightBand({ bandColor: '#ffd700' })).toBe(true); expect(lightBand({ bandColor: '#041e42' })).toBe(false);
  });
});

describe('event day', () => {
  const ev = withDefaults({ date: '2026-10-23' });
  const groups = [{ id: 'a', name: 'A', tee: '1:10 PM' }, { id: 'b', name: 'B', tee: '12:30' }, { id: 'c', name: 'C', tee: '' }];
  it('knows before, on and after the day', () => {
    expect(dayPhase(ev, at('2026-10-22'))).toBe('before');
    expect(dayPhase(ev, at('2026-10-23'))).toBe('today');
    expect(dayPhase(ev, at('2026-10-24'))).toBe('after');
    expect(dayPhase(withDefaults({}), at('2026-10-24'))).toBe('today');
  });
  it('reads the earliest tee time, with afternoon guessed for 1-6 o’clock', () => {
    expect(teeInfo(groups)).toEqual({ txt: '12:30', mins: 12 * 60 + 30 });
    expect(teeInfo([{ id: 'x', name: 'x', tee: '9:00' }, { id: 'y', name: 'y', tee: '2:00' }]).mins).toBe(9 * 60);
    expect(teeInfo([]).mins).toBeNull();
  });
  it('goes live 10 minutes before the first tee time', () => {
    const t = liveAt(ev, groups, at('2026-10-23'));
    expect(new Date(t).getHours()).toBe(12); expect(new Date(t).getMinutes()).toBe(20);
    expect(liveAt(ev, [], at('2026-10-23'))).toBe(0);
  });
  it('header chip follows the day', () => {
    expect(chip(ev, groups, at('2026-10-20'))[0]).toMatch(/^Upcoming · Oct 23 · 12:30$/);
    expect(chip(ev, groups, new Date('2026-10-23T09:00:00'))).toEqual(['Today · 12:30', false]);
    expect(chip(ev, groups, new Date('2026-10-23T12:25:00'))).toEqual(['Live', true]);
    expect(chip(ev, groups, at('2026-10-24'))).toEqual(['Final', false]);
    expect(chip({ ...ev, locked: true }, groups, at('2026-10-23'))).toEqual(['Final', false]);
    expect(chip({ ...ev, visibility: 'hidden' }, groups, new Date('2026-10-23T13:00:00'))).toEqual(['Leaderboard hidden', false]);
  });
  it('scheduled results show once their time comes', () => {
    const e = withDefaults({ visibility: 'scheduled', revealAt: 1000 });
    expect(revealed(e, 999)).toBe(false); expect(revealed(e, 1000)).toBe(true);
    expect(revealed(withDefaults({ visibility: 'hidden' }))).toBe(false);
  });
  it('event list status', () => {
    expect(evStatus({ date: '2026-10-23', locked: false }, at('2026-10-23'))).toEqual(['Today', 'live']);
    expect(evStatus({ date: '2026-10-30', locked: false }, at('2026-10-23'))).toEqual(['Upcoming', '']);
    expect(evStatus({ date: '2026-10-01', locked: false }, at('2026-10-23'))).toEqual(['Final', 'past']);
  });
  it('message before matches are posted', () => {
    expect(noMatchMsg({ date: '' })).toEqual(['Pairings coming soon', 'Matches will be posted here before the event.']);
    expect(noMatchMsg({ date: '', noMatchTitle: 'Hold tight' })).toEqual(['Hold tight', '']);
  });
});
