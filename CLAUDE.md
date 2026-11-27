# CLAUDE.md — working notes for Claude

Read this first, then README.md.

## Who and what
- Owner: Will Hickey. Wants direct, plain, conversational replies.
- Family golf tournament every June, usually 3-4 teams, scramble. Site = live scoring (`/`) + History (`/history`).
- Repo willhickey55/HickeyTournament, branch `main`. Vercel serves `site/` (rewrites in vercel.json), no build step.
- Firebase project `hickey-tournament` (made Nov 26, 2026 with Will's OK: Spark, no Gemini, no Analytics, Google +
  Anonymous sign-in, Firestore nam5 production mode). Rules: `firebase/firestore.rules`.
- Code came from unh-golf `events-app/` on Nov 26, 2026. Fixes to shared scoring there may be worth copying over.

## Rules Will set (from unh-golf; same here)
- Never type passwords or do Google sign-ins. Will signs in himself.
- Get Will's explicit OK before publishing Firestore rules or changing account/security settings.
- Big changes: branch + PR + a preview (artifact) Will looks at before it goes live. Small fixes straight to `main`.
- Wording: "Exec", never "Organizer". The site stays out of Google (noindex meta + X-Robots-Tag header).
- Design taste: no "AI slop" look (status pills with dots, mono small-caps labels). Exec screens plain.

## Build and check
- `cd app && npm test && npm run build` (commit `site/index.html`). `npm run build:demo` -> `.preview/index.html`.
- Browser tests: Playwright with the preinstalled Chromium; abort Google Fonts requests or pages hang.

## History page (Nov 26)
- `lib/history.ts` (tested in test/history.test.ts): types, `records()` (most titles by player name ignoring case,
  repeat team names, lowest winning score by to-par when any year has it else strokes, biggest win / closest finish
  from the field), form <-> entry, `entryFromBoard`.
- `History.tsx`: page (newest year as the hero card, past champions, Records aside on laptops), `LastChamps` on the
  live page, exec editor (`S.histEdit`). Photos in `histphotos/{id}`, loaded per card (`loadHistPhoto`).
- Settings → "Save this year to History" (`saveYearToHistory`): team leaderboard -> that year's doc (same year = update).
- Routing: `S.page` from the path (`/history`, or `#history` in previews), `goPage` uses pushState. `SiteNav` strip.
- Start a new event keeps name, look, format, holes, course and pars (Will's tournament is the same every year).

## Status
- LIVE Nov 26, 2026: https://hickeytournament.vercel.app (Vercel project `hickeytournament`, team wh-golf, preset Other,
  root ./, no build). `firebase/firestore.rules` published Nov 26 7:56 PM with Will's OK (read back, same length).
  hickeytournament.vercel.app added to Firebase Auth authorized domains.
- GitHub flagged the Firebase web API key as a secret: expected (it's public by design); Will closes the alert.
  Optional: restrict the key to the site's referrers in Google Cloud.
- Vercel Web Analytics isn't on for this project, so /_vercel/insights/script.js 404s (harmless). Turn it on in Vercel
  if Will wants visit counts.
- Still to do (Will): sign in as exec once (creates events/current with the defaults), add past years on /history.
- Logo (Nov 26): Will's Hickey Family Tournament logo (cream badge, navy + green #1f4d3a). site/img: icon-64/180/192,
  preview.jpg (link preview); app/src/logo.webp = header badge, Look tab "Hickey logo" (event logo 'hickey', the default).
- Preview (example data): https://claude.ai/artifact/1fgg4zd88MTeVmzN3BZw3g
- Crosswinds (Nov 26): the tournament is always at Crosswinds Golf Club (Plymouth, MA), 27 holes in three nines (Jones,
  Ouimet, Zaharias, par 36 each). `lib/courses.ts` (pars from Will's will-golf-stats course doc) + `CrosswindsPick` at the
  top of Settings → Round: pick the front and back nine on the day, course name ("Crosswinds · Jones / Ouimet") and pars
  fill in. Default course "Crosswinds Golf Club" with nothing picked. Tapping a picked nine un-picks it (Will, Nov 26):
  its holes keep their pars; "Crosswinds · back nine X" when only the back is picked. History editor suggests the six routes.

## Redesign (Nov 26; LIVE: PR #1 merged Nov 26 ~9:06 PM with Will's OK, branch `redesign` can be deleted; draft canvas https://claude.ai/artifact/Qjt7MCWX4VHWeEJocyB3dG)
- Will's picks: white page, logo's navy (#13233f) for text/buttons/cards, light gray fills (#f4f4f4), NO green outside the
  logo, Archivo throughout (800 for names, scores, headings; Caslon + Source Sans was tried and dropped). Built with the Hallmark + Impeccable floors in
  mind: no tracked capitals, no eyebrows, no middle-dot meta strings, no hard offset shadows, no decorative status dots.
- `Head.tsx`: `HomeHead` (see-through logo `logo-clear.png` centered, "Saturday, June 12", "Crosswinds, Jones and Ouimet
  nines" from `courseLine`, Leaderboard/History pills = `SiteNav pills`) and `HistoryHead`. The exec strip nav only shows
  in the exec view of the live page. `redesign.css` (imported last) applies to every screen, exec too since Nov 26 (Will: the exec
  board hadn't been redone); it forces --band navy, so the Look tab's main colour no longer shows anywhere. The exec view
  uses `HomeHead` too (logo, date, pills, Player view button), then the exec tabs. Event link = the site root (EVENT_PATH '/'). Scoring screens: same fonts and navy (`--k-royal` -> navy), layout unchanged.
- No team names (Will, Nov 26): `nameTeams()` in state.ts (runs in every `emit()`) sets each team's `name` to its
  players' first names ("Alex, Jake & Tom"; a shared first name gets the last initial); the stored name ("Team 1") is kept as `base` and shows only while a team is empty. The exec's
  team-name boxes are gone. History: no team-name fields; `teamLabel` = the players; "Repeat team champions" removed.
- One team (3 or 4 players) per tee time (Will, Nov 26): MyCard says "Your team" and "Your scorecard" when the group holds
  exactly one team. Exec: Groups by tee time, then Field → "Make each group a team". Demo "Scramble" = 4 teams of 3.
- Scoring screen has a leaderboard under the hole grid (`MiniBoard` in Scoring.tsx; hidden while the board is hidden).
- Fixed: the player scorecard's `table.sc9.teams` picked up base.css `.teams{display:grid}` (laptop layout broke);
  the class is `tms` now. The same bug is likely in unh-golf events-app (not changed there).
- Laptop layout (Will, Nov 26): >=1024px the live page is a grid (`.pl-grid` in Player.tsx / redesign.css): header, your
  team card + scorecard and last year's champions on the left (360px), leaderboard on the right. `main` and its `.wrap`
  are display:contents there. Phones unchanged (one column).
