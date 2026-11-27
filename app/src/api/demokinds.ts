/* The preview's example events (demo build only; kept apart from api/demo.ts so the live page's bundle doesn't pull
   the example data in just for the picker's labels). */
/** Preview examples: the Ryder Cup, Friday best ball, and one per format / Ryder match layout so every scoring
    screen can be reached (Nov 21 scoring redesign). */
export const DEMO_KINDS = [['ryder', 'Ryder Cup'], ['layouts', 'Ryder match layouts'], ['ryder9', 'Ryder Cup · 9 holes'], ['bestball', 'Best ball'],
  ['stroke', 'Stroke play'], ['stableford', 'Stableford'], ['team', 'Team stroke play'], ['shamble', 'Shamble'], ['scramble', 'Scramble'],
  ['altshot', 'Alternate shot'], ['skins', 'Skins'], ['split', 'Best ball → Scramble']] as const;
export type DemoKind = typeof DEMO_KINDS[number][0];
