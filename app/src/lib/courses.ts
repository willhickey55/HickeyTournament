/* Crosswinds Golf Club (Plymouth, MA): 27 holes in three nines. The tournament is always there, and which two
   nines it's played on is only known on the day (Will, Nov 26), so the exec picks them in Settings → Round.
   Pars copied from Will's golf stats app (will-golf-stats, course "Crosswinds Golf Club"), Nov 26, 2026. */

export const CLUB = 'Crosswinds';
export const NINES: Record<string, number[]> = {
  Jones: [5, 4, 4, 4, 5, 3, 4, 3, 4],
  Ouimet: [4, 3, 4, 5, 5, 4, 4, 3, 4],
  Zaharias: [4, 4, 5, 4, 4, 3, 4, 3, 5],
};
export const NINE_NAMES = Object.keys(NINES);

/** The course name and pars for a front nine (and a back nine for 18 holes). */
export function crosswinds(front: string, back?: string): { course: string; pars: number[] } {
  const f = NINES[front] ? front : NINE_NAMES[0];
  const b = back && NINES[back] && back !== f ? back : '';
  const pars = [...NINES[f], ...(b ? NINES[b] : NINES[f])];
  return { course: `${CLUB} · ${b ? f + ' / ' + b : f}`, pars };
}

/** Which nines the saved course name points to ([] = not a Crosswinds course). */
export function ninesOf(course: string | undefined): string[] {
  const m = /^Crosswinds\b.*?·\s*(.+)$/i.exec(course || '');
  if (!m) return [];
  return m[1].split('/').map(s => s.trim()).map(s => NINE_NAMES.find(n => n.toLowerCase() === s.toLowerCase()) || '').filter(Boolean);
}

/** Every 18-hole way round, for the History editor's course suggestions. */
export const ALL_ROUTES = NINE_NAMES.flatMap(a => NINE_NAMES.filter(b => b !== a).map(b => crosswinds(a, b).course));
