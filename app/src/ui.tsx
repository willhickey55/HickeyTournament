import { focusDialog } from '../../shared/dialog';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { demoLoad, demoSwitch, dropPop, goPage, setPlayerView, signIn, signOut } from './actions';
import type { EventDoc } from './lib/types';
import { DEMO_KINDS } from './api/demokinds';
import { S, emit } from './state';

import hickeyLogo from './logo.webp';
/** The event's picture: the Hickey Tournament logo (default), the exec's own upload, or none. */
export const logoOf = (e: Pick<EventDoc, 'logo' | 'logoImg'>) => (e.logo === 'none' ? '' : e.logo === 'custom' && e.logoImg ? e.logoImg : hickeyLogo);
export const HICKEY_LOGO = hickeyLogo;

export function Header({ children }: { children: ComponentChildren }) {
  return <header class="band"><div class="wrap">{children}</div></header>;
}
export function Headline({ title, e }: { title: string; e?: Pick<EventDoc, 'logo' | 'logoImg'> }) {
  const src = logoOf(e || {});
  return <div class="headline">{src ? <img src={src} alt="" /> : null}<h1 class="evname">{title}</h1></div>;
}
export function Back({ label, onClick, eyebrow }: { label: string; onClick: () => void; eyebrow: string }) {
  return <div class="toprow"><button class="back" onClick={() => { S.err = ''; onClick(); }}>{label}</button><div class="eyebrow">{eyebrow}</div></div>;
}

/** A button that needs a second tap (anything that deletes or resets). */
export function Confirm({ id, label, again, onYes, cls, disabled }: { id: string; label: string; again?: string; onYes: () => void; cls?: string; disabled?: boolean }) {
  const armed = S.confirm === id;
  return (
    <button type="button" class={cls || 'link'} disabled={disabled}
      onClick={ev => { ev.stopPropagation(); if (!armed) { S.confirm = id; emit(); return; } S.confirm = null; onYes(); emit(); }}>
      {armed ? (again || 'Tap again') : label}
    </button>
  );
}

export const Lock = ({ title, children }: { title: string; children?: ComponentChildren }) => <div class="lock"><b>{title}</b>{children ? <span>{children}</span> : null}</div>;
export const SecHead = ({ title, small, top, stack }: { title: string; small?: ComponentChildren; top?: boolean; stack?: boolean }) =>
  <div class={'sechead' + (stack ? ' stack' : '')} style={top ? 'padding-top:12px' : undefined}><h2>{title}</h2>{small ? <small>{small}</small> : null}</div>;

export function Switch({ on, label, help, onClick }: { on: boolean; label: string; help?: string; onClick: () => void }) {
  return (
    <div class="srow"><div><b>{label}</b>{help ? <small>{help}</small> : null}</div>
      <button class={'switch' + (on ? ' on' : '')} aria-label={label} aria-pressed={!!on} onClick={onClick} /></div>
  );
}
export function Seg<T extends string | number>({ value, opts, onPick }: { value: T; opts: [T, string][]; onPick: (v: T) => void }) {
  return <div class="seg2" role="group">{opts.map(([v, l]) => <button type="button" aria-pressed={String(value) === String(v)} class={String(value) === String(v) ? 'on' : ''} onClick={() => onPick(v)}>{l}</button>)}</div>;
}

/** First load: a plain header and grey placeholders until the event arrives (see pageReady in state.ts). */
export function Loading() {
  return (
    <>
      <Header><div class="toprow"><span class="skel" style="width:90px;height:11px" /></div>
        <div class="headline"><span class="skel" style="width:min(70%,320px);height:30px" /></div>
        <span class="skel" style="width:min(55%,240px);height:13px" /></Header>
      <main><div class="wrap"><div class="skpage" role="status" aria-label="Loading"><span class="sk big" /><span class="sk title" /><span class="sk row" /><span class="sk row" /><span class="sk row" /></div></div></main>
    </>
  );
}

export function Toast() { return <div class="toast" hidden={!S.toast} role="status" aria-live="polite">{S.toast}</div>; }
/** Live pop-ups on the board (lib/pops.ts): newest at the bottom, gone after 6 seconds, tap to close. */
export function Pops() {
  return <div class="pops" role="status" aria-live="polite">{S.pops.map(p =>
    <button key={p.id} type="button" class={'pop' + (p.side ? ' side' + p.side.toLowerCase() : '')} onClick={() => dropPop(p.id)} aria-label={p.text + '. Close'}><i aria-hidden="true" /><span>{p.text}</span></button>)}</div>;
}
export function OfflineBar() {
  if (S.online) return null;
  return <div class="offline"><div class="wrap">{S.noDisk
    ? 'No signal. Scores will send when signal comes back, but this browser can’t keep them if the page closes: keep this page open.'
    : 'No signal. Keep scoring: scores are saved on this phone and send when signal comes back.'}</div></div>;
}
export function DemoBar() {
  if (S.api?.mode !== 'demo') return null;
  return (
    <div class="demo-bar"><div class="wrap"><span>Design preview with example data. Nothing here is saved.</span>
      <div class="seg"><button class={S.demoAs === 'player' ? 'on' : ''} onClick={() => demoSwitch('player')}>Player view</button>
        <button class={S.demoAs === 'org' ? 'on' : ''} onClick={() => demoSwitch('org')}>Exec view</button></div>
      <select class="demo-kind" aria-label="Example event" value={S.demoKind} onChange={ev => demoLoad((ev.target as HTMLSelectElement).value)}>
        {DEMO_KINDS.map(([k, l]) => <option value={k}>{l}</option>)}</select></div></div>
  );
}

/** The two pages of the site: the live tournament and its history. */
export function SiteNav({ pills }: { pills?: boolean }) {
  const live = S.page !== 'history', go = (p: 'live' | 'history') => (ev: Event) => { ev.preventDefault(); goPage(p); };
  return <nav class={'sitenav' + (pills ? ' pills' : '')} aria-label="Site"><div class="wrap">
    <a href="/" class={live ? 'on' : ''} aria-current={live ? 'page' : undefined} onClick={go('live')}>{pills ? 'Leaderboard' : S.ev?.date && +String(S.ev.date).slice(0, 4) ? String(S.ev.date).slice(0, 4) + ' tournament' : 'Live scoring'}</a>
    <a href="/history" class={live ? '' : 'on'} aria-current={live ? undefined : 'page'} onClick={go('history')}>History</a>
  </div></nav>;
}

export function Foot() {
  const demo = S.api?.mode === 'demo';
  return (
    <footer class="foot"><div class="wrap">
      {demo ? null : S.org || S.signedInGoogle
        ? <button class="link org" onClick={() => signOut()}>Sign out ({S.email})</button>
        : <button class="link org" onClick={() => signIn()}>Exec sign-in</button>}
    </div></footer>
  );
}

/** Exec ↔ player view switch, shown in the event header for the exec. */
export function ViewSwitch() {
  if (!S.canOrg) return null;
  return <button class="ghost" onClick={() => setPlayerView(S.org)}>{S.org ? 'Player view' : 'Exec view'}</button>;
}

/** A panel that slides up from the bottom of the screen (centered on wide screens). Tap outside or Esc to close. */
export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => panel.current ? focusDialog(panel.current, onClose) : undefined, []);
  return (
    <div class="drawer" onClick={ev => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div ref={panel} class="dpanel" role="dialog" aria-modal="true" aria-label={title}>
        <div class="dhead"><b>{title}</b><button type="button" class="link" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

export type PickOpt = { id: string; name: string; sub?: string };
/** Mouse/trackpad: jump straight to the search box. On a phone that would pop the keyboard over the list, so don't. */
const finePointer = () => { try { return !matchMedia('(pointer: coarse)').matches; } catch (_) { return true; } };
/**
 * Looks like a select; tapping it opens a Drawer with a search box and the options. `blank` is the
 * "nobody" choice at the top (picks ''), `hidden` says how many options were left out (already used elsewhere).
 */
export function Picker({ id, label, value, opts, blank, placeholder, hidden, hiddenWhy, none, onPick, cls }: {
  id: string; label: string; value: string; opts: PickOpt[]; blank?: string; placeholder?: string;
  hidden?: PickOpt[]; hiddenWhy?: string; none?: string; onPick: (id: string) => void; cls?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const search = useRef<HTMLInputElement>(null);
  // autofocus only works on page load, so focus the search box when the drawer opens (not on phones: see finePointer)
  useEffect(() => { if (open && finePointer()) search.current?.focus(); }, [open]);
  const cur = opts.find(o => o.id === value);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = opts.filter(o => words.every(w => o.name.toLowerCase().includes(w)));
  const pick = (v: string) => { setOpen(false); setQ(''); if (v !== value) onPick(v); };
  return (
    <>
      <button type="button" id={id} class={'picker' + (cur ? '' : ' unset') + (cls ? ' ' + cls : '')} aria-label={label} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span>{cur ? cur.name : placeholder || blank || 'Pick'}</span>
      </button>
      {open ? <Drawer title={label} onClose={() => { setOpen(false); setQ(''); }}>
        <input type="search" class="psearch" placeholder="Type a name" aria-label="Search" value={q} ref={search}
          onInput={ev => setQ((ev.target as HTMLInputElement).value)}
          onKeyDown={ev => { if (ev.key === 'Enter' && shown.length === 1) pick(shown[0].id); }} />
        <div class="plist" role="listbox" aria-label={label}>
          {blank && !words.length ? <button type="button" role="option" aria-selected={!value} class={'popt blank' + (!value ? ' on' : '')} onClick={() => pick('')}>{blank}</button> : null}
          {shown.map(o => <button type="button" role="option" aria-selected={o.id === value} class={'popt' + (o.id === value ? ' on' : '')} onClick={() => pick(o.id)}>
            <span>{o.name}</span>{o.sub ? <small>{o.sub}</small> : null}</button>)}
          {!shown.length ? <p class="note pnone">{words.length ? `Nobody matches “${q.trim()}”.` : none || 'Nobody left to pick.'}</p> : null}
        </div>
        {hidden?.length ? <details class="pnote"><summary>{hidden.length} {hidden.length === 1 ? 'player' : 'players'} hidden: {hiddenWhy || 'already picked'}</summary>
          <ul>{hidden.map(o => <li>{o.name}{o.sub ? <small> · {o.sub}</small> : null}</li>)}</ul></details> : null}
      </Drawer> : null}
    </>
  );
}

/**
 * One box per digit (group codes, last 4 of a phone). It's a single real input laid over the boxes,
 * so paste, autofill and backspace all work like a normal text field.
 */
export function CodeInput({ id, value, onInput, length = 4, label }: { id: string; value: string; onInput: (v: string) => void; length?: number; label?: string }) {
  const [focus, setFocus] = useState(false);
  const v = (value || '').replace(/\D/g, '').slice(0, length);
  return (
    <div class={'codebox' + (focus ? ' focus' : '')} style={`--n:${length}`}>
      {Array.from({ length }, (_, i) => <span class={'cbox' + (v[i] ? ' full' : '') + (focus && i === Math.min(v.length, length - 1) ? ' at' : '')}>{v[i] || ''}</span>)}
      <input type="text" id={id} inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={length} aria-label={label} value={v}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onInput={ev => { const el = ev.target as HTMLInputElement, d = el.value.replace(/\D/g, '').slice(0, length); el.value = d; onInput(d); }} />
    </div>
  );
}
