import { describe, expect, it } from 'vitest';
import { ALL_ROUTES, crosswinds, ninesOf } from '../src/lib/courses';

describe('Crosswinds', () => {
  it('builds the name and 18 pars from two nines', () => {
    const c = crosswinds('Ouimet', 'Zaharias');
    expect(c.course).toBe('Crosswinds · Ouimet / Zaharias');
    expect(c.pars).toEqual([4, 3, 4, 5, 5, 4, 4, 3, 4, 4, 4, 5, 4, 4, 3, 4, 3, 5]);
    expect(c.pars.reduce((a, b) => a + b, 0)).toBe(72);
  });
  it('a 9-hole round is one nine', () => {
    expect(crosswinds('Jones').course).toBe('Crosswinds · Jones');
    expect(crosswinds('Jones').pars.slice(0, 9)).toEqual([5, 4, 4, 4, 5, 3, 4, 3, 4]);
  });
  it('never pairs a nine with itself', () => {
    expect(crosswinds('Jones', 'Jones').course).toBe('Crosswinds · Jones');
  });
  it('un-picking: nothing picked goes back to the club name, unpicked holes keep their pars', () => {
    const rest = Array(18).fill(4);
    expect(crosswinds('', '', rest)).toEqual({ course: 'Crosswinds Golf Club', pars: rest });
    const b = crosswinds('', 'Ouimet', rest);
    expect(b.course).toBe('Crosswinds · back nine Ouimet');
    expect(b.pars).toEqual([...Array(9).fill(4), 4, 3, 4, 5, 5, 4, 4, 3, 4]);
    expect(ninesOf(b.course)).toEqual(['', 'Ouimet']);
    expect(ninesOf('Crosswinds · Jones')).toEqual(['Jones']);
  });
  it('reads the nines back from the course name', () => {
    expect(ninesOf('Crosswinds · Zaharias / Jones')).toEqual(['Zaharias', 'Jones']);
    expect(ninesOf('Crosswinds Golf Club')).toEqual([]);
    expect(ninesOf('Some other course')).toEqual([]);
  });
  it('lists all six ways round', () => { expect(ALL_ROUTES).toHaveLength(6); });
});
