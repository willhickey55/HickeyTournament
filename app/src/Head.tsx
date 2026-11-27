/* The redesign's header for the public pages (Will, Nov 26): white page, the Hickey logo big at the top, the day and
   the course under it, then the two pages as pill buttons. Exec screens keep the plain band (Boards.tsx EventBand). */
import { ninesOf } from './lib/courses';
import type { EventDoc } from './lib/types';
import { E, S } from './state';
import { HICKEY_LOGO, SiteNav, ViewSwitch, logoOf } from './ui';
import clearLogo from './logo-clear.png';

/** On the white page the Hickey logo is drawn without its cream square (an uploaded picture shows as it is). */
const pageLogo = (src: string) => (src === HICKEY_LOGO ? clearLogo : src);

/** "Saturday, June 12" (no year: the logo carries it). */
export const longDate = (d: string) => (d ? new Date(d + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) : '');

/** "Crosswinds, Jones and Ouimet nines" once the nines are picked, else the course as typed. */
export function courseLine(e: Pick<EventDoc, 'course'>) {
  const [a, b] = ninesOf(e.course);
  if (a && b) return `Crosswinds, ${a} and ${b} nines`;
  if (a) return `Crosswinds, ${a} nine`;
  if (b) return `Crosswinds, ${b} nine`;
  return e.course || '';
}

export function HomeHead() {
  const e = E(), logo = pageLogo(logoOf(e));
  return (
    <header class="hh"><div class="wrap">
      {S.canOrg ? <div class="hh-exec"><ViewSwitch /></div> : null}
      {logo ? <img class="hh-logo" src={logo} alt="" /> : null}
      <h1 class={'hh-name' + (logo ? ' sr' : '')}>{e.name}</h1>
      {e.date ? <p class="hh-date">{longDate(e.date)}</p> : null}
      {courseLine(e) ? <p class="hh-course">{courseLine(e)}</p> : null}
      {e.tagline ? <p class="hh-course">{e.tagline}</p> : null}
      <SiteNav pills />
    </div></header>
  );
}

export function HistoryHead({ years, first }: { years: number; first: number }) {
  const logo = pageLogo(logoOf(E()));
  return (
    <header class="hh hh-hist"><div class="wrap">
      {S.canOrg ? <div class="hh-exec"><ViewSwitch /></div> : null}
      <div class="hh-row">
        {logo ? <img class="hh-logo sm" src={logo} alt="" /> : null}
        <div><h1 class="hh-title">History</h1>
          <p class="hh-course">{years ? `${years} ${years === 1 ? 'tournament' : 'tournaments'} since ${first}` : 'Every champion, every year'}</p></div>
      </div>
      <SiteNav pills />
    </div></header>
  );
}
