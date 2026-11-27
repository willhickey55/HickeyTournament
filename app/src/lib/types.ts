/* Data shapes for the events site (Firestore: events/current + its subcollections). */

export type FormatKey = 'stroke' | 'stableford' | 'team' | 'bestball' | 'scramble' | 'shamble' | 'altshot' | 'skins' | 'ryder';
export type Visibility = 'live' | 'hidden' | 'scheduled' | 'published';
export type MatchType = 'singles' | 'fourball' | 'foursomes' | 'scramble' | 'stroke' | 'strokesingles'; // strokesingles: back nine only (two 1 v 1 stroke-play matches)
/** Which holes a Ryder Cup match covers. 'split' = front nine one way, back nine another (see contestsOf). */
export type MatchLayout = 'all' | 'front' | 'back' | 'split';
export type Side = 'A' | 'B';
export type MatchResult = 'A' | 'B' | 'H';

export interface EventDoc {
  id?: string;
  name: string;
  date: string;              // YYYY-MM-DD ('' = no date)
  course: string;
  holes: number;             // 9 | 18
  pars: number[];
  format: FormatKey;
  format2?: FormatKey;       // back-nine format for team events ('' / missing / same = one format all round)
  colorA: string;
  colorB: string;
  countN: number;
  countMode: 'hole' | 'round';
  showIndividual: boolean;
  skinsCarry: boolean;
  sideA: string;
  sideB: string;
  visibility: Visibility;
  revealAt: number;
  show: 'full' | 'positions';
  codes: boolean;
  messaging: boolean;
  locked: boolean;
  hold?: boolean;   // scoring not open yet: players can find their match but can't keep score (Will, Oct 21)
  listed: boolean;
  createdAt: number;
  noMatchTitle?: string;
  noMatchText?: string;
  // Look and link (new on the combined site). Blank = default.
  eyebrow?: string;          // small text above the name (default "Hickey Tournament")
  tagline?: string;          // optional line under the name
  tabTitle?: string;         // browser tab title (default: the event name)
  bandColor?: string;        // main color: header, your-group card, footer. #rrggbb ('' = navy)
  logo?: 'wildcat' | 'none' | 'custom';
  logoImg?: string;          // data URL for logo 'custom' (shrunk on the phone)
}

export interface Player { id: string; name: string; groupId?: string; teamId?: string; side?: Side | ''; order?: number; status?: string }
export interface Team { id: string; name: string; groupId?: string; order?: number; status?: string; fromGroup?: string }
export interface Group {
  id: string; name: string; tee?: string; start?: number; scorers?: string[]; submitted?: boolean; submittedAt?: number; order?: number;
  mtype?: MatchType; aIds?: string[]; bIds?: string[];
  // Ryder Cup match setup (all optional; missing = one match over every hole, worth 1 point, as before)
  layout?: MatchLayout;      // all 18 (default), front 9, back 9, or split at the turn
  mtype2?: MatchType;        // back-nine format when split (default singles)
  cross?: boolean;           // back-nine singles: first A player vs second B player (and the other way round)
  pts?: number;              // points per match (each back-nine singles counts as its own match)
  round?: number;            // which round the match is in (missing = 1); a player is in one match per round
}
export interface ScoreDoc { id?: string; groupId?: string; holes?: Record<string, number | MatchResult | null> }
export type Unit = Player | Team;
