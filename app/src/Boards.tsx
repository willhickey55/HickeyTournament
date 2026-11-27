import type { ComponentChildren } from 'preact';
/* The event header, leaderboards, Ryder Cup board and scorecards (shared by the player and exec views). */
import { useLayoutEffect, useRef } from 'preact/hooks';
import { shareCup } from './share';
import { FORMATS, MTYPES, fmtOf, formatLine, isRyder, isTeam, nH, oneBall, parOf, playerBall, sideName, splitOn, teamBall } from './lib/event';
import {
  PARTS, byRound, cardLabel, contestStatus, contestsOf, cupState, fmtPar, fmtPts, individualRows, line, mPlayers, mstatus, namesOf, outsRows, playerPoints, playersIn, recordOf, roundOf, skinsRows, teamRows, unitsIn, ownHoles,
  type CupState, type Line, type MatchStatus, type Row,
} from './lib/scoring';
import { chip, dayPhase, fmtDate, fmtWhen, liveNow, noMatchMsg, revealed } from './lib/time';
import type { Group, Unit } from './lib/types';
import { reconnectNow } from './actions';
import { C, E, S, emit, teamById, toast } from './state';
import { Headline, Lock, SecHead, ViewSwitch } from './ui';

/* ---------- header ---------- */
/** preview: what players see (used on the Look tab). */
export function EventBand({ preview }: { preview?: boolean }) {
  const e = E(), meta = [fmtDate(e.date), e.course].filter(Boolean).join(' · ');
  const [txt, on] = chip(e, S.groups);
  return (
    <>
      <div class="toprow"><div class="eyebrow">{S.org && !preview ? 'Exec' : (e.eyebrow || '')}</div>
        <span class="hdr-r">{preview ? null : <ViewSwitch />}<span class={'chip' + (on ? ' on' : '')}>{txt}</span></span></div>
      <Headline title={e.name} e={e} />
      {e.tagline ? <p class="meta tagline">{e.tagline}</p> : null}
      <p class="fmtline">{formatLine(e)}{meta ? ' · ' + meta : ''}</p>
    </>
  );
}

/* ---------- leaderboards ---------- */
/** Under the leaderboard on event day (Will, Oct 28): is this page live, and when did the last update come in? */
const hm = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export function SyncLine() {
  const e = E(); if (!liveNow(e, S.groups) || (S.live === null && S.online)) return null;
  const off = !S.online || (S.live === false && S.offSince && Date.now() - S.offSince >= 3000);
  return <p class={'syncline' + (off ? ' off' : '')} role="status"><i aria-hidden="true" />
    <b>{!S.online ? 'No signal' : off ? 'Reconnecting…' : 'Live'}</b>
    {S.dataAt ? <span>last update {hm(S.dataAt)}</span> : null}
    {off && S.online ? <button type="button" class="link" onClick={reconnectNow}>Reconnect</button> : null}</p>;
}


/** The Ryder Cup board: the cup score + live line, then the matches. */
export const CupTop = () => <><CupBoard /><SyncLine /></>;
export function CupRest({ orgView }: { orgView: boolean }) {
  const e = E(), done = cupState(C()).allFinal;
  // once every match is final there's nothing projected any more, so that sentence goes (Will, Oct 28)
  return <div class="results-columns"><section><SecHead title="Matches" /><MatchList orgView={orgView} />
    <p class="note">{S.groups.every(g => contestsOf(e, g).every(ct => ct.pts === 1)) ? '1 point per match won, ½ for a halved match.' : 'A match won earns its points, a halved match half of them.'}{done ? '' : ' Projected totals count every match as it stands right now.'}</p>
    </section><aside><PointsBoard /></aside></div>;
}

export function Boards({ orgView }: { orgView: boolean }) {
  const e = E(), c = C(), f = fmtOf(e);
  if (!orgView && !revealed(e)) {
    return <><SecHead title="Leaderboard" /><Lock title="Leaderboard hidden">{e.visibility === 'scheduled' && e.revealAt ? `Results post ${fmtWhen(e.revealAt)}.` : 'Results will be posted when the event is completed.'}</Lock></>;
  }
  const show = orgView ? 'full' : e.show;
  if (isRyder(e)) {
    return <><CupTop /><CupRest orgView={orgView} /></>;
  }
  if (f === 'skins') {
    const { rows, carry } = skinsRows(c);
    return <><SecHead title="Skins" /><BoardTable rows={rows} outs={outsRows(c)} show={show} orgView={orgView} kind="skins" /><SyncLine />
      {carry ? <p class="note">{carry} {carry === 1 ? 'skin is' : 'skins are'} carrying over to the next hole.</p> : null}
      <p class="note">A hole is decided once every player has a score on it.</p></>;
  }
  if (!isTeam(e)) return <><SecHead title="Leaderboard" /><BoardTable rows={individualRows(c)} outs={outsRows(c)} show={show} orgView={orgView} kind={f === 'stableford' ? 'pts' : 'par'} /><SyncLine /></>;
  return (
    <div class="twoboards"><div>
      <SecHead title="Leaderboard" />
      <BoardTable rows={teamRows(c)} outs={oneBall(e) && !splitOn(e) ? outsRows(c) : []} show={show} orgView={orgView} kind="team" /><SyncLine />
      {playerBall(e) && (e.showIndividual || orgView) ? <><SecHead title="Individual" /><BoardTable rows={individualRows(c)} outs={outsRows(c)} show={show} orgView={orgView} kind="par" /></> : null}
    </div></div>
  );
}

function edit(id: string) { S.editId = id; S.view = 'edit'; emit(); window.scrollTo(0, 0); }

function BoardTable({ rows, outs, show, orgView, kind }: { rows: Row[]; outs: Line[]; show: string; orgView: boolean; kind: 'skins' | 'pts' | 'par' | 'team' }) {
  if (!rows.length && !outs.length) return <Lock title="No scores yet">Scores appear here as groups enter them.</Lock>;
  const c = C(), e = E();
  const myIds = new Set(S.myGroup ? [...playersIn(c, S.myGroup).map(p => p.id), ...unitsIn(c, S.myGroup).map(u => u.id), ...playersIn(c, S.myGroup).map(p => p.teamId).filter(Boolean) as string[]] : []);
  const simple = show === 'positions' && !orgView;
  const editable = (orgView && kind !== 'team') || (orgView && teamBall(e));
  const edAttrs = (id: string) => ({ role: 'button' as const, tabIndex: 0, style: 'cursor:pointer', onClick: () => edit(id), onKeyDown: (ev: KeyboardEvent) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); edit(id); } } });
  const sub = (r: Row) => {
    if (kind === 'skins') return r.won && r.won.length ? <span class="teamtag" style="display:block">Won {r.won.map(h => '#' + h).join(', ')}</span> : null;
    // split format: each nine's score too (front best ball, back scramble...)
    // the team's name is already its players (state.ts nameTeams), so only the split-format nines go under it
    if (kind === 'team' && (!oneBall(e) || splitOn(e))) return r.nines ? <span class="teamtag" style="display:block">Front {fmtPar(r.nines[0])}, back {fmtPar(r.nines[1])}</span> : null;
    const t = kind !== 'team' && (r.u as any).teamId ? teamById((r.u as any).teamId) : null;
    return t ? <span class="teamtag" style="display:block">{t.name}</span> : null;
  };
  return (
    <div class="lb">
      {simple ? <div class="lbrow simple head"><span>Pos</span><span>{kind === 'team' ? 'Team' : 'Player'}</span></div>
        : <div class="lbrow head"><span>Pos</span><span>{kind === 'team' ? 'Team' : 'Player'}</span><span style="text-align:right">{kind === 'pts' ? 'Pts' : kind === 'skins' ? 'Skins' : 'Par'}</span><span style="text-align:right">Thru</span><span style="text-align:right">{kind === 'pts' ? 'Str' : kind === 'skins' ? 'Par' : 'Tot'}</span></div>}
      {rows.map(r => {
        const me = myIds.has(r.u.id) && !orgView, pos = (r.tie ? 'T' : '') + r.pos;
        return simple
          ? <div class={'lbrow simple' + (me ? ' me' : '')}><span class="pos">{pos}</span><span class="nm">{r.u.name}{sub(r)}</span></div>
          : <div class={'lbrow' + (me ? ' me' : '')} {...(editable ? edAttrs(r.u.id) : {})}><span class="pos">{pos}</span><span class="nm">{r.u.name}{sub(r)}</span>
            <span class="num">{kind === 'pts' ? r.pts : kind === 'skins' ? r.skins : fmtPar(r.rel)}</span><span class="sm">{r.label || (r.done ? 'F' : r.thru)}</span><span class="sm">{kind === 'skins' ? fmtPar(r.rel) : r.strokes}</span></div>;
      })}
      {outs.map(r => simple
        ? <div class="lbrow simple"><span class="pos sm" style="font-size:14px">{r.u.status}</span><span class="nm">{r.u.name}</span></div>
        : <div class="lbrow" {...(orgView ? edAttrs(r.u.id) : {})}><span class="pos" style="font-size:16px;color:var(--muted)">{r.u.status}</span><span class="nm" style="color:var(--muted)">{r.u.name}</span>
          <span class="num" style="color:var(--muted)">{r.thru ? (kind === 'pts' ? r.pts : fmtPar(r.rel)) : '—'}</span><span class="sm">{r.thru || '–'}</span><span class="sm">{r.strokes || '–'}</span></div>)}
    </div>
  );
}

/* ---------- scorecards ---------- */
/** Players' group card (Will, Nov 21): the front and back nine stacked, like the tryouts card, so 18 holes fit a phone
    without scrolling sideways. Out / In, then the total and to-par (points in Stableford) on the last nine. The back nine
    shows once anyone has a score there. Split format: holes a unit doesn't score on show a faded dash. */
function NineCard({ units }: { units: Unit[] }) {
  const e = E(), c = C(), n = nH(e), stab = fmtOf(e) === 'stableford';
  const hv = (u: Unit, h: number) => +(((S.scores[u.id] || {}).holes || {})['h' + h] as number || 0);
  const owns = new Map(units.map(u => [u.id, new Set(ownHoles(c, u))]));
  const backOn = n > 9 && units.some(u => { for (let h = 10; h <= n; h++) if (hv(u, h)) return true; return false; });
  const nines = n > 9 ? (backOn ? [[1, 9, 'Out'], [10, n, 'In']] as const : [[1, 9, 'Out']] as const) : [[1, n, 'Tot']] as const;
  // players by first name (last initial when two match); teams keep their name
  const isTeam = (u: Unit) => !!teamById(u.id);
  const first = (u: Unit) => u.name.split(' ')[0];
  const ini = (u: Unit) => `${first(u)} ${(u.name.split(' ')[1] || '').charAt(0)}.`;
  const label = (u: Unit) => { if (isTeam(u)) return u.name; const ps = units.filter(q => !isTeam(q));
    if (ps.filter(q => first(q) === first(u)).length < 2) return first(u);
    return ps.filter(q => ini(q) === ini(u)).length < 2 ? ini(u) : u.name.split(' ').slice(1).join(' ') || u.name; };
  const sum = (u: Unit, a: number, b: number) => { let t = 0; for (let h = a; h <= b; h++) if (owns.get(u.id)!.has(h)) t += hv(u, h); return t; };
  const parSum = (a: number, b: number) => { let t = 0; for (let h = a; h <= b; h++) t += parOf(e, h); return t; };
  const rel = (l: ReturnType<typeof line>) => stab ? `${l.pts} pts` : fmtPar(l.rel);
  return <div class="ncard">{nines.map(([a, b, lab], i) => {
    const hs = Array.from({ length: b - a + 1 }, (_, k) => a + k), last = i === nines.length - 1, more = last;
    return <table class={'sc9' + (units.some(isTeam) ? ' teams' : '')}>
      <thead><tr><th class="nm">Hole</th>{hs.map(h => <th>{h}</th>)}<th class="sub">{lab}</th>{more ? <th class="sub">{backOn ? 'Tot' : stab ? 'Pts' : '±'}</th> : null}</tr></thead>
      <tbody>
        <tr class="par"><td class="nm">Par</td>{hs.map(h => <td>{parOf(e, h)}</td>)}<td class="sub">{parSum(a, b)}</td>{more ? <td class="sub">{backOn ? parSum(1, n) : ''}</td> : null}</tr>
        {units.map(u => { const l = line(c, u), own = owns.get(u.id)!; return <tr>
          <td class="nm">{label(u)}</td>
          {hs.map(h => { if (!own.has(h)) return <td class="off">–</td>;
            const v = hv(u, h), d = v - parOf(e, h);
            return <td><span class={'m' + (!v ? '' : d <= -2 ? ' eag' : d === -1 ? ' bir' : d === 1 ? ' bog' : d >= 2 ? ' dbl' : '')}>{v || ''}</span></td>; })}
          <td class="sub">{sum(u, a, b) || ''}</td>
          {more ? <td class="sub tot">{backOn ? <>{l.strokes || ''}{l.thru ? <small>{rel(l)}</small> : null}</> : l.thru ? rel(l) : ''}</td> : null}
        </tr>; })}
      </tbody>
    </table>;
  })}</div>;
}

export function Scorecard({ units, editable }: { units: Unit[]; editable?: (u: Unit, h: number, v: string) => void }) {
  const e = E(), c = C(), n = nH(e), holes = Array.from({ length: n }, (_, i) => i + 1), stab = fmtOf(e) === 'stableford';
  if (!editable) return <NineCard units={units} />;
  return (
    <div class="scwrap"><table class="sc">
      <thead><tr><th class="nm">Hole</th>{holes.map(h => <th>{h}</th>)}<th>Tot</th><th>{stab ? 'Pts' : '±'}</th></tr></thead>
      <tbody>
        <tr class="par"><td class="nm">Par</td>{holes.map(h => <td>{parOf(e, h)}</td>)}<td>{holes.reduce((a, h) => a + parOf(e, h), 0)}</td><td></td></tr>
        {units.map(u => {
          const sc = (S.scores[u.id] || {}).holes || {}, l = line(c, u), own = new Set(ownHoles(c, u));
          return <tr><td class="nm">{u.name}</td>{holes.map(h => {
            if (!own.has(h)) return <td class="off">–</td>; // split format: this unit doesn't score on this nine
            const v = +(sc['h' + h] as number) || 0, d = v ? v - parOf(e, h) : 0;
            if (editable) return <td><input type="number" inputMode="numeric" min={1} max={15} id={`e-${u.id}-${h}`} value={v || ''} aria-label={`Hole ${h}`} onInput={ev => editable(u, h, (ev.target as HTMLInputElement).value)} /></td>;
            return <td>{v ? <span class={'m' + (d <= -2 ? ' eag' : d < 0 ? ' bir' : d >= 2 ? ' dbl' : d > 0 ? ' bog' : '')}>{v}</span> : '·'}</td>;
          })}<td class="tot">{l.strokes || '·'}</td><td class="tot">{l.thru ? (stab ? l.pts : fmtPar(l.rel)) : '·'}</td></tr>;
        })}
      </tbody>
    </table></div>
  );
}

/* ---------- Ryder Cup ---------- */
/* Clinch banner: shows once a side reaches the winning number (or every match is final and it's tied).
   It slides in only when the clinch happens while the page is open, not on a later page load. */
const cup = { t0: 0, seen: null as string | null, at: 0, eid: '' };
function Clinch({ c }: { c: CupState }) {
  const e = E(), key = c.winner || (c.halved ? 'H' : '');
  if (cup.eid !== S.eid) { cup.eid = S.eid; cup.t0 = Date.now(); cup.seen = null; cup.at = 0; }
  if (Date.now() - cup.t0 < 4000 || cup.seen == null) cup.seen = key;
  else if (key !== cup.seen) { cup.seen = key; if (key) { cup.at = Date.now(); setTimeout(() => toast(key === 'H' ? 'The Cup is halved' : sideName(e, key as 'A' | 'B') + ' clinched the Cup!'), 0); } }
  const fresh = cup.at && Date.now() - cup.at < 1500;
  if (!key) return null;
  const score = c.winner === 'B' ? `${fmtPts(c.B)}–${fmtPts(c.A)}` : `${fmtPts(c.A)}–${fmtPts(c.B)}`;
  const sub = c.playing ? `${score} · ${c.playing} ${c.playing === 1 ? 'match' : 'matches'} still on the course` : `Final · ${score}`;
  return (
    <div class={`clinch ${c.winner ? 'w' + c.winner.toLowerCase() : 'wh'} ${fresh ? 'fresh' : ''}`} role="status">
      <i class="cbar" aria-hidden="true"></i>
      <div class="ctext"><span class="eyebrow">{c.winner ? (c.playing ? 'Cup clinched' : 'Cup won') : 'Cup halved'}</span>
        <b>{c.winner ? sideName(e, c.winner) + ' wins' : 'All square'}</b><small>{sub}</small></div>
      <button class="ghost" onClick={() => shareCup()}>Share result</button>
    </div>
  );
}

export function CupBoard() {
  const e = E(), c = cupState(C()), { A, B, JA, JB, n, toWin, winner } = c, pct = (v: number) => (n ? v / n * 100 : 0);
  const ref = useRef<HTMLDivElement>(null);
  // Keep long team names on one line: shrink both names together until they fit, but never below 11px (Oct 29: 9.5px
  // was hard to read outside); past that the names wrap onto a second line (.tname.wrap).
  useLayoutEffect(() => {
    const fit = () => {
      const sp = [...(ref.current?.querySelectorAll<HTMLElement>('.tname span') || [])]; if (!sp.length) return;
      sp.forEach(s => { s.style.fontSize = ''; s.parentElement!.classList.remove('wrap'); });
      let fs = parseFloat(getComputedStyle(sp[0]).fontSize) || 12;
      const over = () => sp.some(s => s.scrollWidth > s.clientWidth + 0.5);
      while (over() && fs > 11) { fs -= 0.5; sp.forEach(s => { s.style.fontSize = fs + 'px'; }); }
      if (over()) sp.forEach(s => s.parentElement!.classList.add('wrap'));
    };
    fit(); addEventListener('resize', fit); return () => removeEventListener('resize', fit);
  });
  return (
    <div class="cupband" ref={ref}><Clinch c={c} /><div class="board">
      <div class="side"><div class="tname"><i class="sw a"></i><span>{sideName(e, 'A')}</span></div><div class="pts">{fmtPts(A)}</div><div class="proj">{JA !== A ? 'Projected ' + fmtPts(JA) : ' '}</div></div>
      <div class="towin">{winner ? 'Needed' : 'To win'}<b>{n ? fmtPts(toWin) : '—'}</b></div>
      <div class="side b"><div class="tname"><span>{sideName(e, 'B')}</span><i class="sw b"></i></div><div class="pts">{fmtPts(B)}</div><div class="proj">{JB !== B ? 'Projected ' + fmtPts(JB) : ' '}</div></div></div>
      <div class="track" aria-hidden="true"><div class="pa" style={`width:${pct(JA)}%`}></div><div class="pb" style={`width:${pct(JB)}%`}></div><div class="fa" style={`width:${pct(A)}%`}></div><div class="fb" style={`width:${pct(B)}%`}></div><div class="mid"></div></div>
    </div>
  );
}

export const Pair = ({ g, k, cls }: { g: Group; k: 'A' | 'B'; cls?: string }) => {
  const ps = mPlayers(C(), g, k);
  return <div class={'pair' + (k === 'B' ? ' b' : '') + (cls ? ' ' + cls : '')}>{ps.length ? ps.map(p => <span>{p.name}</span>) : <span>TBD</span>}</div>;
};

const Row = ({ onClick, children, ...p }: { onClick?: () => void; class: string; children: ComponentChildren }) =>
  onClick ? <button {...p} onClick={onClick}>{children}</button> : <div {...p}>{children}</div>;

export function MatchList({ orgView }: { orgView: boolean }) {
  const e = E(), c = C(), ms = [...S.groups].sort(byRound);
  if (!ms.length && !S.org && (e.noMatchTitle || e.noMatchText || dayPhase(e) === 'before')) {
    const [t, x] = noMatchMsg(e); return <div class="lock"><b>{t}</b>{x ? <span class="pre">{x}</span> : null}</div>;
  }
  if (!ms.length) return <Lock title="No matches yet">{S.org ? 'Add matches in the Matches tab.' : 'Matches will show up here once they’re posted.'}</Lock>;
  // with more than one round, matches sit under a heading per round with that round's points
  const rounds = [...new Set(ms.map(roundOf))].sort((a, b) => a - b);
  const row = (g: Group) => {
      const st = mstatus(c, g);
      // The player's own match is already the Your match card at the top: one short line here instead of the same card twice
      if (g.id === S.myGroup && !orgView) return <div class="mrow mineref"><span>{cardLabel(e, g)} · <b>your match</b>, shown at the top</span><span class={'pill ' + (st.lead || '')}>{st.label}</span></div>;
      const ca = st.final && st.lead ? (st.lead === 'A' ? 'win' : 'lose') : '', cb = st.final && st.lead ? (st.lead === 'B' ? 'win' : 'lose') : '';
      return (
        // Only the exec can open a match (to fix it); for everyone else the row is plain, so it doesn't look tappable.
        <Row class={'mrow' + (g.id === S.myGroup && !orgView ? ' mine' : '')} onClick={orgView ? () => edit(g.id) : undefined}>
          <Pair g={g} k="A" cls={ca} />
          <div class="stat"><span class="mnum">{cardLabel(e, g)}</span><CardStat g={g} st={st} /></div>
          <Pair g={g} k="B" cls={cb} />
          <ContestLines g={g} />
        </Row>
      );
  };
  if (rounds.length < 2) return <div class="list">{ms.map(row)}</div>;
  return <>{rounds.map(r => {
    const rm = ms.filter(g => roundOf(g) === r), cs = cupState({ ...c, groups: rm });
    return <>
      <SecHead stack title={'Round ' + r} small={cs.allFinal ? `${sideName(e, 'A')} ${fmtPts(cs.A)} · ${sideName(e, 'B')} ${fmtPts(cs.B)} · final` : `${sideName(e, 'A')} ${fmtPts(cs.JA)} · ${sideName(e, 'B')} ${fmtPts(cs.JB)} · as it stands`} />
      <div class="list">{rm.map(row)}</div>
    </>;
  })}</>;
}

/** Player points: each player's record (won–lost–halved) and points from finished matches. Partners split their
    match's points, so the column adds up to the cup score. Shows once a match has finished. */
export function PointsBoard() {
  const e = E(), rows = playerPoints(C());
  if (!rows.some(r => r.w + r.l + r.h > 0)) return null;
  return <>
    <SecHead title="Player points" small="Won–lost–halved" />
    <div class="lb">
      <div class="lbrow head pts3"><span>Player</span><span style="text-align:right">Record</span><span style="text-align:right">Pts</span></div>
      {rows.map(r => <div class={'lbrow pts3' + (S.myGroup && S.groups.find(g => g.id === S.myGroup && [...(g.aIds || []), ...(g.bIds || [])].includes(r.p.id)) && !S.org ? ' me' : '')}>
        <span class="nm"><i class={'sw ' + r.side.toLowerCase()} title={sideName(e, r.side)}></i><span class="vh">{sideName(e, r.side)}: </span> {r.p.name}{r.live ? <span class="teamtag" style="display:block">{r.live} still playing</span> : null}</span>
        <span class="sm" style="text-align:right">{recordOf(r)}</span><span class="num" style="text-align:right">{fmtPts(r.pts)}</span>
      </div>)}
    </div>
    <p class="note">Partners split their match’s points (a four-ball win is ½ each), so this adds up to the {sideName(e, 'A')} and {sideName(e, 'B')} scores.</p>
  </>;
}

/** The middle of a match row: the match status ("2 UP") for one match, or, for a card with several matches
    (split at the turn), each side's points in its own color, so it doesn't read as one score. */
export function CardStat({ g, st }: { g: Group; st: MatchStatus }) {
  if (contestsOf(E(), g).length < 2) return <><span class={'pill ' + (st.lead || '')}>{st.label}</span><span class="sub">{st.final && st.lead ? `${sideName(E(), st.lead)} won` : st.sub}</span></>;
  const started = st.sub !== 'Not started', a = st.final ? st.pa : st.ja, b = st.final ? st.pb : st.jb;
  return <>
    <span class="ptsbox" aria-label={`${sideName(E(), 'A')} ${fmtPts(a)}, ${sideName(E(), 'B')} ${fmtPts(b)} points`}>
      <span class="pill sm A">{started ? fmtPts(a) : '–'}</span><span class="pill sm B">{started ? fmtPts(b) : '–'}</span></span>
    <span class="sub">{started ? (st.final ? 'Points · final' : `Points · thru ${st.thru}`) : 'Not started'}</span>
  </>;
}

/** Under a match that has more than one part (or only plays 9): one line per contest, e.g. "Back 9 · Singles
    Tyler vs Sean  2 UP". Nothing for a plain 18-hole match. */
const lastOf = (c: ReturnType<typeof C>, ids: string[]) => namesOf(c, ids).split(' & ').map(n => n.trim().split(/\s+/).pop()).join(' & ');

export function ContestLines({ g }: { g: Group }) {
  const e = E(), c = C(), cts = contestsOf(e, g);
  if (cts.length === 1 && cts[0].part === 'all') return null;
  return (
    <div class="clines">{cts.map(ct => {
      const st = contestStatus(c, g, ct), solo = ct.a.length < 2 && ct.b.length < 2;
      return <div class="cline">
        <span class="cpart">{[PARTS[ct.part], MTYPES[ct.type]].filter(Boolean).join(' · ')}{solo ? <small>{lastOf(c, ct.a)} v {lastOf(c, ct.b)}</small> : null}</span>
        <span class="cstat"><span class={'pill sm ' + (st.lead || '')}>{st.label}</span><span class="sub">{st.final && st.lead ? `${sideName(E(), st.lead)} won` : st.sub}</span></span>
      </div>;
    })}</div>
  );
}

export const formatDesc = () => FORMATS[fmtOf(E())].desc;
export const ScoreOf = ({ u }: { u: Unit }) => { const l = line(C(), u); return <>{l.thru ? (fmtOf(E()) === 'stableford' ? l.pts + ' pts' : fmtPar(l.rel)) : '—'}</>; };
