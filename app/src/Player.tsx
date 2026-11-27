/* Player side of an event (phone-first): your group/match, keeping score, the leaderboard. */
import { claimScoring, flushScores, joinGroup, wake } from './actions';
import { Boards, CardStat, ContestLines, Pair, Scorecard } from './Boards';
import { fmtOf, isRyder, oneBall, sideName } from './lib/event';
import { byOrder, cardLabel, contestsOf, fmtPar, groupDone, line, mNames, roundOf, mstatus, unitsIn } from './lib/scoring';
import { dayPhase, fmtDate, liveNow } from './lib/time';
import type { Group } from './lib/types';
import { C, E, S, emit, groupById, iScore, scorersOf } from './state';
import { Back, CodeInput, Confirm, Foot, Header, Lock, SecHead, Seg } from './ui';
import { CardScoring, MatchScoring, Scoring } from './Scoring';
import { LastChamps } from './History';
import { HomeHead } from './Head';

const go = (v: typeof S.view) => { flushScores(); S.view = v; S.review = false; S.confirm = null; emit(); window.scrollTo(0, 0); };

export function PlayerEvent() {
  if (S.view === 'pick') return <Pick />;
  if (S.view === 'confirm') return <ConfirmGroup />;
  if (S.view === 'score' && S.myGroup && iScore(S.myGroup) && (!E().hold || S.canOrg)) {
    if (!isRyder(E())) return <Scoring />;
    // a plain 18-hole match keeps the original one-tap screen; 9-hole, split and stroke-play matches use the card screen
    const g = groupById(S.myGroup)!, cts = contestsOf(E(), g);
    return cts.length === 1 && cts[0].part === 'all' && cts[0].type !== 'stroke' ? <MatchScoring /> : <CardScoring />;
  }
  return (
    <>
      <HomeHead />
      <main><div class="wrap event-results">{!S.evReady ? <div class="skpage" role="status" aria-label="Loading"><span class="sk big" /><span class="sk title" /><span class="sk row" /><span class="sk row" /><span class="sk row" /></div> : !S.ev ? <><Lock title="This year’s tournament isn’t set up yet">Check back closer to June.</Lock><LastChamps /></> : <>{lateFind() ? null : <MyCard />}<Boards orgView={false} />{lateFind() ? <MyCard /> : null}<LastChamps /></>}</div></main>
      <Foot />
    </>
  );
}

/** Once play is live, a phone that hasn't found its group yet gets the Playing today? button at the bottom of the
    page, under the leaderboard (Will, Oct 27); before that it stays at the top. */
const lateFind = () => !!S.ev && !S.myGroup && liveNow(E(), S.groups);

function ScorerButton({ g, start, done }: { g: { id: string; submitted?: boolean }; start: string; done: string }) {
  const e = E(), sc = scorersOf(groupById(g.id)), mine = sc.includes(S.uid), others = sc.filter(u => u !== S.uid).length, ryder = isRyder(e);
  if (g.submitted) return <span class="lbl">{ryder ? '✓ Result submitted' : '✓ Scores submitted'}</span>;
  if (e.locked) return <span class="lbl">Scoring is closed</span>;
  if (e.hold && !S.canOrg) return <button class="btn primary big" disabled>Scoring isn’t open yet</button>;
  if (mine) return <button class="btn primary big" onClick={() => { S.hole = null; wake(); go('score'); }}><i class="ic ic-pencil" aria-hidden="true" /> {groupDone(C(), groupById(g.id)) ? done : start}</button>;
  return <>
    <Confirm id="claim" cls="btn primary big" label={ryder ? 'I’ll keep score for this match' : 'I’ll keep score for this group'} again="Tap again to confirm" onYes={claimScoring} />
    {others ? <span class="lbl">{others} {others === 1 ? 'phone is' : 'phones are'} already keeping score</span> : null}
  </>;
}

const rounds = () => [...new Set(S.groups.map(roundOf))].sort((a, b) => a - b);

/** Once your match is over (decided or submitted) and there's a later round, a way to move this phone to your
    next match (same code check as joining). Hidden while the match is still being played (Will, Oct 21). */
function NextRound({ g }: { g: Group }) {
  const next = rounds().find(r => r > roundOf(g));
  if (!next || E().locked || !(g.submitted || mstatus(C(), g).final)) return null;
  return <button class="pick-cta" onClick={() => { S.pickRound = next; go('pick'); }}><i class="ic ic-flag" aria-hidden="true" /><div><b>Playing Round {next}?</b>
    <span>Find your next match</span></div><span class="arrow">→</span></button>;
}

function MyCard() {
  const e = E(), c = C(), g = groupById(S.myGroup);
  if (!g) {
    const ph = dayPhase(e);
    return S.groups.length && !e.locked && ph !== 'after'
      ? <button class="pick-cta" onClick={() => go('pick')}><i class="ic ic-flag" aria-hidden="true" /><div><b>{ph === 'before' ? 'Playing ' + fmtDate(e.date) + '?' : 'Playing today?'}</b><span>{(isRyder(e) ? 'Find your match' : 'Find your group') + (e.hold ? ' · scoring opens on the day' : ' to keep score')}</span></div><span class="arrow">→</span></button>
      : null;
  }
  const where = [g.tee, (g.start || 1) > 1 ? 'Hole ' + g.start : ''].filter(Boolean).join(' · ');
  if (isRyder(e)) {
    const st = mstatus(c, g);
    return (
      <><div class="mine-card">
        <div class="toprow"><span class="lbl">Your match<span class="lblsub">{rounds().length > 1 ? 'Round ' + roundOf(g) + ' · ' : ''}{cardLabel(e, g)}</span></span><span class="lbl" style="white-space:nowrap">{where ? <><i class="ic ic-clock" aria-hidden="true" /> {where}</> : null}</span></div>
        <div class="vsline"><Pair g={g} k="A" /><div class="stat"><CardStat g={g} st={st} /></div><Pair g={g} k="B" /><ContestLines g={g} /></div>
        <ScorerButton g={g} start={st.thru ? 'Score hole ' + st.next : 'Start scoring'} done="Review and submit result" />
      </div>
      <NextRound g={g} /></>
    );
  }
  // the family tournament plays one team per tee time (Will, Nov 26): then the card is "Your team"
  const us = unitsIn(c, g.id), one = us.length === 1 && !!S.teams.find(t => t.id === us[0].id), sc = scorersOf(g), mine = sc.includes(S.uid), others = sc.filter(u => u !== S.uid).length, stab = fmtOf(e) === 'stableford';
  return (
    <>
      <div class="mine-card">
        <div class="toprow"><span class="lbl">{one ? 'Your team' : 'Your group, ' + g.name}</span><span class="lbl">{where}</span></div>
        <div style="display:flex;flex-direction:column;gap:2px">{us.map(u => {
          const l = line(c, u);
          return <div class="toprow" style="font-weight:600"><span>{u.name}</span><span style="font-family:var(--display);font-size:20px">{l.thru ? <>{stab ? l.pts + ' pts' : fmtPar(l.rel)} <span style="font-size:13px;color:var(--bandmuted);font-family:var(--cond)">{l.done ? 'F' : 'thru ' + l.thru}</span></> : '—'}</span></div>;
        })}</div>
        <ScorerButton g={g} start="Enter scores" done="Review and submit scores" />
      </div>
 <SecHead title={one ? 'Your scorecard' : 'Group scorecard'} small={mine ? (others ? `You + ${others} more scoring` : 'You’re scoring') : 'View only'} />
      <Scorecard units={us} />
    </>
  );
}

function Pick() {
  const e = E(), c = C(), ryder = isRyder(e), num0 = new Map([...S.groups].sort(byOrder).map((g, i) => [g.id, i + 1]));
  // Ryder rounds: one round at a time (the one asked for, or the earliest), with a switch when there are several
  const rs = ryder ? rounds() : [1], round = rs.includes(S.pickRound || 0) ? S.pickRound! : rs[0];
  const gs = [...S.groups].sort(byOrder).filter(g => !ryder || roundOf(g) === round);
  return (
    <>
      <Header><Back label="← Back" eyebrow="Step 1 of 2" onClick={() => { S.pickRound = null; go('home'); }} />
        <h1 class="evname">Find your {ryder ? 'match' : 'group'}</h1><p class="meta">Tap the {ryder ? 'match' : 'group'} with your name in it.</p></Header>
      <main><div class="wrap">{rs.length > 1 ? <div style="padding-top:12px"><Seg value={round} opts={rs.map(r => [r, 'Round ' + r] as [number, string])} onPick={r => { S.pickRound = r; emit(); }} /></div> : null}
      <div class="pick">{gs.map(g => {
        const i = num0.get(g.id)! - 1;
        const nm = String(g.name || '').replace(/^(Group|Match)\s*/i, ''), num = /^\d{1,3}$/.test(nm) ? nm : String(i + 1);
        const us = unitsIn(c, g.id);
        if (g.id === S.myGroup) return <div class="pickrow" style="opacity:.6;cursor:default"><div class="num"><small>{g.tee || 'Match'}</small>{num}</div>
          <div class="teams2"><div class="t"><span>{ryder ? `${mNames(c, g, 'A')} v ${mNames(c, g, 'B')}` : us.map(u => u.name).join(', ') || 'No players yet'}</span></div><div class="t"><span><b>{ryder ? 'Your match now' : 'Your group now'}</b></span></div></div></div>;
        return (
          <button class="pickrow" onClick={() => { S.pickId = g.id; S.err = ''; S.codeDraft = ''; go('confirm'); }}>
            <div class="num"><small>{g.tee || (ryder ? 'Match' : 'Group')}</small>{num}</div>
            <div class="teams2">
              {ryder ? <><div class="t"><i class="sw a"></i><span>{mNames(c, g, 'A')}</span></div><div class="t"><i class="sw b"></i><span>{mNames(c, g, 'B')}</span></div></> : null}
              {us.map(u => <div class="t"><span>{u.name}{oneBall(e) ? ' · ' + S.players.filter(p => p.teamId === u.id).map(p => p.name).join(', ') : ''}</span></div>)}
              {!ryder && !us.length ? <div class="t"><span>No players yet</span></div> : null}
            </div>
          </button>
        );
      })}</div></div></main>
      <Foot />
    </>
  );
}

function ConfirmGroup() {
  const g = groupById(S.pickId), e = E(), c = C();
  if (!g) { S.view = 'pick'; return <Pick />; }
  return (
    <>
      <Header><Back label="← Back" eyebrow="Step 2 of 2" onClick={() => go('pick')} /><h1 class="evname">Is this your group?</h1></Header>
      <main><div class="wrap"><div class="confirm">
        <h2>{g.name}</h2>
        <p class="note">{[isRyder(e) ? cardLabel(e, g) : '', g.tee, (g.start || 1) > 1 ? 'Starts on hole ' + g.start : ''].filter(Boolean).join(' · ')}</p>
        {isRyder(e)
          ? <><div class="side2"><small>{sideName(e, 'A')}</small>{mNames(c, g, 'A')}</div><div class="side2 b"><small>{sideName(e, 'B')}</small>{mNames(c, g, 'B')}</div></>
          : unitsIn(c, g.id).map(u => <div class="side2" style="border-left-color:var(--ink)">{u.name}</div>)}
        {e.codes ? <div class="field"><label for="j-code">Group code</label><CodeInput id="j-code" label="Group code" value={S.codeDraft} onInput={v => { S.codeDraft = v; emit(); }} /><small class="note">4 digits from the exec</small></div> : null}
        {S.err ? <p class="err">{S.err}</p> : null}
        <p class="note">{groupById(S.myGroup) ? `This phone will move from ${groupById(S.myGroup)!.name} to ${g.name}.` : `This phone will be linked to ${g.name} for this event.`}</p>
        <button class="btn primary big" disabled={S.joining} onClick={() => joinGroup(g.id, (S.codeDraft || '').trim())}>{S.joining ? 'Joining…' : 'Yes, this is my group'}</button>
        <button class="btn big" onClick={() => go('pick')}>No, go back</button>
      </div></div></main>
    </>
  );
}
