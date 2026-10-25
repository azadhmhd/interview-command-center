import type { Problem } from './problems';
import { BF, BT, custom, DF, fn, t, tree } from './dsa-kit';

const PACIFIC = [[1, 2, 2, 3, 5], [3, 2, 3, 4, 4], [2, 4, 5, 3, 1], [6, 7, 1, 4, 5], [5, 1, 1, 2, 4]];
const BOARD = ['ABCE', 'SFCS', 'ADEE'];

/** More problems for Depth-First Search, Breadth-First Search and Backtracking. */
export const PROBLEMS_D: Problem[] = [
  tree(DF, { slug: 'validate-bst', title: 'Validate Binary Search Tree', difficulty: 'medium', summary: 'Check that a tree obeys the binary-search-tree rule everywhere.',
    scenario: 'Implement `is_valid_bst(root)` / `isValidBst(root)`: `true` if every node is strictly greater than **all** values in its left subtree and strictly smaller than all values in its right subtree.',
    py: 'is_valid_bst', js: 'isValidBst', empty: ['False', 'false'],
    tests: [t('small valid', [[2, 1, 3]], true), t('right child too small', [[5, 1, 4, null, null, 3, 6]], false), t('empty', [[]], true), t('deep violation', [[5, 4, 6, null, null, 3, 7]], false), t('duplicates', [[2, 2, 2]], false)],
    hints: ['Checking only parent and child misses deeper violations.', 'Pass an allowed (low, high) range down the recursion.'] }),
  tree(DF, { slug: 'binary-tree-tilt', title: 'Binary Tree Tilt', difficulty: 'easy', summary: 'Add up how unbalanced every node\'s subtrees are.',
    scenario: 'A node\'s tilt is `|sum of its left subtree - sum of its right subtree|` (an empty subtree sums to 0). Implement `find_tilt(root)` / `findTilt(root)`: return the sum of every node\'s tilt.',
    py: 'find_tilt', js: 'findTilt', empty: ['0', '0'],
    tests: [t('three nodes', [[1, 2, 3]], 1), t('uneven', [[4, 2, 9, 3, 5, null, 7]], 15), t('empty', [[]], 0), t('deeper', [[21, 7, 14, 1, 1, 2, 2, 3, 3]], 9)],
    hints: ['Have the recursion return the subtree sum, and add each node\'s tilt to a running total on the way.'] }),
  tree(DF, { slug: 'diameter-of-binary-tree', title: 'Diameter of a Binary Tree', difficulty: 'easy', summary: 'Length of the longest path between any two nodes.',
    scenario: 'Implement `diameter(root)`: the number of **edges** on the longest path between any two nodes. The path does not have to pass through the root.',
    py: 'diameter', js: 'diameter', empty: ['0', '0'],
    tests: [t('through the root', [[1, 2, 3, 4, 5]], 3), t('two nodes', [[1, 2]], 1), t('empty', [[]], 0), t('single', [[1]], 0)],
    hints: ['Return the height from the recursion; the best path through a node is left height + right height.'] }),
  tree(DF, { slug: 'path-sum-ii', title: 'Path Sum II', difficulty: 'medium', summary: 'List every root-to-leaf path that adds up to a target.',
    scenario: 'Implement `path_sums(root, target)` / `pathSums(root, target)`: every root-to-leaf path whose values sum to `target`, as lists of values, in left-to-right order of their leaves.',
    py: 'path_sums', js: 'pathSums', extra: 'target', empty: ['[]', '[]'],
    tests: [t('two paths', [[5, 4, 8, 11, null, 13, 4, 7, 2, null, null, 5, 1], 22], [[5, 4, 11, 2], [5, 8, 4, 5]]), t('none', [[1, 2, 3], 5], []), t('root is not a leaf', [[1, 2], 1], []), t('empty', [[], 0], [])],
    hints: ['Carry the current path; record a copy at a leaf when the sum matches, then pop on the way back.'] }),
  tree(DF, { slug: 'longest-univalue-path', title: 'Longest Univalue Path', difficulty: 'medium', summary: 'Longest path where every node has the same value.',
    scenario: 'Implement `longest_univalue(root)` / `longestUnivalue(root)`: the number of edges on the longest path whose nodes all have the same value. It may or may not pass through the root.',
    py: 'longest_univalue', js: 'longestUnivalue', empty: ['0', '0'],
    tests: [t('fives on the right', [[5, 4, 5, 1, 1, null, 5]], 2), t('fours on the left', [[1, 4, 5, 4, 4, null, 5]], 2), t('empty', [[]], 0), t('bend through the root', [[1, 1, 1]], 2)],
    hints: ['Return the longest same-value arm going down from a node.', 'An arm only continues into a child with the same value.'] }),
  custom(DF, { slug: 'clone-graph', title: 'Clone Graph', difficulty: 'medium', summary: 'Make a deep copy of a connected graph.',
    scenario: 'Implement `clone_graph(node)` / `cloneGraph(node)`: return a deep copy of the graph reachable from `node` (new nodes with the same values and the same connections). Tests give the graph as an adjacency list: entry `i` lists the neighbours of node `i + 1`.',
    kind: 'function', entry: { python: 'solve', javascript: 'solve' },
    starter: {
      python: `class Node:
    def __init__(self, val=0, neighbors=None):
        self.val = val
        self.neighbors = neighbors if neighbors is not None else []


def clone_graph(node):
    # your code here
    return node


# test glue: leave as is
def solve(adj):
    nodes = [Node(i + 1) for i in range(len(adj))]
    for i, ns in enumerate(adj):
        nodes[i].neighbors = [nodes[j - 1] for j in ns]
    copy = clone_graph(nodes[0] if nodes else None)
    if copy is None:
        return []
    originals = set(map(id, nodes))
    seen, stack = {copy.val: copy}, [copy]
    while stack:
        n = stack.pop()
        if id(n) in originals:
            return "returned an original node, not a copy"
        for m in n.neighbors:
            if m.val not in seen:
                seen[m.val] = m
                stack.append(m)
    return [[m.val for m in seen[v].neighbors] for v in sorted(seen)]
`,
      javascript: `class Node {
  constructor(val = 0, neighbors = []) {
    this.val = val;
    this.neighbors = neighbors;
  }
}

function cloneGraph(node) {
  // your code here
  return node;
}

// test glue: leave as is
function solve(adj) {
  const nodes = adj.map((_, i) => new Node(i + 1));
  adj.forEach((ns, i) => { nodes[i].neighbors = ns.map((j) => nodes[j - 1]); });
  const copy = cloneGraph(nodes[0] ?? null);
  if (!copy) return [];
  const originals = new Set(nodes), seen = new Map([[copy.val, copy]]), stack = [copy];
  while (stack.length) {
    const n = stack.pop();
    if (originals.has(n)) return 'returned an original node, not a copy';
    for (const m of n.neighbors) if (!seen.has(m.val)) { seen.set(m.val, m); stack.push(m); }
  }
  return [...seen.keys()].sort((a, b) => a - b).map((v) => seen.get(v).neighbors.map((m) => m.val));
}
`,
    },
    tests: [t('square', [[[2, 4], [1, 3], [2, 4], [1, 3]]], [[2, 4], [1, 3], [2, 4], [1, 3]]), t('lonely node', [[[]]], [[]]), t('empty graph', [[]], []), t('a pair', [[[2], [1]]], [[2], [1]])],
    hints: ['Keep a map from original node to its copy; it doubles as the visited set.', 'Create the copy before visiting neighbours, so cycles find it.'] }),
  fn(DF, { slug: 'graph-valid-tree', title: 'Graph Valid Tree', difficulty: 'medium', summary: 'Do these edges form a single tree?',
    scenario: 'Nodes are `0..n-1` and `edges` are undirected. Return `true` if the edges form a valid tree: everything connected and no cycle.',
    py: 'valid_tree', js: 'validTree', params: 'n: int, edges: list[list[int]]', jsParams: 'n, edges', ret: 'bool',
    tests: [t('a tree', [5, [[0, 1], [0, 2], [0, 3], [1, 4]]], true), t('has a cycle', [5, [[0, 1], [1, 2], [2, 3], [1, 3], [1, 4]]], false), t('single node', [1, []], true), t('two pieces', [4, [[0, 1], [2, 3]]], false)],
    hints: ['A tree on n nodes has exactly n - 1 edges.', 'With n - 1 edges, it is a tree if a DFS from node 0 reaches every node.'] }),
  fn(DF, { slug: 'flood-fill', title: 'Flood Fill', difficulty: 'easy', summary: 'Repaint a connected region of an image.',
    scenario: 'Starting at pixel `(sr, sc)`, repaint it and every pixel connected to it (up, down, left, right) with the **same original colour** to `color`. Return the image.',
    py: 'flood_fill', js: 'floodFill', params: 'image: list[list[int]], sr: int, sc: int, color: int', jsParams: 'image, sr, sc, color', ret: 'list[list[int]]',
    tests: [t('centre region', [[[1, 1, 1], [1, 1, 0], [1, 0, 1]], 1, 1, 2], [[2, 2, 2], [2, 2, 0], [2, 0, 1]]), t('same colour', [[[0, 0, 0], [0, 0, 0]], 0, 0, 0], [[0, 0, 0], [0, 0, 0]]), t('one pixel', [[[1]], 0, 0, 5], [[5]])],
    hints: ['If the new colour equals the old one, return straight away (or you loop forever).'] }),
  fn(DF, { slug: 'surrounded-regions', title: 'Surrounded Regions', difficulty: 'medium', summary: 'Capture every region of O cells that cannot reach the border.',
    scenario: '`board` is a list of strings of `X` and `O`. Flip every `O` that is **not** connected (up, down, left, right) to an `O` on the border into `X`. Return the board as a list of strings.',
    py: 'capture', js: 'capture', params: 'board: list[str]', jsParams: 'board', ret: 'list[str]',
    tests: [t('one region captured', [['XXXX', 'XOOX', 'XXOX', 'XOXX']], ['XXXX', 'XXXX', 'XXXX', 'XOXX']), t('single X', [['X']], ['X']), t('all on the border', [['OO', 'OO']], ['OO', 'OO']), t('centre captured', [['XXX', 'XOX', 'XXX']], ['XXX', 'XXX', 'XXX'])],
    hints: ['Work backwards: DFS from every border O and mark what it reaches as safe.', 'Every O that is not safe becomes X.'] }),
  fn(DF, { slug: 'pacific-atlantic-water-flow', title: 'Pacific Atlantic Water Flow', difficulty: 'medium', summary: 'Which cells can drain into both oceans?',
    scenario: 'The Pacific touches the top and left edges of `heights`, the Atlantic the bottom and right edges. Water flows to a neighbour (up, down, left, right) of equal or lower height. Return every `[row, col]` from which water can reach **both** oceans, sorted.',
    py: 'flow_cells', js: 'flowCells', params: 'heights: list[list[int]]', jsParams: 'heights', ret: 'list[list[int]]',
    tests: [t('island', [PACIFIC], [[0, 4], [1, 3], [1, 4], [2, 2], [3, 0], [3, 1], [4, 0]]), t('one cell', [[[1]]], [[0, 0]]), t('empty', [[]], [])],
    hints: ['Search uphill from each ocean\'s edge instead of downhill from every cell.', 'The answer is the cells both searches reach.'] }),

  tree(BF, { slug: 'level-order-sum', title: 'Level Order Sum', difficulty: 'easy', summary: 'Sum the values on each level of a tree.',
    scenario: 'Implement `level_sums(root)` / `levelSums(root)`: a list with the sum of each level, from the root down.',
    py: 'level_sums', js: 'levelSums', empty: ['[]', '[]'],
    tests: [t('three levels', [[3, 9, 20, null, null, 15, 7]], [3, 29, 22]), t('empty', [[]], []), t('full', [[1, 2, 3, 4, 5]], [1, 5, 9])],
    hints: ['Process the queue one level at a time.'] }),
  tree(BF, { slug: 'rightmost-node', title: 'Binary Tree Right Side View', difficulty: 'medium', summary: 'The nodes you see when looking at a tree from the right.',
    scenario: 'Implement `right_view(root)` / `rightView(root)`: the value of the rightmost node on each level, from the top.',
    py: 'right_view', js: 'rightView', empty: ['[]', '[]'],
    tests: [t('mixed', [[1, 2, 3, null, 5, null, 4]], [1, 3, 4]), t('right chain', [[1, null, 3]], [1, 3]), t('empty', [[]], []), t('left leaf shows', [[1, 2, 3, 4]], [1, 3, 4])],
    hints: ['The last node of each BFS level is the one you see.'] }),
  tree(BF, { slug: 'zigzag-level-order', title: 'Zigzag Level Order', difficulty: 'medium', summary: 'Levels of a tree, alternating left-to-right and right-to-left.',
    scenario: 'Implement `zigzag(root)`: the levels as lists, the first left to right, the second right to left, and so on.',
    py: 'zigzag', js: 'zigzag', empty: ['[]', '[]'],
    tests: [t('three levels', [[3, 9, 20, null, null, 15, 7]], [[3], [20, 9], [15, 7]]), t('single', [[1]], [[1]]), t('empty', [[]], []), t('gaps', [[1, 2, 3, 4, null, null, 5]], [[1], [3, 2], [4, 5]])],
    hints: ['Do a normal level-order pass and reverse every second level.'] }),
  tree(BF, { slug: 'maximum-width-binary-tree', title: 'Maximum Width of Binary Tree', difficulty: 'medium', summary: 'Widest level, counting the gaps between its end nodes.',
    scenario: 'Implement `max_width(root)` / `maxWidth(root)`. A level\'s width is the distance between its leftmost and rightmost nodes, counting the missing positions in between as if the tree were complete. Return the largest width.',
    py: 'max_width', js: 'maxWidth', empty: ['0', '0'],
    tests: [t('gap in the middle', [[1, 3, 2, 5, 3, null, 9]], 4), t('wide bottom', [[1, 3, 2, 5, null, null, 9, 6, null, 7]], 7), t('lopsided', [[1, 3, 2, 5]], 2), t('empty', [[]], 0)],
    hints: ['Give each node a position: children of p are 2p and 2p + 1.', 'Width = last position - first position + 1. Re-base positions per level to keep numbers small.'] }),
  fn(BF, { slug: 'zero-one-matrix', title: '01-Matrix', difficulty: 'medium', summary: 'Distance from every cell to the nearest 0.',
    scenario: '`mat` holds `0`s and `1`s (at least one `0`). Return a matrix of the same shape where each cell is its distance (steps up, down, left, right) to the nearest `0`.',
    py: 'nearest_zero', js: 'nearestZero', params: 'mat: list[list[int]]', jsParams: 'mat', ret: 'list[list[int]]',
    tests: [t('one surrounded', [[[0, 0, 0], [0, 1, 0], [0, 0, 0]]], [[0, 0, 0], [0, 1, 0], [0, 0, 0]]), t('bottom row', [[[0, 0, 0], [0, 1, 0], [1, 1, 1]]], [[0, 0, 0], [0, 1, 0], [1, 2, 1]]), t('single zero', [[[0]]], [[0]]), t('one row', [[[1, 0, 1, 1]]], [[1, 0, 1, 2]])],
    hints: ['Start a BFS from every 0 at once (multi-source).'] }),
  fn(BF, { slug: 'bus-routes', title: 'Bus Routes', difficulty: 'hard', summary: 'Fewest buses from one stop to another.',
    scenario: '`routes[i]` lists the stops bus `i` visits (it loops forever). Return the fewest buses you must take to get from stop `source` to stop `target`, or `-1` if you cannot.',
    py: 'num_buses', js: 'numBuses', params: 'routes: list[list[int]], source: int, target: int', jsParams: 'routes, source, target', ret: 'int',
    tests: [t('change once', [[[1, 2, 7], [3, 6, 7]], 1, 6], 2), t('unreachable', [[[7, 12], [4, 5, 15], [6], [15, 19], [9, 12, 13]], 15, 12], -1), t('already there', [[[1, 2]], 1, 1], 0), t('a chain', [[[1, 2], [2, 3], [3, 4]], 1, 4], 3)],
    hints: ['BFS over buses, not stops: one level = one more bus.', 'Map each stop to the buses that serve it, and mark each bus used once.'] }),

  fn(BT, { slug: 'word-search', title: 'Word Search', difficulty: 'medium', summary: 'Can a word be traced through neighbouring letters of a grid?',
    scenario: '`board` is a list of strings. Return `true` if `word` can be spelled by moving between neighbouring cells (up, down, left, right), using each cell at most once.',
    py: 'exist', js: 'exist', params: 'board: list[str], word: str', jsParams: 'board, word', ret: 'bool',
    tests: [t('winding path', [BOARD, 'ABCCED'], true), t('short', [BOARD, 'SEE'], true), t('reuses a cell', [BOARD, 'ABCB'], false), t('one letter', [['A'], 'A'], true)],
    hints: ['Try every starting cell; DFS letter by letter.', 'Mark a cell used while it is on the path, and unmark it when you back out.'] }),
  fn(BT, { slug: 'generate-parentheses', title: 'Generate Parentheses', difficulty: 'medium', summary: 'Every valid arrangement of n pairs of brackets.',
    scenario: 'Return every valid string of `n` pairs of `(` and `)`, sorted.',
    py: 'generate', js: 'generate', params: 'n: int', jsParams: 'n', ret: 'list[str]',
    tests: [t('three pairs', [3], ['((()))', '(()())', '(())()', '()(())', '()()()']), t('one pair', [1], ['()']), t('two pairs', [2], ['(())', '()()'])],
    hints: ['Add "(" while you have some left; add ")" only while it would not close more than you opened.'] }),
  fn(BT, { slug: 'combination-sum', title: 'Combination Sum', difficulty: 'medium', summary: 'Every way to reach a target, reusing numbers as often as you like.',
    scenario: '`candidates` are distinct positive numbers. Return every combination (each number may be used any number of times) that sums to `target`. Each combination is ascending and the list is sorted.',
    py: 'combination_sum', js: 'combinationSum', params: 'candidates: list[int], target: int', jsParams: 'candidates, target', ret: 'list[list[int]]',
    tests: [t('two ways', [[2, 3, 6, 7], 7], [[2, 2, 3], [7]]), t('three ways', [[2, 3, 5], 8], [[2, 2, 2, 2], [2, 3, 3], [3, 5]]), t('impossible', [[2], 1], []), t('repeat one', [[1], 2], [[1, 1]])],
    hints: ['Sort, then recurse with a start index so each combination is built in one order.', 'Stay on the same index to reuse a number; stop once the sum passes the target.'] }),
  fn(BT, { slug: 'palindrome-partitioning', title: 'Palindrome Partitioning', difficulty: 'medium', summary: 'Every way to cut a string into palindromes.',
    scenario: 'Return every way to split `s` into pieces that are all palindromes. Each split is a list of pieces in order; the list of splits is sorted.',
    py: 'partitions', js: 'partitions', params: 's: str', jsParams: 's', ret: 'list[list[str]]',
    tests: [t('two ways', ['aab'], [['a', 'a', 'b'], ['aa', 'b']]), t('single letter', ['a'], [['a']]), t('whole word', ['aba'], [['a', 'b', 'a'], ['aba']])],
    hints: ['Choose the first piece (any palindromic prefix), then recurse on the rest.'] }),
];
