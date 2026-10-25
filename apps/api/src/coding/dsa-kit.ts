import type { Lang, Problem, TestCase } from './problems';

/** A coding practice section: an overview lesson, a reusable template and its problems. */
export interface Topic {
  slug: string; title: string; summary: string;
  /** Markdown: when to reach for the pattern and how it works */
  lesson: string;
  template: Record<Lang, string>;
  complexity: string;
  pitfalls: string[];
  problems: Problem[];
}

/** The sections, in the order the catalog shows them. */
export const TP = { slug: 'two-pointers', title: 'Two Pointers' };
export const SW = { slug: 'sliding-window', title: 'Sliding Window' };
export const IV = { slug: 'intervals', title: 'Intervals' };
export const ST = { slug: 'stack', title: 'Stack' };
export const LL = { slug: 'linked-list', title: 'Linked List' };
export const BS = { slug: 'binary-search', title: 'Binary Search' };
export const HP = { slug: 'heap', title: 'Heap' };
export const DF = { slug: 'depth-first-search', title: 'Depth-First Search' };
export const BF = { slug: 'breadth-first-search', title: 'Breadth-First Search' };
export const BT = { slug: 'backtracking', title: 'Backtracking' };
export const GR = { slug: 'graphs', title: 'Graphs' };
export const DP = { slug: 'dynamic-programming', title: 'Dynamic Programming' };
export const GD = { slug: 'greedy', title: 'Greedy' };
export const TR = { slug: 'trie', title: 'Trie' };
export const PS = { slug: 'prefix-sum', title: 'Prefix Sum' };
export const MX = { slug: 'matrices', title: 'Matrices' };

export const t = (name: string, args: unknown[], expected: unknown): TestCase => ({ name, args, expected });
const MINUTES = { easy: 15, medium: 25, hard: 40 } as const;

interface Base { slug: string; title: string; difficulty: Problem['difficulty']; summary: string; scenario: string; hints: string[] }

/** A function problem whose starter code is generated from its signature. */
export function fn(topic: { slug: string; title: string }, o: Base & { py: string; js: string; params: string; jsParams: string; ret: string; tests: TestCase[] }): Problem {
  return {
    slug: o.slug, title: o.title, pattern: topic.title, topic: topic.slug, difficulty: o.difficulty, minutes: MINUTES[o.difficulty], summary: o.summary,
    scenario: o.scenario, kind: 'function', entry: { python: o.py, javascript: o.js },
    starter: {
      python: `def ${o.py}(${o.params}) -> ${o.ret}:\n    # your code here\n    pass\n`,
      javascript: `function ${o.js}(${o.jsParams}) {\n  // your code here\n}\n`,
    },
    stages: [{ title: o.title, brief: o.summary, tests: o.tests }], hints: o.hints, aiTips: [],
  };
}

/** A problem with hand-written starters (classes, or helpers such as list / tree builders). */
export function custom(topic: { slug: string; title: string }, o: Base & { kind: Problem['kind']; entry: Record<Lang, string>; starter: Record<Lang, string>; tests: TestCase[] }): Problem {
  return {
    slug: o.slug, title: o.title, pattern: topic.title, topic: topic.slug, difficulty: o.difficulty, minutes: MINUTES[o.difficulty], summary: o.summary,
    scenario: o.scenario, kind: o.kind, entry: o.entry, starter: o.starter, stages: [{ title: o.title, brief: o.summary, tests: o.tests }], hints: o.hints, aiTips: [],
  };
}

/** Starter glue for linked-list problems: tests pass plain lists; the glue builds nodes and reads the answer back. */
export const LIST_PY = `class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


def build(values):
    head = None
    for v in reversed(values):
        head = ListNode(v, head)
    return head


def to_list(head):
    out = []
    while head:
        out.append(head.val)
        head = head.next
    return out
`;
export const LIST_JS = `class ListNode {
  constructor(val = 0, next = null) {
    this.val = val;
    this.next = next;
  }
}

function build(values) {
  let head = null;
  for (let i = values.length - 1; i >= 0; i--) head = new ListNode(values[i], head);
  return head;
}

function toList(head) {
  const out = [];
  for (; head; head = head.next) out.push(head.val);
  return out;
}
`;

/** Starter glue for binary-tree problems: tests pass level-order lists with null for missing children. */
export const TREE_PY = `class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


def build(values):
    """Level-order list (None = no child) -> root."""
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue, i = [root], 1
    while queue and i < len(values):
        node = queue.pop(0)
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            queue.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            queue.append(node.right)
        i += 1
    return root
`;
export const TREE_JS = `class TreeNode {
  constructor(val = 0, left = null, right = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }
}

// level-order array (null = no child) -> root
function build(values) {
  if (!values.length || values[0] === null) return null;
  const root = new TreeNode(values[0]);
  const queue = [root];
  let i = 1;
  while (queue.length && i < values.length) {
    const node = queue.shift();
    if (i < values.length && values[i] !== null) queue.push((node.left = new TreeNode(values[i])));
    i++;
    if (i < values.length && values[i] !== null) queue.push((node.right = new TreeNode(values[i])));
    i++;
  }
  return root;
}
`;

/** A binary-tree problem: the user writes one function taking the root (plus `extra` params); the glue builds the tree. */
export function tree(topic: { slug: string; title: string }, o: Base & { py: string; js: string; extra?: string; empty: [python: string, javascript: string]; tests: TestCase[] }): Problem {
  const x = o.extra ? `, ${o.extra}` : '';
  return custom(topic, {
    ...o, kind: 'function', entry: { python: 'solve', javascript: 'solve' },
    starter: {
      python: `${TREE_PY}\n\ndef ${o.py}(root${x}):\n    # your code here\n    return ${o.empty[0]}\n\n\n# test glue: leave as is\ndef solve(values${x}):\n    return ${o.py}(build(values)${x})\n`,
      javascript: `${TREE_JS}\nfunction ${o.js}(root${x}) {\n  // your code here\n  return ${o.empty[1]};\n}\n\n// test glue: leave as is\nfunction solve(values${x}) {\n  return ${o.js}(build(values)${x});\n}\n`,
    },
  });
}
