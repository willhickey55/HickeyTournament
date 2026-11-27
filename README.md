# Hickey Tournament

Live scoring and history for the Hickey family tournament (every June, usually 3 or 4 teams playing a scramble).
One self-contained page served by Vercel:

| URL | What |
|---|---|
| `/` | This year's tournament: live team leaderboard, scorecards, score entry on phones, exec setup |
| `/history` | Every past champion, full results by year, records (most titles, lowest winning score, biggest win, closest finish) |

Built from the UNH Golf `/event` app (willhickey55/unh-golf, `events-app/`): same scoring, formats, offline saving,
results picture and exec tools, with the UNH branding taken out and a History page added.

## Layout

- `app/` – the source (Preact + TypeScript + Vite). `app/src/History.tsx` and `app/src/lib/history.ts` are the History page.
- `shared/` – CSS and small helpers copied from unh-golf `src/shared/`.
- `site/` – the built page (`index.html`, committed) and `sw.js` (keeps the page working with no signal). Vercel serves
  these; there is no build step on Vercel.
- `firebase/firestore.rules` – Firestore rules for the `hickey-tournament` project (published by hand in the console).

## Build

```sh
cd app
npm install
npm test             # scoring + history tests
npm run build        # writes ../site/index.html (commit it)
npm run build:demo   # ../.preview/index.html: example data, no Firebase
```

## Data (Firebase project `hickey-tournament`)

- `events/current` and its subcollections: this year's tournament (same as the UNH events app).
- `history/{id}`: one doc per year `{year, date, course, champ: {name, players[], score, toPar}, field: [...], note, photo}`.
- `histphotos/{id}`: that year's picture `{data}` (JPEG shrunk on the phone), loaded only when shown.
- `config/admins`: other exec emails (willhickey55@gmail.com is always exec).

Players are signed in anonymously; the exec signs in with Google.

## Each June

1. Settings: date, course, pars. Field: add players and teams. Groups: one per team (or per foursome).
2. Share the link. Each team's scorer taps their group and enters one score per hole.
3. After the round: Settings → **Save this year to History**, then **Start a new event** (keeps the name, look,
   format, course and pars, erases the scores and teams).
