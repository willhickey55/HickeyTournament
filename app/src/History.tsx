/* /history: every past champion, records, and (for the exec) the editor for each year. Data: lib/history.ts. */
import { useEffect, useState } from 'preact/hooks';
import { deleteHistory, goPage, loadHistPhoto, saveHistory, setHistPhoto } from './actions';
import { entryToForm, formToEntry, marginText, records, scoreText, teamLabel, type HistForm, type HistoryEntry } from './lib/history';
import { fmtDate } from './lib/time';
import { E, S, emit, toast } from './state';
import { Confirm, Foot, Header, SecHead, ViewSwitch } from './ui';

const editing = () => S.canOrg && !S.asPlayer;

export function HistoryPage() {
  const list = S.history, r = records(list), first = list.length ? list[list.length - 1].year : 0;
  if (S.histEdit && editing()) return <HistEditor id={S.histEdit} />;
  return (
    <>
      <Header>
        <div class="toprow"><div class="eyebrow">{E().eyebrow || 'Hickey Tournament'}</div><span class="hdr-r"><ViewSwitch /></span></div>
        <div class="headline"><h1 class="evname">History</h1></div>
        <p class="fmtline">{r.years ? `${r.years} ${r.years === 1 ? 'tournament' : 'tournaments'} · since ${first}` : 'Every champion, every year'}</p>
      </Header>
      <main><div class="wrap h-wrap">
        {!S.histReady ? <div class="skpage" role="status" aria-label="Loading"><span class="sk big" /><span class="sk row" /><span class="sk row" /></div>
          : <div class="h-cols">
            <section class="h-main">
              {editing() ? <button class="btn primary big" onClick={() => { S.histEdit = 'new'; emit(); window.scrollTo(0, 0); }}>+ Add a year</button> : null}
              {list.length ? <Champion e={list[0]} hero /> : <div class="empty"><b>No years yet</b><span>{editing() ? 'Add past tournaments with “Add a year”.' : 'Past champions show up here.'}</span></div>}
              {list.length > 1 ? <><SecHead title="Past champions" /><div class="h-list">{list.slice(1).map(e => <Champion e={e} />)}</div></> : null}
            </section>
            {r.years ? <aside class="h-side"><Records list={list} /></aside> : null}
          </div>}
      </div></main>
      <Foot />
    </>
  );
}

function Photo({ e }: { e: HistoryEntry }) {
  useEffect(() => { if (e.photo) loadHistPhoto(e.id); }, [e.id, e.photo]);
  const src = e.photo ? S.histPhotos[e.id] : '';
  if (!e.photo) return null;
  return <div class="h-photo">{src ? <img src={src} alt={`${teamLabel(e.champ)}, ${e.year} champions`} loading="lazy" /> : <span class="sk" />}</div>;
}

function Champion({ e, hero }: { e: HistoryEntry; hero?: boolean }) {
  const c = e.champ, where = [e.date ? fmtDate(e.date) : '', e.course].filter(Boolean).join(' · '), sc = scoreText(c);
  const names = c.name && c.players?.length ? c.players.join(', ') : '';
  return (
    <article class={'h-card' + (hero ? ' hero' : '')}>
      <Photo e={e} />
      <div class="h-body">
        <div class="h-top"><span class="h-year">{e.year}</span>{hero ? <span class="h-tag">{e.year >= new Date().getFullYear() - 1 ? 'Defending champions' : 'Most recent'}</span> : null}</div>
        <div class="h-champ"><h3>{teamLabel(c)}</h3>{sc ? <span class="h-score">{sc}</span> : null}</div>
        {names ? <p class="h-players">{names}</p> : null}
        {where ? <p class="h-where">{where}</p> : null}
        {e.note ? <p class="h-note">{e.note}</p> : null}
        {e.field?.length ? <details class="h-field"><summary>Full results ({e.field.length + 1} teams)</summary>
          <ol>{[{ ...c, pos: 1 }, ...e.field].map((t, i) => <li><span class="h-pos">{t.pos || i + 1}</span><span class="h-fn"><b>{teamLabel(t)}</b>{t.name && t.players?.length ? <small>{t.players.join(', ')}</small> : null}</span><span class="h-fs">{scoreText(t)}</span></li>)}</ol>
        </details> : null}
        {editing() ? <div class="h-edit"><button class="btn" onClick={() => { S.histEdit = e.id; emit(); window.scrollTo(0, 0); }}>Edit {e.year}</button></div> : null}
      </div>
    </article>
  );
}

function Records({ list }: { list: HistoryEntry[] }) {
  const r = records(list), top = r.titles.slice(0, 6);
  return (
    <div class="h-rec">
      <SecHead title="Records" />
      {top.length ? <div class="h-block"><h4>Most titles</h4><ol class="h-titles">{top.map(t => <li><span>{t.name}</span><b>{t.n}</b><small>{t.years.join(', ')}</small></li>)}</ol></div> : null}
      {r.lowest ? <div class="h-block"><h4>Lowest winning score</h4><p class="h-big">{r.lowest.text}</p><p>{teamLabel(r.lowest.e.champ)}, {r.lowest.e.year}</p></div> : null}
      {r.biggest ? <div class="h-block"><h4>Biggest win</h4><p class="h-big">{r.biggest.by} {r.biggest.by === 1 ? 'shot' : 'shots'}</p><p>{teamLabel(r.biggest.e.champ)} over {teamLabel(r.biggest.second)}, {r.biggest.e.year}</p></div> : null}
      {r.closest && (!r.biggest || r.closest.e.id !== r.biggest.e.id) ? <div class="h-block"><h4>Closest finish</h4><p class="h-big">{r.closest.by === 0 ? 'Playoff' : r.closest.by + (r.closest.by === 1 ? ' shot' : ' shots')}</p><p>{teamLabel(r.closest.e.champ)} {marginText(r.closest.by)} over {teamLabel(r.closest.second)}, {r.closest.e.year}</p></div> : null}
      {r.teamTitles.length ? <div class="h-block"><h4>Repeat team champions</h4><ol class="h-titles">{r.teamTitles.map(t => <li><span>{t.name}</span><b>{t.n}</b><small>{t.years.join(', ')}</small></li>)}</ol></div> : null}
    </div>
  );
}

/** Small "Champions" link for the live page: last year's winners under the leaderboard. */
export function LastChamps() {
  const e = S.history[0]; if (!e) return null;
  return <button class="h-last" onClick={() => goPage('history')}><span class="lbl">{e.year} champions</span><b>{teamLabel(e.champ)}</b>
    {e.champ.name && e.champ.players?.length ? <small>{e.champ.players.join(', ')}</small> : null}<span class="h-more">All past champions →</span></button>;
}

/* ---------- exec editor ---------- */
async function shrinkPhoto(file: File, max = 1200): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const s = Math.min(1, max / Math.max(img.width, img.height)), w = Math.round(img.width * s), h = Math.round(img.height * s);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d')!.drawImage(img, 0, 0, w, h);
    for (const q of [0.82, 0.7, 0.55, 0.4]) { const d = cv.toDataURL('image/jpeg', q); if (d.length < 700000) return d; }
    throw new Error('too big');
  } finally { URL.revokeObjectURL(url); }
}

function HistEditor({ id }: { id: string }) {
  const cur = id === 'new' ? null : S.history.find(h => h.id === id) || null;
  const [f, setF] = useState<HistForm>(() => entryToForm(cur));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof HistForm) => (ev: Event) => setF({ ...f, [k]: (ev.target as HTMLInputElement).value });
  const setRow = (i: number, k: 'name' | 'players' | 'score' | 'toPar', v: string) => setF({ ...f, field: f.field.map((r, j) => (j === i ? { ...r, [k]: v } : r)) });
  const close = () => { S.histEdit = null; emit(); window.scrollTo(0, 0); };
  const save = async () => {
    const out = formToEntry(f); if (typeof out === 'string') { setErr(out); return; }
    if (S.history.some(h => h.year === out.year && h.id !== cur?.id)) { setErr(`${out.year} is already on the page. Edit that year instead.`); return; }
    setBusy(true);
    try { const hid = await saveHistory(cur?.id || null, { ...out, photo: cur?.photo || '' }); toast(`${out.year} saved`); S.histEdit = hid; close(); }
    catch (e) { console.warn(e); setErr('Couldn’t save. Check your connection and try again.'); }
    finally { setBusy(false); }
  };
  const onPhoto = async (ev: Event) => {
    const file = (ev.target as HTMLInputElement).files?.[0]; (ev.target as HTMLInputElement).value = '';
    if (!file || !cur) return;
    try { await setHistPhoto(cur.id, await shrinkPhoto(file)); toast('Photo saved'); } catch (_) { toast('Couldn’t use that photo. Try another one.'); }
  };
  return (
    <>
      <Header><div class="toprow"><button class="back" onClick={close}>← History</button><div class="eyebrow">Exec</div></div>
        <div class="headline"><h1 class="evname">{cur ? 'Edit ' + cur.year : 'Add a year'}</h1></div></Header>
      <main><div class="wrap"><div class="form" style="padding-top:12px">
        <div class="inline">
          <div class="field"><label for="h-year">Year</label><input type="number" id="h-year" inputMode="numeric" value={f.year} onInput={set('year')} /></div>
          <div class="field"><label for="h-date">Date (optional)</label><input type="date" id="h-date" value={f.date} onInput={set('date')} /></div></div>
        <div class="field"><label for="h-course">Course</label><input type="text" id="h-course" value={f.course} onInput={set('course')} /></div>

        <SecHead title="Champions" />
        <div class="field"><label for="h-team">Team name (optional)</label><input type="text" id="h-team" value={f.team} placeholder="Leave blank to show the players" onInput={set('team')} /></div>
        <div class="field"><label for="h-pl">Players</label><input type="text" id="h-pl" value={f.players} placeholder="Will Hickey, Dad, Uncle Mike" onInput={set('players')} /><small class="note">Separate names with commas. Use the same spelling every year so Most titles adds them up.</small></div>
        <div class="inline">
          <div class="field"><label for="h-sc">Score</label><input type="number" id="h-sc" inputMode="numeric" value={f.score} placeholder="64" onInput={set('score')} /></div>
          <div class="field"><label for="h-tp">To par</label><input type="text" id="h-tp" inputMode="text" value={f.toPar} placeholder="-8" onInput={set('toPar')} /></div></div>
        <p class="note">Fill in either one or both. Leave them blank if nobody remembers.</p>
        <div class="field"><label for="h-note">Note (optional)</label><textarea id="h-note" value={f.note} placeholder="Won it on 18 with a 30-foot putt" onInput={set('note')} /></div>

        <SecHead title="Rest of the field" small="optional" />
        {f.field.map((r, i) => <div class="h-frow">
          <div class="inline"><div class="field"><label for={'hf-n' + i}>{i + 2}{['nd', 'rd'][i] || 'th'} place team</label><input type="text" id={'hf-n' + i} value={r.name} onInput={ev => setRow(i, 'name', (ev.target as HTMLInputElement).value)} /></div>
            <div class="field"><label for={'hf-s' + i}>Score</label><input type="number" id={'hf-s' + i} value={r.score} onInput={ev => setRow(i, 'score', (ev.target as HTMLInputElement).value)} /></div>
            <div class="field"><label for={'hf-t' + i}>To par</label><input type="text" id={'hf-t' + i} value={r.toPar} onInput={ev => setRow(i, 'toPar', (ev.target as HTMLInputElement).value)} /></div></div>
          <div class="field"><label for={'hf-p' + i}>Players</label><input type="text" id={'hf-p' + i} value={r.players} onInput={ev => setRow(i, 'players', (ev.target as HTMLInputElement).value)} /></div>
          <button class="link" onClick={() => setF({ ...f, field: f.field.filter((_, j) => j !== i) })}>Remove this team</button></div>)}
        <button class="btn" onClick={() => setF({ ...f, field: [...f.field, { name: '', players: '', score: '', toPar: '' }] })}>+ Add a team</button>
        <p class="note">With the other teams in, the page can show the closest finish and biggest win.</p>

        {err ? <p class="ferr" role="alert">{err}</p> : null}
        <div class="inline"><button class="btn primary big" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>

        {cur ? <>
          <SecHead title="Photo" small="optional" />
          {cur.photo && S.histPhotos[cur.id] ? <img class="h-prev" src={S.histPhotos[cur.id]} alt="" /> : null}
          <div class="inline"><label class="btn filebtn">{cur.photo ? 'Change photo' : 'Add a photo'}<input type="file" accept="image/*" onChange={onPhoto} aria-label="Add a photo" /></label>
            {cur.photo ? <Confirm id="hphoto" cls="btn" label="Remove photo" again="Tap again to remove" onYes={() => { void setHistPhoto(cur.id, ''); }} /> : null}</div>
          <SecHead title="Remove this year" />
          <Confirm id="hdel" cls="btn danger" label={'Remove ' + cur.year} again="Tap again to remove it for good" onYes={() => { void deleteHistory(cur.id); }} />
        </> : <p class="note">Save first, then you can add a photo.</p>}
      </div></div></main>
    </>
  );
}
