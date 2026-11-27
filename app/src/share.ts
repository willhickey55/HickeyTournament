/* Results pictures: a card of the Ryder Cup, or a leaderboard card for every other format.
   For Instagram, group chats, and posting results on the home page after the event is erased.
   Also the pairings picture (who plays with whom, tee times), for the team chat before the event. */
import { FORMATS, MTYPES, SW, fmtOf, formatLine, isRyder, isTeam, oneBall, playerBall, sideName, splitOn } from './lib/event';
import { cleanHex, onColor } from './lib/look';
import { PARTS, byOrder, byRound, cardLabel, contestStatus, contestsOf, cupState, fmtPar, fmtPts, individualRows, layoutOf, mPlayers, namesOf, playersIn, roundOf, skinsRows, teamRows, unitsIn, type Row } from './lib/scoring';
import { dayPhase, fmtDate } from './lib/time';
import { C, E, S, toast } from './state';
import { logoOf } from './ui';
import { SITE } from './config';

async function cupImage(box = 1350, W = 1080) {
  const c = cupState(C()), e = E();
  // one row per match; a match split at the turn gives a row for its front nine and one per back-nine match
  const rows = c.ms.flatMap(g => contestsOf(e, g).map(ct => ({ g, ct, st: contestStatus(C(), g, ct) })));
  // Roomy: big score. Tighter (d under 0.9): smaller score block, 105 px shorter.
  const sizeOf = (d: number) => (d >= 0.9 ? 792 : 687) + rows.length * Math.round(104 * d) + 110;
  const d = roomy(sizeOf, box), big = d >= 0.9, hC = sizeOf(d), f = Math.min(d, 1.4);
  const H = Math.max(box, hC), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d')!, D = '"Big Shoulders Display","Arial Narrow",Impact,sans-serif', T = '"Public Sans",system-ui,sans-serif';
  try {
    await Promise.race([Promise.all(['900 120px', '800 60px'].map(f => document.fonts.load(f + ' "Big Shoulders Display"')).concat(['700 30px', '500 30px'].map(f => document.fonts.load(f + ' "Public Sans"')))), new Promise(r => setTimeout(r, 1500))]);
  } catch (_) { /* system fonts */ }
  const col = (k: 'A' | 'B') => (SW[k === 'A' ? (e.colorA || 'royal') : (e.colorB || 'white')] || SW.royal).bar || '#fff';
  const fit = (t: string, font: string, size: number, max: number) => { let z = size; do { x.font = font.replace('#', String(z)); if (x.measureText(t).width <= max) break; z -= 2; } while (z > 12); return z; };
  const txt = (t: string, X: number, Y: number, font: string, size: number, max: number, color: string, align: CanvasTextAlign = 'left') => { fit(t, font, size, max); x.fillStyle = color; x.textAlign = align; x.fillText(t, X, Y); };
  // The event's main color when it's dark enough for white text; navy otherwise.
  const band = cleanHex(e.bandColor);
  x.fillStyle = band && onColor(band) === '#ffffff' ? band : '#041e42'; x.fillRect(0, 0, W, H);
  // halftone dots, top right
  x.fillStyle = 'rgba(255,255,255,.07)';
  for (let i = 0; i < 22; i++) for (let j = 0; j < 12; j++) { const r = Math.max(0, 5 - (i + j) * 0.22); if (r > 0) { x.beginPath(); x.arc(W - 30 - i * 24, 30 + j * 24, r, 0, 7); x.fill(); } }
  // content is centered when the frame has room to spare
  x.save(); x.translate(0, Math.floor((H - hC) / 2));
  const P = 72, src = logoOf(e);
  let tx = P;
  if (src) { try { const img = new Image(); img.src = src; await img.decode(); const h = 120, w = img.width * h / img.height; x.drawImage(img, P, P, w, h); tx = P + Math.min(w, 160) + 20; } catch (_) { /* no picture */ } }
  txt((e.eyebrow || '').toUpperCase(), tx, P + 44, '700 #px ' + T, 28, W - tx - P, '#bbbcbc');
  txt(String(e.name || 'The Hickey Tournament').toUpperCase(), tx, P + 112, '900 #px ' + D, 72, W - tx - P, '#ffffff');
  txt([fmtDate(e.date), e.course].filter(Boolean).join(' · '), P, P + 190, '500 #px ' + T, 30, W - P * 2, '#bbbcbc');
  // score
  let y = P + 250; x.fillStyle = 'rgba(187,188,188,.45)'; x.fillRect(P, y, W - P * 2, 3); y += 40;
  const half = (W - P * 2) / 2 - 60;
  ([['A', P, 'left'], ['B', W - P, 'right']] as const).forEach(([k, X, al]) => {
    x.fillStyle = col(k); x.fillRect(al === 'left' ? X : X - 18, y + 6, 18, 18);
    txt(sideName(e, k).toUpperCase(), al === 'left' ? X + 30 : X - 30, y + 26, '700 #px ' + T, 30, half - 30, '#ffffff', al);
    txt(fmtPts(k === 'A' ? c.A : c.B), X, y + (big ? 230 : 160), '900 #px ' + D, big ? 210 : 140, half, '#ffffff', al);
  });
  txt('–', W / 2, y + (big ? 200 : 140), '800 #px ' + D, big ? 90 : 64, 80, 'rgba(255,255,255,.5)', 'center');
  y += big ? 270 : 190;
  // bar
  const bw = W - P * 2, pct = (v: number) => (c.n ? v / c.n : 0);
  x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(P, y, bw, 22);
  x.fillStyle = col('A'); x.fillRect(P, y, bw * pct(c.A), 22); x.fillStyle = col('B'); x.fillRect(P + bw - bw * pct(c.B), y, bw * pct(c.B), 22);
  x.fillStyle = '#ffffff'; x.fillRect(W / 2 - 2, y - 6, 4, 34); y += big ? 115 : 90;
  const team = (n: string) => (/^team\b/i.test(n) ? n : 'Team ' + n);
  const head = c.winner ? team(sideName(e, c.winner)).toUpperCase() + ' WINS' : c.halved ? 'THE CUP IS HALVED' : 'LIVE · ' + (c.n ? fmtPts(c.toWin) + ' TO WIN' : '');
  txt(head, W / 2, y, '900 #px ' + D, 64, W - P * 2, '#ffffff', 'center'); y += 45;
  // each match: partners stacked one per line on each side, result in the middle
  const rh = Math.round(104 * d);
  rows.forEach(({ ct, st }, i) => {
    const ry = y + i * rh, mid = ry + rh / 2;
    x.fillStyle = 'rgba(187,188,188,.3)'; x.fillRect(P, ry, W - P * 2, 2);
    const wa = st.final && st.lead === 'A', wb = st.final && st.lead === 'B';
    const nameCol = (w: boolean, l: boolean) => (w ? '#ffffff' : l ? 'rgba(187,188,188,.75)' : '#e6e9ee');
    const side = (k: 'A' | 'B', X: number, al: CanvasTextAlign, w: boolean, l: boolean) => {
      const ns = (k === 'A' ? ct.a : ct.b).map(id => C().players.find(p => p.id === id)?.name || '').filter(Boolean); if (!ns.length) ns.push('TBD');
      const fs = Math.min(32 * f, rh * 0.62 / ns.length), lh = fs * 1.22, top = mid - (ns.length - 1) * lh / 2;
      ns.forEach((nm, j) => txt(nm, X, top + j * lh + fs * 0.35, (w ? '700' : '500') + ' #px ' + T, fs, W / 2 - P - 110, nameCol(w, l), al));
    };
    side('A', P, 'left', wa, wb); side('B', W - P, 'right', wb, wa);
    const fs = Math.min(30 * f, rh * 0.36), bh = Math.min(60 * f, rh * 0.6);
    const lab = st.thru ? st.label : '—', lc = st.lead ? col(st.lead) : 'rgba(255,255,255,.2)';
    x.fillStyle = st.lead ? lc : 'rgba(255,255,255,.15)'; x.fillRect(W / 2 - 90, mid - bh / 2, 180, bh);
    const dark = st.lead && ['#ffffff', '#bbbcbc'].includes(lc.toLowerCase());
    txt(lab, W / 2, mid + fs * 0.4, '800 #px ' + D, fs * 1.25, 160, dark ? '#041e42' : '#ffffff', 'center');
    if (ct.part !== 'all') txt(PARTS[ct.part].toUpperCase() + ' · ' + MTYPES[ct.type].toUpperCase(), W / 2, mid - bh / 2 - 8, '700 #px ' + T, 16, 220, 'rgba(187,188,188,.85)', 'center');
  });
  txt(SITE.replace(/^https?:\/\//, ''), W / 2, hC - 56, '700 #px ' + T, 30, 600, '#bbbcbc', 'center');
  x.restore();
  return cv;
}

const D = '"Big Shoulders Display","Arial Narrow",Impact,sans-serif', T = '"Public Sans",system-ui,sans-serif';

/** How roomy to draw a card's rows so it fills its frame (Will, Oct 23: shrinking the whole picture looked zoomed out).
    sizeOf(d) is the card's height with rows drawn at d times their normal size. Picks the biggest d from 1.6 down to
    0.8 that fits. If even 0.8 doesn't fit, shareCard redraws the card wider and shrinks it, so it still fills the frame. */
function roomy(sizeOf: (d: number) => number, box: number) {
  for (let i = 40; i >= 0; i -= 1) { const d = 0.8 + i * 0.02; if (sizeOf(d) <= box) return d; }
  return 0.8;
}

/** Leaderboard card for every format except the Ryder Cup: team board and/or individual board, as tall as it needs. */
async function boardImage(box = 1350, W = 1080) {
  const e = E(), c = C(), f = fmtOf(e), P = 72;
  type Block = { title: string; rows: Row[]; kind: 'par' | 'pts' | 'skins' | 'team' };
  const blocks: Block[] = [];
  if (f === 'skins') blocks.push({ title: 'Skins', rows: skinsRows(c).rows, kind: 'skins' });
  else if (!isTeam(e)) blocks.push({ title: 'Leaderboard', rows: individualRows(c), kind: f === 'stableford' ? 'pts' : 'par' });
  else {
    blocks.push({ title: 'Team leaderboard', rows: teamRows(c), kind: 'team' });
    if (playerBall(e) && e.showIndividual) blocks.push({ title: 'Individual', rows: individualRows(c), kind: 'par' });
  }
  const MAX = blocks.length > 1 ? 12 : 20;
  const shown = blocks.map(b => ({ ...b, rows: b.rows.slice(0, MAX) }));
  // Header ends at y≈434; each board adds its title (92) and rows (+40 for a "+ N more" line); 150 left for the footer.
  // Rows are 76 px at normal size, scaled by d to fill the frame.
  const sizeOf = (d: number) => 434 + shown.reduce((a, b, i) => a + 92 + Math.max(1, b.rows.length) * Math.round(76 * d) + (b.rows.length < blocks[i].rows.length ? 40 : 0), 0) + 150;
  const d = roomy(sizeOf, box), RH = Math.round(76 * d), fz = Math.min(d, 1.4), hC = sizeOf(d);
  const H = Math.max(box, hC);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d')!;
  try { await Promise.race([Promise.all(['900 120px', '800 60px'].map(q => document.fonts.load(q + ' "Big Shoulders Display"')).concat(['700 30px', '500 30px'].map(q => document.fonts.load(q + ' "Public Sans"')))), new Promise(r => setTimeout(r, 1500))]); } catch (_) { /* system fonts */ }
  const fit = (t: string, font: string, size: number, max: number) => { let z = size; do { x.font = font.replace('#', String(z)); if (x.measureText(t).width <= max) break; z -= 2; } while (z > 12); return z; };
  const txt = (t: string, X: number, Y: number, font: string, size: number, max: number, color: string, align: CanvasTextAlign = 'left') => { fit(t, font, size, max); x.fillStyle = color; x.textAlign = align; x.fillText(t, X, Y); };
  const band = cleanHex(e.bandColor);
  x.fillStyle = band && onColor(band) === '#ffffff' ? band : '#041e42'; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,.07)';
  for (let i = 0; i < 22; i++) for (let j = 0; j < 12; j++) { const r = Math.max(0, 5 - (i + j) * 0.22); if (r > 0) { x.beginPath(); x.arc(W - 30 - i * 24, 30 + j * 24, r, 0, 7); x.fill(); } }
  x.save(); x.translate(0, Math.floor((H - hC) / 2));
  const src = logoOf(e); let tx = P;
  if (src) { try { const img = new Image(); img.src = src; await img.decode(); const h = 120, w = img.width * h / img.height; x.drawImage(img, P, P, w, h); tx = P + Math.min(w, 160) + 20; } catch (_) { /* no picture */ } }
  txt((e.eyebrow || '').toUpperCase(), tx, P + 44, '700 #px ' + T, 28, W - tx - P, '#bbbcbc');
  txt(String(e.name || 'Results').toUpperCase(), tx, P + 112, '900 #px ' + D, 72, W - tx - P, '#ffffff');
  txt([fmtDate(e.date), e.course].filter(Boolean).join(' · '), P, P + 190, '500 #px ' + T, 30, W - P * 2, '#bbbcbc');
  txt(formatLine(e).toUpperCase(), P, P + 232, '700 #px ' + T, 24, W - P * 2, '#bbbcbc');
  const final = e.locked || dayPhase(e) === 'after' || blocks.every(b => b.rows.length && b.rows.every(r => r.done));
  let y = P + 262; x.fillStyle = 'rgba(187,188,188,.45)'; x.fillRect(P, y, W - P * 2, 3); y += 70;
  txt(final ? 'FINAL RESULTS' : 'RESULTS SO FAR', W / 2, y, '900 #px ' + D, 56, W - P * 2, '#ffffff', 'center'); y += 30;
  const valOf = (r: Row, k: Block['kind']) => (k === 'pts' ? r.pts + ' pts' : k === 'skins' ? `${r.skins} ${r.skins === 1 ? 'skin' : 'skins'}` : fmtPar(r.rel));
  for (const b of shown) {
    y += 70; txt(b.title.toUpperCase(), P, y, '800 #px ' + D, 40, W - P * 2, '#ffffff'); y += 22;
    if (!b.rows.length) { y += 50; txt('No scores', P, y, '500 #px ' + T, 28, W - P * 2, '#bbbcbc'); y += RH - 50; continue; }
    b.rows.forEach((r, i) => {
      const top = y + i * RH; x.fillStyle = 'rgba(187,188,188,.3)'; x.fillRect(P, top, W - P * 2, 2);
      const first = r.pos === 1, mid = top + RH / 2;
      const sub = b.kind === 'team' && (!oneBall(e) || splitOn(e)) ? S.players.filter(p => p.teamId === r.u.id).map(p => p.name).join(', ') + (r.nines ? ` · F ${fmtPar(r.nines[0])}, B ${fmtPar(r.nines[1])}` : '') : '';
      txt((r.tie ? 'T' : '') + r.pos, P, mid + 14 * fz, '900 #px ' + D, 42 * fz, 90, first ? '#ffffff' : '#bbbcbc');
      txt(r.u.name, P + 110, sub ? mid - 2 * fz : mid + 11 * fz, (first ? '700' : '600') + ' #px ' + T, 32 * fz, W - P * 2 - 110 - 280, '#ffffff');
      if (sub) txt(sub, P + 110, mid + 26 * fz, '500 #px ' + T, 22 * fz, W - P * 2 - 110 - 280, '#bbbcbc');
      txt(valOf(r, b.kind), W - P - 120, mid + 14 * fz, '900 #px ' + D, 42 * fz, 160, '#ffffff', 'right');
      txt(r.done ? (b.kind === 'skins' ? fmtPar(r.rel) : String(r.strokes)) : 'thru ' + (r.label || r.thru), W - P, mid + 10 * fz, '600 #px ' + T, 26 * fz, 110, '#bbbcbc', 'right');
    });
    y += b.rows.length * RH;
    if (b.rows.length < blocks.find(o => o.title === b.title)!.rows.length) { y += 40; txt(`+ ${blocks.find(o => o.title === b.title)!.rows.length - b.rows.length} more`, P, y, '500 #px ' + T, 24, W - P * 2, '#bbbcbc'); }
  }
  txt(SITE.replace(/^https?:\/\//, ''), W / 2, hC - 56, '700 #px ' + T, 30, 600, '#bbbcbc', 'center');
  x.restore();
  return cv;
}

/** Pairings card: every match (Ryder Cup) or group with its tee time, starting hole and players, in the order
    they're listed on the Matches / Groups tab. Join codes only when asked for (withCodes), since the picture may
    be passed around. As tall as it needs. */
async function pairingsImage(withCodes: boolean, box = 1350, W = 1080) {
  const e = E(), c = C(), ryder = isRyder(e), P = 72;
  // match numbers follow the list order (as on the board); with several rounds, matches sit under a heading per round
  const num = new Map([...S.groups].sort(byOrder).map((g, i) => [g.id, i + 1]));
  const gs = [...S.groups].sort(ryder ? byRound : byOrder), multi = ryder && new Set(gs.map(roundOf)).size > 1;
  const sideCol = (k: 'A' | 'B') => (SW[k === 'A' ? (e.colorA || 'royal') : (e.colorB || 'white')] || SW.royal).bar || '#fff';
  // what each row shows: a label, the tee time / hole / code on the right, and the names
  const rows = gs.map((g, i) => {
    const head = multi && (i === 0 || roundOf(gs[i - 1]) !== roundOf(g)) ? 'ROUND ' + roundOf(g) : '';
    const where = [g.tee ? String(g.tee).trim() : '', (g.start || 1) > 1 ? 'Hole ' + g.start : ''].filter(Boolean).join(' · ');
    const code = withCodes && e.codes && S.codes[g.id] ? 'Code ' + S.codes[g.id] : '';
    if (ryder) {
      const A = mPlayers(c, g, 'A').map(p => p.name), B = mPlayers(c, g, 'B').map(p => p.name), cts = contestsOf(e, g);
      // a match split at the turn: say who plays whom on the back nine
      const back = layoutOf(e, g) === 'split' ? 'Back 9 ' + MTYPES[cts[1].type].toLowerCase() + ': ' + cts.slice(1).map(ct => `${namesOf(c, ct.a)} v ${namesOf(c, ct.b)}`).join(' · ') : '';
      return { head, label: `Match ${num.get(g.id)} · ${cardLabel(e, g)}`, where, code, A: A.length ? A : ['TBD'], B: B.length ? B : ['TBD'], names: [] as string[], back };
    }
    const names = (oneBall(e) && !splitOn(e) ? unitsIn(c, g.id) : playersIn(c, g.id)).map(u => u.name);
    return { head, label: g.name || 'Group ' + (i + 1), where, code, A: [], B: [], names: names.length ? names : ['No players yet'], back: '' };
  });
  // Ryder rows stack partners on each side (2 lines max); group rows put 2 names per line
  const lines = (r: typeof rows[number]) => (ryder ? Math.max(r.A.length, r.B.length) : Math.ceil(r.names.length / 2));
  // row parts at normal size, scaled by d to fill the frame
  const rhAt = (r: typeof rows[number], d: number) => Math.round((78 + lines(r) * 44 + (r.back ? 52 : 0)) * d) + (r.head ? Math.round(84 * d) : 0);
  const sizeOf = (d: number) => 434 + 40 + rows.reduce((a, r) => a + rhAt(r, d), 0) + 150;
  const d = roomy(sizeOf, box), f = Math.min(d, 1.4), hC = sizeOf(d), H = Math.max(box, hC);
  const rh = (r: typeof rows[number]) => rhAt(r, d), hd = Math.round(84 * d);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d')!;
  try { await Promise.race([Promise.all(['900 120px', '800 60px'].map(q => document.fonts.load(q + ' "Big Shoulders Display"')).concat(['700 30px', '500 30px'].map(q => document.fonts.load(q + ' "Public Sans"')))), new Promise(r => setTimeout(r, 1500))]); } catch (_) { /* system fonts */ }
  const fit = (t: string, font: string, size: number, max: number) => { let z = size; do { x.font = font.replace('#', String(z)); if (x.measureText(t).width <= max) break; z -= 2; } while (z > 12); return z; };
  const txt = (t: string, X: number, Y: number, font: string, size: number, max: number, color: string, align: CanvasTextAlign = 'left') => { fit(t, font, size, max); x.fillStyle = color; x.textAlign = align; x.fillText(t, X, Y); };
  const band = cleanHex(e.bandColor);
  x.fillStyle = band && onColor(band) === '#ffffff' ? band : '#041e42'; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,.07)';
  for (let i = 0; i < 22; i++) for (let j = 0; j < 12; j++) { const r = Math.max(0, 5 - (i + j) * 0.22); if (r > 0) { x.beginPath(); x.arc(W - 30 - i * 24, 30 + j * 24, r, 0, 7); x.fill(); } }
  x.save(); x.translate(0, Math.floor((H - hC) / 2));
  const src = logoOf(e); let tx = P;
  if (src) { try { const img = new Image(); img.src = src; await img.decode(); const h = 120, w = img.width * h / img.height; x.drawImage(img, P, P, w, h); tx = P + Math.min(w, 160) + 20; } catch (_) { /* no picture */ } }
  txt((e.eyebrow || '').toUpperCase(), tx, P + 44, '700 #px ' + T, 28, W - tx - P, '#bbbcbc');
  txt(String(e.name || 'Team event').toUpperCase(), tx, P + 112, '900 #px ' + D, 72, W - tx - P, '#ffffff');
  txt([fmtDate(e.date), e.course].filter(Boolean).join(' · '), P, P + 190, '500 #px ' + T, 30, W - P * 2, '#bbbcbc');
  if (ryder) {
    // the two sides with their colors
    const half = (W - P * 2) / 2 - 40;
    ([['A', P, 'left'], ['B', W - P, 'right']] as const).forEach(([k, X, al]) => {
      x.fillStyle = sideCol(k); x.fillRect(al === 'left' ? X : X - 18, P + 214, 18, 18);
      txt(sideName(e, k).toUpperCase(), al === 'left' ? X + 30 : X - 30, P + 233, '700 #px ' + T, 26, half - 30, '#ffffff', al);
    });
  } else txt(formatLine(e).toUpperCase(), P, P + 232, '700 #px ' + T, 24, W - P * 2, '#bbbcbc');
  let y = P + 262; x.fillStyle = 'rgba(187,188,188,.45)'; x.fillRect(P, y, W - P * 2, 3); y += 70;
  txt(ryder ? 'PAIRINGS' : 'TEE TIMES', W / 2, y, '900 #px ' + D, 56, W - P * 2, '#ffffff', 'center'); y += 40;
  if (!rows.length) { y += 60; txt(ryder ? 'Matches coming soon' : 'Groups coming soon', W / 2, y, '500 #px ' + T, 30, W - P * 2, '#bbbcbc', 'center'); }
  for (const r of rows) {
    const h = rh(r);
    if (r.head) { txt(r.head, P, y + 62 * d, '900 #px ' + D, 44 * f, W - P * 2, '#ffffff'); y += hd; }
    x.fillStyle = 'rgba(187,188,188,.3)'; x.fillRect(P, y, W - P * 2, 2);
    // top line: label on the left; tee time (big) and code on the right
    const right = [r.where, r.code].filter(Boolean).join(' · ');
    txt(r.label.toUpperCase(), P, y + 46 * d, '700 #px ' + T, 24 * f, W - P * 2 - 420, '#bbbcbc');
    if (right) txt(right, W - P, y + 50 * d, '800 #px ' + D, 40 * f, 400, '#ffffff', 'right');
    const top = y + 108 * d, lh = 44 * d;
    if (ryder) {
      const col = (W - P * 2) / 2 - 60;
      r.A.forEach((nm, j) => txt(nm, P, top + j * lh, '600 #px ' + T, 32 * f, col, '#ffffff'));
      r.B.forEach((nm, j) => txt(nm, W - P, top + j * lh, '600 #px ' + T, 32 * f, col, '#ffffff', 'right'));
      txt('vs', W / 2, top + (Math.max(r.A.length, r.B.length) - 1) * lh / 2, '800 #px ' + D, 34 * f, 80, 'rgba(255,255,255,.55)', 'center');
      if (r.back) txt(r.back, P, top + Math.max(r.A.length, r.B.length) * lh + 2, '600 #px ' + T, 24 * f, W - P * 2, '#bbbcbc');
    } else {
      const col = (W - P * 2) / 2 - 20;
      r.names.forEach((nm, j) => txt(nm, j % 2 ? W / 2 + 20 : P, top + Math.floor(j / 2) * lh, '600 #px ' + T, 32 * f, col, '#ffffff'));
    }
    y += h - (r.head ? hd : 0);
  }
  txt(SITE.replace(/^https?:\/\//, ''), W / 2, hC - 56, '700 #px ' + T, 30, 600, '#bbbcbc', 'center');
  x.restore();
  return cv;
}

/** The results picture for the current event: the cup card for a Ryder Cup, a leaderboard card otherwise. */
export function shareResults() { return isRyder(E()) ? shareCup() : shareCard(boardImage, FORMATS[fmtOf(E())].label); }

export function shareCup() { return shareCard(cupImage, 'Hickey Tournament'); }

/** The pairings picture, for the team chat before the event. */
export function sharePairings(withCodes = false) {
  if (!S.groups.length) { toast(isRyder(E()) ? 'Add matches first' : 'Add groups first'); return; }
  return shareCard((h, w) => pairingsImage(withCodes, h, w), 'pairings', 'pairings',
    withCodes ? 'This picture has the join codes, so only send it to the team.' : 'Post it in the team chat so everyone knows who they’re playing with and when.');
}

/* Instagram sizes (Will, Oct 23: the pictures grew taller than Instagram allows, so it cropped them).
   Post = 1080x1350 (4:5, the tallest feed post). Story = 1080x1920 (9:16) with the top and bottom kept clear of
   Instagram's own buttons. The card is drawn at its natural height, then shrunk evenly if needed to fit. */
type Size = 'post' | 'story';
const SIZES: Record<Size, { label: string; h: number; top: number; bottom: number }> = {
  post: { label: 'Instagram post', h: 1350, top: 0, bottom: 0 },
  story: { label: 'Instagram story', h: 1920, top: 220, bottom: 260 },
};
const SIZE_KEY = 'unhgolf:shareSize';
const savedSize = (): Size => { try { return localStorage.getItem(SIZE_KEY) === 'story' ? 'story' : 'post'; } catch (_) { return 'post'; } };
const saveSize = (z: Size) => { try { localStorage.setItem(SIZE_KEY, z); } catch (_) { /* private mode */ } };

/** Fit a card into the chosen size: same background, card centered, shrunk evenly if it's too tall. */
export function fitCard(card: HTMLCanvasElement, z: Size) {
  const sz = SIZES[z], W = 1080, box = sz.h - sz.top - sz.bottom;
  if (z === 'post' && card.width === W && card.height === sz.h) return card;
  const out = document.createElement('canvas'); out.width = W; out.height = sz.h;
  const x = out.getContext('2d')!, band = cleanHex(E().bandColor);
  x.fillStyle = band && onColor(band) === '#ffffff' ? band : '#041e42'; x.fillRect(0, 0, W, sz.h);
  const k = Math.min(1, box / card.height, W / card.width), w = card.width * k, h = card.height * k;
  x.drawImage(card, (W - w) / 2, sz.top + (box - h) / 2, w, h);
  return out;
}

async function shareCard(make: (box: number, w: number) => Promise<HTMLCanvasElement>, fallbackTitle: string, suffix = '', tip = 'To keep the results on the home page, add this picture to an announcement there.', z: Size = savedSize()): Promise<void> {
  let cv: HTMLCanvasElement;
  const sz = SIZES[z];
  const box = sz.h - sz.top - sz.bottom;
  try {
    cv = await make(box, 1080);
    // Too much for the frame even with tight rows: draw it wider (rows get longer, same height), then shrink it to
    // 1080 wide. Everything gets smaller evenly but still fills the frame edge to edge.
    if (cv.height > box) { const w = Math.ceil(1080 * cv.height / box); cv = await make(Math.round(box * w / 1080), w); }
    cv = fitCard(cv, z);
  } catch (err) { console.warn(err); toast('Couldn’t make the image on this phone'); return; }
  const url = cv.toDataURL('image/png'), name = ([String(E().name || fallbackTitle), suffix, z === 'story' ? 'story' : ''].filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'result') + '.png';
  const blob = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/png')); const file = blob && new File([blob], name, { type: 'image/png' });
  const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  document.getElementById('sharesheet')?.remove();
  const el = document.createElement('div'); el.id = 'sharesheet'; el.className = 'sharesheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', suffix === 'pairings' ? 'Share pairings' : 'Share result');
  const sheet = document.createElement('div'); sheet.className = 'sheet';
  // Post / Story switch: remembered on this phone, redraws the picture
  const seg = document.createElement('div'); seg.className = 'seg2'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Picture size');
  (['post', 'story'] as Size[]).forEach(k => { const b = document.createElement('button'); b.type = 'button'; b.dataset.z = k; b.textContent = k === 'post' ? 'Post' : 'Story'; b.title = SIZES[k].label; b.setAttribute('aria-pressed', String(k === z)); if (k === z) b.className = 'on'; seg.appendChild(b); });
  const img = document.createElement('img'); img.src = url; img.alt = (suffix === 'pairings' ? 'Pairings image' : 'Result image') + ', ' + sz.label + ' size';
  const row = document.createElement('div'); row.className = 'row';
  if (canShare) { const b = document.createElement('button'); b.className = 'btn primary'; b.dataset.s = 'share'; b.textContent = 'Share'; row.appendChild(b); }
  const a = document.createElement('a'); a.className = 'btn' + (canShare ? '' : ' primary'); a.href = url; a.download = name; a.textContent = 'Save image'; row.appendChild(a);
  const close = document.createElement('button'); close.className = 'btn'; close.dataset.s = 'close'; close.textContent = 'Close'; row.appendChild(close);
  const note = document.createElement('p'); note.className = 'note'; note.textContent = (canShare ? 'Share sends it straight to Instagram, Messages and more. ' : 'On a phone, you can also press and hold the image to save it. ') + tip;
  sheet.append(seg, img, row, note); el.appendChild(sheet);
  const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { el.remove(); document.removeEventListener('keydown', onKey); } };
  el.addEventListener('click', ev => {
    const zb = (ev.target as HTMLElement).closest<HTMLElement>('[data-z]');
    if (zb) { const nz = zb.dataset.z as Size; if (nz !== z) { saveSize(nz); document.removeEventListener('keydown', onKey); shareCard(make, fallbackTitle, suffix, tip, nz); } return; }
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-s]');
    if (ev.target === el || (b && b.dataset.s === 'close')) { el.remove(); document.removeEventListener('keydown', onKey); }
    else if (b && b.dataset.s === 'share' && file) navigator.share({ files: [file], title: E().name || fallbackTitle }).catch(() => {});
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el); el.querySelector<HTMLElement>('button,a')?.focus();
}
