/* Exec side of an event: board, field, groups/matches, scores, look and settings. */
import { confirmReset } from '../../shared/dialog';
import { useState } from 'preact/hooks';
import {
  addAdmin, addGroup, addPlayers, addTeam, autofill, deleteGroup, deleteTeam, downloadCsv, editEvent, movePlayer, moveTeam, newGroupCode,
  removeAdmin, removePlayer, renamePlayer, renameTeam, reopenGroup, resetPhones, resetScorers, saveCourse, saveEvent, setCardHole, setHole, setMatchHole,
  setMatchPlayer, setPar, saveYearToHistory, goPage, setPlayer, setStatus, startNewEvent, teamsFromGroups, updateGroup, useSavedCourse,
} from './actions';
import { Boards, EventBand, MatchList, Scorecard } from './Boards';
import { OWNER_EMAIL, SITE } from './config';
import { Look } from './Look';
import { sharePairings, shareResults } from './share';
import { FORMATS, MTYPES, fmtOf, isRyder, isTeam, nH, parOf, sideName, SW, TEAM_FORMATS, oneBallAt, playerBall, splitOn, teamBall } from './lib/event';
import { PARTS, byOrder, byRound, cardLabel, contestStatus, contestsOf, fmtPar, fmtPts, hasCardScores, layoutOf, line, matchWith, mNames, mstatus, namesOf, resultKey, roundOf, strokeKey, unitsIn } from './lib/scoring';
import { fmtAgo, fmtWhen, noMatchMsg } from './lib/time';
import type { EventDoc, FormatKey, Group, MatchLayout, MatchResult, MatchType, Team } from './lib/types';
import { C, E, S, emit, groupById, scorersOf, EVENT_PATH, teamById, toast, unitById, type Tab } from './state';
import { Back, Confirm, Foot, Header, Lock, Picker, SecHead, Seg, Switch } from './ui';

export function OrgEvent() {
  if (S.view === 'edit') return isRyder(E()) ? <EditMatch /> : <EditUnit />;
  const ryder = isRyder(E());
  const tabs: [Tab, string][] = [['board', 'Board'], ['field', ryder ? 'Players' : 'Field'], ['groups', ryder ? 'Matches' : 'Groups'], ['scores', 'Scores'], ['look', 'Look'], ['settings', 'Settings']];
  const Body = { board: OrgBoard, field: Field, groups: ryder ? Matches : Groups, scores: OrgScores, look: Look, settings: Settings }[S.tab] || OrgBoard;
  return (
    <>
      <Header><EventBand /></Header>
      <main><div class="wrap">
        <nav class="tabs" aria-label="Exec sections">{tabs.map(([k, l]) => <button class={S.tab === k ? 'on' : ''} onClick={() => { S.tab = k; S.view = 'home'; S.confirm = null; emit(); }}>{l}</button>)}</nav>
        {S.evReady && !S.ev ? <Lock title="No event loaded">Check your signal. If this is a brand-new site, the event is made as soon as you’re online.</Lock> : <Body />}
      </div></main>
      <Foot />
    </>
  );
}

export const linkOf = () => SITE + EVENT_PATH;
function copyLink() {
  const link = linkOf();
  (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast('Link copied')).catch(() => toast('Press and hold the link to copy it'));
}

function OrgBoard() {
  const e = E();
  const visLbl = ({ hidden: 'Hidden from players', live: 'Live for players', scheduled: e.revealAt ? `Posts ${fmtWhen(e.revealAt)}` : 'Scheduled', published: 'Posted for players' } as Record<string, string>)[e.visibility] || '';
  const shown = e.visibility === 'live' || e.visibility === 'published';
  return (
    <>
      <div class="share" style="margin-top:12px"><code>{linkOf()}</code><button class="btn" onClick={copyLink}>Copy link</button></div>
      <div class="srow"><div><b>Player view: {visLbl}</b><small>You always see the full live board.</small></div>
        {shown ? <button class="btn" onClick={() => { saveEvent({ visibility: 'hidden' }); toast('Leaderboard hidden'); }}>Hide</button>
          : <button class="btn primary" onClick={() => { saveEvent({ visibility: 'published' }); toast('Results posted'); }}>Post results</button>}</div>
      <div class="srow"><div><b>Scoring: {e.hold ? 'Not open yet' : e.locked ? 'Locked' : 'Open'}</b><small>{e.hold ? 'Players can find their match but can’t keep score.' : 'Players can keep score.'}</small></div>
        {e.hold ? <button class="btn primary" onClick={() => { saveEvent({ hold: false }); toast('Scoring is open'); }}>Open scoring</button>
          : <button class="btn" onClick={() => { saveEvent({ hold: true }); toast('Scoring on hold'); }}>Hold scoring</button>}</div>
      <Boards orgView={true} />
      <div class="helper"><button class="btn" onClick={() => { shareResults(); }}>Save results picture</button><button class="btn" onClick={downloadCsv}>Export results (CSV)</button><PairingsButtons /></div>
    </>
  );
}

/** Pairings picture for the team chat. With codes on, a second button puts the join codes in it too. */
function PairingsButtons() {
  return <>
    <button class="btn" onClick={() => { sharePairings(false); }}>Share pairings</button>
    {E().codes ? <button class="btn" onClick={() => { sharePairings(true); }}>Share pairings with codes</button> : null}
  </>;
}

function BulkAdd({ placeholder }: { placeholder?: string }) {
  const [txt, setTxt] = useState('');
  return (
    <form class="form" onSubmit={ev => { ev.preventDefault(); if (!txt.trim()) { toast('Type at least one name'); return; } addPlayers(txt); setTxt(''); (document.activeElement as HTMLElement)?.blur(); }}>
      <div class="field"><label for="bulk">Add players (one name per line)</label><textarea id="bulk" style="min-height:90px" placeholder={placeholder} value={txt} onInput={ev => setTxt((ev.target as HTMLTextAreaElement).value)} /></div>
      <button class="btn primary" type="submit">Add players</button>
    </form>
  );
}

function Field() {
  const e = E(), ryder = isRyder(e), team = isTeam(e) && !ryder, ps = [...S.players].sort(byOrder);
  if (ryder) {
    return (
      <>
        <SecHead top title="Players" small={`${ps.filter(p => p.side === 'A').length} ${sideName(e, 'A')} · ${ps.filter(p => p.side === 'B').length} ${sideName(e, 'B')}`} />
        <BulkAdd />
        {ps.map(p => <div class="frow">
          <input type="text" id={'pn-' + p.id} value={p.name} aria-label="Player name" onInput={ev => renamePlayer(p.id, (ev.target as HTMLInputElement).value)} />
          <select id={'ps-' + p.id} aria-label="Side" value={p.side || ''} onChange={ev => setPlayer(p.id, { side: (ev.target as HTMLSelectElement).value as 'A' | 'B' | '' })}>
            <option value="">No side</option><option value="A">{sideName(e, 'A')}</option><option value="B">{sideName(e, 'B')}</option></select>
          <Confirm id={'delp:' + p.id} label="Remove" onYes={() => removePlayer(p.id)} />
        </div>)}
      </>
    );
  }
  const groups = S.groups, teams = [...S.teams].sort(byOrder);
  const gopts = [<option value="">No group</option>, ...groups.map(g => <option value={g.id}>{g.name}</option>)];
  return (
    <>
      <SecHead top title="Players" small={`${ps.length} entered`} />
      <BulkAdd placeholder={'Jake Miller\nRyan Torres'} />
      {ps.map(p => <div class="frow">
        <input type="text" id={'pn-' + p.id} value={p.name} aria-label="Player name" onInput={ev => renamePlayer(p.id, (ev.target as HTMLInputElement).value)} />
        {playerBall(e) ? <select id={'pg-' + p.id} aria-label="Group" value={p.groupId || ''} onChange={ev => movePlayer(p.id, (ev.target as HTMLSelectElement).value)}>{gopts}</select> : null}
        {team ? <select id={'pt-' + p.id} aria-label="Team" value={p.teamId || ''} onChange={ev => setPlayer(p.id, { teamId: (ev.target as HTMLSelectElement).value })}><option value="">No team</option>{teams.map(t => <option value={t.id}>{t.name}</option>)}</select> : null}
        <Confirm id={'delp:' + p.id} label="Remove" onYes={() => removePlayer(p.id)} />
      </div>)}
      {team ? <>
        <SecHead title="Teams" small={`${S.teams.length} teams`} />
        <div class="inline"><button class="btn primary" onClick={addTeam}>+ Add team</button>
          {groups.length ? <Confirm id="tfg" cls="btn" label="Make each group a team" again="Tap again: one team per group" onYes={teamsFromGroups} /> : null}</div>
        {teams.map((t: Team) => <div class="gcard">
          <div class="inline">
            <div class="field"><label for={'tn-' + t.id}>Team name</label><input type="text" id={'tn-' + t.id} value={t.name} onInput={ev => renameTeam(t.id, (ev.target as HTMLInputElement).value)} /></div>
            {teamBall(e) ? <div class="field"><label for={'tg-' + t.id}>Group</label><select id={'tg-' + t.id} value={t.groupId || ''} onChange={ev => moveTeam(t.id, (ev.target as HTMLSelectElement).value)}>{gopts}</select></div> : null}
          </div>
          <div class="toprow"><small class="note">{S.players.filter(p => p.teamId === t.id).map(p => p.name).join(', ') || 'No players yet'}</small>
            <Confirm id={'delt:' + t.id} label="Delete team" onYes={() => deleteTeam(t.id)} /></div>
        </div>)}
      </> : null}
    </>
  );
}

function CodeAndDelete({ g, what }: { g: Group; what: 'match' | 'group' }) {
  return <div class="top"><b>{g.name}</b>
    {E().codes ? <span class="code">Code <strong>{S.codes[g.id] || '····'}</strong> <button class="link" onClick={() => newGroupCode(g.id)}>New code</button></span> : null}
    <Confirm id={'delg:' + g.id} label={what === 'match' ? 'Delete match' : 'Delete group'} again={what === 'match' ? 'Tap again to delete' : 'Tap again to delete group'} onYes={() => deleteGroup(g.id)} /></div>;
}
function Submitted({ g }: { g: Group }) {
  return g.submitted ? <div class="srow" style="border:0;padding:0"><div><b>{isRyder(E()) ? '✓ Result submitted' : '✓ Scores submitted'}</b><small>{fmtAgo(g.submittedAt || 0)}</small></div><button class="btn" onClick={() => reopenGroup(g.id)}>Reopen</button></div> : null;
}
function Scorers({ g }: { g: Group }) {
  const n = scorersOf(g).length;
  return <><div class="srow" style="border:0;padding:0"><div><b>Scorers</b><small>{n ? `${n} ${n === 1 ? 'phone' : 'phones'} keeping score` : 'Nobody yet'}</small></div>
    <span class="hdr-r">{n ? <button class="btn" onClick={() => resetScorers(g.id)}>Reset scorers</button> : null}<Confirm id={'rg:' + g.id} cls="btn" label="Reset phones" onYes={() => resetPhones(g.id)} /></span></div><p class="note">Reset scorers: phones stay in this group, but must tap “I’ll keep score” again. Reset phones: removes this group’s phone links; players must find and join their group again. Scores stay.</p></>;
}
const StartHole = ({ g }: { g: Group }) => (
  <div class="field"><label for={'gs-' + g.id}>Starting hole</label><select id={'gs-' + g.id} value={String(+(g.start || 1))} onChange={ev => updateGroup(g.id, { start: +(ev.target as HTMLSelectElement).value })}>
    {Array.from({ length: nH(E()) }, (_, j) => <option value={String(j + 1)}>{j + 1}</option>)}</select></div>
);
const Tee = ({ g }: { g: Group }) => (
  <div class="field"><label for={'gt-' + g.id}>Tee time</label><input type="text" id={'gt-' + g.id} value={g.tee || ''} placeholder="1:00 PM" onInput={ev => updateGroup(g.id, { tee: (ev.target as HTMLInputElement).value }, true)} /></div>
);

function Groups() {
  const e = E();
  return (
    <>
      <div class="inline" style="padding-top:12px"><button class="btn primary" onClick={addGroup}>+ Add group</button>{S.groups.length ? <PairingsButtons /> : null}
        {S.players.some(p => !p.groupId) && playerBall(e) ? <button class="btn" onClick={autofill}>Put unassigned players in groups of 4</button> : null}</div>
      {S.groups.length ? S.groups.map(g => <div class="gcard">
        <CodeAndDelete g={g} what="group" />
        <div class="inline">
          <div class="field"><label for={'gn-' + g.id}>Name</label><input type="text" id={'gn-' + g.id} value={g.name} onInput={ev => updateGroup(g.id, { name: (ev.target as HTMLInputElement).value }, true)} /></div>
          <Tee g={g} /><StartHole g={g} />
        </div>
        <GroupMembers g={g} />
        <Submitted g={g} /><Scorers g={g} />
      </div>) : <div class="lock" style="margin-top:12px"><b>No groups yet</b><span>Add groups, then add players to each one.</span></div>}
    </>
  );
}

/** Who's in a group: a chip per player (× takes them out) and a picker that only lists players with no group yet. */
function GroupMembers({ g }: { g: Group }) {
  const e = E(), c = C();
  const kinds: { what: string; all: { id: string; name: string; groupId?: string }[]; move: (id: string, gid: string) => void }[] = [];
  if (playerBall(e)) kinds.push({ what: 'player', all: [...S.players].sort(byOrder), move: movePlayer });
  if (teamBall(e)) kinds.push({ what: 'team', all: [...S.teams].sort(byOrder), move: moveTeam });
  if (!kinds.length) return <p class="note" style="margin:0">{unitsIn(c, g.id).map(u => u.name).join(', ')}</p>;
  return <>{kinds.map(k => {
    const inG = k.all.filter(u => u.groupId === g.id), free = k.all.filter(u => !groupById(u.groupId || '')), taken = k.all.filter(u => !free.includes(u) && u.groupId !== g.id);
    return <div class="field"><span class="lbl">{k.what === 'team' ? 'Teams' : 'Players'} ({inG.length})</span>
      <div class="mchips">
        {inG.map(u => <span class="mchip">{u.name}<button type="button" aria-label={`Take ${u.name} out of ${g.name}`} onClick={() => k.move(u.id, '')}>✕</button></span>)}
        <span style="flex:1;min-width:170px"><Picker id={`ga-${k.what}-${g.id}`} cls="add" label={`Add a ${k.what} to ${g.name}`} value="" placeholder={`+ Add ${k.what}`}
          opts={free.map(u => ({ id: u.id, name: u.name }))} hidden={taken.map(u => ({ id: u.id, name: u.name, sub: groupById(u.groupId || '')?.name }))} hiddenWhy="already in a group" none="Everyone is already in a group. Take someone out of theirs first (✕), or add players in Field."
          onPick={id => { if (id) k.move(id, g.id); }} /></span>
      </div></div>;
  })}</>;
}

function Matches() {
  const e = E(), side = (k: 'A' | 'B') => S.players.filter(p => p.side === k).sort(byOrder);
  // A player is in one match per round: anyone already picked in another match of the same round is left out.
  const ms = [...S.groups].sort(byRound), nRounds = Math.max(1, ...ms.map(roundOf));
  // match numbers follow the list order, the same as the board, pairings picture and players' match list
  const num = new Map([...S.groups].sort(byOrder).map((g, n) => [g.id, n + 1]));
  // Moving a match to another round can leave someone in two matches of that round: say so on the card.
  const Twice = ({ g }: { g: Group }) => {
    const dup = (['A', 'B'] as const).flatMap(k => ((k === 'A' ? g.aIds : g.bIds) || []).map((pid, i) => ({ pid, n: pid ? matchWith(ms, pid, g.id, k, i) : -1 })))
      .filter(x => x.n >= 0).map(x => `${S.players.find(p => p.id === x.pid)?.name || '?'} is also in Match ${num.get(ms[x.n].id)}`);
    return dup.length ? <p class="err" style="margin:0">{dup.join('; ')} this round. A player can only be in one match per round.</p> : null;
  };
  const sel = (g: Group, k: 'A' | 'B', i: number) => {
    const cur = ((k === 'A' ? g.aIds : g.bIds) || [])[i] || '', where = (pid: string) => matchWith(ms, pid, g.id, k, i);
    const all = side(k), free = all.filter(p => p.id === cur || where(p.id) < 0), taken = all.filter(p => !free.includes(p));
    const inRound = nRounds > 1 ? `a Round ${roundOf(g)} match` : 'a match';
    return <Picker id={`mp-${g.id}-${k}${i}`} label={`${sideName(e, k)} ${i ? 'partner' : 'player'}`} value={cur} placeholder={i ? 'Partner' : 'Player'} blank="Nobody (leave empty)"
      opts={free.map(p => ({ id: p.id, name: p.name }))} hidden={taken.map(p => ({ id: p.id, name: p.name, sub: 'Match ' + num.get(ms[where(p.id)].id) }))}
      hiddenWhy={'already in ' + inRound} none={`Everyone on ${sideName(e, k)} is already in ${inRound}. Take someone out of their match first, or add players in Players.`}
      onPick={pid => setMatchPlayer(g.id, k, i, pid)} />;
  };
  return (
    <>
      <div class="inline" style="padding-top:12px"><button class="btn primary" onClick={addGroup}>+ Add match</button>{S.groups.length ? <PairingsButtons /> : null}</div>
      {ms.length ? ms.map((g, i) => <>
        {nRounds > 1 && (i === 0 || roundOf(ms[i - 1]) !== roundOf(g)) ? <SecHead title={'Round ' + roundOf(g)} small={`${ms.filter(x => roundOf(x) === roundOf(g)).length} matches`} /> : null}
        <div class="gcard">
        <CodeAndDelete g={{ ...g, name: 'Match ' + num.get(g.id) }} what="match" />
        <div class="inline">
          <div class="field"><label for={'mt-' + g.id}>{layoutOf(e, g) === 'split' ? 'Front 9' : 'Match type'}</label><select id={'mt-' + g.id} value={g.mtype || 'singles'} onChange={ev => setMatchType(g, (ev.target as HTMLSelectElement).value as MatchType)} title={hasCardScores(C(), g) ? 'Scores are in: switching to or from stroke play or singles is locked' : undefined}>
            {Object.entries(MTYPES).filter(([k]) => k !== 'strokesingles').map(([k, l]) => <option value={k} disabled={hasCardScores(C(), g) && ((k === 'stroke') !== ((g.mtype || 'singles') === 'stroke') || (k === 'singles') !== ((g.mtype || 'singles') === 'singles'))}>{l}</option>)}</select></div>
          <Tee g={g} /><StartHole g={g} />
          <div class="field"><label for={'mr-' + g.id}>Round</label><select id={'mr-' + g.id} value={String(roundOf(g))} onChange={ev => updateGroup(g.id, { round: +(ev.target as HTMLSelectElement).value })}>
            {[1, 2, 3, 4].map(r => <option value={String(r)}>Round {r}</option>)}</select></div>
        </div>
        <div class="pairs"><div class="col"><span class="lbl">{sideName(e, 'A')}</span>{sel(g, 'A', 0)}{(g.mtype || 'singles') !== 'singles' ? sel(g, 'A', 1) : null}</div>
          <div class="col b"><span class="lbl">{sideName(e, 'B')}</span>{sel(g, 'B', 0)}{(g.mtype || 'singles') !== 'singles' ? sel(g, 'B', 1) : null}</div></div>
        <Twice g={g} />
        <MatchLayoutFields g={g} />
        <Submitted g={g} /><Scorers g={g} />
      </div></>) : <div class="lock" style="margin-top:12px"><b>No matches yet</b><span>Add players to each side in Players, then add matches here.</span></div>}
    </>
  );
}

/** Singles is 1 v 1: switching a 2 v 2 match to singles drops the partners, or they'd still show on the board. */
function setMatchType(g: Group, mtype: MatchType) {
  updateGroup(g.id, mtype === 'singles' ? { mtype, aIds: (g.aIds || []).slice(0, 1), bIds: (g.bIds || []).slice(0, 1) } : { mtype });
}

/** Which holes a match covers, what the back nine is when it's split, and what each match is worth. */
function MatchLayoutFields({ g }: { g: Group }) {
  const e = E(), c = C(), lay = layoutOf(e, g), cts = contestsOf(e, g), a = (g.aIds || []).filter(Boolean), b = (g.bIds || []).filter(Boolean);
  const nm = (id?: string) => (id && S.players.find(p => p.id === id)?.name) || '?';
  const two = a.length >= 2 && b.length >= 2, t2 = g.mtype2 || 'singles';
  // Results are saved per match on the card (h12, h12_2, strokes per player). Once anything is scored, changing
  // which holes or matches the card has would hand those results to different matches, so the setup locks.
  const locked = hasCardScores(c, g);
  return (
    <>
      <div class="inline">
        {nH(e) === 18 ? <div class="field"><label for={'ml-' + g.id}>Holes</label><select id={'ml-' + g.id} value={lay} disabled={locked} onChange={ev => updateGroup(g.id, { layout: (ev.target as HTMLSelectElement).value as MatchLayout })}>
          <option value="all">All 18</option><option value="front">Front 9 only</option><option value="back">Back 9 only</option><option value="split">Split at the turn</option></select></div> : null}
        {lay === 'split' ? <div class="field"><label for={'m2-' + g.id}>Back 9</label><select id={'m2-' + g.id} value={t2} disabled={locked} onChange={ev => updateGroup(g.id, { mtype2: (ev.target as HTMLSelectElement).value as MatchType })}>
          <option value="singles">{two ? 'Singles (two matches)' : 'Singles'}</option><option value="fourball">Four-ball</option><option value="foursomes">Alternate shot</option><option value="scramble">Scramble</option>
          <option value="stroke">{two ? 'Stroke play (2 v 2 total)' : 'Stroke play'}</option>{two ? <option value="strokesingles">Stroke play singles (two matches)</option> : null}</select></div> : null}
        {lay === 'split' && (t2 === 'singles' || t2 === 'strokesingles') && two ? <div class="field"><label for={'mx-' + g.id}>Back 9 singles</label><select id={'mx-' + g.id} value={g.cross ? '1' : ''} disabled={locked} onChange={ev => updateGroup(g.id, { cross: !!(ev.target as HTMLSelectElement).value })}>
          <option value="">{nm(a[0])} v {nm(b[0])}, {nm(a[1])} v {nm(b[1])}</option><option value="1">{nm(a[0])} v {nm(b[1])}, {nm(a[1])} v {nm(b[0])}</option></select></div> : null}
        <div class="field"><label for={'mpts-' + g.id}>Points per match</label><select id={'mpts-' + g.id} value={String(+(g.pts ?? 1) || 1)} onChange={ev => updateGroup(g.id, { pts: +(ev.target as HTMLSelectElement).value })}>
          <option value="0.5">½</option><option value="1">1</option><option value="2">2</option></select></div>
      </div>
      {cts.length > 1 || lay !== 'all' ? <p class="note" style="margin:0">{cts.length > 1 ? `${cts.length} matches, ${fmtPts(cts.reduce((t, x) => t + x.pts, 0))} points: ` : ''}{cts.map(ct => `${[PARTS[ct.part], MTYPES[ct.type]].filter(Boolean).join(' ')} (${namesOf(c, ct.a)} v ${namesOf(c, ct.b)})`).join('; ')}.
        {cts.some(ct => ct.type === 'stroke') ? ' Stroke play: each side adds its players’ scores; lower total wins.' : ''}
        {lay === 'split' && t2 === 'singles' && !two && (a.length > 1 || b.length > 1) ? ' Back-nine singles need two players on each side.' : ''}</p> : null}
      {locked && nH(e) === 18 ? <p class="note" style="margin:0">Scores are in, so the holes and back-nine setup are locked (changing them would move the results to other matches). To change it, clear this match’s holes in Scores first.</p> : null}
    </>
  );
}

function OrgScores() {
  const e = E(), c = C();
  if (isRyder(e)) return <><SecHead top title="Matches" small="Tap to edit" /><MatchList orgView={true} /></>;
  // a split format has both: players (their own-ball nine) and teams (their one-ball nine)
  const us = [...(playerBall(e) ? S.players : []), ...(teamBall(e) ? S.teams : [])].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <SecHead top title="All scores" small="Tap to edit" />
      <div class="list">{us.length ? us.map(u => {
        const l = line(c, u), g = groupById(u.groupId);
        return <button class="mrow" style="grid-template-columns:1fr auto" onClick={() => { S.editId = u.id; S.view = 'edit'; emit(); window.scrollTo(0, 0); }}>
          <div class="pair"><span>{u.name}{u.status ? <span class="tag">{u.status}</span> : null}</span><span class="sub" style="text-transform:none;letter-spacing:0">{g ? g.name : 'No group'}</span></div>
          <div class="stat"><span class="pill">{l.thru ? (fmtOf(e) === 'stableford' ? l.pts + ' pts' : fmtPar(l.rel)) : '—'}</span><span class="sub">{l.thru ? (g && g.submitted ? 'Submitted' : l.done ? 'Final' : 'Thru ' + l.thru) : 'No scores'}</span></div>
        </button>;
      }) : <div class="empty"><b>Nobody entered yet</b><span>Add players in Field.</span></div>}</div>
    </>
  );
}

const backToOrg = () => { S.editId = ''; S.view = 'home'; emit(); window.scrollTo(0, 0); };

function EditMatch() {
  const e = E(), c = C(), g = groupById(S.editId);
  if (!g) { S.view = 'home'; return <OrgEvent />; }
  const st = mstatus(c, g), h0 = (S.scores[g.id] || {}).holes || {}, cts = contestsOf(e, g);
  if (cts.length > 1 || cts[0].part !== 'all' || cts[0].type === 'stroke') return <EditCard g={g} />;
  return (
    <>
      <Header><Back label="← Back" eyebrow="Edit match" onClick={backToOrg} /><h1 class="evname">{mNames(c, g, 'A')} vs {mNames(c, g, 'B')}</h1><p class="meta">{st.label} · {st.sub}</p></Header>
      <main><div class="wrap form"><div class="pars">{Array.from({ length: nH(e) }, (_, i) => (
        <label for={'mh-' + (i + 1)}>{i + 1}<select id={'mh-' + (i + 1)} value={(h0['h' + (i + 1)] as string) || ''} onChange={ev => setMatchHole(g, i + 1, ((ev.target as HTMLSelectElement).value || null) as MatchResult | null)}>
          <option value="">–</option><option value="A">{sideName(e, 'A').replace(/^team\s+/i, '').slice(0, 6)}</option><option value="H">Half</option><option value="B">{sideName(e, 'B').replace(/^team\s+/i, '').slice(0, 6)}</option></select></label>
      ))}</div>
        <p class="note">Pick who won each hole. Changes save right away.</p></div></main>
    </>
  );
}

/** Exec fixes for a match card with a layout: who won each hole for each match, or each player's strokes. */
function EditCard({ g }: { g: Group }) {
  const e = E(), c = C(), st = mstatus(c, g), h0 = (S.scores[g.id] || {}).holes || {}, cts = contestsOf(e, g);
  return (
    <>
      <Header><Back label="← Back" eyebrow={`Edit match · ${cardLabel(e, g)}`} onClick={backToOrg} /><h1 class="evname">{mNames(c, g, 'A')} vs {mNames(c, g, 'B')}</h1><p class="meta">{st.label} · {st.sub}</p></Header>
      <main><div class="wrap form">{cts.map(ct => {
        const cs = contestStatus(c, g, ct), hs = [...ct.holes].sort((x, y) => x - y);
        return <div class="field"><label>{[PARTS[ct.part], MTYPES[ct.type]].filter(Boolean).join(' · ')}: {namesOf(c, ct.a)} vs {namesOf(c, ct.b)} · {cs.label}</label>
          {ct.type === 'stroke'
            ? [...ct.a, ...ct.b].map(pid => <div class="pars"><span class="note" style="grid-column:1/-1">{namesOf(c, [pid])}</span>{hs.map(h => <label for={`sk-${h}-${pid}`}>{h}<input type="number" inputMode="numeric" min={1} max={15} id={`sk-${h}-${pid}`} value={(h0[strokeKey(h, pid)] as number) || ''}
                onInput={ev => { const v = (ev.target as HTMLInputElement).value.trim(), n = +v; setCardHole(g, strokeKey(h, pid), v === '' ? null : (n >= 1 && n <= 15 ? n : null)); }} /></label>)}</div>)
            : <div class="pars">{hs.map(h => <label for={`mk-${ct.suffix}-${h}`}>{h}<select id={`mk-${ct.suffix}-${h}`} value={(h0[resultKey(ct, h)] as string) || ''} onChange={ev => setCardHole(g, resultKey(ct, h), ((ev.target as HTMLSelectElement).value || null) as MatchResult | null)}>
                <option value="">–</option><option value="A">{ct.a.length === 1 ? namesOf(c, ct.a).split(' ')[0] : sideName(e, 'A').replace(/^team\s+/i, '').slice(0, 6)}</option><option value="H">Half</option><option value="B">{ct.b.length === 1 ? namesOf(c, ct.b).split(' ')[0] : sideName(e, 'B').replace(/^team\s+/i, '').slice(0, 6)}</option></select></label>)}</div>}
        </div>;
      })}
        <p class="note">Changes save a moment after you stop.</p></div></main>
    </>
  );
}

const cellT: Record<string, ReturnType<typeof setTimeout>> = {};
function EditUnit() {
  const e = E(), u = unitById(S.editId);
  if (!u) { S.view = 'home'; return <OrgEvent />; }
  const isT = !!teamById(u.id), l = line(C(), u);
  return (
    <>
      <Header><Back label="← Back" eyebrow="Edit scores" onClick={backToOrg} /><h1 class="evname">{u.name}</h1>
        <p class="meta">{l.thru ? `${fmtOf(e) === 'stableford' ? l.pts + ' pts' : fmtPar(l.rel)} · ${l.strokes} strokes · ${l.done ? 'Final' : 'thru ' + l.thru}` : 'No scores yet'}</p></Header>
      <main><div class="wrap form">
        <div class="field"><label for="ep-name">{isT ? 'Team' : 'Player'} name</label><input type="text" id="ep-name" value={u.name} onInput={ev => (isT ? renameTeam : renamePlayer)(u.id, (ev.target as HTMLInputElement).value)} /></div>
        <div class="field"><label>Status</label><Seg value={u.status || ''} opts={[['', 'Playing'], ['WD', 'WD (withdrew)'], ['DQ', 'DQ']]} onPick={v => setStatus(u.id, v)} /></div>
        <div class="field"><label>Scores (saves as you type)</label>
          <Scorecard units={[u]} editable={(x, h, v) => { clearTimeout(cellT[x.id + h]); cellT[x.id + h] = setTimeout(() => { const n = +v.trim(); setHole(x.id, h, v.trim() === '' ? null : (n >= 1 && n <= 15 ? n : null)); }, 600); }} /></div>
        <p class="note">Clear a box to remove that hole’s score.</p>
      </div></main>
    </>
  );
}

function Settings() {
  const e = E(), f = fmtOf(e), ryder = f === 'ryder';
  const sw = (k: keyof EventDoc, label: string, help?: string) => <Switch on={!!e[k]} label={label} help={help} onClick={() => saveEvent({ [k]: !e[k] } as Partial<EventDoc>)} />;
  const dt = e.revealAt ? new Date(e.revealAt - new Date(e.revealAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  const txt = (k: keyof EventDoc) => (ev: Event) => editEvent({ [k]: (ev.target as HTMLInputElement).value } as Partial<EventDoc>);
  const swatches = (k: 'colorA' | 'colorB', def: string) => <div class="swatches">{Object.entries(SW).map(([key, v]) =>
    <button class={'swb' + ((e[k] || def) === key ? ' on' : '')} style={`background:${v.c}`} aria-label={v.n} title={v.n} onClick={() => saveEvent({ [k]: key })} />)}</div>;
  return (
    <div class="form" style="padding-top:12px">
      <SecHead title="Format" />
      <Seg value={f} opts={Object.entries(FORMATS).map(([k, v]) => [k as FormatKey, v.short])} onPick={v => saveEvent({ format: v })} />
      <p class="note">{FORMATS[f].desc}{S.groups.length || S.players.length ? ' Changing the format keeps your players and groups.' : ''}</p>
      {f === 'team' ? <><div class="inline">
        <div class="field"><label for="s-countN">Scores that count</label><input type="number" id="s-countN" min={1} max={10} value={+e.countN || 2} onInput={ev => editEvent({ countN: Math.max(1, +(ev.target as HTMLInputElement).value || 1) })} /></div>
        <div class="field"><label>Counted</label><Seg value={e.countMode} opts={[['hole', 'Best per hole'], ['round', 'Best rounds']]} onPick={v => saveEvent({ countMode: v })} /></div></div>
        <p class="note">{e.countMode === 'round' ? `Team score = the ${+e.countN || 2} best player rounds.` : `Team score = the ${+e.countN || 2} best scores on each hole.`}</p></> : null}
      {f === 'shamble' ? <div class="field"><label for="s-countN">Scores that count on each hole</label><input type="number" id="s-countN" min={1} max={10} value={+e.countN || 2} onInput={ev => editEvent({ countN: Math.max(1, +(ev.target as HTMLInputElement).value || 1) })} /></div> : null}
      {f === 'skins' ? sw('skinsCarry', 'Carry over ties', 'When a hole is tied, its skin adds to the next hole.') : null}
      {ryder ? <div class="teams">
        <div class="field"><label for="s-sideA">Side 1 name</label><input type="text" id="s-sideA" value={e.sideA} onInput={txt('sideA')} />{swatches('colorA', 'royal')}</div>
        <div class="field"><label for="s-sideB">Side 2 name</label><input type="text" id="s-sideB" value={e.sideB} onInput={txt('sideB')} />{swatches('colorB', 'white')}</div></div> : null}
      {ryder ? <>
        <div class="field"><label for="s-nmt">Message before matches are posted</label><input type="text" id="s-nmt" value={e.noMatchTitle || ''} placeholder="Pairings coming soon" onInput={txt('noMatchTitle')} /></div>
        <div class="field"><label for="s-nmx">Details (optional)</label><textarea id="s-nmx" placeholder={noMatchMsg({ date: e.date })[1]} value={e.noMatchText || ''} onInput={txt('noMatchText')} /><small class="note">Players see this until the first match is added. Leave both blank for the default.</small></div></> : null}
      {TEAM_FORMATS.includes(f) && nH(e) === 18 ? <div class="field"><label for="s-f2">Back 9 format</label><select id="s-f2" value={splitOn(e) ? e.format2 : ''} onChange={ev => saveEvent({ format2: ((ev.target as HTMLSelectElement).value || '') as FormatKey })}>
        <option value="">Same as the front 9</option>{TEAM_FORMATS.filter(k => k !== f).map(k => <option value={k}>{FORMATS[k].label}</option>)}</select>
        <small class="note">{splitOn(e) ? `Front 9 ${FORMATS[f].label.toLowerCase()}, back 9 ${FORMATS[e.format2!].label.toLowerCase()}. Teams stay the same all round.${teamBall(e) ? ' On the ' + (oneBallAt(e, 1) ? 'front' : 'back') + ' nine the team enters one score, so give each team its group in Field.' : ''}` : 'Play the back nine in another team format, e.g. best ball then scramble.'}</small></div> : null}
      {playerBall(e) && isTeam(e) && !isRyder(e) ? sw('showIndividual', 'Show individual leaderboard too', 'Players also see their own standings.') : null}

      <SecHead title="Leaderboard" />
      <div class="field"><label>Who can see it</label><Seg value={e.visibility} opts={[['live', 'Live'], ['hidden', 'Hidden'], ['scheduled', 'At a set time'], ['published', 'Posted']]}
        onPick={v => saveEvent(v === 'scheduled' && !e.revealAt ? { visibility: v, revealAt: Date.now() + 3 * 3600000 } : { visibility: v })} /></div>
      {e.visibility === 'scheduled' ? <div class="field"><label for="s-reveal">Post results at</label><input type="datetime-local" id="s-reveal" value={dt} onInput={ev => { const v = (ev.target as HTMLInputElement).value; editEvent({ revealAt: v ? new Date(v).getTime() : 0 }); }} /></div> : null}
      <div class="field"><label>What players see</label><Seg value={e.show} opts={[['full', 'Full scores'], ['positions', 'Positions only']]} onPick={v => saveEvent({ show: v })} /></div>

      <SecHead title="Round" />
      <div class="inline"><div class="field"><label for="s-date">Date</label><input type="date" id="s-date" value={e.date} onInput={txt('date')} /></div>
        <div class="field"><label for="s-course">Course</label><input type="text" id="s-course" value={e.course} onInput={txt('course')} /></div></div>
      <div class="field"><label>Holes</label><Seg value={nH(e)} opts={[[9, '9 holes'], [18, '18 holes']]} onPick={v => saveEvent({ holes: +v })} /></div>
      <div class="srow"><div><b>Saved course</b><small>{S.savedCourse ? `${S.savedCourse.course || 'Unnamed course'} · par ${(S.savedCourse.pars || []).slice(0, 18).reduce((a, b) => a + (+b || 0), 0)}` : 'Standard par 72 (built in)'}</small></div>
        <span class="hdr-r"><button class="btn" onClick={useSavedCourse}>Use saved</button><button class="btn" onClick={saveCourse}>Save current</button></span></div>
      <div class="field"><label>Par for each hole ({Array.from({ length: nH(e) }, (_, i) => parOf(e, i + 1)).reduce((a, b) => a + b, 0)} total)</label>
        <div class="pars">{Array.from({ length: nH(e) }, (_, i) => <label for={'par-' + (i + 1)}>{i + 1}<select id={'par-' + (i + 1)} value={String(parOf(e, i + 1))} onChange={ev => setPar(i + 1, +(ev.target as HTMLSelectElement).value)}>{[3, 4, 5, 6].map(v => <option value={String(v)}>{v}</option>)}</select></label>)}</div></div>

      <SecHead title="Scoring & access" />
      {sw('codes', 'Require group codes', 'Players need a 4-digit code to join a group. Codes show in Groups.')}
      {sw('hold', 'Hold scoring (before the round)', 'Players can find their match but can’t keep score yet. Turn it off when you’re ready to play.')}
      {sw('locked', 'Lock scoring', 'Stops players from changing scores and marks the event final.')}
      <ExecList />

      <SecHead title="History" />
      <p class="note">Puts this year on the History page: the winners and every team’s finish from the leaderboard. Doing it again later just updates the same year. You can add a photo and a note on the History page.</p>
      <div class="inline"><button class="btn primary" onClick={() => { saveYearToHistory().then(() => toast((+(E().date || '').slice(0, 4) || new Date().getFullYear()) + ' saved to History')).catch(err => toast(err?.message || 'Couldn’t save. Try again.')); }}>Save this year to History</button>
        <button class="btn" onClick={() => goPage('history')}>Open History</button></div>

      <SecHead title="Start a new event" />
      <p class="note">When the tournament is done, save it to the History page (it keeps the whole leaderboard), save the picture and the CSV if you want them, then start next year’s. This erases the scores, players, {ryder ? 'matches' : 'teams and groups'} and phone links. The name, look, format, course, pars and the History page stay. It can’t be undone.</p>
      <div class="inline"><button class="btn" onClick={() => { shareResults(); }}>Save results picture</button><button class="btn" onClick={downloadCsv}>Export results (CSV)</button></div>
      <div class="inline">
        <button class="btn danger" onClick={() => confirmReset('Start a new event?', 'This permanently erases scores, players, teams, matches and phone links. The name, look, format, course, pars, exec access and the History page stay. Save this year to History first.', [{label: 'Export results (CSV)', run: downloadCsv}], startNewEvent)}>Start a new event</button></div>
    </div>
  );
}

export function ExecList() {
  const [v, setV] = useState('');
  return (
    <>
      <SecHead title="Exec" />
      <p class="note">{OWNER_EMAIL} is always on the exec. Add a Google email to give someone the same access.</p>
      {S.admins.map(a => <div class="srow"><div><b>{a}</b></div><button class="link" onClick={() => removeAdmin(a)}>Remove</button></div>)}
      <form class="pinbox" onSubmit={ev => { ev.preventDefault(); if (addAdmin(v)) setV(''); }}>
        <input type="email" placeholder="coach@gmail.com" aria-label="Exec email" value={v} onInput={ev => setV((ev.target as HTMLInputElement).value)} /><button class="btn" type="submit">Add</button>
      </form>
    </>
  );
}
