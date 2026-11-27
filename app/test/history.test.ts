import { describe, expect, it } from 'vitest';
import { cleanNames, entryFromBoard, entryToForm, formToEntry, records, scoreText, type HistoryEntry } from '../src/lib/history';

const T = (name: string, players: string[], score: number | null, toPar: number | null) => ({ name, players, score, toPar });
const E = (year: number, champ: ReturnType<typeof T>, field: ReturnType<typeof T>[] = []): HistoryEntry => ({ id: 'y' + year, year, champ, field });

describe('history', () => {
  it('splits player names on commas, ampersands and "and"', () => {
    expect(cleanNames('Will Hickey, Dad & Uncle  Mike and Jack')).toEqual(['Will Hickey', 'Dad', 'Uncle Mike', 'Jack']);
  });
  it('shows a score both ways, one way or not at all', () => {
    expect(scoreText({ score: 64, toPar: -8 })).toBe('64 (−8)');
    expect(scoreText({ score: null, toPar: 0 })).toBe('E');
    expect(scoreText({ score: 70, toPar: null })).toBe('70');
    expect(scoreText({ score: null, toPar: null })).toBe('');
  });
  it('counts titles per player, ignoring case and spaces', () => {
    const r = records([E(2024, T('A', ['Will', 'Dad'], 64, -8)), E(2025, T('B', ['will ', 'Mom'], 62, -10)), E(2023, T('C', ['Dad'], 66, -6))]);
    expect(r.titles.find(t => t.name === 'Will')).toMatchObject({ n: 2, years: [2024, 2025] });
    expect(r.titles.map(t => t.n)).toEqual([2, 2, 1]);
    expect(r.lowest?.e.year).toBe(2025);
  });
  it('uses to par for the lowest score when any year has it', () => {
    const r = records([E(2020, T('Old', ['X'], 60, null)), E(2021, T('New', ['Y'], 66, -6))]);
    expect(r.lowest?.e.year).toBe(2021);
  });
  it('finds the biggest win and the closest finish from the field', () => {
    const r = records([
      E(2024, T('A', ['a'], 64, -8), [T('B', ['b'], 68, -4)]),
      E(2025, T('C', ['c'], 62, -10), [T('D', ['d'], 63, -9)]),
      E(2023, T('E', ['e'], 65, -7), []),
    ]);
    expect(r.biggest).toMatchObject({ by: 4 }); expect(r.biggest?.e.year).toBe(2024);
    expect(r.closest).toMatchObject({ by: 1 }); expect(r.closest?.e.year).toBe(2025);
  });
  it('team titles only list repeat winners', () => {
    const r = records([E(2024, T('Hickey Boys', ['a'], 64, -8)), E(2025, T('hickey boys', ['b'], 62, -10)), E(2023, T('Other', ['c'], 65, -7))]);
    expect(r.teamTitles).toEqual([{ name: 'Hickey Boys', n: 2, years: [2024, 2025] }]);
  });
  it('builds a year from the final leaderboard', () => {
    const e = entryFromBoard(2027, '2027-06-12', 'Home CC', [
      { pos: 1, name: 'Team 2', players: ['a', 'b'], strokes: 62, rel: -10 },
      { pos: 2, name: 'Team 1', players: ['c'], strokes: 65, rel: -7 },
    ]);
    expect(e?.champ).toMatchObject({ name: 'Team 2', toPar: -10, score: 62 });
    expect(e?.field).toHaveLength(1);
    expect(entryFromBoard(2027, '', '', [])).toBeNull();
  });
  it('checks the form and round-trips an entry', () => {
    const blank = entryToForm(null);
    expect(formToEntry({ ...blank, year: '' })).toMatch(/year/);
    expect(formToEntry({ ...blank, year: '2019' })).toMatch(/winning/);
    const out = formToEntry({ ...blank, year: '2019', players: 'Will, Dad', toPar: 'E', score: '72', field: [{ name: 'Mom team', players: 'Mom', score: '', toPar: '+2' }, { name: '', players: '', score: '', toPar: '' }] });
    expect(out).toMatchObject({ year: 2019, champ: { players: ['Will', 'Dad'], toPar: 0, score: 72 }, field: [{ name: '', players: ['Mom'], toPar: 2, score: null }] });
    const f = entryToForm({ id: 'x', ...(out as any) });
    expect(f).toMatchObject({ year: '2019', players: 'Will, Dad', toPar: 'E', score: '72' });
  });
});
