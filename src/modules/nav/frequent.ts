/**
 * Frequency tracking for the "Frequent" block at the top of the sidebar and the
 * default list in the command palette. Most users touch a handful of screens out
 * of the ~35 in the nav; surfacing those removes the daily hunt through groups.
 *
 * Counts live in localStorage (per browser, not per account — the panel has no
 * per-user preferences store). Scores decay on every write so a burst of visits
 * during one project does not pin a screen to the top forever.
 */

const KEY = 'mf-nav-visits';
/** Applied on each visit, so a route unused for ~70 visits falls out of the top. */
const DECAY = 0.99;
/** Below this a route is forgotten entirely, keeping the map small. */
const FLOOR = 0.05;

type Visits = Record<string, number>;

const read = (): Visits => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    if (!raw || typeof raw !== 'object') return {};
    // Drop anything a hand-edited/older payload may have left behind.
    return Object.fromEntries(
      Object.entries(raw as Visits).filter(([, n]) => typeof n === 'number' && Number.isFinite(n)),
    );
  } catch {
    return {};
  }
};

/** Record one visit to `path`, decaying every other route's score. */
export const recordVisit = (path: string): void => {
  const visits = read();
  const next: Visits = {};
  for (const [route, score] of Object.entries(visits)) {
    const decayed = score * DECAY;
    if (decayed >= FLOOR) next[route] = decayed;
  }
  next[path] = (next[path] ?? 0) + 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private-mode / quota failures are not worth surfacing — the nav still works.
  }
};

/**
 * The `limit` most-visited routes, most frequent first. Routes are returned even
 * if the caller no longer renders them; callers match against their own visible
 * module list so a revoked permission cannot leak a link back into the sidebar.
 */
export const topRoutes = (limit: number): string[] =>
  Object.entries(read())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([route]) => route);
