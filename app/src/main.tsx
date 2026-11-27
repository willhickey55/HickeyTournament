import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import '../../shared/base.css';
import './extra.css';
import './styles.css';
import '../../shared/polish.css';
import '../../shared/controls.css';
import '../../shared/score.css';
import './score-event.css';
import { initSlide } from '../../shared/slide';
import { scoreSizes } from '../../shared/scoresize';
import { start, submission } from './actions';
import { FIREBASE_CONFIG } from './config';
import { SW } from './lib/event';
import { lightBand, themeVars } from './lib/look';
import { OrgEvent } from './Org';
import { PlayerEvent } from './Player';
import { E, S, emit, pageReady, useApp } from './state';
import { DemoBar, Loading, OfflineBar, Toast, Pops, SiteNav } from './ui';
import { HistoryPage } from './History';
import './history.css';
import { markExec, useScreen } from '../../shared/motion';

const root = document.getElementById('app')!;
const THEME_KEYS = ['--band', '--onband', '--bandmuted', '--bandrule'];

/** Event colors (main color and Ryder Cup side colors) and the tab title. */
function useLook() {
  const e = S.ev ? E() : null;
  const vars = e ? themeVars(e) : {}, light = !!e && lightBand(e);
  const A = SW[e?.colorA || 'royal'] || SW.royal, B = SW[e?.colorB || 'white'] || SW.white;
  const key = JSON.stringify([vars, light, A, B, e?.tabTitle, e?.name, S.page]);
  useEffect(() => {
    THEME_KEYS.forEach(k => root.style.removeProperty(k));
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.classList.toggle('lightband', light);
    for (const [k, v] of [['a', A], ['b', B]] as const) {
      root.style.setProperty('--' + k, v.c); root.style.setProperty('--' + k + '-on', v.on);
      root.style.setProperty('--' + k + '-edge-l', v.el); root.style.setProperty('--' + k + '-edge-d', v.ed); root.style.setProperty('--' + k + '-bar', v.bar || v.c);
    }
    if (e) document.title = S.page === 'history' ? 'History · ' + (e.eyebrow || e.name || 'Hickey Tournament') : e.tabTitle || e.name || 'Hickey Tournament';
  }, [key]);
}

function App() {
  useApp();
  useLook();
  const v = S.view;
  markExec(!!S.org);
  const hist = S.page === 'history';
  useScreen(!pageReady() || (S.org && !hist) ? '' : hist ? 'history' + (S.histEdit ? ':e' : '') : v, hist ? (S.histEdit ? 1 : 0) : v === 'home' ? 0 : v === 'score' ? 2 : 1, v === 'score' && !hist ? S.hole : null);
  const scoring = !hist && v === 'score' && !S.org;
  return (
    <>
      <DemoBar />
      <OfflineBar />
      {scoring || (hist && S.histEdit) ? null : <SiteNav />}
      {hist ? <HistoryPage /> : !pageReady() ? <Loading /> : S.org ? <OrgEvent /> : <PlayerEvent />}
      <Pops />
      {submission.busy || submission.error ? <div class="submission-banner" role="status" onClick={() => { submission.error = ''; emit(); }}>{submission.error || (S.online ? 'Submitting… waiting for confirmation. Keep this page open.' : 'Waiting for connection to submit. Keep this page open.')}</div> : null}<Toast />
    </>
  );
}

render(<App />, root);

// Tapping anywhere else cancels a "Tap again" button.
document.addEventListener('click', () => { if (S.confirm) { S.confirm = null; emit(); } });

// The preview build leaves Firebase out entirely; the live build leaves the example data out.
(async () => {
  try {
    if (__DEMO__) { const { demoApi } = await import('./api/demo'); start(demoApi()); }
    else { const { firebaseApi } = await import('./api/firebase'); start(firebaseApi(FIREBASE_CONFIG)); }
  } catch (e) {
    console.error(e);
    S.api = null; S.failed = true; S.evReady = true;
    emit();
  }
})();

initSlide();
scoreSizes();
