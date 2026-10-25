import { PROBLEMS, SECTIONS } from './dsa';
import { findProblem, TestCase } from './problems';

type Fn = (...a: any[]) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Cls = new (...a: any[]) => any; // eslint-disable-line @typescript-eslint/no-explicit-any

const cmp = (a: (number | string)[], b: (number | string)[]) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return a.length - b.length; };
const bsearch = (lo: number, hi: number, ok: (x: number) => boolean) => { while (lo < hi) { const m = Math.floor((lo + hi) / 2); if (ok(m)) hi = m; else lo = m + 1; } return lo; };
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
/** all-pairs shortest paths (Floyd-Warshall) for small undirected weighted graphs */
const floyd = (n: number, edges: number[][]) => {
  const d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
  for (const [u, v, w] of edges) { d[u][v] = Math.min(d[u][v], w); d[v][u] = Math.min(d[v][u], w); }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) d[i][j] = Math.min(d[i][j], d[i][k] + d[k][j]);
  return d;
};

/** Reference solutions (JavaScript), mostly brute force: every test must pass, so the expected answers are right. */
const REF: Record<string, Fn | Cls> = {
  // Two Pointers
  'container-with-most-water': (h: number[]) => { let best = 0; for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) best = Math.max(best, Math.min(h[i], h[j]) * (j - i)); return best; },
  'two-sum-sorted': (n: number[], t: number) => { for (let i = 0; i < n.length; i++) for (let j = i + 1; j < n.length; j++) if (n[i] + n[j] === t) return [i, j]; return []; },
  'three-sum': (nums: number[]) => { const seen = new Set<string>(); for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) for (let k = j + 1; k < nums.length; k++) if (nums[i] + nums[j] + nums[k] === 0) seen.add(JSON.stringify([nums[i], nums[j], nums[k]].sort((a, b) => a - b))); return [...seen].map((s) => JSON.parse(s)).sort(cmp); },
  'triangle-numbers': (n: number[]) => { let c = 0; for (let i = 0; i < n.length; i++) for (let j = i + 1; j < n.length; j++) for (let k = j + 1; k < n.length; k++) { const [a, b, x] = [n[i], n[j], n[k]].sort((p, q) => p - q); if (a + b > x) c++; } return c; },
  'move-zeroes': (n: number[]) => [...n.filter((x) => x), ...n.filter((x) => !x)],
  'sort-colors': (n: number[]) => [...n].sort((a, b) => a - b),
  'trapping-rain-water': (h: number[]) => sum(h.map((x, i) => Math.min(Math.max(...h.slice(0, i + 1)), Math.max(...h.slice(i))) - x)),
  // Sliding Window
  'max-sum-subarray-size-k': (n: number[], k: number) => Math.max(...n.slice(0, n.length - k + 1).map((_, i) => sum(n.slice(i, i + k)))),
  'max-points-from-cards': (c: number[], k: number) => Math.max(...Array.from({ length: k + 1 }, (_, l) => sum(c.slice(0, l)) + sum(c.slice(c.length - (k - l))))),
  'max-sum-distinct-subarrays': (n: number[], k: number) => Math.max(0, ...n.slice(0, n.length - k + 1).map((_, i) => n.slice(i, i + k)).filter((w) => new Set(w).size === k).map(sum)),
  'longest-substring-without-repeats': (s: string) => { let best = 0; for (let i = 0; i < s.length; i++) for (let j = i; j < s.length; j++) if (new Set(s.slice(i, j + 1)).size === j - i + 1) best = Math.max(best, j - i + 1); return best; },
  'longest-repeating-replacement': (s: string, k: number) => { let best = 0; for (let i = 0; i < s.length; i++) for (let j = i; j < s.length; j++) { const w = s.slice(i, j + 1), top = Math.max(...[...new Set(w)].map((c) => w.split(c).length - 1)); if (w.length - top <= k) best = Math.max(best, w.length); } return best; },
  // Intervals
  'can-attend-meetings': (m: number[][]) => m.every((a, i) => m.every((b, j) => i === j || a[1] <= b[0] || b[1] <= a[0])),
  'merge-intervals': (iv: number[][]) => { const out: number[][] = []; for (const [s, e] of [...iv].sort((a, b) => a[0] - b[0])) { const last = out[out.length - 1]; if (last && s <= last[1]) last[1] = Math.max(last[1], e); else out.push([s, e]); } return out; },
  'insert-interval': (iv: number[][], nw: number[]) => (REF['merge-intervals'] as Fn)([...iv.map((x) => [...x]), [...nw]]),
  'non-overlapping-intervals': (iv: number[][]) => { let kept = 0, end = -Infinity; for (const [s, e] of [...iv].sort((a, b) => a[1] - b[1])) if (s >= end) { kept++; end = e; } return iv.length - kept; },
  'employee-free-time': (sch: number[][][]) => { const busy = (REF['merge-intervals'] as Fn)(sch.flat().map((x) => [...x])) as number[][]; return busy.slice(1).map((b, i) => [busy[i][1], b[0]]).filter(([a, b]) => b > a); },
  // Stack
  'valid-parentheses': (s: string) => { let prev; let cur = s; do { prev = cur; cur = cur.replace(/\(\)|\[\]|\{\}/g, ''); } while (cur !== prev); return !cur; },
  'daily-temperatures': (t: number[]) => t.map((v, i) => { const j = t.findIndex((w, k) => k > i && w > v); return j < 0 ? 0 : j - i; }),
  'decode-string': (s: string) => { let cur = s; while (/\d+\[[a-z]*\]/.test(cur)) cur = cur.replace(/(\d+)\[([a-z]*)\]/, (_m, n, x) => x.repeat(+n)); return cur; },
  'longest-valid-parentheses': (s: string) => { let best = 0; for (let i = 0; i < s.length; i++) for (let j = i + 2; j <= s.length; j += 2) if ((REF['valid-parentheses'] as Fn)(s.slice(i, j))) best = Math.max(best, j - i); return best; },
  'largest-rectangle-histogram': (h: number[]) => { let best = 0; for (let i = 0; i < h.length; i++) { let lo = Infinity; for (let j = i; j < h.length; j++) { lo = Math.min(lo, h[j]); best = Math.max(best, lo * (j - i + 1)); } } return best; },
  // Binary Search
  'search-rotated-sorted-array': (n: number[], t: number) => n.indexOf(t),
  'koko-eating-bananas': (p: number[], h: number) => bsearch(1, Math.max(...p), (k) => sum(p.map((x) => Math.ceil(x / k))) <= h),
  'split-array-largest-sum': (n: number[], k: number) => { const parts = (lim: number) => { let c = 1, s = 0; for (const x of n) { if (s + x > lim) { c++; s = 0; } s += x; } return c; }; return bsearch(Math.max(...n), sum(n), (lim) => parts(lim) <= k); },
  'kth-smallest-sorted-matrix': (m: number[][], k: number) => m.flat().sort((a, b) => a - b)[k - 1],
  'minimum-shipping-capacity': (w: number[], days: number) => { const need = (cap: number) => { let d = 1, s = 0; for (const x of w) { if (s + x > cap) { d++; s = 0; } s += x; } return d; }; return bsearch(Math.max(...w), sum(w), (cap) => need(cap) <= days); },
  // Heap
  'kth-largest-element': (n: number[], k: number) => [...n].sort((a, b) => b - a)[k - 1],
  'k-closest-points': (p: number[][], k: number) => [...p].sort((a, b) => a[0] ** 2 + a[1] ** 2 - b[0] ** 2 - b[1] ** 2 || a[0] - b[0] || a[1] - b[1]).slice(0, k),
  'find-k-closest-elements': (a: number[], k: number, x: number) => [...a].sort((p, q) => Math.abs(p - x) - Math.abs(q - x) || p - q).slice(0, k).sort((p, q) => p - q),
  'merge-k-sorted-lists': (f: number[][]) => f.flat().sort((a, b) => a - b),
  'median-from-data-stream': class { v: number[] = []; add(x: number) { this.v.push(x); this.v.sort((a, b) => a - b); } median() { const n = this.v.length; return n % 2 ? this.v[(n - 1) / 2] : (this.v[n / 2 - 1] + this.v[n / 2]) / 2; } },
  // Depth-First Search
  'number-of-islands': (g: string[]) => {
    const seen = new Set<string>(); let n = 0;
    const fill = (r: number, c: number): void => { if (g[r]?.[c] !== '1' || seen.has(`${r},${c}`)) return; seen.add(`${r},${c}`); for (const [dr, dc] of DIRS) fill(r + dr, c + dc); };
    g.forEach((row, r) => [...row].forEach((x, c) => { if (x === '1' && !seen.has(`${r},${c}`)) { n++; fill(r, c); } }));
    return n;
  },
  'graph-valid-tree': (n: number, e: number[][]) => { const p = Array.from({ length: n }, (_, i) => i); const f = (x: number): number => (p[x] === x ? x : (p[x] = f(p[x]))); for (const [a, b] of e) { if (f(a) === f(b)) return false; p[f(a)] = f(b); } return e.length === n - 1; },
  'flood-fill': (img: number[][], sr: number, sc: number, color: number) => {
    const out = img.map((r) => [...r]), old = img[sr][sc];
    if (old === color) return out;
    const go = (r: number, c: number): void => { if (out[r]?.[c] !== old) return; out[r][c] = color; for (const [dr, dc] of DIRS) go(r + dr, c + dc); };
    go(sr, sc);
    return out;
  },
  'surrounded-regions': (b: string[]) => {
    const g = b.map((r) => [...r]), safe = new Set<string>();
    const go = (r: number, c: number): void => { if (g[r]?.[c] !== 'O' || safe.has(`${r},${c}`)) return; safe.add(`${r},${c}`); for (const [dr, dc] of DIRS) go(r + dr, c + dc); };
    g.forEach((row, r) => row.forEach((_, c) => { if (!r || !c || r === g.length - 1 || c === row.length - 1) go(r, c); }));
    return g.map((row, r) => row.map((x, c) => (x === 'O' && !safe.has(`${r},${c}`) ? 'X' : x)).join(''));
  },
  'pacific-atlantic-water-flow': (h: number[][]) => {
    const reach = (r0: number, c0: number, ocean: (r: number, c: number) => boolean) => {
      const seen = new Set([`${r0},${c0}`]), st = [[r0, c0]];
      while (st.length) { const [r, c] = st.pop()!; if (ocean(r, c)) return true; for (const [dr, dc] of DIRS) { const nr = r + dr, nc = c + dc; if (h[nr]?.[nc] !== undefined && h[nr][nc] <= h[r][c] && !seen.has(`${nr},${nc}`)) { seen.add(`${nr},${nc}`); st.push([nr, nc]); } } }
      return false;
    };
    const out: number[][] = [];
    h.forEach((row, r) => row.forEach((_, c) => { if (reach(r, c, (a, b) => !a || !b) && reach(r, c, (a, b) => a === h.length - 1 || b === row.length - 1)) out.push([r, c]); }));
    return out;
  },
  // Breadth-First Search
  'rotting-oranges': (grid: number[][]) => {
    const g = grid.map((r) => [...r]); let q: number[][] = [], fresh = 0, min = 0;
    g.forEach((row, r) => row.forEach((v, c) => { if (v === 2) q.push([r, c]); if (v === 1) fresh++; }));
    while (q.length && fresh) { const next: number[][] = []; for (const [r, c] of q) for (const [dr, dc] of DIRS) { const nr = r + dr, nc = c + dc; if (g[nr]?.[nc] === 1) { g[nr][nc] = 2; fresh--; next.push([nr, nc]); } } q = next; min++; }
    return fresh ? -1 : min;
  },
  'minimum-knight-moves': (x: number, y: number) => {
    const goal = `${Math.abs(x)},${Math.abs(y)}`; let q = [[0, 0]], d = 0; const seen = new Set(['0,0']);
    for (;;) {
      const next: number[][] = [];
      for (const [a, b] of q) {
        if (`${a},${b}` === goal) return d;
        for (const [da, db] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) { const k = `${a + da},${b + db}`; if (a + da >= -2 && b + db >= -2 && !seen.has(k)) { seen.add(k); next.push([a + da, b + db]); } }
      }
      q = next; d++;
    }
  },
  'zero-one-matrix': (m: number[][]) => m.map((row, r) => row.map((_, c) => Math.min(...m.flatMap((rr, i) => rr.map((v, j) => (v ? Infinity : Math.abs(i - r) + Math.abs(j - c))))))),
  'bus-routes': (routes: number[][], s: number, t: number) => {
    if (s === t) return 0;
    let stops = new Set([s]); const used = new Set<number>();
    for (let n = 1; n <= routes.length; n++) {
      const next = new Set(stops);
      routes.forEach((r, i) => { if (!used.has(i) && r.some((x) => stops.has(x))) { used.add(i); r.forEach((x) => next.add(x)); } });
      if (next.has(t)) return n;
      stops = next;
    }
    return -1;
  },
  // Backtracking
  'word-search': (b: string[], w: string) => {
    const go = (r: number, c: number, i: number, used: Set<string>): boolean => { if (i === w.length) return true; if (b[r]?.[c] !== w[i] || used.has(`${r},${c}`)) return false; used.add(`${r},${c}`); const ok = DIRS.some(([dr, dc]) => go(r + dr, c + dc, i + 1, used)); used.delete(`${r},${c}`); return ok; };
    return b.some((row, r) => [...row].some((_, c) => go(r, c, 0, new Set())));
  },
  subsets: (n: number[]) => Array.from({ length: 2 ** n.length }, (_, m) => n.filter((_x, i) => m & (1 << i))).sort(cmp),
  'generate-parentheses': (n: number) => Array.from({ length: 2 ** (2 * n) }, (_, m) => Array.from({ length: 2 * n }, (_x, i) => (m & (1 << (2 * n - 1 - i)) ? ')' : '(')).join('')).filter((s) => (REF['valid-parentheses'] as Fn)(s)).sort(),
  'combination-sum': (cands: number[], target: number) => { const out: number[][] = []; const c = [...cands].sort((a, b) => a - b); const go = (i: number, left: number, path: number[]): void => { if (!left) { out.push([...path]); return; } for (let j = i; j < c.length && c[j] <= left; j++) go(j, left - c[j], [...path, c[j]]); }; go(0, target, []); return out.sort(cmp); },
  'palindrome-partitioning': (s: string) => { const out: string[][] = []; const pal = (x: string) => x === [...x].reverse().join(''); const go = (i: number, path: string[]): void => { if (i === s.length) { out.push(path); return; } for (let j = i + 1; j <= s.length; j++) if (pal(s.slice(i, j))) go(j, [...path, s.slice(i, j)]); }; go(0, []); return out.sort(cmp); },
  'n-queens': (n: number) => { const cols = new Set<number>(), d1 = new Set<number>(), d2 = new Set<number>(); const go = (r: number): number => { if (r === n) return 1; let s = 0; for (let c = 0; c < n; c++) { if (cols.has(c) || d1.has(r - c) || d2.has(r + c)) continue; cols.add(c); d1.add(r - c); d2.add(r + c); s += go(r + 1); cols.delete(c); d1.delete(r - c); d2.delete(r + c); } return s; }; return go(0); },
  // Graphs
  'course-schedule': (n: number, pre: number[][]) => (REF['course-schedule-ii'] as Fn)(n, pre).length === n,
  'course-schedule-ii': (n: number, pre: number[][]) => { const done: number[] = []; while (done.length < n) { const next = Array.from({ length: n }, (_, i) => i).find((c) => !done.includes(c) && pre.every(([a, b]) => a !== c || done.includes(b))); if (next === undefined) return []; done.push(next); } return done; },
  'shortest-path-weighted': (n: number, e: number[][], src: number) => floyd(n, e)[src].map((d) => (d === Infinity ? -1 : d)),
  'network-delay-time': (links: number[][], n: number, k: number) => { const dist = Array(n + 1).fill(Infinity); dist[k] = 0; for (let i = 0; i < n; i++) for (const [u, v, w] of links) dist[v] = Math.min(dist[v], dist[u] + w); const m = Math.max(...dist.slice(1)); return m === Infinity ? -1 : m; },
  'cheapest-flights-k-stops': (n: number, f: number[][], src: number, dst: number, k: number) => { let best = Infinity; const go = (at: number, cost: number, stops: number): void => { if (at === dst) { best = Math.min(best, cost); return; } if (stops > k) return; for (const [u, v, w] of f) if (u === at) go(v, cost + w, stops + 1); }; go(src, 0, 0); return best === Infinity ? -1 : best; },
  'path-with-minimum-effort': (h: number[][]) => bsearch(0, 1e6, (lim) => { const seen = new Set(['0,0']), st = [[0, 0]]; while (st.length) { const [r, c] = st.pop()!; if (r === h.length - 1 && c === h[0].length - 1) return true; for (const [dr, dc] of DIRS) { const nr = r + dr, nc = c + dc; if (h[nr]?.[nc] !== undefined && Math.abs(h[nr][nc] - h[r][c]) <= lim && !seen.has(`${nr},${nc}`)) { seen.add(`${nr},${nc}`); st.push([nr, nc]); } } } return false; }),
  'find-the-city': (n: number, e: number[][], th: number) => { const d = floyd(n, e); let best = -1, fewest = Infinity; d.forEach((row, i) => { const c = row.filter((x, j) => j !== i && x <= th).length; if (c <= fewest) { fewest = c; best = i; } }); return best; },
  // Dynamic Programming
  'counting-bits': (n: number) => Array.from({ length: n + 1 }, (_, i) => i.toString(2).split('1').length - 1),
  'decode-ways': (s: string) => { const go = (i: number): number => (i === s.length ? 1 : s[i] === '0' ? 0 : go(i + 1) + (i + 1 < s.length && +s.slice(i, i + 2) <= 26 ? go(i + 2) : 0)); return go(0); },
  'unique-paths': (r: number, c: number) => { const go = (a: number, b: number): number => (a === 1 || b === 1 ? 1 : go(a - 1, b) + go(a, b - 1)); return go(r, c); },
  'maximal-square': (m: string[]) => { let best = 0; m.forEach((row, r) => [...row].forEach((_, c) => { for (let k = 1; r + k <= m.length && c + k <= row.length; k++) { let ok = true; for (let i = r; i < r + k; i++) if (m[i].slice(c, c + k).includes('0')) ok = false; if (ok) best = Math.max(best, k * k); } })); return best; },
  'longest-increasing-subsequence': (n: number[]) => { const dp = n.map(() => 1); n.forEach((x, i) => { for (let j = 0; j < i; j++) if (n[j] < x) dp[i] = Math.max(dp[i], dp[j] + 1); }); return n.length ? Math.max(...dp) : 0; },
  'word-break': (s: string, w: string[]) => { const ok = [true]; for (let i = 1; i <= s.length; i++) ok[i] = w.some((x) => i >= x.length && ok[i - x.length] && s.slice(i - x.length, i) === x); return ok[s.length]; },
  'job-scheduling': (st: number[], en: number[], pr: number[]) => { let best = 0; for (let m = 0; m < 2 ** st.length; m++) { const ids = st.map((_, i) => i).filter((i) => m & (1 << i)); if (ids.every((a) => ids.every((b) => a === b || en[a] <= st[b] || en[b] <= st[a]))) best = Math.max(best, sum(ids.map((i) => pr[i]))); } return best; },
  'paint-house': (c: number[][]) => (REF['paint-house-ii'] as Fn)(c),
  'paint-house-ii': (c: number[][]) => { const go = (i: number, prev: number): number => (i === c.length ? 0 : Math.min(...c[i].map((x, k) => (k === prev ? Infinity : x + go(i + 1, k))))); return go(0, -1); },
  'minimum-window-subsequence': (s: string, t: string) => { let best = ''; for (let i = 0; i < s.length; i++) for (let j = i + 1; j <= s.length; j++) { let k = 0; for (const ch of s.slice(i, j)) if (ch === t[k]) k++; if (k === t.length && (!best || j - i < best.length)) best = s.slice(i, j); } return best; },
  // Greedy
  'best-time-to-buy-sell-stock': (p: number[]) => Math.max(0, ...p.flatMap((b, i) => p.slice(i + 1).map((s) => s - b))),
  'gas-station': (f: number[], c: number[]) => f.findIndex((_, s) => { let tank = 0; for (let k = 0; k < f.length; k++) { const i = (s + k) % f.length; tank += f[i] - c[i]; if (tank < 0) return false; } return true; }),
  'jump-game': (j: number[]) => { const ok = j.map(() => false); ok[0] = true; j.forEach((x, i) => { if (ok[i]) for (let k = 1; k <= x && i + k < j.length; k++) ok[i + k] = true; }); return ok[j.length - 1]; },
  'jump-game-ii': (j: number[]) => { const d = j.map(() => Infinity); d[0] = 0; j.forEach((x, i) => { for (let k = 1; k <= x && i + k < j.length; k++) d[i + k] = Math.min(d[i + k], d[i] + 1); }); return d[j.length - 1]; },
  'partition-labels': (s: string) => { const out: number[] = []; let start = 0; for (let i = 0; i < s.length; i++) { const piece = s.slice(start, i + 1); if ([...piece].every((ch) => s.lastIndexOf(ch) <= i)) { out.push(piece.length); start = i + 1; } } return out; },
  // Trie
  'implement-trie': class { w = new Set<string>(); insert(x: string) { this.w.add(x); } contains(x: string) { return this.w.has(x); } prefix(p: string) { return [...this.w].some((x) => x.startsWith(p)); } },
  'prefix-matching': (w: string[], q: string[]) => q.map((p) => w.filter((x) => x.startsWith(p)).length),
  // Prefix Sum
  'count-vowels-in-substrings': (s: string, q: number[][]) => q.map(([l, r]) => [...s.slice(l, r + 1)].filter((c) => 'aeiou'.includes(c)).length),
  'subarray-sum-equals-k': (n: number[], k: number) => { let c = 0; for (let i = 0; i < n.length; i++) for (let j = i; j < n.length; j++) if (sum(n.slice(i, j + 1)) === k) c++; return c; },
  // Matrices
  'spiral-matrix': (m: number[][]) => { const out: number[] = []; let g = m.map((r) => [...r]); while (g.length) { out.push(...g.shift()!); g = (g[0] ?? []).map((_, c) => g.map((r) => r[c])).reverse(); } return out; },
  'rotate-image': (m: number[][]) => m[0].map((_, c) => m.map((r) => r[c]).reverse()),
  'set-matrix-zeroes': (m: number[][]) => { const rows = new Set<number>(), cols = new Set<number>(); m.forEach((r, i) => r.forEach((v, j) => { if (!v) { rows.add(i); cols.add(j); } })); return m.map((r, i) => r.map((v, j) => (rows.has(i) || cols.has(j) ? 0 : v))); },
};

/** List, tree and graph problems: the user writes one function inside starter glue; append a reference version and run the real glue. */
const GLUED: Record<string, string> = {
  'remove-nth-from-end': 'function removeNth(h, n) { const d = new ListNode(0, h); let f = d, s = d; for (let i = 0; i <= n; i++) f = f.next; while (f) { f = f.next; s = s.next; } s.next = s.next.next; return d.next; }',
  'linked-list-cycle': 'function hasCycle(h) { let s = h, f = h; while (f && f.next) { s = s.next; f = f.next.next; if (s === f) return true; } return false; }',
  'palindrome-linked-list': 'function isPalindrome(h) { const v = toList(h); return v.join() === [...v].reverse().join(); }',
  'reorder-list': 'function reorderList(h) { const nodes = []; for (let n = h; n; n = n.next) nodes.push(n); let i = 0, j = nodes.length - 1; const order = []; while (i <= j) { order.push(nodes[i++]); if (i <= j) order.push(nodes[j--]); } order.forEach((n, k) => { n.next = order[k + 1] ?? null; }); }',
  'swap-nodes-in-pairs': 'function swapPairs(h) { if (!h || !h.next) return h; const n = h.next; h.next = swapPairs(n.next); n.next = h; return n; }',
  'max-depth-binary-tree': 'function maxDepth(n) { return n ? 1 + Math.max(maxDepth(n.left), maxDepth(n.right)) : 0; }',
  'path-sum': 'function hasPathSum(n, t) { if (!n) return false; if (!n.left && !n.right) return n.val === t; return hasPathSum(n.left, t - n.val) || hasPathSum(n.right, t - n.val); }',
  'validate-bst': 'function isValidBst(n, lo = -Infinity, hi = Infinity) { return !n || (lo < n.val && n.val < hi && isValidBst(n.left, lo, n.val) && isValidBst(n.right, n.val, hi)); }',
  'binary-tree-tilt': 'function findTilt(root) { const s = (n) => (n ? n.val + s(n.left) + s(n.right) : 0); const t = (n) => (n ? Math.abs(s(n.left) - s(n.right)) + t(n.left) + t(n.right) : 0); return t(root); }',
  'diameter-of-binary-tree': 'function diameter(root) { const h = (n) => (n ? 1 + Math.max(h(n.left), h(n.right)) : 0); const d = (n) => (n ? Math.max(h(n.left) + h(n.right), d(n.left), d(n.right)) : 0); return d(root); }',
  'path-sum-ii': 'function pathSums(root, target) { const out = []; const go = (n, path) => { if (!n) return; const p = [...path, n.val]; if (!n.left && !n.right) { if (p.reduce((a, b) => a + b, 0) === target) out.push(p); return; } go(n.left, p); go(n.right, p); }; go(root, []); return out; }',
  'longest-univalue-path': 'function longestUnivalue(root) { const arm = (n, v) => (n && n.val === v ? 1 + Math.max(arm(n.left, v), arm(n.right, v)) : 0); const go = (n) => (n ? Math.max(arm(n.left, n.val) + arm(n.right, n.val), go(n.left), go(n.right)) : 0); return go(root); }',
  'clone-graph': 'function cloneGraph(node) { if (!node) return null; const m = new Map(); const go = (n) => { if (m.has(n)) return m.get(n); const c = new Node(n.val); m.set(n, c); c.neighbors = n.neighbors.map(go); return c; }; return go(node); }',
  'level-order-sum': 'function levelSums(root) { const out = []; let q = root ? [root] : []; while (q.length) { out.push(q.reduce((a, n) => a + n.val, 0)); q = q.flatMap((n) => [n.left, n.right].filter(Boolean)); } return out; }',
  'rightmost-node': 'function rightView(root) { const out = []; let q = root ? [root] : []; while (q.length) { out.push(q[q.length - 1].val); q = q.flatMap((n) => [n.left, n.right].filter(Boolean)); } return out; }',
  'zigzag-level-order': 'function zigzag(root) { const out = []; let q = root ? [root] : []; while (q.length) { const v = q.map((n) => n.val); out.push(out.length % 2 ? v.reverse() : v); q = q.flatMap((n) => [n.left, n.right].filter(Boolean)); } return out; }',
  'maximum-width-binary-tree': 'function maxWidth(root) { let best = 0, q = root ? [[root, 0]] : []; while (q.length) { best = Math.max(best, q[q.length - 1][1] - q[0][1] + 1); const base = q[0][1]; q = q.flatMap(([n, p]) => [[n.left, 2 * (p - base)], [n.right, 2 * (p - base) + 1]].filter(([c]) => c)); } return best; }',
};

const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));

function run(ref: Fn | Cls, test: TestCase) {
  if (!test.ops) return canon((ref as Fn)(...structuredClone(test.args ?? []))) === canon(test.expected);
  const [[, ctor], ...ops] = test.ops;
  const obj = new (ref as Cls)(...structuredClone(ctor));
  return ops.every(([m, args, exp]) => { const got = obj[m](...args); return exp === undefined || canon(got) === canon(exp); });
}

describe('coding practice catalog', () => {
  it.each(PROBLEMS.map((p) => [p.slug, p] as const))('%s: the reference solution passes every test', (slug, p) => {
    // later function declarations win, so the appended reference replaces the starter's stub
    const ref = REF[slug] ?? (new Function(`${p.starter.javascript}\n${GLUED[slug]}\nreturn ${p.entry.javascript};`)() as Fn);
    for (const test of p.stages[0].tests) expect({ test: test.name, passed: run(ref, test) }).toMatchObject({ passed: true });
  });

  it('every section and problem is well formed', () => {
    expect(SECTIONS).toHaveLength(16);
    expect(PROBLEMS).toHaveLength(93);
    expect(new Set(PROBLEMS.map((p) => p.slug)).size).toBe(PROBLEMS.length);
    expect(new Set(SECTIONS.map((s) => s.slug)).size).toBe(SECTIONS.length);
    for (const section of SECTIONS) {
      expect(section.lesson.length).toBeGreaterThan(200);
      for (const p of section.problems) {
        expect({ slug: p.slug, topic: p.topic, pattern: p.pattern }).toEqual({ slug: p.slug, topic: section.slug, pattern: section.title });
        expect(REF[p.slug] ?? GLUED[p.slug]).toBeDefined();
        expect(findProblem(p.slug)).toBe(p);
        for (const lang of ['python', 'javascript'] as const) expect(p.starter[lang]).toContain(p.entry[lang]);
      }
    }
  });
});
