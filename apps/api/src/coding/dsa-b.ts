import { BF, BT, custom, DP, fn, GD, GR, MX, PS, t, Topic, TR, TREE_JS, TREE_PY } from './dsa-kit';

export const TOPICS_B: Topic[] = [
  {
    ...BF, summary: 'Explore in rings of equal distance: levels of a tree, fewest steps on a grid.',
    lesson: `**Reach for it when** the question asks for the **fewest steps**, the **nearest** thing, or anything "level by level".

**How it works.** Put the start in a queue. Repeatedly take the oldest item and add its unvisited neighbours to the back. Because older items are always closer, nodes come out in order of distance: the first time you reach the goal is the shortest path (when every step costs the same).

**Levels.** To know which level you are on, process the queue one level at a time: read its length, pop exactly that many items, then start the next level.

**Many starts.** Put every source in the queue before you begin (all the rotten fruit, all the exits). The wave then spreads from all of them at once, and the level count is the time it takes.

Mark a node visited **when you add it** to the queue, not when you take it out, or it may be queued many times.`,
    template: {
      python: 'from collections import deque\n\ndef steps(start, goal, neighbours):\n    queue, seen, dist = deque([start]), {start}, 0\n    while queue:\n        for _ in range(len(queue)):   # one level\n            node = queue.popleft()\n            if node == goal:\n                return dist\n            for nxt in neighbours(node):\n                if nxt not in seen:\n                    seen.add(nxt)         # mark when queued\n                    queue.append(nxt)\n        dist += 1\n    return -1\n',
      javascript: 'function steps(start, goal, neighbours, key = String) {\n  let queue = [start], dist = 0;\n  const seen = new Set([key(start)]);\n  while (queue.length) {\n    const next = [];                  // the next level\n    for (const node of queue) {\n      if (key(node) === key(goal)) return dist;\n      for (const n of neighbours(node)) {\n        if (!seen.has(key(n))) { seen.add(key(n)); next.push(n); }\n      }\n    }\n    queue = next;\n    dist++;\n  }\n  return -1;\n}\n',
    },
    complexity: 'O(nodes + edges) time, O(nodes) space for the queue and the visited set.',
    pitfalls: ['Marking visited on dequeue, so a node is queued many times.', 'Using a list with pop(0) / shift() on huge inputs (O(n) per pop): use a deque or level arrays.', 'Using BFS for shortest paths when edges have different weights (that needs Dijkstra).'],
    problems: [
      fn(BF, { slug: 'rotting-oranges', title: 'Rotting Oranges', difficulty: 'medium', summary: 'How many minutes until every fruit has spoiled?',
        scenario: 'In `grid`, `0` is empty, `1` is fresh fruit and `2` is spoiled fruit. Each minute, fresh fruit next to spoiled fruit (up, down, left, right) spoils. Return the minutes until no fresh fruit is left, or `-1` if some never spoils.',
        py: 'minutes_to_spoil', js: 'minutesToSpoil', params: 'grid: list[list[int]]', jsParams: 'grid', ret: 'int',
        tests: [t('four minutes', [[[2, 1, 1], [1, 1, 0], [0, 1, 1]]], 4), t('one is cut off', [[[2, 1, 1], [0, 1, 1], [1, 0, 1]]], -1), t('nothing fresh', [[[0, 2]]], 0)],
        hints: ['Start the queue with every spoiled fruit at once.', 'Count the fresh fruit; it must reach zero.'] }),
      fn(BF, { slug: 'minimum-knight-moves', title: 'Minimum Knight Moves', difficulty: 'medium', summary: 'Fewest knight moves from the origin to a square on an endless board.',
        scenario: 'A chess knight starts at `(0, 0)` on an infinite board. Return the fewest moves it needs to reach `(x, y)`.',
        py: 'knight_moves', js: 'knightMoves', params: 'x: int, y: int', jsParams: 'x, y', ret: 'int',
        tests: [t('one hop', [2, 1], 1), t('diagonal', [5, 5], 4), t('already there', [0, 0], 0), t('tricky neighbour', [1, 1], 2)],
        hints: ['BFS over squares; the board is symmetric, so you can work with |x| and |y|.', 'Allow a small margin below zero: some short paths step outside the first quadrant.'] }),
    ],
  },
  {
    ...BT, summary: 'Build answers one choice at a time and undo the choice to try the next.',
    lesson: `**Reach for it when** you must list **every** valid combination, arrangement or placement, or search for one under constraints (sudoku, n-queens, word search).

**How it works.** A recursive function holds a partial answer. At each step it tries every remaining choice: **choose** (add it), **explore** (recurse), **un-choose** (remove it). When the partial answer is complete, record a copy.

**Pruning** is what makes it fast enough: stop exploring a branch the moment it cannot lead to a valid answer (a queen is attacked, the sum is over the target).

**Avoiding duplicates.** Pass a start index so each combination is built in one order only; sort first and skip equal neighbours when the input repeats values.

The output itself is often exponential (2ⁿ subsets, n! orderings), so that is the complexity to quote.`,
    template: {
      python: 'def all_subsets(items):\n    out, path = [], []\n    def go(start):\n        out.append(path[:])             # record a copy\n        for i in range(start, len(items)):\n            path.append(items[i])       # choose\n            go(i + 1)                   # explore\n            path.pop()                  # un-choose\n    go(0)\n    return out\n',
      javascript: 'function allSubsets(items) {\n  const out = [], path = [];\n  const go = (start) => {\n    out.push([...path]);              // record a copy\n    for (let i = start; i < items.length; i++) {\n      path.push(items[i]);            // choose\n      go(i + 1);                      // explore\n      path.pop();                     // un-choose\n    }\n  };\n  go(0);\n  return out;\n}\n',
    },
    complexity: 'Exponential in the input size: O(2ⁿ · n) for subsets, O(n! · n) for permutations.',
    pitfalls: ['Recording the shared path instead of a copy.', 'Forgetting to undo the choice, so branches leak into each other.', 'No pruning, so the search explores branches that can never succeed.'],
    problems: [
      fn(BT, { slug: 'subsets', title: 'Subsets', difficulty: 'medium', summary: 'List every subset of a set of distinct numbers.',
        scenario: 'Return every subset of `nums` (distinct values, in ascending order). Each subset keeps the input order, and the list of subsets is sorted (shorter prefix first, as Python sorts lists).',
        py: 'subsets', js: 'subsets', params: 'nums: list[int]', jsParams: 'nums', ret: 'list[list[int]]',
        tests: [t('three numbers', [[1, 2, 3]], [[], [1], [1, 2], [1, 2, 3], [1, 3], [2], [2, 3], [3]]), t('one number', [[0]], [[], [0]])],
        hints: ['Record the path at every call, not only at the leaves.', 'The template above already produces this order.'] }),
      fn(BT, { slug: 'n-queens', title: 'N-Queens', difficulty: 'hard', summary: 'Count the ways to place n queens that cannot attack each other.',
        scenario: 'Return how many ways `n` queens can be placed on an `n × n` board so that no two share a row, column or diagonal.',
        py: 'count_queens', js: 'countQueens', params: 'n: int', jsParams: 'n', ret: 'int',
        tests: [t('one', [1], 1), t('four', [4], 2), t('five', [5], 10), t('six', [6], 4), t('eight', [8], 92)],
        hints: ['Place one queen per row.', 'Keep sets of used columns, row-col diagonals and row+col diagonals.'] }),
    ],
  },
  {
    ...GR, summary: 'Nodes and edges: build an adjacency list, then search, colour or relax it.',
    lesson: `**Reach for it when** things are connected by relationships: cities and roads, people and friendships, tasks and prerequisites.

**Representation.** Turn the edge list into an **adjacency list**: \`node -> [neighbours]\`. For weighted edges store \`(neighbour, weight)\`.

**Connected groups.** Run DFS/BFS from every unvisited node, or use **union-find**: each node points to a parent; joining two nodes links their roots. The number of distinct roots is the number of groups.

**Shortest paths with weights.** **Dijkstra** keeps a min-heap of \`(distance, node)\`. Pop the closest unsettled node, settle it, and try to improve each neighbour's distance. Works when no weight is negative.

**Two-colouring.** Colour a node, give every neighbour the other colour, and report a clash if a neighbour already has the same one. A graph is two-colourable exactly when it has no odd cycle.`,
    template: {
      python: 'import heapq\n\ndef dijkstra(n, edges, src):\n    graph = {i: [] for i in range(n)}\n    for u, v, w in edges:\n        graph[u].append((v, w))\n    dist = {src: 0}\n    heap = [(0, src)]\n    while heap:\n        d, u = heapq.heappop(heap)\n        if d > dist[u]:\n            continue                   # stale entry\n        for v, w in graph[u]:\n            if d + w < dist.get(v, float("inf")):\n                dist[v] = d + w\n                heapq.heappush(heap, (d + w, v))\n    return dist\n',
      javascript: 'function groups(n, edges) {\n  const parent = Array.from({ length: n }, (_, i) => i);\n  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));\n  let count = n;\n  for (const [a, b] of edges) {\n    const ra = find(a), rb = find(b);\n    if (ra !== rb) { parent[ra] = rb; count--; } // two groups become one\n  }\n  return count;\n}\n',
    },
    complexity: 'Traversal O(V + E); Dijkstra O((V + E) log V); union-find nearly O(1) per operation with path compression.',
    pitfalls: ['Forgetting isolated nodes that appear in no edge.', 'Adding only one direction for an undirected edge.', 'Not skipping stale heap entries in Dijkstra.'],
    problems: [
      fn(GR, { slug: 'network-delay-time', title: 'Network Delay Time', difficulty: 'medium', summary: 'How long until a message reaches every server?',
        scenario: 'Servers are numbered `1..n`. Each `[u, v, w]` in `links` means a message takes `w` ms from `u` to `v` (one way). Starting at server `k`, return the time until every server has the message, or `-1` if some never get it.',
        py: 'broadcast_time', js: 'broadcastTime', params: 'links: list[list[int]], n: int, k: int', jsParams: 'links, n, k', ret: 'int',
        tests: [t('fan out', [[[2, 1, 1], [2, 3, 1], [3, 4, 1]], 4, 2], 2), t('one link', [[[1, 2, 1]], 2, 1], 1), t('wrong direction', [[[1, 2, 1]], 2, 2], -1)],
        hints: ['Dijkstra from k; the answer is the largest settled distance.'] }),
    ],
  },
  {
    ...DP, summary: 'Answer each subproblem once, store it, and build bigger answers from smaller ones.',
    lesson: `**Reach for it when** a problem asks for a count, a minimum or a maximum, and a brute-force recursion keeps solving the **same subproblems** again.

**Four steps.**
1. **State**: what does \`dp[i]\` (or \`dp[i][j]\`) mean, in one sentence? ("the number of ways to decode the first \`i\` characters")
2. **Transition**: how is a state built from smaller ones? (\`dp[i] = dp[i-1] + dp[i-2]\` when both last pieces are valid)
3. **Base case**: the smallest states you know directly (\`dp[0] = 1\`, the empty prefix).
4. **Order**: fill states so everything a state needs is already known.

**Top-down vs bottom-up.** Memoised recursion (\`@cache\`) is often the quickest to write; a table filled in a loop avoids recursion limits and makes it easy to keep only the last row.

Grid problems ("how many paths") are the clearest picture: each cell is the sum of the cell above and the cell to the left.`,
    template: {
      python: 'def unique_paths(rows, cols):\n    dp = [[1] * cols for _ in range(rows)]  # first row/col: one way\n    for r in range(1, rows):\n        for c in range(1, cols):\n            dp[r][c] = dp[r - 1][c] + dp[r][c - 1]\n    return dp[-1][-1]\n',
      javascript: 'function uniquePaths(rows, cols) {\n  const dp = Array.from({ length: rows }, () => new Array(cols).fill(1));\n  for (let r = 1; r < rows; r++)\n    for (let c = 1; c < cols; c++)\n      dp[r][c] = dp[r - 1][c] + dp[r][c - 1];\n  return dp[rows - 1][cols - 1];\n}\n',
    },
    complexity: 'Number of states × work per state; often O(n) or O(n²), with O(n) space or less when only the last row is kept.',
    pitfalls: ['A state that does not capture everything the future depends on.', 'Wrong base case (dp[0] for the empty prefix is usually 1 for counts, 0 for lengths).', 'Filling the table in an order that reads states not computed yet.'],
    problems: [
      fn(DP, { slug: 'decode-ways', title: 'Decode Ways', difficulty: 'medium', summary: 'Count the ways a string of digits decodes into letters.',
        scenario: 'Letters map to numbers `A=1 … Z=26`. Given a string of digits, return how many ways it can be split into valid codes (`"06"` is not a valid code).',
        py: 'decode_ways', js: 'decodeWays', params: 's: str', jsParams: 's', ret: 'int',
        tests: [t('two ways', ['12'], 2), t('three ways', ['226'], 3), t('leading zero', ['06'], 0), t('zeros inside', ['11106'], 2)],
        hints: ['dp[i] = ways to decode the first i digits.', 'Add dp[i-1] if the last digit is 1-9, and dp[i-2] if the last two are 10-26.'] }),
      fn(DP, { slug: 'longest-increasing-subsequence', title: 'Longest Increasing Subsequence', difficulty: 'medium', summary: 'Length of the longest strictly increasing subsequence.',
        scenario: 'Return the length of the longest strictly increasing subsequence of `nums` (items keep their order but need not be adjacent).',
        py: 'longest_rising', js: 'longestRising', params: 'nums: list[int]', jsParams: 'nums', ret: 'int',
        tests: [t('mixed', [[10, 9, 2, 5, 3, 7, 101, 18]], 4), t('zigzag', [[0, 1, 0, 3, 2, 3]], 4), t('all equal', [[7, 7, 7]], 1), t('empty', [[]], 0)],
        hints: ['dp[i] = longest rising subsequence ending at i.', 'For O(n log n): keep the smallest tail for each length and binary-search it.'] }),
      fn(DP, { slug: 'word-break', title: 'Word Break', difficulty: 'medium', summary: 'Can a string be split into dictionary words?',
        scenario: 'Return `true` if `s` can be cut into a sequence of words from `words` (a word may be used many times).',
        py: 'can_split_words', js: 'canSplitWords', params: 's: str, words: list[str]', jsParams: 's, words', ret: 'bool',
        tests: [t('reused word', ['applepenapple', ['apple', 'pen']], true), t('dead end', ['catsandog', ['cats', 'dog', 'sand', 'and', 'cat']], false), t('empty string', ['', ['a']], true), t('leftover letter', ['ab', ['a']], false)],
        hints: ['ok[i] = the first i characters can be split.'] }),
    ],
  },
  {
    ...GD, summary: 'Make the locally best choice at every step, when you can argue it is never wrong.',
    lesson: `**Reach for it when** sorting or a single pass with a simple rule ("always take the cheapest so far", "always go as far as you can") seems to work, and you can explain why.

**The argument matters.** A greedy choice is correct when swapping it into any optimal answer never makes that answer worse (an **exchange argument**). If you cannot argue it, try a small counter-example: greedy failures usually show up on inputs of three or four items, and the fix is often dynamic programming.

**Common shapes.**
- Track the best value seen so far (lowest price, farthest reach) and decide each item against it.
- Sort by end time or by ratio, then take items in that order.
- Keep a running balance; when it goes negative, the start must be after this point.`,
    template: {
      python: 'def best_profit(prices):\n    lowest, best = float("inf"), 0\n    for p in prices:\n        lowest = min(lowest, p)        # best buy so far\n        best = max(best, p - lowest)   # sell today?\n    return best\n',
      javascript: 'function bestProfit(prices) {\n  let lowest = Infinity, best = 0;\n  for (const p of prices) {\n    lowest = Math.min(lowest, p);      // best buy so far\n    best = Math.max(best, p - lowest); // sell today?\n  }\n  return best;\n}\n',
    },
    complexity: 'Usually O(n) for one pass, O(n log n) when you sort first; O(1) extra space.',
    pitfalls: ['Using greedy without checking a counter-example.', 'Updating the best-so-far after using it in the same step (or before, when the rule needs after).', 'Missing the "no valid answer" case.'],
    problems: [
      fn(GD, { slug: 'best-time-to-buy-sell-stock', title: 'Best Time to Buy and Sell Stock', difficulty: 'easy', summary: 'Maximum profit from buying once and selling later.',
        scenario: '`prices[i]` is the price on day `i`. Buy on one day and sell on a later day; return the best profit, or `0` if no trade makes money.',
        py: 'max_profit', js: 'maxProfit', params: 'prices: list[int]', jsParams: 'prices', ret: 'int',
        tests: [t('buy low sell high', [[7, 1, 5, 3, 6, 4]], 5), t('only falling', [[7, 6, 4, 3, 1]], 0), t('no prices', [[]], 0), t('early peak', [[2, 4, 1]], 2)],
        hints: ['Keep the lowest price seen so far.'] }),
      fn(GD, { slug: 'jump-game', title: 'Jump Game', difficulty: 'medium', summary: 'Can you reach the last step with the jumps allowed?',
        scenario: 'Standing on step `i` you may jump up to `jumps[i]` steps forward. Starting on step `0`, return `true` if you can reach the last step.',
        py: 'can_reach', js: 'canReach', params: 'jumps: list[int]', jsParams: 'jumps', ret: 'bool',
        tests: [t('reachable', [[2, 3, 1, 1, 4]], true), t('stuck on zero', [[3, 2, 1, 0, 4]], false), t('already there', [[0]], true)],
        hints: ['Track the farthest step reachable so far.'] }),
      fn(GD, { slug: 'gas-station', title: 'Gas Station', difficulty: 'medium', summary: 'Pick the station to start a full lap of a circular route.',
        scenario: 'Stations sit on a loop. At station `i` you collect `fuel[i]`; driving to the next station costs `cost[i]`. You start with an empty tank. Return the start index from which you can drive a full lap, or `-1`. The answer is unique if it exists.',
        py: 'start_station', js: 'startStation', params: 'fuel: list[int], cost: list[int]', jsParams: 'fuel, cost', ret: 'int',
        tests: [t('start at three', [[1, 2, 3, 4, 5], [3, 4, 5, 1, 2]], 3), t('not enough fuel', [[2, 3, 4], [3, 4, 3]], -1), t('one station', [[5], [4]], 0)],
        hints: ['If total fuel < total cost, no start works.', 'When the running tank goes negative, the start must be after this station.'] }),
    ],
  },
  {
    ...TR, summary: 'A tree of characters that answers prefix questions in time proportional to the word.',
    lesson: `**Reach for it when** you look words up by **prefix**: autocomplete, spell checks, "does any word start with…", or matching many words against a grid.

**How it works.** Each node holds a map from character to child and a flag saying "a word ends here". Inserting walks down the characters, creating missing children. Looking up a word walks down and checks the flag at the end; looking up a prefix only needs the walk to succeed.

Every operation costs \`O(length of the word)\`, regardless of how many words are stored.

**Autocomplete.** Walk to the prefix node, then collect words below it in alphabetical order (visit children sorted), stopping once you have enough.`,
    template: {
      python: 'class Trie:\n    def __init__(self):\n        self.root = {}\n\n    def insert(self, word):\n        node = self.root\n        for ch in word:\n            node = node.setdefault(ch, {})\n        node["$"] = True            # a word ends here\n\n    def _walk(self, s):\n        node = self.root\n        for ch in s:\n            if ch not in node:\n                return None\n            node = node[ch]\n        return node\n',
      javascript: 'class Trie {\n  constructor() { this.root = new Map(); }\n  insert(word) {\n    let node = this.root;\n    for (const ch of word) {\n      if (!node.has(ch)) node.set(ch, new Map());\n      node = node.get(ch);\n    }\n    node.set("$", true); // a word ends here\n  }\n  walk(s) {\n    let node = this.root;\n    for (const ch of s) {\n      node = node.get(ch);\n      if (!node) return null;\n    }\n    return node;\n  }\n}\n',
    },
    complexity: 'O(L) per insert or lookup for a word of length L; space up to the total length of all words.',
    pitfalls: ['Treating a prefix as a stored word (forgetting the end-of-word flag).', 'Collecting autocomplete results in insertion order instead of alphabetical order.', 'A "$" marker colliding with a real character: use a separate flag if input may contain it.'],
    problems: [
      custom(TR, { slug: 'implement-trie', title: 'Implement Trie Methods', difficulty: 'medium', summary: 'Implement insert, exact lookup and prefix lookup.',
        scenario: 'Implement a class `Trie` with `insert(word)`, `contains(word)` (exact word stored?) and `prefix(p)` (does any stored word start with `p`?).',
        kind: 'class', entry: { python: 'Trie', javascript: 'Trie' },
        starter: {
          python: 'class Trie:\n    def __init__(self):\n        pass\n\n    def insert(self, word: str) -> None:\n        pass\n\n    def contains(self, word: str) -> bool:\n        pass\n\n    def prefix(self, p: str) -> bool:\n        pass\n',
          javascript: 'class Trie {\n  constructor() {}\n\n  insert(word) {}\n\n  contains(word) {}\n\n  prefix(p) {}\n}\n',
        },
        tests: [
          { name: 'words and prefixes', ops: [['new', []], ['insert', ['apple']], ['contains', ['apple'], true], ['contains', ['app'], false], ['prefix', ['app'], true], ['insert', ['app']], ['contains', ['app'], true], ['prefix', ['b'], false]] },
          { name: 'empty trie', ops: [['new', []], ['contains', ['a'], false], ['prefix', ['a'], false]] },
        ],
        hints: ['Each node: children by character, plus an end-of-word flag.'] }),
    ],
  },
  {
    ...PS, summary: 'Precompute running totals so any range sum is one subtraction.',
    lesson: `**Reach for it when** you need sums (or counts) over many ranges, or you are counting subarrays whose sum hits a target.

**Building it.** \`prefix[0] = 0\` and \`prefix[i + 1] = prefix[i] + nums[i]\`. The sum of \`nums[i..j]\` is then \`prefix[j + 1] - prefix[i]\`: \`O(1)\` per query after \`O(n)\` set-up.

**Counting subarrays with sum k.** Walk the array keeping the running total and a hash map of **how many times each earlier total appeared**. A subarray ending here sums to \`k\` exactly when an earlier total equals \`total - k\`. Start the map with \`{0: 1}\` for subarrays that begin at index 0.

The extra leading \`0\` removes almost every off-by-one: get used to it.`,
    template: {
      python: 'def count_with_sum(nums, k):\n    seen = {0: 1}          # running total -> times seen\n    total = count = 0\n    for x in nums:\n        total += x\n        count += seen.get(total - k, 0)\n        seen[total] = seen.get(total, 0) + 1\n    return count\n',
      javascript: 'function countWithSum(nums, k) {\n  const seen = new Map([[0, 1]]); // running total -> times seen\n  let total = 0, count = 0;\n  for (const x of nums) {\n    total += x;\n    count += seen.get(total - k) ?? 0;\n    seen.set(total, (seen.get(total) ?? 0) + 1);\n  }\n  return count;\n}\n',
    },
    complexity: 'O(n) to build, O(1) per range query; the counting variant is O(n) time and space.',
    pitfalls: ['Forgetting the leading 0 (or {0: 1}) and missing ranges that start at index 0.', 'Using a sliding window when numbers can be negative.', 'Adding the current total to the map before looking up total - k.'],
    problems: [
      fn(PS, { slug: 'subarray-sum-equals-k', title: 'Subarray Sum Equals K', difficulty: 'medium', summary: 'Count contiguous subarrays that sum to k.',
        scenario: 'Return how many contiguous, non-empty subarrays of `nums` sum to exactly `k`. Numbers can be negative.',
        py: 'count_subarrays', js: 'countSubarrays', params: 'nums: list[int], k: int', jsParams: 'nums, k', ret: 'int',
        tests: [t('overlapping', [[1, 1, 1], 2], 2), t('two ways', [[1, 2, 3], 3], 2), t('with negatives', [[1, -1, 0], 0], 3), t('empty', [[], 0], 0)],
        hints: ['A running total and a map of earlier totals.'] }),
    ],
  },
  {
    ...MX, summary: 'Walk 2D grids by layers, transpose and reflect, and use the edges as scratch space.',
    lesson: `**Reach for it when** the input is a grid and the task is a traversal order, a rotation, or a change that depends on whole rows and columns.

**Index discipline.** Name your bounds (\`top\`, \`bottom\`, \`left\`, \`right\`) and shrink them after each side of a layer. Most matrix bugs are bound updates done in the wrong order.

**Rotation.** Rotating 90° clockwise equals **transposing** (swap \`[r][c]\` with \`[c][r]\`) and then **reversing each row**. Counter-clockwise: reverse first, then transpose.

**Row and column marks.** To zero every row and column that contains a zero, first record which rows and columns to clear, then clear them; clearing while scanning spreads zeros that were never in the input. The \`O(1)\`-space trick stores those marks in the first row and column.`,
    template: {
      python: 'def spiral(m):\n    out = []\n    while m:\n        out += m.pop(0)                    # top row\n        m = [list(r) for r in zip(*m)][::-1]  # turn the rest\n    return out\n\n\ndef rotate(m):\n    n = len(m)\n    for r in range(n):\n        for c in range(r + 1, n):\n            m[r][c], m[c][r] = m[c][r], m[r][c]  # transpose\n    for row in m:\n        row.reverse()\n    return m\n',
      javascript: 'function rotate(m) {\n  const n = m.length;\n  for (let r = 0; r < n; r++)\n    for (let c = r + 1; c < n; c++)\n      [m[r][c], m[c][r]] = [m[c][r], m[r][c]]; // transpose\n  for (const row of m) row.reverse();\n  return m;\n}\n',
    },
    complexity: 'O(rows × cols) time; O(1) extra space for in-place rotation and the first-row-marker trick.',
    pitfalls: ['Updating the bounds in the wrong order and visiting a cell twice.', 'Single-row or single-column layers in spiral order.', 'Writing zeros while still scanning for them.'],
    problems: [
      fn(MX, { slug: 'spiral-matrix', title: 'Spiral Matrix', difficulty: 'medium', summary: 'Read a matrix in clockwise spiral order.',
        scenario: 'Return all values of `matrix` (rows × cols) in clockwise spiral order, starting top-left.',
        py: 'spiral', js: 'spiral', params: 'matrix: list[list[int]]', jsParams: 'matrix', ret: 'list[int]',
        tests: [t('square', [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], [1, 2, 3, 6, 9, 8, 7, 4, 5]), t('wide', [[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]], [1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7]), t('one cell', [[[7]]], [7]), t('empty', [[]], [])],
        hints: ['Keep top, bottom, left and right bounds and shrink them.'] }),
      fn(MX, { slug: 'rotate-image', title: 'Rotate Image', difficulty: 'medium', summary: 'Rotate a square matrix 90° clockwise in place.',
        scenario: 'Rotate the `n × n` `matrix` 90° clockwise **in place** and return it.',
        py: 'rotate', js: 'rotate', params: 'matrix: list[list[int]]', jsParams: 'matrix', ret: 'list[list[int]]',
        tests: [t('three by three', [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], [[7, 4, 1], [8, 5, 2], [9, 6, 3]]), t('one cell', [[[1]]], [[1]]), t('two by two', [[[1, 2], [3, 4]]], [[3, 1], [4, 2]])],
        hints: ['Transpose, then reverse each row.'] }),
      fn(MX, { slug: 'set-matrix-zeroes', title: 'Set Matrix Zeroes', difficulty: 'medium', summary: 'Zero every row and column that holds a zero.',
        scenario: 'For every `0` in `matrix`, set its whole row and column to `0`. Return the matrix.',
        py: 'set_zeroes', js: 'setZeroes', params: 'matrix: list[list[int]]', jsParams: 'matrix', ret: 'list[list[int]]',
        tests: [t('centre zero', [[[1, 1, 1], [1, 0, 1], [1, 1, 1]]], [[1, 0, 1], [0, 0, 0], [1, 0, 1]]), t('corner zeros', [[[0, 1, 2, 0], [3, 4, 5, 2], [1, 3, 1, 5]]], [[0, 0, 0, 0], [0, 4, 5, 0], [0, 3, 1, 0]]), t('no zeros', [[[1]]], [[1]])],
        hints: ['Record the rows and columns first, then clear them.'] }),
    ],
  },
];
