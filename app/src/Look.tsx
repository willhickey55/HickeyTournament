/* Look tab: everything that makes an event feel like its own (name, header text, color, picture, tab title). */
import { editEvent, saveEvent } from './actions';
import { EventBand } from './Boards';
import { cleanHex } from './lib/look';
import { E, toast } from './state';
import { HICKEY_LOGO, Header, SecHead } from './ui';

/* Header colors to pick from; any other color works with the color picker. */
const MAIN: [string, string][] = [['#1f4d3a', 'Logo green (standard)'], ['#13233f', 'Logo navy'], ['#041e42', 'Navy'], ['#003594', 'Blue'], ['#000000', 'Black'], ['#8b0000', 'Dark red'], ['#c8102e', 'Red'], ['#1b5e20', 'Green'], ['#4a148c', 'Purple'], ['#bbbcbc', 'Gray'], ['#f2c75c', 'Gold']];

/** Shrink a picture on the phone to at most 240 px, so it fits in the event (and loads fast). */
export async function shrinkImage(file: File, max = 240): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const s = Math.min(1, max / Math.max(img.width, img.height)), w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const webp = cv.toDataURL('image/webp', 0.85);
    return webp.startsWith('data:image/webp') ? webp : cv.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}

export function Look() {
  const e = E(), main = cleanHex(e.bandColor);
  const txt = (k: 'name' | 'eyebrow' | 'tagline' | 'tabTitle') => (ev: Event) => editEvent({ [k]: (ev.target as HTMLInputElement).value });
  const onFile = async (ev: Event) => {
    const f = (ev.target as HTMLInputElement).files?.[0]; (ev.target as HTMLInputElement).value = '';
    if (!f) return;
    try { const img = await shrinkImage(f); if (img.length > 300000) { toast('That picture is too big. Try a smaller one.'); return; } saveEvent({ logo: 'custom', logoImg: img }); toast('Picture updated'); }
    catch (_) { toast('Couldn’t read that picture. Try a PNG or JPG.'); }
  };
  return (
    <div class="form" style="padding-top:12px">
      <p class="note">Make this event its own. Changes show for everyone right away. This is how the top of the page looks to players:</p>
      <div class="preview-band"><Header><EventBand preview /></Header></div>

      <SecHead title="Header" />
      <div class="field"><label for="l-name">Event name</label><input type="text" id="l-name" maxLength={80} value={e.name} onInput={txt('name')} /></div>
      <div class="field"><label for="l-eye">Small text above the name</label><input type="text" id="l-eye" maxLength={60} value={e.eyebrow || ''} placeholder="Leave blank for none" onInput={txt('eyebrow')} /><small class="note">Blank = nothing shows.</small></div>
      <div class="field"><label for="l-tag">Tagline (optional)</label><input type="text" id="l-tag" maxLength={120} value={e.tagline || ''} placeholder="The family scramble" onInput={txt('tagline')} /><small class="note">A short line under the name.</small></div>

      <div class="field"><label>Main color</label>
        <div class="colors">
          {MAIN.map(([c, n]) => <button class={'swb' + (main === c ? ' on' : '')} style={`background:${c || '#041e42'}`} aria-label={n} title={n} onClick={() => saveEvent({ bandColor: c })} />)}
          <input type="color" aria-label="Pick any color" title="Pick any color" value={main || '#041e42'} onInput={ev => editEvent({ bandColor: (ev.target as HTMLInputElement).value })} />
        </div>
        <small class="note">Used for the header, the “your group” card and the bottom of the page.</small></div>

      <div class="field"><label>Picture next to the name</label>
        <div class="logopick">
          {e.logo === 'none' ? null : <img src={e.logo === 'custom' && e.logoImg ? e.logoImg : HICKEY_LOGO} alt="" />}
          <div class="seg2" role="group">
            <button class={e.logo !== 'none' && e.logo !== 'custom' ? 'on' : ''} onClick={() => saveEvent({ logo: 'hickey' })}>Hickey logo</button>
            {e.logoImg ? <button class={e.logo === 'custom' ? 'on' : ''} onClick={() => saveEvent({ logo: 'custom' })}>Yours</button> : null}
            <button class={e.logo === 'none' ? 'on' : ''} onClick={() => saveEvent({ logo: 'none' })}>None</button>
          </div>
          <label class="btn filebtn">{e.logoImg ? 'Upload another' : 'Upload your own'}<input type="file" accept="image/*" onChange={onFile} aria-label="Upload a picture" /></label>
        </div>
        <small class="note">PNG with a see-through background looks best. It’s shrunk to a small size on your phone.</small></div>

      <SecHead title="Browser tab" />
      <div class="field"><label for="l-tab">Browser tab title</label><input type="text" id="l-tab" maxLength={60} value={e.tabTitle || ''} placeholder={e.name} onInput={txt('tabTitle')} /><small class="note">Leave blank to use the event name.</small></div>
    </div>
  );
}
