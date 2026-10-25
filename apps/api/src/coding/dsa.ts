import { TOPICS_A } from './dsa-a';
import { TOPICS_B } from './dsa-b';
import { PROBLEMS_C } from './dsa-c';
import { PROBLEMS_D } from './dsa-d';
import { PROBLEMS_E } from './dsa-e';
import type { Topic } from './dsa-kit';

/** Each section's problems, in the order the catalog lists them (easier and core problems first). */
const ORDER: Record<string, string[]> = {
  'two-pointers': ['container-with-most-water', 'two-sum-sorted', 'three-sum', 'triangle-numbers', 'move-zeroes', 'sort-colors', 'trapping-rain-water'],
  'sliding-window': ['max-sum-subarray-size-k', 'max-points-from-cards', 'max-sum-distinct-subarrays', 'longest-substring-without-repeats', 'longest-repeating-replacement'],
  intervals: ['can-attend-meetings', 'insert-interval', 'non-overlapping-intervals', 'merge-intervals', 'employee-free-time'],
  stack: ['valid-parentheses', 'decode-string', 'longest-valid-parentheses', 'daily-temperatures', 'largest-rectangle-histogram'],
  'linked-list': ['linked-list-cycle', 'palindrome-linked-list', 'remove-nth-from-end', 'reorder-list', 'swap-nodes-in-pairs'],
  'binary-search': ['koko-eating-bananas', 'search-rotated-sorted-array', 'split-array-largest-sum', 'kth-smallest-sorted-matrix', 'minimum-shipping-capacity'],
  heap: ['kth-largest-element', 'k-closest-points', 'find-k-closest-elements', 'merge-k-sorted-lists', 'median-from-data-stream'],
  'depth-first-search': ['max-depth-binary-tree', 'path-sum', 'validate-bst', 'binary-tree-tilt', 'diameter-of-binary-tree', 'path-sum-ii', 'longest-univalue-path', 'clone-graph', 'graph-valid-tree', 'flood-fill', 'number-of-islands', 'surrounded-regions', 'pacific-atlantic-water-flow'],
  'breadth-first-search': ['level-order-sum', 'rightmost-node', 'zigzag-level-order', 'maximum-width-binary-tree', 'minimum-knight-moves', 'rotting-oranges', 'zero-one-matrix', 'bus-routes'],
  backtracking: ['word-search', 'subsets', 'generate-parentheses', 'combination-sum', 'palindrome-partitioning', 'n-queens'],
  graphs: ['course-schedule', 'course-schedule-ii', 'shortest-path-weighted', 'network-delay-time', 'cheapest-flights-k-stops', 'path-with-minimum-effort', 'find-the-city'],
  'dynamic-programming': ['counting-bits', 'decode-ways', 'unique-paths', 'maximal-square', 'longest-increasing-subsequence', 'word-break', 'job-scheduling', 'paint-house', 'paint-house-ii', 'minimum-window-subsequence'],
  greedy: ['best-time-to-buy-sell-stock', 'gas-station', 'jump-game', 'jump-game-ii', 'partition-labels'],
  trie: ['implement-trie', 'prefix-matching'],
  'prefix-sum': ['count-vowels-in-substrings', 'subarray-sum-equals-k'],
  matrices: ['spiral-matrix', 'rotate-image', 'set-matrix-zeroes'],
};

const all = [...TOPICS_A, ...TOPICS_B].flatMap((t) => t.problems).concat(PROBLEMS_C, PROBLEMS_D, PROBLEMS_E);
const bySlug = new Map(all.map((p) => [p.slug, p]));

/** Coding practice: sixteen sections, each an overview lesson plus its problems (all original content). */
export const SECTIONS: Topic[] = [...TOPICS_A, ...TOPICS_B].map((t) => ({
  ...t,
  problems: ORDER[t.slug].map((slug) => { const p = bySlug.get(slug); if (!p) throw new Error(`Unknown problem ${slug}`); return p; }),
}));
export const PROBLEMS = SECTIONS.flatMap((s) => s.problems);
