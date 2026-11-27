/* Crosswinds Golf Club (Plymouth, MA): 27 holes in three nines. The tournament is always there, and which two
   nines it's played on is only known on the day (Will, Nov 26), so the exec picks them in Settings → Round.
   Pars copied from Will's golf stats app (will-golf-stats, course "Crosswinds Golf Club"), Nov 26, 2026. */

export const CLUB = 'Crosswinds';
/** The course name with no nines picked yet (also what un-picking goes back to). */
export const CLUB_NAME = 'Crosswinds Golf Club';
export const NINES: Record<string, number[]> = {
  Jones: [5, 4, 4, 4, 5, 3, 4, 3, 4],
  Ouimet: [4, 3, 4, 5, 5, 4, 4, 3, 4],
  Zaharias: [4, 4, 5, 4, 4, 3, 4, 3, 5],
};
export const NINE_NAMES = Object.keys(NINES);

/** The course name and pars for a front nine and a back nine. Either can be left out (not picked yet, or
    un-picked): its holes keep the pars in `rest`. */
export function crosswinds(front: string, back?: string, rest: number[] = []): { course: string; pars: number[] } {
  const f = NINES[front] ? front : '';
  const b = back && NINES[back] && back !== f ? back : '';
  const keep = (i: number) => +rest[i] || 4;
  const pars = [...(f ? NINES[f] : Array.from({ length: 9 }, (_, i) => keep(i))), ...(b ? NINES[b] : Array.from({ length: 9 }, (_, i) => keep(9 + i)))];
  const name = f && b ? f + ' / ' + b : f ? f : b ? 'back nine ' + b : '';
  return { course: name ? `${CLUB} · ${name}` : CLUB_NAME, pars };
}

/** Which nines the saved course name points to ([] = not a Crosswinds course). */
export function ninesOf(course: string | undefined): string[] {
  const m = /^Crosswinds\b.*?·\s*(.+)$/i.exec(course || '');
  if (!m) return [];
  const nm = (s: string) => NINE_NAMES.find(n => n.toLowerCase() === s.trim().toLowerCase()) || '';
  const back = /^back nine\s+(.+)$/i.exec(m[1].trim());
  if (back) return ['', nm(back[1])];
  return m[1].split('/').map(nm);
}

/** Every 18-hole way round, for the History editor's course suggestions. */
export const ALL_ROUTES = NINE_NAMES.flatMap(a => NINE_NAMES.filter(b => b !== a).map(b => crosswinds(a, b).course));
