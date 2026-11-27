/* The event's look: its main color, turned into readable header colors. */
import type { EventDoc } from './types';

const hex = (s: string | undefined) => (s && /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : '');
function lum(h: string) {
  const ch = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
/** Readable text on a color: navy on light colors, white on dark ones. */
export const onColor = (h: string) => (lum(h) > 0.4 ? '#041e42' : '#ffffff');

/** CSS variables for the event's main color (header, your-group card, footer) ({} = the standard navy look). */
export function themeVars(e: Pick<EventDoc, 'bandColor'>): Record<string, string> {
  const v: Record<string, string> = {}, band = hex(e.bandColor);
  if (band) {
    const dark = onColor(band) === '#ffffff';
    v['--band'] = band; v['--onband'] = dark ? '#ffffff' : '#041e42';
    v['--bandmuted'] = dark ? 'rgba(255,255,255,.72)' : 'rgba(4,30,66,.72)';
    v['--bandrule'] = dark ? 'rgba(255,255,255,.4)' : 'rgba(4,30,66,.35)';
  }
  return v;
}
export const cleanHex = hex;
/** True when the main color is light, so text and buttons on it switch to navy. */
export const lightBand = (e: Pick<EventDoc, 'bandColor'>) => { const b = hex(e.bandColor); return !!b && onColor(b) !== '#ffffff'; };
