/* The tournament's history (Will, Nov 26): one doc per year in `history/{id}`, public to read, exec to write.
   Will types in the past years himself on the History page; "Save this year to history" (Settings) fills a year
   from the live leaderboard before Start a new event erases it. Pure functions here, unit-tested. */

/** One team's finish in a year. score = strokes (e.g. 64), toPar = to par (-8). Either can be missing for old years. */
export interface HistTeam { name: string; players: string[]; score?: number | null; toPar?: number | null; pos?: number | null }

export interface HistoryEntry {
  id: string;
  year: number;
  date?: string;           // YYYY-MM-DD, optional
  course?: string;
  champ: HistTeam;          // the winners
  field?: HistTeam[];       // everyone else (optional), in finishing order
  note?: string;            // a line or two: "Won on the last hole", "Rain-shortened to 9"
  photo?: string;           // marker ('' = none). The picture itself lives in histphotos/{id} {data} so the page loads fast.
  createdAt?: number;
}

export const cleanNames = (s: string) => s.split(/[,\n&]+|\band\b/i).map(x => x.trim().replace(/\s+/g, ' ')).filter(Boolean);
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !isFinite(+(v as number)) ? null : +(v as number));
export const fmtToPar = (n: number | null | undefined) => (n === null || n === undefined ? '' : n === 0 ? 'E' : n > 0 ? '+' + n : '' + n);

/** How a team's result reads: "64 (−8)", "−8", "64" or "". */
export function scoreText(t: Pick<HistTeam, 'score' | 'toPar'>) {
  const s = num(t.score), p = num(t.toPar);
  if (s !== null && p !== null) return `${s} (${fmtToPar(p).replace('-', '−')})`;
  if (p !== null) return fmtToPar(p).replace('-', '−');
  return s !== null ? String(s) : '';
}

/** Newest year first. */
export const byYear = (a: HistoryEntry, b: HistoryEntry) => b.year - a.year || (b.createdAt || 0) - (a.createdAt || 0);

/** A comparable number for a winning result: to par when there is one, else strokes. Lower is better. */
const best = (t: HistTeam) => (num(t.toPar) !== null ? { v: num(t.toPar)!, par: true } : num(t.score) !== null ? { v: num(t.score)!, par: false } : null);

/** Second place, if the year has a field with a comparable score. */
function runnerUp(e: HistoryEntry): HistTeam | null {
  const w = best(e.champ); if (!w) return null;
  const others = (e.field || []).filter(t => { const b = best(t); return b && b.par === w.par; });
  others.sort((a, b) => best(a)!.v - best(b)!.v);
  return others[0] || null;
}

export interface Records {
  titles: { name: string; n: number; years: number[] }[];   // players with the most wins
  teamTitles: { name: string; n: number; years: number[] }[]; // team names that won more than once
  lowest: { e: HistoryEntry; text: string } | null;          // best winning score
  biggest: { e: HistoryEntry; by: number; second: HistTeam } | null;
  closest: { e: HistoryEntry; by: number; second: HistTeam } | null;
  years: number;
}

/** Everything the Records box shows. Players are matched by name ignoring case and extra spaces. */
export function records(list: HistoryEntry[]): Records {
  const es = list.filter(e => e.champ && (e.champ.name || e.champ.players?.length));
  const tally = (keyOf: (e: HistoryEntry) => string[]) => {
    const m = new Map<string, { name: string; n: number; years: number[] }>();
    for (const e of es) for (const raw of new Set(keyOf(e))) {
      const k = raw.toLowerCase().replace(/\s+/g, ' ').trim(); if (!k) continue;
      const r = m.get(k) || { name: raw.trim(), n: 0, years: [] };
      r.n++; r.years.push(e.year); m.set(k, r);
    }
    return [...m.values()].map(r => ({ ...r, years: r.years.sort((a, b) => a - b) })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  };
  const titles = tally(e => e.champ.players || []);
  const teamTitles = tally(e => (e.champ.name ? [e.champ.name] : [])).filter(r => r.n > 1);

  // lowest winning score: compare to-par results with each other; only fall back to strokes when no year has to par
  const withPar = es.filter(e => num(e.champ.toPar) !== null), pool = withPar.length ? withPar : es.filter(e => num(e.champ.score) !== null);
  const key = (e: HistoryEntry) => (withPar.length ? num(e.champ.toPar)! : num(e.champ.score)!);
  const low = pool.slice().sort((a, b) => key(a) - key(b) || a.year - b.year)[0];

  const margins = es.map(e => { const s = runnerUp(e); return s ? { e, second: s, by: best(s)!.v - best(e.champ)!.v } : null; })
    .filter((x): x is { e: HistoryEntry; second: HistTeam; by: number } => !!x && x.by >= 0);
  const biggest = margins.slice().sort((a, b) => b.by - a.by || a.e.year - b.e.year)[0] || null;
  const closest = margins.slice().sort((a, b) => a.by - b.by || b.e.year - a.e.year)[0] || null;

  return { titles, teamTitles, lowest: low ? { e: low, text: scoreText(low.champ) } : null, biggest: biggest && biggest.by > 0 ? biggest : null, closest, years: es.length };
}

/** "by 3 shots", "in a tie (won the playoff)" */
export const marginText = (by: number) => (by === 0 ? 'tied, won the playoff' : `by ${by} shot${by === 1 ? '' : 's'}`);

/** A history year from the final team leaderboard. rows: [pos, team name, players, strokes, to par]. */
export function entryFromBoard(year: number, date: string, course: string, rows: { pos: number; name: string; players: string[]; strokes: number; rel: number }[]): Omit<HistoryEntry, 'id'> | null {
  if (!rows.length) return null;
  const t = (r: typeof rows[number]): HistTeam => ({ name: r.name, players: r.players, score: r.strokes || null, toPar: r.rel, pos: r.pos });
  return { year, date: date || '', course: course || '', champ: t(rows[0]), field: rows.slice(1).map(t), note: '', photo: '', createdAt: Date.now() };
}

/** Form values (all strings) -> a saved entry. Returns an error message instead when something needed is missing. */
export interface HistForm { year: string; date: string; course: string; team: string; players: string; score: string; toPar: string; note: string; field: { name: string; players: string; score: string; toPar: string }[] }
export function formToEntry(f: HistForm): Omit<HistoryEntry, 'id' | 'createdAt' | 'photo'> | string {
  const year = Math.round(+f.year);
  if (!f.year.trim() || !isFinite(year) || year < 1950 || year > 2100) return 'Enter the year (like 2019).';
  const players = cleanNames(f.players);
  if (!players.length) return 'Enter the winning players.';
  const par = (s: string) => { const v = s.trim().replace(/^e$/i, '0').replace('−', '-').replace(/^\+/, ''); return v === '' ? null : num(v); };
  // no team names (Will, Nov 26): a team is its players
  const team = (_name: string, pl: string, sc: string, tp: string): HistTeam => ({ name: '', players: cleanNames(pl), score: num(sc.trim()), toPar: par(tp) });
  const field = f.field.filter(r => r.players.trim()).map(r => team(r.name, r.players, r.score, r.toPar));
  return { year, date: f.date || '', course: f.course.trim(), champ: { ...team(f.team, f.players, f.score, f.toPar), pos: 1 }, field, note: f.note.trim() };
}
export function entryToForm(e: HistoryEntry | null): HistForm {
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  if (!e) return { year: String(new Date().getFullYear() - 1), date: '', course: '', team: '', players: '', score: '', toPar: '', note: '', field: [] };
  const tp = (v: unknown) => (num(v) === null ? '' : fmtToPar(num(v)));
  return { year: s(e.year), date: e.date || '', course: e.course || '', team: e.champ.name || '', players: (e.champ.players || []).join(', '), score: s(e.champ.score), toPar: tp(e.champ.toPar), note: e.note || '',
    field: (e.field || []).map(t => ({ name: t.name || '', players: (t.players || []).join(', '), score: s(t.score), toPar: tp(t.toPar) })) };
}
/** A team's display name: its name, or its players. */
export const teamLabel = (t: HistTeam) => joinNames(t.players || []) || t.name || 'Unknown';
const joinNames = (ns: string[]) => (ns.length < 3 ? ns.join(' & ') : ns.slice(0, -1).join(', ') + ' & ' + ns[ns.length - 1]);
