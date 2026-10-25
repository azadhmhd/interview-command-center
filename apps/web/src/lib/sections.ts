/**
 * Coding practice sections: types shared with the API, and the step-by-step frames each section's visual plays. Every generator runs
 * the real algorithm on a small input and records a frame per decision, so the picture and the captions cannot drift.
 */
import type { Lang } from './coding';

export interface SectionProblem { slug: string; title: string; difficulty: 'easy' | 'medium' | 'hard'; summary?: string; done: boolean }
export interface Section { slug: string; title: string; summary: string; problems: SectionProblem[] }
export interface Lesson extends Section { lesson: string; template: Record<Lang, string>; complexity: string; pitfalls: string[] }

export const DIFF_TONE = { easy: 'success', medium: 'warning', hard: 'danger' } as const;

export type Tone = 'active' | 'done' | 'mark' | 'dim';
export interface ArrayRow { label?: string; values: (number | string)[]; pointers?: Record<string, number>; range?: [number, number]; tones?: Partial<Record<number, Tone>> }
export interface GridView { cells: (number | string)[][]; tones?: Partial<Record<string, Tone>> }
export interface GraphNode { id: string; x: number; y: number; label: string; tag?: string }
export interface GraphView { nodes: GraphNode[]; edges: { from: string; to: string; label?: string; directed?: boolean; tone?: Tone }[]; tones?: Partial<Record<string, Tone>> }
export interface Bar { start: number; end: number; lane: number; tone?: Tone }
export interface Frame {
  note: string;
  arrays?: ArrayRow[]; grid?: GridView; graph?: GraphView;
  intervals?: { max: number; lanes: string[]; bars: Bar[] };
  chips?: { label: string; items: (string | number)[] }[];
  vars?: Record<string, string | number>;
}

const key = (r: number, c: number) => `${r},${c}`;
const toneMap = (idx: number[], tone: Tone) => Object.fromEntries(idx.map((i) => [i, tone]));

/** x by leaf order, parent centred over its children, y by depth. */
function layoutTree(nodes: { id: string; parent?: string; label: string }[]): GraphView {
  const kids = (id?: string) => nodes.filter((n) => n.parent === id);
  const pos = new Map<string, { x: number; y: number }>();
  let leaf = 0;
  const place = (id: string, depth: number): number => {
    const ch = kids(id);
    const x = ch.length ? ch.map((c) => place(c.id, depth + 1)).reduce((a, b) => a + b, 0) / ch.length : leaf++;
    pos.set(id, { x, y: depth });
    return x;
  };
  for (const root of kids(undefined)) place(root.id, 0);
  return {
    nodes: nodes.map((n) => ({ id: n.id, label: n.label, ...pos.get(n.id)! })),
    edges: nodes.filter((n) => n.parent).map((n) => ({ from: n.parent!, to: n.id })),
  };
}

function twoPointers(): Frame[] {
  const nums = [1, 2, 4, 7, 11], target = 9, f: Frame[] = [];
  let l = 0, r = nums.length - 1;
  f.push({ note: `Sorted list, target ${target}. One pointer at each end.`, arrays: [{ values: nums, pointers: { L: l, R: r } }], vars: { target } });
  while (l < r) {
    const s = nums[l] + nums[r];
    const hit = s === target;
    f.push({ note: hit ? `${nums[l]} + ${nums[r]} = ${s}: found the pair at [${l}, ${r}].` : s < target ? `${nums[l]} + ${nums[r]} = ${s} is too small: only moving L right can grow the sum.` : `${nums[l]} + ${nums[r]} = ${s} is too big: only moving R left can shrink it.`,
      arrays: [{ values: nums, pointers: { L: l, R: r }, tones: toneMap([l, r], hit ? 'done' : 'active') }], vars: { target, sum: s } });
    if (hit) break;
    if (s < target) l++; else r--;
  }
  return f;
}

function slidingWindow(): Frame[] {
  const nums = [2, 1, 5, 1, 3, 2], k = 3, f: Frame[] = [];
  let sum = 0, best = -Infinity;
  for (let i = 0; i < nums.length; i++) {
    sum += nums[i];
    if (i >= k) sum -= nums[i - k];
    if (i < k - 1) { f.push({ note: `Fill the first window: add ${nums[i]}.`, arrays: [{ values: nums, range: [0, i], tones: { [i]: 'active' } }], vars: { k, sum } }); continue; }
    const improved = sum > best;
    best = Math.max(best, sum);
    f.push({ note: i < k ? `First full window sums to ${sum}.` : `Slide: add ${nums[i]}, drop ${nums[i - k]}. Window sum ${sum}${improved ? ', a new best' : ''}.`,
      arrays: [{ values: nums, range: [i - k + 1, i], tones: { [i]: 'active', ...(i >= k && { [i - k]: 'dim' }) } }], vars: { k, sum, best } });
  }
  return f;
}

function intervals(): Frame[] {
  const input = [[1, 3], [2, 6], [8, 10], [15, 18]], merged: number[][] = [], f: Frame[] = [];
  const lanes = [...input.map((x) => `[${x}]`), 'merged'];
  const bars = (active: number): Bar[] => [...input.map(([s, e], i) => ({ start: s, end: e, lane: i, tone: i === active ? 'active' as const : i < active ? 'done' as const : undefined })), ...merged.map(([s, e]) => ({ start: s, end: e, lane: input.length, tone: 'mark' as const }))];
  f.push({ note: 'Sorted by start. Sweep left to right, comparing each interval with the last merged block.', intervals: { max: 19, lanes, bars: bars(-1) } });
  input.forEach(([s, e], i) => {
    const last = merged[merged.length - 1];
    const overlap = last && s <= last[1];
    if (overlap) last[1] = Math.max(last[1], e); else merged.push([s, e]);
    f.push({ note: overlap ? `[${s}, ${e}] starts before the block ends: stretch the block to ${last[1]}.` : `[${s}, ${e}] starts after the last block: open a new block.`, intervals: { max: 19, lanes, bars: bars(i) }, chips: [{ label: 'merged', items: merged.map((m) => `[${m}]`) }] });
  });
  return f;
}

function stack(): Frame[] {
  const s = [...'([{}])'], st: string[] = [], f: Frame[] = [], pair: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  s.forEach((c, i) => {
    if (pair[c]) st.pop(); else st.push(c);
    f.push({ note: pair[c] ? `"${c}" closes the "${pair[c]}" on top of the stack: pop it.` : `"${c}" opens a group: push it.`, arrays: [{ values: s, pointers: { i }, tones: { ...toneMap([...Array(i).keys()], 'done'), [i]: 'active' } }], chips: [{ label: 'stack (top on the right)', items: [...st] }] });
  });
  f.push({ note: 'The stack is empty at the end: every bracket was closed in order.', arrays: [{ values: s, tones: toneMap([...s.keys()], 'done') }], chips: [{ label: 'stack', items: [] }] });
  return f;
}

function linkedList(): Frame[] {
  const vals = [1, 2, 3, 4], next = [1, 2, 3, -1], f: Frame[] = [];
  const snap = (note: string, prev: number, curr: number) => f.push({
    note,
    graph: {
      nodes: vals.map((v, i) => ({ id: `n${i}`, x: i * 1.6, y: 0, label: String(v), tag: [i === prev && 'prev', i === curr && 'curr'].filter(Boolean).join(' / ') || undefined })),
      edges: next.flatMap((to, i) => (to < 0 ? [] : [{ from: `n${i}`, to: `n${to}`, directed: true, tone: to < i ? 'done' as const : undefined }])),
      tones: { ...(prev >= 0 && { [`n${prev}`]: 'done' as const }), ...(curr >= 0 && { [`n${curr}`]: 'active' as const }) },
    },
    vars: { prev: prev < 0 ? 'null' : vals[prev], curr: curr < 0 ? 'null' : vals[curr] },
  });
  let prev = -1, curr = 0;
  snap('Start: prev is null, curr is the head.', prev, curr);
  while (curr >= 0) {
    const nxt = next[curr];
    next[curr] = prev;
    snap(`Save curr.next, point ${vals[curr]} back at ${prev < 0 ? 'null' : vals[prev]}, then step both pointers forward.`, curr, nxt);
    prev = curr; curr = nxt;
  }
  f.push({ ...f[f.length - 1], note: `curr fell off the end: prev (${vals[prev]}) is the new head.` });
  return f;
}

function binarySearch(): Frame[] {
  const nums = [-1, 0, 3, 5, 9, 12], target = 5, f: Frame[] = [];
  let lo = 0, hi = nums.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const hit = nums[mid] === target;
    f.push({ note: hit ? `nums[${mid}] = ${target}: found it in ${f.length + 1} steps.` : nums[mid] < target ? `nums[${mid}] = ${nums[mid]} < ${target}: the answer is right of mid, so lo = mid + 1.` : `nums[${mid}] = ${nums[mid]} > ${target}: the answer is left of mid, so hi = mid - 1.`,
      arrays: [{ values: nums, range: [lo, hi], pointers: { lo, mid, hi }, tones: { [mid]: hit ? 'done' : 'active' } }], vars: { target } });
    if (hit) break;
    if (nums[mid] < target) lo = mid + 1; else hi = mid - 1;
  }
  return f;
}

function heap(): Frame[] {
  const h: number[] = [], f: Frame[] = [];
  const snap = (note: string, active: number[]) => {
    // complete tree: a slot's position comes from its array index, so left and right children stay apart
    const depth = (i: number) => Math.floor(Math.log2(i + 1));
    const view: GraphView = {
      nodes: h.map((v, i) => ({ id: `h${i}`, label: String(v), x: ((i + 1 - 2 ** depth(i) + 0.5) * 4) / 2 ** depth(i), y: depth(i) })),
      edges: h.slice(1).map((_, k) => ({ from: `h${k >> 1}`, to: `h${k + 1}` })),
    };
    f.push({ note, graph: { ...view, tones: Object.fromEntries(active.map((i) => [`h${i}`, 'active' as const])) }, arrays: [{ label: 'array', values: [...h], tones: toneMap(active, 'active') }] });
  };
  for (const x of [5, 3, 8, 1, 4]) {
    h.push(x);
    let i = h.length - 1;
    snap(`Add ${x} at the end of the array (the next free spot in the tree).`, [i]);
    while (i > 0 && h[(i - 1) >> 1] > h[i]) {
      const p = (i - 1) >> 1;
      [h[p], h[i]] = [h[i], h[p]];
      snap(`${h[p]} is smaller than its parent ${h[i]}: swap them (sift up).`, [p]);
      i = p;
    }
  }
  f.push({ ...f[f.length - 1], note: `Every parent is smaller than its children: the minimum (${h[0]}) is at the root.` });
  return f;
}

function dfs(): Frame[] {
  const map = ['11000', '11000', '00100', '00011'].map((r) => [...r]), f: Frame[] = [];
  const island: Record<string, number> = {};
  const snap = (note: string, at?: [number, number]) => f.push({
    note,
    grid: { cells: map.map((row, r) => row.map((c, k) => island[key(r, k)] ?? (c === '1' ? '·' : ''))), tones: Object.fromEntries(map.flatMap((row, r) => row.map((c, k) => [key(r, k), at && at[0] === r && at[1] === k ? 'active' : island[key(r, k)] ? 'done' : c === '1' ? 'mark' : 'dim'] as const))) },
    vars: { islands: Math.max(0, ...Object.values(island)) },
  });
  let count = 0;
  const fill = (r: number, c: number) => {
    if (map[r]?.[c] !== '1' || island[key(r, c)]) return;
    island[key(r, c)] = count;
    snap(`Visit (${r}, ${c}) and mark it as island ${count}; then go deeper into its neighbours.`, [r, c]);
    fill(r + 1, c); fill(r - 1, c); fill(r, c + 1); fill(r, c - 1);
  };
  snap('Land cells (·) are unvisited. Start a DFS from each unvisited land cell.');
  map.forEach((row, r) => row.forEach((c, k) => { if (c === '1' && !island[key(r, k)]) { count++; fill(r, k); } }));
  snap(`Every land cell is marked: ${count} separate islands, one per DFS start.`);
  return f;
}

function bfs(): Frame[] {
  const map = ['S..#.', '.#...', '.#.#.', '...#E'], f: Frame[] = [];
  const dist: Record<string, number> = { [key(0, 0)]: 0 };
  let level = [[0, 0]], d = 0;
  const snap = (note: string, fresh: number[][]) => f.push({
    note,
    grid: {
      cells: map.map((row, r) => [...row].map((c, k) => (c === '#' ? '' : dist[key(r, k)] ?? (c === 'E' ? 'E' : '')))),
      tones: Object.fromEntries(map.flatMap((row, r) => [...row].map((c, k) => [key(r, k), c === '#' ? 'dim' : fresh.some(([a, b]) => a === r && b === k) ? 'active' : dist[key(r, k)] !== undefined ? 'done' : c === 'E' ? 'mark' : undefined] as const)).filter(([, t]) => t)),
    },
    vars: { step: d },
  });
  snap('Start in the corner at distance 0. Each round adds the next ring of cells.', level);
  while (level.length) {
    const next: number[][] = [];
    for (const [r, c] of level) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (map[nr]?.[nc] && map[nr][nc] !== '#' && dist[key(nr, nc)] === undefined) { dist[key(nr, nc)] = d + 1; next.push([nr, nc]); }
    }
    if (!next.length) break;
    d++;
    const exit = next.some(([r, c]) => map[r][c] === 'E');
    snap(exit ? `The exit is reached in round ${d}: the shortest path is ${d} steps.` : `Round ${d}: every cell ${d} step${d > 1 ? 's' : ''} away joins the queue.`, next);
    if (exit) break;
    level = next;
  }
  return f;
}

function backtracking(): Frame[] {
  const items = [1, 2, 3], nodes: { id: string; parent?: string; label: string }[] = [], out: string[] = [], f: Frame[] = [];
  const all: { id: string; parent?: string; label: string }[] = [];
  const go = (start: number, path: number[], parent?: string) => {
    const id = `p${all.length}`;
    all.push({ id, parent, label: `[${path}]` });
    for (let i = start; i < items.length; i++) go(i + 1, [...path, items[i]], id);
  };
  go(0, []);
  const pos = layoutTree(all);
  all.forEach((n, i) => {
    nodes.push(n);
    out.push(n.label);
    const shown = new Set(nodes.map((x) => x.id));
    f.push({
      note: i ? `Choose ${n.label.slice(1, -1).split(',').pop()}: record ${n.label}, then try the numbers after it. Returning undoes the choice.` : 'Start with the empty path and record it.',
      graph: { nodes: pos.nodes.filter((x) => shown.has(x.id)), edges: pos.edges.filter((e) => shown.has(e.to)), tones: { [n.id]: 'active', ...Object.fromEntries(nodes.slice(0, -1).map((x) => [x.id, 'done' as const])) } },
      chips: [{ label: 'output', items: [...out] }],
    });
  });
  f.push({ ...f[f.length - 1], note: `Every branch explored: ${out.length} subsets, 2³ for 3 items.` });
  return f;
}

function graphs(): Frame[] {
  const at: Record<string, [number, number]> = { A: [0, 1], B: [2, 0], C: [2, 2], D: [4, 1], E: [6, 1] };
  const edges: [string, string, number][] = [['A', 'B', 4], ['A', 'C', 1], ['C', 'B', 2], ['B', 'D', 1], ['C', 'D', 5], ['D', 'E', 3]];
  const dist: Record<string, number> = { A: 0 }, done = new Set<string>(), f: Frame[] = [];
  const snap = (note: string, active?: string) => f.push({
    note,
    graph: {
      nodes: Object.entries(at).map(([id, [x, y]]) => ({ id, x, y, label: id, tag: String(dist[id] ?? '∞') })),
      edges: edges.map(([a, b, w]) => ({ from: a, to: b, label: String(w), tone: active && (a === active || b === active) ? 'active' as const : undefined })),
      tones: { ...Object.fromEntries([...done].map((n) => [n, 'done' as const])), ...(active && { [active]: 'active' as const }) },
    },
    chips: [{ label: 'heap (distance, node)', items: Object.keys(dist).filter((n) => !done.has(n)).sort((a, b) => dist[a] - dist[b]).map((n) => `(${dist[n]}, ${n})`) }],
  });
  snap('Dijkstra from A. Tags show the best distance known so far.');
  for (;;) {
    const u = Object.keys(dist).filter((n) => !done.has(n)).sort((a, b) => dist[a] - dist[b])[0];
    if (!u) break;
    done.add(u);
    const better: string[] = [];
    for (const [a, b, w] of edges) for (const [x, y] of [[a, b], [b, a]]) if (x === u && !done.has(y) && dist[u] + w < (dist[y] ?? Infinity)) { dist[y] = dist[u] + w; better.push(`${y} = ${dist[y]}`); }
    snap(`Pop ${u} (distance ${dist[u]}), the closest unsettled node. ${better.length ? `Improve ${better.join(', ')}.` : 'No neighbour improves.'}`, u);
  }
  f.push({ ...f[f.length - 1], note: 'Every node is settled: the tags are the shortest distances from A.' });
  return f;
}

function dp(): Frame[] {
  const rows = 3, cols = 4, g: (number | string)[][] = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (r === 0 || c === 0 ? 1 : ''))), f: Frame[] = [];
  f.push({ note: 'Paths from the top-left to each cell, moving only right or down. The first row and column have exactly one path.', grid: { cells: g.map((r) => [...r]), tones: Object.fromEntries(g.flatMap((row, r) => row.map((v, c) => [key(r, c), v === '' ? undefined : 'done'] as const)).filter(([, t]) => t)) } });
  for (let r = 1; r < rows; r++) for (let c = 1; c < cols; c++) {
    g[r][c] = (g[r - 1][c] as number) + (g[r][c - 1] as number);
    f.push({ note: `dp[${r}][${c}] = above (${g[r - 1][c]}) + left (${g[r][c - 1]}) = ${g[r][c]}.`,
      grid: { cells: g.map((x) => [...x]), tones: { ...Object.fromEntries(g.flatMap((row, i) => row.map((v, j) => [key(i, j), v === '' ? undefined : 'done'] as const)).filter(([, t]) => t)), [key(r - 1, c)]: 'mark', [key(r, c - 1)]: 'mark', [key(r, c)]: 'active' } } });
  }
  f[f.length - 1].note += ` The bottom-right cell holds the answer: ${g[rows - 1][cols - 1]} paths.`;
  return f;
}

function greedy(): Frame[] {
  const prices = [7, 1, 5, 3, 6, 4], f: Frame[] = [];
  let low = Infinity, lowAt = -1, best = 0;
  prices.forEach((p, i) => {
    const note = p < low ? `${p} is the lowest price so far: the best day to buy, if we sell later.` : p - low > best ? `Selling at ${p} after buying at ${low} earns ${p - low}: a new best.` : `Selling at ${p} earns ${p - low}, no better than ${best}.`;
    if (p < low) { low = p; lowAt = i; }
    best = Math.max(best, p - low);
    f.push({ note, arrays: [{ label: 'price', values: prices, pointers: { day: i, ...(lowAt !== i && { buy: lowAt }) }, tones: { [lowAt]: 'mark', [i]: 'active' } }], vars: { lowest: low, best } });
  });
  return f;
}

function trie(): Frame[] {
  const nodes: { id: string; parent?: string; label: string }[] = [{ id: 'root', label: '·' }], ends = new Set<string>(), f: Frame[] = [];
  const final: { id: string; parent?: string; label: string }[] = [{ id: 'root', label: '·' }];
  for (const w of ['car', 'cat', 'do']) for (let i = 1; i <= w.length; i++) if (!final.some((n) => n.id === w.slice(0, i))) final.push({ id: w.slice(0, i), parent: i > 1 ? w.slice(0, i - 1) : 'root', label: w[i - 1] });
  const pos = layoutTree(final);
  const snap = (note: string, active: string) => {
    const shown = new Set(nodes.map((n) => n.id));
    f.push({ note, graph: { nodes: pos.nodes.filter((n) => shown.has(n.id)), edges: pos.edges.filter((e) => shown.has(e.to)), tones: { ...Object.fromEntries([...ends].map((e) => [e, 'done' as const])), [active]: 'active' } } });
  };
  snap('An empty trie: just the root.', 'root');
  for (const w of ['car', 'cat', 'do']) {
    for (let i = 1; i <= w.length; i++) {
      const id = w.slice(0, i), fresh = !nodes.some((n) => n.id === id);
      if (fresh) nodes.push(final.find((n) => n.id === id)!);
      if (i === w.length) ends.add(id);
      snap(`Insert "${w}": ${fresh ? `add a child "${w[i - 1]}"` : `"${w[i - 1]}" already exists, walk down`}${i === w.length ? ', and mark the end of a word.' : '.'}`, id);
    }
  }
  return f;
}

function prefixSum(): Frame[] {
  const nums = [3, 1, 4, 1, 5, 9], pre = [0], f: Frame[] = [];
  f.push({ note: 'prefix[0] = 0: the sum of nothing. It saves a special case later.', arrays: [{ label: 'nums', values: nums }, { label: 'prefix', values: [...pre], tones: { 0: 'active' } }] });
  nums.forEach((x, i) => {
    pre.push(pre[i] + x);
    f.push({ note: `prefix[${i + 1}] = prefix[${i}] + nums[${i}] = ${pre[i]} + ${x} = ${pre[i + 1]}.`, arrays: [{ label: 'nums', values: nums, tones: { [i]: 'active' } }, { label: 'prefix', values: [...pre], tones: { [i]: 'mark', [i + 1]: 'active' } }] });
  });
  f.push({ note: `Sum of nums[1..3] = prefix[4] - prefix[1] = ${pre[4]} - ${pre[1]} = ${pre[4] - pre[1]}: one subtraction for any range.`, arrays: [{ label: 'nums', values: nums, range: [1, 3] }, { label: 'prefix', values: pre, tones: { 1: 'mark', 4: 'active' } }] });
  return f;
}

function matrices(): Frame[] {
  const rows = 3, cols = 4, m = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => r * cols + c + 1)), order: Record<string, number> = {}, f: Frame[] = [];
  let top = 0, bottom = rows - 1, left = 0, right = cols - 1;
  const visit = (r: number, c: number, side: string) => {
    order[key(r, c)] = Object.keys(order).length + 1;
    f.push({ note: `${side}: read ${m[r][c]} (output #${order[key(r, c)]}).`, grid: { cells: m, tones: { ...Object.fromEntries(Object.keys(order).map((k) => [k, 'done' as const])), [key(r, c)]: 'active' } }, vars: { top, bottom, left, right } });
  };
  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c++) visit(top, c, 'Top row, left to right');
    top++;
    for (let r = top; r <= bottom; r++) visit(r, right, 'Right column, downwards');
    right--;
    if (top <= bottom) { for (let c = right; c >= left; c--) visit(bottom, c, 'Bottom row, right to left'); bottom--; }
    if (left <= right) { for (let r = bottom; r >= top; r--) visit(r, left, 'Left column, upwards'); left++; }
  }
  f[f.length - 1].note += ' The bounds have crossed: done.';
  return f;
}

export const VISUALS: Record<string, { title: string; frames: () => Frame[] }> = {
  'two-pointers': { title: 'Find two numbers that add up to 9', frames: twoPointers },
  'sliding-window': { title: 'Best sum of 3 consecutive values', frames: slidingWindow },
  intervals: { title: 'Merge overlapping intervals', frames: intervals },
  stack: { title: 'Check brackets with a stack', frames: stack },
  'linked-list': { title: 'Reverse a linked list in place', frames: linkedList },
  'binary-search': { title: 'Find 5 in a sorted list', frames: binarySearch },
  heap: { title: 'Insert into a min-heap', frames: heap },
  'depth-first-search': { title: 'Count islands with flood fill', frames: dfs },
  'breadth-first-search': { title: 'Shortest path on a grid', frames: bfs },
  backtracking: { title: 'Every subset of [1, 2, 3]', frames: backtracking },
  graphs: { title: 'Dijkstra shortest paths', frames: graphs },
  'dynamic-programming': { title: 'Count grid paths with a table', frames: dp },
  greedy: { title: 'Best single trade', frames: greedy },
  trie: { title: 'Insert car, cat and do', frames: trie },
  'prefix-sum': { title: 'Build a prefix array, then query a range', frames: prefixSum },
  matrices: { title: 'Read a matrix in spiral order', frames: matrices },
};
