export type Unsub = () => void;
export type Where = [string, '==', unknown] | null;
export interface Doc { id: string; [k: string]: any }
export interface User { uid: string; email: string | null; isAnonymous: boolean }

/** Everything the app needs from the database. Two versions: real Firebase and the in-memory demo. */
export interface Api {
  mode: 'web' | 'demo';
  undoScore(path: string, key: string, expected: number | string | null, previous: number | string | null, by: string, at: number): Promise<void>;
  /** Resolves once every save made on this phone (also before a reload) has reached the server. */
  waitPending?(): Promise<void>;
  watchDoc(path: string, cb: (d: Doc | null) => void, err?: (e: any) => void): Unsub;
  watchCol(col: string, where: Where, cb: (docs: Doc[]) => void, err?: (e: any) => void): Unsub;
  /** One-time read of a collection (exec only: repairing the events list). */
  getCol(col: string): Promise<Doc[]>;
  set(path: string, data: object, merge?: boolean): Promise<void>;
  update(path: string, data: object): Promise<void>;
  del(path: string): Promise<void>;
  /** Remove fields (dotted paths like "players.p1") from a doc. */
  delFields(path: string, fields: string[]): Promise<void>;
  addScorer(path: string, uid: string): Promise<void>;
  /** Write data only if the server says the doc doesn't exist. Never creates anything offline (a phone with no
      signal can see "no such doc" from its own cache, and a plain write would then overwrite the real one).
      Resolves true if it created the doc. */
  createIfMissing(path: string, data: object): Promise<boolean>;
  /** Link this phone to a group: members/{uid}. */
  join(path: string, groupId: string, code: string): Promise<void>;
  /** Delete the members of one group (or all of them). */
  clearMembers(col: string, groupId?: string): Promise<void>;
  clearCol(col: string): Promise<void>;
  signInGoogle(): Promise<void>;
  signOut(): Promise<void>;
  /** Signed-out phones get an anonymous account, so the callback always gets a user once signed in. */
  onAuth(cb: (u: User | null) => void): void;
  /** Drop and reopen the live connection (real Firebase only). */
  reconnect?(): Promise<void>;
  /** Is this page really connected to the server right now? (true = live data, false = only what's on the phone).
      Listens with metadata on a doc the page already watches, so it costs no extra reads. */
  watchSync?(path: string, cb: (live: boolean) => void): Unsub;
}
