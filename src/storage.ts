// Saved code and progress. Every access is wrapped: school browsers can
// block storage, and the app has to work without it.

const PREFIX = 'roversim.v1.';

function get(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function set(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // Storage unavailable or full: keep going without saving.
  }
}

function doneSet(): Set<number> {
  try {
    const parsed: unknown = JSON.parse(get('done') ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : []);
  } catch {
    return new Set();
  }
}

export const storage = {
  code: (levelId: number): string | null => get(`code.${levelId}`),
  saveCode: (levelId: number, code: string): void => set(`code.${levelId}`, code),
  clearCode: (levelId: number): void => set(`code.${levelId}`, null),
  isDone: (levelId: number): boolean => doneSet().has(levelId),
  markDone(levelId: number): void {
    const done = doneSet();
    done.add(levelId);
    set('done', JSON.stringify([...done].sort((a, b) => a - b)));
  },
  lastLevel: (): number | null => {
    const v = Number(get('lastLevel'));
    return Number.isInteger(v) && v > 0 ? v : null;
  },
  setLastLevel: (levelId: number): void => set('lastLevel', String(levelId)),
  commandsShown: (): boolean => get('commandsShown') === '1',
  markCommandsShown: (): void => set('commandsShown', '1'),

  // v0.5 reordered levels 1-8. Saved code and checkmarks follow the levels
  // that stayed the same; the others are different levels now, so theirs go.
  migrate(): void {
    if (get('levels') === '2') return;
    const moved: [number, number][] = [[3, 2], [8, 15]]; // v0.4 id -> v0.5 id
    const oldDone = doneSet();
    const code = new Map<number, string | null>();
    for (let id = 1; id <= 8; id++) {
      code.set(id, get(`code.${id}`));
      set(`code.${id}`, null);
    }
    const done = new Set([...oldDone].filter((id) => id > 8));
    for (const [from, to] of moved) {
      const c = code.get(from);
      if (c != null) set(`code.${to}`, c);
      if (oldDone.has(from)) done.add(to);
    }
    set('done', JSON.stringify([...done].sort((a, b) => a - b)));
    const last = moved.find(([from]) => String(from) === get('lastLevel'));
    if (last) set('lastLevel', String(last[1]));
    set('levels', '2');
  },
};
