/* The scorer's screens on /event (Nov 21 redesign, the draft Will approved: https://claude.ai/artifact/4yFgyBmmBLPux6aFztVRcs).
   Look from src/shared/score.css (sc- classes); data, saving and every rule from actions.ts / lib/scoring.ts as before.
   - Scoring:      every stroke-type format (stroke, Stableford, skins, best ball, team stroke, shamble, scramble,
                   alternate shot, split formats): − / + steppers, a live line per format, Review scores, Submit.
   - MatchScoring: a plain Ryder match over every hole: Blue / Halved / White in the bottom bar, Undo.
   - CardScoring:  a Ryder card with a layout (9-hole matches, split at the turn, stroke-play nines). */
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { lastScore, undoLastScore, undoOpen, queuedScores, submission, flushScores, sends, setCardHole, setHole, setMatchHole, submitScores } from './actions';
import { FORMATS, MTYPES, fmtAt, fmtOf, nH, oneBallAt, parOf, sideName, splitOn } from './lib/event';
import { PARTS, contestHasHole, contestLive, contestStatus, contestsOf, cardLabel, fmtPar, groupDone, holeSeq, line, mPlayers, mstatus, namesOf, ownHoles, resultKey, scoreName, skinsRows, strokeKey, teamLine, unitHoles, unitsAt, unitsIn, type Contest } from './lib/scoring';
import type { Group, MatchResult, Side, Unit } from './lib/types';
import { countingAt, firstName, lastName, matchWords, plural, pointsWords, shortNames, shortSide, sideHole, sideLetters, skinAt, stabPts, strokeTotals, type Words } from './lib/words';
import { C, E, S, emit, groupById, iScore, teamById } from './state';
import { Confirm, logoOf } from './ui';
import { backTracker } from '../../shared/goback';

/* ---------- shared pieces ---------- */
const goHome = () => { flushScores(); S.view = 'home'; S.review = false; S.confirm = null; emit(); window.scrollTo(0, 0); };
const toTop = () => window.scrollTo(0, 0);
const goHole = (h: number) => { flushScores(); S.hole = h; S.review = false; emit(); toTop(); };

/** Stroke formats: no Undo (+ / − fixes a score); for a few seconds after Next hole, "← Back to hole N" instead. */
const back = backTracker(emit);

/** Score-card mark for a score in the stepper / review card (circle birdie, square bogey, doubles drawn inside). */
const mark = (v: number, par: number) => (!v ? 'empty' : v - par <= -2 ? 'eag' : v - par === -1 ? 'bir' : v - par === 1 ? 'bog' : v - par >= 2 ? 'dbl' : '');
/** Label for a Next hole button that can't be tapped yet: says whose score is missing. */
const waitingOn = (names: string[]) => (names.length === 1 ? `Enter ${firstName(names[0])}’s score` : `Enter ${names.length} more scores`);
const sideShort = (k: Side) => shortSide(sideName(E(), k));

function ScHead({ kick, title, children }: { kick: string; title: string; children?: ComponentChildren }) {
  const e = E(), src = logoOf(e);
  return (
    <header class="sc-hd"><div class="sc-wrap">
      <div class="sc-hrow"><button type="button" class="sc-hdlink" onClick={goHome}><span aria-hidden="true">←</span> Leaderboard</button><span class="sc-chip">You’re keeping score</span></div>
      <div class="sc-catrow">{src ? <img src={src} alt="" /> : null}<div><p class="sc-kick">{kick}</p><h1 class="sc-h1">{title}</h1></div></div>
      {children}
    </div></header>
  );
}
/** The two sides under the title, with the match status (or the card's points) in the middle. */
function VsStrip({ g, big, sub, cls }: { g: Group; big: string; sub: string; cls: string }) {
  const c = C(), side = (k: Side) => <div class={'sc-vside' + (k === 'B' ? ' r' : '')}><span>{mPlayers(c, g, k).map(p => lastName(p.name)).join(' & ') || 'TBD'}</span>
    <small>{k === 'A' ? <i class="sc-sw" aria-hidden="true" /> : null}{sideName(E(), k)}{k === 'B' ? <i class="sc-sw b" aria-hidden="true" /> : null}</small></div>;
  return <div class="sc-vs">{side('A')}<div class={'sc-plate ' + cls} role="status"><b>{big}</b>{sub ? <small>{sub}</small> : null}</div>{side('B')}</div>;
}
function HoleBar({ h, seq, onNav, sub }: { h: number; seq: number[]; onNav: (d: number) => void; sub?: string }) {
  const i = seq.indexOf(h);
  return <div class="sc-holebar"><button type="button" class="sc-nav" disabled={i <= 0} aria-label="Previous hole" onClick={() => onNav(-1)}>‹</button>
    <div class="sc-hlabel"><span class="sc-hsub">Hole</span><b>{h}</b><span class="sc-hmeta">{sub || <b>Par {parOf(E(), h)}</b>}</span></div>
    <button type="button" class="sc-nav" disabled={i >= seq.length - 1} aria-label="Next hole" onClick={() => onNav(1)}>›</button></div>;
}
const Bar = ({ children }: { children: ComponentChildren }) => <div class="sc-bar"><div class="sc-wrap">{children}</div></div>;

/** "Saving scores…" right after a tap, "✓ All scores sent" for a moment, then nothing (Will, Oct 28). Stays while
    scores wait for signal or a save failed. */
function SaveLine() {
  const waiting = sends.waiting(true) + queuedScores();
  return <>
    {submission.error ? <p class="sc-err" role="alert">{submission.error}</p> : null}
    {sends.failed ? <p class="sc-err" role="alert">Some scores were not saved. Re-enter the affected holes before submitting. Ask the exec if saving is not allowed.<small>Affected: {sends.failedFields.map(k => k.split(':').pop()).join(', ')}</small></p>
      : <div role="status" aria-live="polite" class={'sc-save' + (submission.busy || waiting || sends.old ? ' wait' : sends.justSent ? ' ok' : '')}>
        {submission.busy ? (S.online ? 'Submitting… keep this page open' : 'Waiting for connection to submit…')
          : waiting || sends.old ? (S.online ? 'Saving scores…' : 'Scores waiting for connection')
          : sends.justSent ? '✓ All scores sent' : null}</div>}
  </>;
}
/** Match play: Undo for 5 seconds after a tap, on this phone only (existing logic in actions.ts). Floats above the bar. */
function UndoFloat({ gid, only }: { gid: string; only?: (key: string) => boolean }) {
  const u = lastScore.entry;
  if (!u || u.groupId !== gid || (only && !only(u.key))) return null;
  if (!undoOpen()) return lastScore.error ? <p class="sc-err" role="alert">{lastScore.error}</p> : null;
  return <><div key={u.made} class="sc-undo sc-float sc-timed" role="status"><span>{u.label}</span>
    <button type="button" disabled={lastScore.busy || submission.busy || !iScore(u.groupId)} onClick={undoLastScore}>{lastScore.busy ? 'Undoing…' : 'Undo'}</button></div>
    {lastScore.error ? <p class="sc-err" role="alert">{lastScore.error}</p> : null}</>;
}
/** Stroke entry: "← Back to hole N" for 5 seconds after Next hole (existing backTracker). Floats above the bar. */
function GoBackFloat({ h }: { h: number }) {
  const f = back.shown(h);
  if (f == null) return null;
  return <div key={'b' + f + '-' + h} class="sc-undo lt sc-float sc-timed" role="status"><span>On hole {h}</span>
    <button type="button" onClick={() => { back.clear(); goHole(f); }}>← Back to hole {f}</button></div>;
}
function SubmitBlock({ title, body, label }: { title: string; body: string; label: string }) {
  return <div class="sc-done"><b class="sc-dt">{title}</b><p>{body}</p>
    <Confirm disabled={submission.busy || !!sends.failed} id="submit" cls={'sc-btn' + (S.confirm === 'submit' ? ' sc-conf' : '')} label={label} again="Tap again to submit and lock" onYes={submitScores} /></div>;
}
/** Front nine / back nine in rows of 5. `only` = just that nine (the other one is folded into a summary line). */
function Grid({ seq, cell, only, backLabel }: { seq: number[]; cell: (h: number) => ComponentChildren; only?: 'front' | 'back'; backLabel?: string }) {
  const hs = [...seq].sort((a, b) => a - b), f = only === 'back' ? [] : hs.filter(x => x <= 9), b = only === 'front' ? [] : hs.filter(x => x >= 10);
  return <div class="sc-grid">{f.length ? <><h3>Front nine</h3><div class="sc-holes">{f.map(cell)}</div></> : null}
    {b.length ? <><h3>{backLabel || 'Back nine'}</h3><div class="sc-holes">{b.map(cell)}</div></> : null}</div>;
}
function Stepper({ name, v, par, onStep, onPar, under, underz }: { name: string; v: number; par: number; onStep: (d: number) => void; onPar: () => void; under?: string; underz?: boolean }) {
  return <div class="sc-stp"><div class="sc-stepper">
    <button type="button" aria-label={`One fewer stroke for ${name}`} onClick={() => onStep(-1)}>−</button>
    <button type="button" class={'sc-val ' + mark(v, par)} aria-label={v ? `${name}: ${v} strokes` : `${name}: set to par`} onClick={() => { if (!v) onPar(); }}>{v || 'Par'}</button>
    <button type="button" class="sc-plus" aria-label={`One more stroke for ${name}`} onClick={() => onStep(1)}>+</button>
  </div>{under ? <span class={'sc-under' + (underz ? ' z' : '')}>{under}</span> : null}</div>;
}
/** One player (or one-ball team) row: name, a line under it, and the stepper. */
function PRow({ name, sub, sw, tag, ...st }: { name: string; sub: ComponentChildren; sw?: Side; tag?: string } & Parameters<typeof Stepper>[0]) {
  return <div class="sc-prow"><div class="sc-who"><span class="sc-nm">{sw ? <i class={'sc-sw' + (sw === 'B' ? ' b' : '')} aria-hidden="true" /> : null}{name}{tag ? <span class="sc-tag f">{tag}</span> : null}</span><small>{sub}</small></div>
    <Stepper name={name} {...st} /></div>;
}
const nextStroke = (cur: number, d: number, par: number) => Math.max(1, cur ? Math.min(15, cur + d) : par + (d > 0 ? 0 : -1));

/* ---------- stroke formats ---------- */
export function Scoring() {
  const e = E(), c = C(), g = groupById(S.myGroup)!, n = nH(e), stab = fmtOf(e) === 'stableford', skins = fmtOf(e) === 'skins';
  const seq = holeSeq(e, g.start);
  // with a split format, who enters a score changes with the nine (players on best ball, teams on a scramble)
  if (S.hole == null || !seq.includes(S.hole)) S.hole = seq.find(h => unitsAt(c, g.id, h).some(u => !(+(unitHoles(c, u.id)['h' + h] as number)))) || seq[0];
  const done = groupDone(c, g);
  if (S.review && done) return <Review g={g} />;
  const h = S.hole, idx = seq.indexOf(h), par = parOf(e, h), us = unitsAt(c, g.id, h), ob = oneBallAt(e, h), fh = fmtAt(e, h);
  const turn = splitOn(e) && idx > 0 && fmtAt(e, seq[idx - 1]) !== fh;
  const val = (id: string, x = h) => +(unitHoles(c, id)['h' + x] as number) || 0;
  const nav = (d: number) => { const i = idx + d; if (i >= 0 && i < n) goHole(seq[i]); };
  const step = (id: string, d: number) => setHole(id, h, nextStroke(val(id), d, par));
  const allIn = us.length > 0 && us.every(u => val(u.id) > 0);
  const title = splitOn(e) ? `${FORMATS[fmtOf(e)].short} → ${FORMATS[e.format2!].short}` : FORMATS[fmtOf(e)].label;
  const sk = skins ? skinsRows(c) : null;
  const word = (id: string) => { const v = val(id); return v ? <> · <b>{scoreName(v - par)}</b></> : null; };
  const subOf = (u: Unit) => {
    const l = line(c, u);
    const s = l.thru ? `${stab ? l.pts + ' pts' : fmtPar(l.rel)} thru ${l.thru}` : 'No scores yet';
    if (skins) { const r = sk!.rows.find(x => x.u.id === u.id); return <><b>{plural(r?.skins || 0, 'skin', 'skins')}</b> · {s}{word(u.id)}</>; }
    return <>{s}{word(u.id)}</>;
  };
  const row = (u: Unit, tag?: string) => {
    const v = val(u.id), members = ob ? S.players.filter(p => p.teamId === u.id).map(p => p.name).join(', ') : '';
    return <PRow name={u.name} sub={members ? <>{members}<br />{subOf(u)}</> : subOf(u)} tag={tag} v={v} par={par}
      onStep={d => step(u.id, d)} onPar={() => setHole(u.id, h, par)} under={stab && v ? plural(stabPts(c, h, v), 'pt', 'pts') : undefined} underz={stab && !!v && !stabPts(c, h, v)} />;
  };

  // team formats played with own balls: the players under their team, with the team's number for this hole
  let rows: ComponentChildren, live: ComponentChildren = null;
  const teamed = !ob && ['bestball', 'team', 'shamble'].includes(fh) && us.some(u => (u as { teamId?: string }).teamId && teamById((u as { teamId?: string }).teamId));
  if (teamed) {
    const ids = [...new Set(us.map(u => (u as { teamId?: string }).teamId || ''))];
    rows = ids.map(tid => {
      const t = teamById(tid), mine = us.filter(u => ((u as { teamId?: string }).teamId || '') === tid);
      if (!t) return <>{mine.map(u => row(u))}</>;
      const ct = countingAt(c, t, h), tl = teamLine(c, t), round = fmtOf(e) === 'team' && e.countMode === 'round' && !splitOn(e);
      const use = new Set(ct.ok && !round ? ct.use.map(x => x.id) : []);
      const tag = fh === 'bestball' ? 'Best' : 'Counts';
      return <><div class="sc-th"><b>{t.name}</b><span>{round ? null : <>{fh === 'bestball' ? 'Best ball' : `Best ${ct.need}`} <strong>{ct.ok ? ct.sum : '–'}</strong><br /></>}
        {tl.thru ? `Team ${fmtPar(tl.rel)} ${round ? '' : 'thru ' + tl.thru}` : 'No holes yet'}</span></div>
        {mine.map(u => row(u, use.has(u.id) ? (fh === 'bestball' ? (ct.use[0]?.id === u.id ? tag : undefined) : tag) : undefined))}</>;
    });
  } else rows = us.map(u => row(u));
  if (skins) {
    const s = skinAt(c, h), w = s.winner ? S.players.find(p => p.id === s.winner) : null;
    live = s.decided
      ? (w ? <div class="sc-live a"><b>Skin: {firstName(w.name)}, {s.lo}</b><small>{s.worth > 1 ? `Worth ${s.worth} with the carry-over.` : 'Worth 1 skin.'}</small></div>
        : <div class="sc-live"><b>Tied at {s.lo}{e.skinsCarry ? ', carries over' : ', no skin'}</b><small>{e.skinsCarry ? `${s.worth + 1} skins on the next hole.` : 'Nobody wins this hole.'}</small></div>)
      : <div class="sc-live"><b>This hole is worth {plural(s.worth, 'skin', 'skins')}{s.carry ? ` (${s.carry} carried over)` : ''}</b><small>Decided once every player in the event has a score here.</small></div>;
  }
  const cell = (x: number) => {
    const ux = unitsAt(c, g.id, x), ok = ux.length > 0 && ux.every(u => val(u.id, x) > 0);
    return <button type="button" class={'sc-hc' + (ok ? ' done' : '') + (x === h ? ' sel' : '')} aria-label={`Hole ${x}${ok ? ', scored' : ''}`} onClick={() => goHole(x)}><span class="n">{x}</span><span class="r">{ok ? '✓' : ''}</span></button>;
  };
  return (
    <>
      <ScHead kick={`${e.name} · ${g.name}`} title={title} />
      <main class="sc-main"><div class="sc-wrap">
        {turn ? <div class="sc-turn"><b>{h >= 10 ? 'Back 9' : 'Front 9'}: {FORMATS[fh].label}</b><span>{ob ? 'One score per team.' : FORMATS[fh].desc}</span></div> : null}
        <HoleBar h={h} seq={seq} onNav={nav} />
        {!us.length ? <div class="sc-live warn"><b>Nobody to score on this hole</b><small>{ob
          ? `The ${FORMATS[fh].label.toLowerCase()} nine needs the teams in this group. Ask the team exec to put each team in its group (Field tab), then this hole will show them.`
          : 'No players are in this group yet. Ask the team exec to add them in the Field tab.'}</small></div> : null}
        {live}
        <div class="sc-rows">{rows}</div>
        <Grid seq={seq} cell={cell} />
      </div></main>
      <Bar>
        <GoBackFloat h={h} />
        <SaveLine />
        {done
          ? <div class="sc-done"><b class="sc-dt">All {n} holes are in</b><p>Check the whole card before you submit.</p>
              <button type="button" class="sc-btn" onClick={() => { flushScores(); S.review = true; S.confirm = null; emit(); toTop(); }}>Review scores</button></div>
          : idx < n - 1 ? <button type="button" class="sc-btn" disabled={!allIn} onClick={() => { back.moved(h, seq[idx + 1]); nav(1); }}>{allIn ? <>Next hole{' '}<span aria-hidden="true">→</span></> : waitingOn(us.filter(u => !val(u.id)).map(u => u.name))}</button>
          : <p class="sc-miss">Some holes are still missing a score. Tap a hole above to fill it in, then you can submit.</p>}
      </Bar>
    </>
  );
}

/** Review scores (Will, Nov 21): the whole card big, holes down the side, one column per player (or team), Out / In /
    Total with ± par. Tap a score to go to that hole. Submit sits under the Total row, not pinned. */
function Review({ g }: { g: Group }) {
  const e = E(), c = C(), n = nH(e), stab = fmtOf(e) === 'stableford', us = unitsIn(c, g.id);
  const isTeam = (u: Unit) => c.teams.some(t => t.id === u.id);
  const pn = shortNames(us.filter(u => !isTeam(u)).map(u => u.name)); let pi = 0;
  const label = us.map(u => (isTeam(u) ? u.name : pn[pi++]));
  const own = us.map(u => new Set(ownHoles(c, u)));
  const val = (u: Unit, h: number) => +(unitHoles(c, u.id)['h' + h] as number) || 0;
  const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
  const parSum = (a: number, b: number) => range(a, b).reduce((t, h) => t + parOf(e, h), 0);
  const sum = (i: number, a: number, b: number) => { const hs = range(a, b).filter(h => own[i].has(h)); return hs.length ? hs.reduce((t, h) => t + val(us[i], h), 0) : null; };
  const row = (h: number) => <tr><th scope="row"><button type="button" class="sc-rvh" aria-label={`Go to hole ${h}`} onClick={() => goHole(h)}>{h}</button></th><td class="rp">{parOf(e, h)}</td>
    {us.map((u, i) => {
      if (!own[i].has(h)) return <td class="off">–</td>;
      const v = val(u, h);
      return <td><button type="button" class="sc-rvc" aria-label={`${label[i]}, hole ${h}: ${v || 'no score'}. Go to this hole`} onClick={() => goHole(h)}>{v ? <span class={'sc-m ' + mark(v, parOf(e, h))}>{v}</span> : <span class="sc-m gone">–</span>}</button></td>;
    })}</tr>;
  const sub = (lab: string, a: number, b: number) => <tr class="sc-rvsub"><th scope="row">{lab}</th><td class="rp">{parSum(a, b)}</td>{us.map((_, i) => <td>{sum(i, a, b) ?? '–'}</td>)}</tr>;
  return (
    <>
      <ScHead kick={`${e.name} · ${g.name}`} title="Review scores" />
      <main class="sc-main"><div class="sc-wrap">
        <div class="sc-rvtop"><button type="button" class="sc-lnk" onClick={() => { S.review = false; S.confirm = null; emit(); toTop(); }}><span aria-hidden="true">←</span> Back to scoring</button><p>Tap any score to go to that hole and fix it.</p></div>
        <div class="sc-rvwrap"><table class="sc-rv">
          <thead><tr><th scope="col">Hole</th><th scope="col" class="rp">Par</th>{label.map(l => <th scope="col">{l}</th>)}</tr></thead>
          <tbody>{range(1, Math.min(9, n)).map(row)}{sub('Out', 1, Math.min(9, n))}{n > 9 ? <>{range(10, n).map(row)}{sub('In', 10, n)}</> : null}</tbody>
          <tfoot><tr><th scope="row">Total</th><td class="rp">{parSum(1, n)}</td>{us.map(u => { const l = line(c, u); return <td>{l.strokes || '–'}<small>{l.thru ? (stab ? l.pts + ' pts' : fmtPar(l.rel)) : ''}</small></td>; })}</tr></tfoot>
        </table></div>
        <div class="sc-rvsubmit"><SubmitBlock title="Everything look right?" body="Scores lock once submitted." label="Submit final scores" /></div>
      </div></main>
      <Bar><SaveLine /></Bar>
    </>
  );
}

/* ---------- Ryder Cup: match play ---------- */
type Cell = { cls: string; txt: ComponentChildren; label: string };
const L = (r: string, lt: Record<Side, string>) => (r === 'A' ? lt.A : r === 'B' ? lt.B : r === 'H' ? '½' : '');
function holeCell(x: number, sel: boolean, dead: boolean, rs: string[], lt: Record<Side, string>, onTap: () => void) {
  let cell: Cell;
  if (rs.length <= 1) { const r = rs[0] || ''; cell = { cls: r, txt: dead ? '–' : L(r, lt), label: dead ? 'not played' : r ? L(r, lt) : '' }; }
  else cell = { cls: rs.every(r => r) ? 'mix' : '', txt: rs.every(r => !r) ? (dead ? '–' : '') : rs.map(r => <i>{L(r, lt) || '·'}</i>), label: rs.map(r => L(r, lt) || 'not in').join(', ') };
  return <button type="button" class={`sc-hc ${cell.cls}${sel ? ' sel' : ''}${dead ? ' dead' : ''}`} aria-label={`Hole ${x}${cell.label ? ': ' + cell.label : ''}`} onClick={onTap}><span class="n">{x}</span><span class="r">{cell.txt}</span></button>;
}
/** Words for one contest: "Blue 2 up", "Miller wins 3&2", "All square". */
function contestWords(ct: Contest, st: ReturnType<typeof contestStatus>): Words {
  const c = C(), solo = (k: Side) => (k === 'A' ? ct.a : ct.b).length === 1;
  return matchWords(st, ct.type === 'stroke', k => (solo(k) ? lastName(namesOf(c, k === 'A' ? ct.a : ct.b)) : sideShort(k)), solo);
}
const plateCls = (lead: Side | null, started: boolean) => (!started ? '' : lead === 'A' ? 'pa' : lead === 'B' ? 'pb' : 'pn');
const btnLabel = (ct: Contest, k: Side) => { const p = k === 'A' ? ct.a : ct.b; return p.length === 1 ? lastName(namesOf(C(), p)) : sideShort(k); };
function Dormie({ w, who }: { w: Words; who: string }) {
  return w.dormie ? <p class="sc-dormie"><span class="sc-tag">Dormie</span>{who} {w.up} up with {w.left} to play</p> : null;
}

/** A plain Ryder match over every hole: one tap per hole, saved right away (setMatchHole), Undo for 5 seconds. */
export function MatchScoring() {
  const e = E(), c = C(), g = groupById(S.myGroup)!, st = mstatus(c, g), n = nH(e), h0 = unitHoles(c, g.id), ct = contestsOf(e, g)[0];
  if (S.hole == null || !st.seq.includes(S.hole)) S.hole = st.next || st.seq[Math.max(0, st.thru - 1)] || 1;
  const h = S.hole, idx = st.seq.indexOf(h), v = (h0['h' + h] as string) || '', dead = idx >= (st.final ? st.thru : n);
  const lt = sideLetters(sideName(e, 'A'), sideName(e, 'B')), w = contestWords(ct, st);
  const pick = (k: MatchResult | null) => { if (!iScore(g.id)) return; setMatchHole(g, h, k); const s2 = mstatus(C(), g); if (k && !s2.final && s2.next) S.hole = s2.next; emit(); };
  const nav = (d: number) => { const i = idx + d; if (i >= 0 && i < n) { S.hole = st.seq[i]; emit(); toTop(); } };
  const cell = (x: number) => holeCell(x, x === h, st.seq.indexOf(x) >= (st.final ? st.thru : n), [(h0['h' + x] as string) || ''], lt, () => { flushScores(); S.hole = x; emit(); });
  const choice = (k: MatchResult) => <button type="button" class={`sc-ch ${k}${v === k ? ' on' : ''}`} aria-pressed={v === k} onClick={() => pick(k)}>
    <b>{k === 'H' ? 'Halved' : btnLabel(ct, k)}</b><small>{k === 'H' ? 'tied' : 'won hole'}</small></button>;
  return (
    <>
      <ScHead kick={`${e.name} · ${g.name}`} title={cardLabel(e, g)}><VsStrip g={g} big={w.big} sub={st.final ? 'Final' : w.sub} cls={plateCls(st.lead, st.thru > 0)} /></ScHead>
      <main class="sc-main"><div class="sc-wrap">
        <HoleBar h={h} seq={st.seq} onNav={nav} />
        {!st.final ? <Dormie w={w} who={st.lead ? sideShort(st.lead) : ''} /> : null}
        {v && !dead ? <div class="sc-resline"><span>Hole {h}: {v === 'H' ? 'halved' : btnLabel(ct, v as Side) + ' won'}</span><button type="button" class="sc-lnk" onClick={() => pick(null)}>Clear hole {h}</button></div> : null}
        {dead && !st.final ? <p class="sc-miss">Not played: this match was decided before hole {h}.</p> : null}
        <Grid seq={st.seq} cell={cell} />
      </div></main>
      <Bar>
        <UndoFloat gid={g.id} />
        <SaveLine />
        {st.final
          ? <SubmitBlock title={w.big} body="Check the holes, then submit. The result locks once submitted." label="Submit result" />
          : !dead ? <><p class="sc-ask">Who won hole <b>{h}</b>?</p><div class="sc-ch3">{choice('A')}{choice('H')}{choice('B')}</div></>
          : st.next ? <button type="button" class="sc-btn sc-s" onClick={() => { S.hole = st.next; emit(); toTop(); }}>Go to hole {st.next}</button> : null}
      </Bar>
    </>
  );
}

/** A match card with a layout: 9-hole matches, a front nine and back nine played differently (four-ball then two
    singles), or stroke play. One phone scores the whole card; results and strokes go through the save queue. */
export function CardScoring() {
  const e = E(), c = C(), g = groupById(S.myGroup)!, cts = contestsOf(e, g), sts = cts.map(ct => contestStatus(c, g, ct)), card = mstatus(c, g), seq = card.seq;
  const [showOther, setShowOther] = useState(false);
  if (S.hole == null || !seq.includes(S.hole)) S.hole = card.next || seq[Math.max(0, card.thru - 1)] || seq[0];
  const h = S.hole, idx = seq.indexOf(h), hs = unitHoles(c, g.id), par = parOf(e, h), multi = cts.length > 1;
  const here = cts.map((ct, i) => ({ ct, st: sts[i], i })).filter(x => x.ct.holes.includes(h)), live = here.filter(x => contestLive(x.st, h));
  const strokeHole = here.some(x => x.ct.type === 'stroke');
  const lt = sideLetters(sideName(e, 'A'), sideName(e, 'B'));
  const nav = (d: number) => { const i = idx + d; if (i >= 0 && i < seq.length) goHole(seq[i]); };
  const holeDone = (x: number, cc = c) => cts.every(ct => !ct.holes.includes(x) || !contestLive(contestStatus(cc, g, ct), x) || contestHasHole(cc, g, ct, x));
  // after a tap: once every match on this hole has its result, go to the next hole (score steppers use Next instead)
  const pick = (ct: Contest, k: MatchResult | null) => {
    if (!iScore(g.id)) return; setCardHole(g, resultKey(ct, h), k);
    const c2 = C(), m2 = mstatus(c2, g);
    if (k && here.every(x => x.ct.type !== 'stroke') && holeDone(h, c2) && !m2.final && m2.next) { flushScores(); S.hole = m2.next; toTop(); }
    emit();
  };
  const sv = (pid: string) => +(hs[strokeKey(h, pid)] as number) || 0;
  const step = (pid: string, d: number) => setCardHole(g, strokeKey(h, pid), nextStroke(sv(pid), d, par));
  // first hole of a new nine (the format changes here): say so
  const turn = idx > 0 && !cts.some(ct => ct.holes.includes(h) && ct.holes.includes(seq[idx - 1]));
  // the other nine, once all its matches are over, folds into one line (Will, Nov 21), with Show holes to reopen it
  const nineOf = (x: number) => (x <= 9 ? 'front' : 'back') as 'front' | 'back';
  const other = nineOf(h) === 'front' ? 'back' : 'front';
  const otherCts = cts.map((ct, i) => ({ ct, st: sts[i] })).filter(x => x.ct.part === other);
  const fold = multi && !showOther && otherCts.length > 0 && otherCts.every(x => x.st.final);
  const cell = (x: number) => {
    const one = cts.map((ct, i) => ({ ct, i })).filter(y => y.ct.holes.includes(x)), dead = one.every(y => !contestLive(sts[y.i], x));
    if (one.some(y => y.ct.type === 'stroke')) {
      const ok = holeDone(x);
      return <button type="button" class={'sc-hc' + (ok && !dead ? ' done' : '') + (x === h ? ' sel' : '') + (dead ? ' dead' : '')} aria-label={`Hole ${x}${ok ? ', scored' : ''}`} onClick={() => goHole(x)}><span class="n">{x}</span><span class="r">{dead ? '–' : ok ? '✓' : ''}</span></button>;
    }
    return holeCell(x, x === h, dead, one.map(y => (hs[resultKey(y.ct, x)] as string) || ''), lt, () => goHole(x));
  };
  const cw = (i: number) => contestWords(cts[i], sts[i]);
  // header plate: one match = its status in words; several = the card's points
  const pw = multi ? pointsWords(card) : null, w0 = cw(0);
  const plate = multi ? { big: pw!.big, sub: pw!.sub, cls: plateCls(card.final ? (card.pa > card.pb ? 'A' : card.pb > card.pa ? 'B' : null) : card.lead, card.sub !== 'Not started') }
    : { big: w0.big, sub: card.final ? 'Final' : w0.sub, cls: plateCls(card.lead, card.thru > 0 || sts[0].thru > 0) };
  const vsName = (ct: Contest) => `${lastName(namesOf(c, ct.a))} v ${lastName(namesOf(c, ct.b))}`;
  const solo = (ct: Contest) => ct.a.length === 1 && ct.b.length === 1;
  const missing = strokeHole ? live.flatMap(x => [...x.ct.a, ...x.ct.b]).filter(pid => !sv(pid)).map(pid => namesOf(c, [pid])) : [];
  const finalTitle = multi ? `Final: ${sideShort('A')} ${pw!.big.split(' – ')[0]}, ${sideShort('B')} ${pw!.big.split(' – ')[1]}` : w0.big;

  // stroke-play rows: a 2 v 2 nine under side headings, singles under "Miller v Okafor"
  const strokeRows = (x: { ct: Contest; st: ReturnType<typeof contestStatus>; i: number }) => {
    const { ct, st } = x, w = cw(x.i), tot = strokeTotals(c, g.id, ct);
    const prow = (pid: string, k: Side) => { const v = sv(pid), nm = namesOf(c, [pid]);
      return <PRow name={nm} sw={k} sub={v ? scoreName(v - par) : 'Enter strokes'} v={v} par={par} onStep={d => step(pid, d)} onPar={() => setCardHole(g, strokeKey(h, pid), par)} />; };
    const totals = <div class={'sc-live' + (st.lead === 'A' ? ' a' : '')}><b>{tot.thru ? `${btnLabel(ct, 'A')} ${tot.a}, ${btnLabel(ct, 'B')} ${tot.b} · ${w.big}` : (solo(ct) ? vsName(ct) + ': stroke play' : `${PARTS[ct.part] || 'Match'}: stroke play`)}</b>
      <small>{tot.thru ? `Thru ${tot.thru} of ${ct.holes.length}. ` : ''}{solo(ct) ? 'Lower total over the nine wins the point.' : 'Each side adds both players’ strokes; lower total wins the point.'}</small></div>;
    if (solo(ct)) return <>{totals}<div class="sc-rows"><div class="sc-th"><b>{vsName(ct)}</b><span>{w.big}{w.sub && !st.final ? ' · ' + w.sub : ''}</span></div>{prow(ct.a[0], 'A')}{prow(ct.b[0], 'B')}</div></>;
    return <>{totals}<div class="sc-rows">{(['A', 'B'] as Side[]).map(k => { const pids = k === 'A' ? ct.a : ct.b, s = sideHole(c, g.id, pids, h);
      return <><div class="sc-th"><b><i class={'sc-sw' + (k === 'B' ? ' b' : '')} aria-hidden="true" />{sideName(e, k)}</b><span>This hole <strong>{s ?? '–'}</strong></span></div>{pids.map(pid => prow(pid, k))}</>; })}</div></>;
  };
  const otherSummary = () => {
    const names = otherCts.map(x => { const i = cts.indexOf(x.ct), w = cw(i), lbl = [PARTS[x.ct.part], solo(x.ct) ? vsName(x.ct) : MTYPES[x.ct.type].toLowerCase()].filter(Boolean).join(' ');
      return <span><b>{lbl}</b>{w.big}</span>; });
    return <div class="sc-frontsum"><span style="display:flex;flex-direction:column">{names}</span><button type="button" class="sc-lnk" onClick={() => setShowOther(true)}>Show holes</button></div>;
  };
  return (
    <>
      <ScHead kick={`${e.name} · ${g.name}`} title={cardLabel(e, g)}><VsStrip g={g} {...plate} /></ScHead>
      <main class="sc-main"><div class="sc-wrap">
        {turn && here.length ? <div class="sc-turn"><b>{PARTS[here[0].ct.part] || 'Next'}: {here.length > 1 ? `${here.length} ${MTYPES[here[0].ct.type].toLowerCase()} matches` : MTYPES[here[0].ct.type]}</b>
          <span>{here.map(x => vsName(x.ct)).join(' · ')}</span></div> : null}
        <HoleBar h={h} seq={seq} onNav={nav} />
        {!strokeHole && here.length === 1 && !card.final ? <Dormie w={cw(here[0].i)} who={here[0].st.lead ? btnLabel(here[0].ct, here[0].st.lead) : ''} /> : null}
        {!strokeHole && live.length ? (() => {
          const set = here.filter(x => hs[resultKey(x.ct, h)]);
          if (!set.length) return null;
          const txt = set.map(x => { const r = hs[resultKey(x.ct, h)] as string; return (here.length > 1 ? vsName(x.ct) + ': ' : '') + (r === 'H' ? 'halved' : btnLabel(x.ct, r as Side) + ' won'); }).join(' · ');
          return <div class="sc-resline"><span>Hole {h}: {txt}</span><button type="button" class="sc-lnk" onClick={() => set.forEach(x => pick(x.ct, null))}>Clear hole {h}</button></div>;
        })() : null}
        {!live.length && !card.final ? <p class="sc-miss">Not played: {here.length > 1 ? 'these matches were' : 'this match was'} decided before hole {h}.</p> : null}
        {strokeHole ? here.map(strokeRows) : null}
        {fold ? otherSummary() : null}
        <Grid seq={seq} cell={cell} only={fold ? nineOf(h) : undefined} />
        {multi ? <><h2 class="sc-sech">This card</h2><ul class="sc-clist">{cts.map((ct, i) => { const w = cw(i);
          return <li><span>{[PARTS[ct.part], solo(ct) ? vsName(ct) : MTYPES[ct.type]].filter(Boolean).join(' · ')}</span><b>{w.big}{w.sub && !sts[i].final ? ' · ' + w.sub : ''}</b></li>; })}</ul></> : null}
      </div></main>
      <Bar>
        {strokeHole ? <GoBackFloat h={h} /> : <UndoFloat gid={g.id} only={k => !/^s\d+_/.test(k)} />}
        <SaveLine />
        {card.final
          ? <SubmitBlock title={finalTitle} body="Check the holes, then submit. The result locks once submitted." label="Submit result" />
          : strokeHole && live.length
            ? idx < seq.length - 1 ? <button type="button" class="sc-btn" disabled={!holeDone(h)} onClick={() => { back.moved(h, seq[idx + 1]); nav(1); }}>{holeDone(h) ? <>Next hole{' '}<span aria-hidden="true">→</span></> : waitingOn(missing)}</button>
              : <p class="sc-miss">Some holes are still missing a score. Tap a hole above to fill it in.</p>
          : live.length === 1 ? (() => { const { ct } = live[0], v = (hs[resultKey(ct, h)] as string) || '';
              const ch = (k: MatchResult) => <button type="button" class={`sc-ch ${k}${v === k ? ' on' : ''}`} aria-pressed={v === k} onClick={() => pick(ct, k)}><b>{k === 'H' ? 'Halved' : btnLabel(ct, k)}</b><small>{k === 'H' ? 'tied' : 'won hole'}</small></button>;
              return <><p class="sc-ask">Who won hole <b>{h}</b>?</p><div class="sc-ch3">{ch('A')}{ch('H')}{ch('B')}</div></>; })()
          : live.length > 1 ? <>
              <p class="sc-ask">Who won hole <b>{h}</b>? {(() => { const got = live.filter(x => hs[resultKey(x.ct, h)]).length; return got ? `${got} of ${live.length} matches in` : `${live.length} matches`; })()}</p>
              {live.map(x => { const v = (hs[resultKey(x.ct, h)] as string) || '', w = cw(x.i);
                const ch = (k: MatchResult) => <button type="button" class={`sc-ch ${k}${v === k ? ' on' : ''}`} aria-pressed={v === k} aria-label={`${vsName(x.ct)}: ${k === 'H' ? 'halved' : btnLabel(x.ct, k) + ' won'}`} onClick={() => pick(x.ct, k)}><b>{k === 'H' ? 'Halved' : btnLabel(x.ct, k)}</b></button>;
                return <div class="sc-crow"><div class="sc-clab"><b>{vsName(x.ct)}</b><span>{w.dormie ? <><span class="sc-tag">Dormie</span> </> : null}{w.big}{w.sub ? ' · ' + w.sub : ''}</span></div><div class="sc-ch3">{ch('A')}{ch('H')}{ch('B')}</div></div>; })}
            </>
          : card.next ? <button type="button" class="sc-btn sc-s" onClick={() => goHole(card.next!)}>Go to hole {card.next}</button> : null}
      </Bar>
    </>
  );
}
