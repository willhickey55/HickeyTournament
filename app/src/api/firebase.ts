import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider, browserLocalPersistence, browserPopupRedirectResolver, indexedDBLocalPersistence, initializeAuth, onAuthStateChanged,
  signInAnonymously, signInWithPopup, signOut as fbSignOut,
} from 'firebase/auth';
import {
  arrayUnion, collection, deleteDoc, deleteField, disableNetwork, doc, enableNetwork, getDocs, initializeFirestore, waitForPendingWrites, limit, onSnapshot, persistentLocalCache,
  persistentMultipleTabManager, query, runTransaction, setDoc, updateDoc, where as fbWhere, writeBatch, type Firestore, type Query,
} from 'firebase/firestore';
import type { Api, Doc, Where } from './types';

const clean = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function firebaseApi(config: object): Api {
  const app = initializeApp(config);
  let db: Firestore;
  try {
    // Scores are saved on the phone first and sync when there's signal (no signal on the course is normal).
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (_) {
    db = initializeFirestore(app, {});
  }
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence], popupRedirectResolver: browserPopupRedirectResolver });
  const q = (col: string, w: Where): Query => (w ? query(collection(db, col), fbWhere(w[0], w[1], w[2])) : collection(db, col));
  const asDoc = (s: { id: string; data: () => any }): Doc => ({ id: s.id, ...s.data() });

  /* A listener that hits an error stops for good in Firebase. Reopen it after a pause (5 s, then longer, up to a minute),
     except for "not allowed", which won't fix itself. */
  const keep = (open: (fail: (e: any) => void) => () => void, err?: (e: any) => void) => {
    let stop: (() => void) | null = null, timer: any = 0, done = false, wait = 5000;
    const go = () => {
      stop = open(e => {
        err && err(e);
        if (done || (e && e.code === 'permission-denied')) return;
        timer = setTimeout(() => { if (!done) { wait = Math.min(wait * 2, 60000); go(); } }, wait);
      });
    };
    go();
    return () => { done = true; clearTimeout(timer); if (stop) stop(); };
  };

  return {
    mode: 'web',
    undoScore: (path, key, expected, previous, by, at) => runTransaction(db, async t => {
      const ref = doc(db, path), data = (await t.get(ref)).data();
      if (!data || data.by !== by || data.updatedAt !== at || (data.holes?.[key] ?? null) !== expected) throw new Error('This score changed on another phone. Review the card instead.');
      t.update(ref, { ['holes.' + key]: previous, updatedAt: Date.now(), by });
    }),
    waitPending: () => waitForPendingWrites(db),
    watchDoc: (p, cb, err) => keep(fail => onSnapshot(doc(db, p), s => cb(s.exists() ? asDoc(s) : null), fail), err),
    watchSync: (p, cb) => keep(fail => onSnapshot(doc(db, p), { includeMetadataChanges: true }, s => cb(!s.metadata.fromCache), fail)),
    watchCol: (c, w, cb, err) => keep(fail => onSnapshot(q(c, w), s => cb(s.docs.map(asDoc)), fail), err),
    // Drop and reopen the live connection. A phone that locked its screen, switched apps or lost signal can keep a
    // dead connection that Firebase doesn't notice for a long time, so the board stops updating until a refresh.
    reconnect: () => disableNetwork(db).then(() => enableNetwork(db)),
    getCol: async c => (await getDocs(collection(db, c))).docs.map(asDoc),
    set: (p, d, merge) => setDoc(doc(db, p), clean(d), { merge: !!merge }),
    update: (p, d) => updateDoc(doc(db, p), clean(d) as any),
    del: p => deleteDoc(doc(db, p)),
    delFields: (p, fields) => updateDoc(doc(db, p), Object.fromEntries(fields.map(f => [f, deleteField()]))),
    // A transaction reads from the server and fails with no signal, so nothing is created from a stale cache.
    createIfMissing: (p, d) => runTransaction(db, async t => { const r = doc(db, p); if ((await t.get(r)).exists()) return false; t.set(r, clean(d)); return true; }),
    addScorer: (p, uid) => updateDoc(doc(db, p), { scorers: arrayUnion(uid) }),
    join: (p, gid, code) => setDoc(doc(db, p), code ? { groupId: gid, code, at: Date.now() } : { groupId: gid, at: Date.now() }),
    clearMembers: async (c, gid) => {
      const s = await getDocs(gid ? query(collection(db, c), fbWhere('groupId', '==', gid)) : collection(db, c));
      await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
    },
    clearCol: async c => {
      for (;;) {
        const s = await getDocs(query(collection(db, c), limit(400)));
        if (s.empty) break;
        const b = writeBatch(db);
        s.docs.forEach(d => b.delete(d.ref));
        await b.commit();
      }
    },
    signInGoogle: async () => { await signInWithPopup(auth, new GoogleAuthProvider()); },
    // Signing out drops back to an anonymous account, like the old page.
    signOut: async () => { await fbSignOut(auth); },
    onAuth: cb => {
      onAuthStateChanged(auth, u => {
        if (!u) { signInAnonymously(auth).catch(() => cb(null)); return; }
        cb({ uid: u.uid, email: u.email, isAnonymous: u.isAnonymous });
      });
    },
  };
}
