/** Native modal dialogs provide focus containment and restore focus on close. */
export function confirmReset(title: string, description: string, exports: { label: string; run: () => unknown }[], action: () => Promise<unknown>) {
  const opener = document.activeElement as HTMLElement | null;
  const dialog = document.createElement('dialog'); dialog.className = 'reset-dialog';
  const heading = document.createElement('h2'); heading.id = 'reset-title'; heading.textContent = title;
  const text = document.createElement('p'); text.id = 'reset-description'; text.textContent = description;
  dialog.setAttribute('aria-labelledby', heading.id); dialog.setAttribute('aria-describedby', text.id);
  const downloads = document.createElement('div'); downloads.className = 'reset-exports';
  for (const exp of exports) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = exp.label; b.onclick = () => exp.run(); downloads.append(b); }
  const error = document.createElement('p'); error.className = 'err'; error.setAttribute('role', 'alert');
  const row = document.createElement('div'); row.className = 'reset-actions';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn'; cancel.textContent = 'Cancel'; cancel.autofocus = true;
  const erase = document.createElement('button'); erase.type = 'button'; erase.className = 'btn danger'; erase.textContent = 'Erase and start new';
  let busy = false;
  const close = () => { if (!busy) dialog.close(); };
  cancel.onclick = close;
  dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  dialog.addEventListener('close', () => { dialog.remove(); if (opener?.isConnected) opener.focus(); });
  erase.onclick = async () => {
    if (busy) return; busy = true; error.textContent = '';
    dialog.querySelectorAll('button').forEach(b => b.disabled = true); erase.textContent = 'Resetting… keep this page open';
    try { await action(); busy = false; dialog.close(); }
    catch (e) { error.textContent = e instanceof Error ? e.message : 'Reset incomplete. Check your connection and retry.'; }
    finally { busy = false; dialog.querySelectorAll('button').forEach(b => b.disabled = false); erase.textContent = 'Retry reset'; }
  };
  row.append(cancel, erase); dialog.append(heading, text, downloads, error, row); document.body.append(dialog); dialog.showModal();
}

/** Focus containment for existing custom drawers. */
export function focusDialog(panel: HTMLElement, close: () => void) {
  const opener = document.activeElement as HTMLElement | null;
  const focusables = () => [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')].filter(el => el.getClientRects().length > 0);
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key !== 'Tab') return;
    const list = focusables(), first = list[0], last = list[list.length - 1];
    if (!first) { e.preventDefault(); panel.focus(); }
    else if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  };
  const before = document.body.style.overflow; document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', key);
  // A non-input initial target avoids opening the phone keyboard.
  panel.tabIndex = -1; panel.focus();
  return () => { document.removeEventListener('keydown', key); document.body.style.overflow = before; if (opener?.isConnected) opener.focus(); };
}
