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
