import type { Problem } from './problems';
import { BS, custom, fn, HP, IV, LIST_JS, LIST_PY, LL, ST, SW, t, TP } from './dsa-kit';

/** More problems for Two Pointers, Sliding Window, Intervals, Stack, Linked List, Binary Search and Heap. */
export const PROBLEMS_C: Problem[] = [
  fn(TP, { slug: 'triangle-numbers', title: 'Triangle Numbers', difficulty: 'medium', summary: 'Count the triples that could be the sides of a triangle.',
    scenario: 'Return how many triples of positions `i < j < k` in `nums` give lengths that form a triangle: the two shorter sides must add up to **more** than the longest.',
    py: 'triangle_count', js: 'triangleCount', params: 'nums: list[int]', jsParams: 'nums', ret: 'int',
    tests: [t('four sticks', [[2, 2, 3, 4]], 3), t('repeated side', [[4, 2, 3, 4]], 4), t('equilateral', [[1, 1, 1]], 1), t('zero length', [[0, 1, 1]], 0), t('empty', [[]], 0)],
    hints: ['Sort first, then fix the longest side.', 'If nums[l] + nums[r] beats the longest side, every index between l and r works with r too.'] }),
  fn(TP, { slug: 'move-zeroes', title: 'Move Zeroes', difficulty: 'easy', summary: 'Push every zero to the end and keep the order of the rest.',
    scenario: 'Move all `0`s in `nums` to the end while keeping the other values in their original order. Do it in place and return `nums`.',
    py: 'move_zeroes', js: 'moveZeroes', params: 'nums: list[int]', jsParams: 'nums', ret: 'list[int]',
    tests: [t('mixed', [[0, 1, 0, 3, 12]], [1, 3, 12, 0, 0]), t('only zero', [[0]], [0]), t('no zeros', [[1, 2]], [1, 2]), t('zeros first', [[0, 0, 1]], [1, 0, 0])],
    hints: ['A slow pointer marks where the next non-zero value goes.'] }),
  fn(TP, { slug: 'sort-colors', title: 'Sort Colors', difficulty: 'medium', summary: 'Sort a list of 0s, 1s and 2s in one pass.',
    scenario: '`nums` holds only `0`, `1` and `2`. Sort it in place in a single pass without a library sort, and return it.',
    py: 'sort_colors', js: 'sortColors', params: 'nums: list[int]', jsParams: 'nums', ret: 'list[int]',
    tests: [t('mixed', [[2, 0, 2, 1, 1, 0]], [0, 0, 1, 1, 2, 2]), t('one of each', [[2, 0, 1]], [0, 1, 2]), t('single', [[1]], [1]), t('empty', [[]], [])],
    hints: ['Three pointers: the end of the 0s, the current item, the start of the 2s.', 'After swapping a 2 to the back, do not advance the current pointer.'] }),
  fn(TP, { slug: 'trapping-rain-water', title: 'Trapping Rain Water', difficulty: 'hard', summary: 'How much rain collects between bars of different heights?',
    scenario: '`heights[i]` is the height of a bar of width 1. After rain, water sits above a bar up to the lower of the tallest bar on its left and the tallest on its right. Return the total water held.',
    py: 'trap', js: 'trap', params: 'heights: list[int]', jsParams: 'heights', ret: 'int',
    tests: [t('classic', [[0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]], 6), t('deep pool', [[4, 2, 0, 3, 2, 5]], 9), t('empty', [[]], 0), t('one dip', [[3, 0, 3]], 3), t('rising', [[1, 2, 3]], 0)],
    hints: ['Water above i = min(max left, max right) - heights[i].', 'With two pointers, move the side whose running maximum is lower: that side\'s limit is already known.'] }),

  fn(SW, { slug: 'max-points-from-cards', title: 'Max Points You Can Obtain From Cards', difficulty: 'medium', summary: 'Take k cards from either end to maximise your score.',
    scenario: 'Cards are in a row with points `cards[i]`. Take exactly `k` cards, each time from the left end or the right end. Return the highest total you can get.',
    py: 'max_score', js: 'maxScore', params: 'cards: list[int], k: int', jsParams: 'cards, k', ret: 'int',
    tests: [t('take from the right', [[1, 2, 3, 4, 5, 6, 1], 3], 12), t('all equal', [[2, 2, 2], 2], 4), t('take everything', [[9, 7, 7, 9, 7, 7, 9], 7], 55), t('one card', [[1, 1000, 1], 1], 1), t('mix both ends', [[1, 79, 80, 1, 1, 1, 200, 1], 3], 202)],
    hints: ['The cards you leave behind form one contiguous window of n - k cards.', 'Minimise that window\'s sum, or slide a k-card window around the two ends.'] }),
  fn(SW, { slug: 'max-sum-distinct-subarrays', title: 'Max Sum of Distinct Subarrays Length k', difficulty: 'medium', summary: 'Best sum of k consecutive values that are all different.',
    scenario: 'Return the largest sum of any `k` consecutive values of `nums` in which no value repeats, or `0` if there is none.',
    py: 'max_distinct_sum', js: 'maxDistinctSum', params: 'nums: list[int], k: int', jsParams: 'nums, k', ret: 'int',
    tests: [t('skip windows with repeats', [[1, 5, 4, 2, 9, 9, 9], 3], 15), t('never distinct', [[4, 4, 4], 3], 0), t('pairs', [[1, 2, 1, 3], 2], 4), t('single', [[5], 1], 5)],
    hints: ['Keep a count per value inside the window.', 'The window is valid when the number of distinct values equals k.'] }),

  fn(IV, { slug: 'non-overlapping-intervals', title: 'Non-Overlapping Intervals', difficulty: 'medium', summary: 'Fewest intervals to remove so the rest do not overlap.',
    scenario: 'Return the minimum number of intervals to remove from `intervals` so that the remaining ones do not overlap. Intervals that only touch (`[1, 2]` and `[2, 3]`) do not overlap.',
    py: 'min_removals', js: 'minRemovals', params: 'intervals: list[list[int]]', jsParams: 'intervals', ret: 'int',
    tests: [t('one long interval', [[[1, 2], [2, 3], [3, 4], [1, 3]]], 1), t('three copies', [[[1, 2], [1, 2], [1, 2]]], 2), t('touching', [[[1, 2], [2, 3]]], 0), t('empty', [[]], 0)],
    hints: ['Sort by end time.', 'Keep an interval when it starts at or after the last kept end; otherwise remove it.'] }),
  fn(IV, { slug: 'employee-free-time', title: 'Employee Free Time', difficulty: 'hard', summary: 'Find the gaps when every employee is free.',
    scenario: '`schedules[e]` is employee `e`\'s busy intervals, sorted and non-overlapping. Return the finite intervals of positive length when **everyone** is free, sorted by start.',
    py: 'free_time', js: 'freeTime', params: 'schedules: list[list[list[int]]]', jsParams: 'schedules', ret: 'list[list[int]]',
    tests: [t('one gap', [[[[1, 2], [5, 6]], [[1, 3]], [[4, 10]]]], [[3, 4]]), t('two gaps', [[[[1, 3], [6, 7]], [[2, 4]], [[2, 5], [9, 12]]]], [[5, 6], [7, 9]]), t('always busy', [[[[1, 5]], [[2, 3]]]], []), t('between people', [[[[1, 2]], [[3, 4]]]], [[2, 3]])],
    hints: ['Flatten everyone\'s intervals and merge them.', 'The gaps between merged blocks are the free time.'] }),

  fn(ST, { slug: 'longest-valid-parentheses', title: 'Longest Valid Parentheses', difficulty: 'hard', summary: 'Length of the longest well-formed run of brackets.',
    scenario: '`s` contains only `(` and `)`. Return the length of the longest contiguous substring that is a valid, fully matched bracket sequence.',
    py: 'longest_valid', js: 'longestValid', params: 's: str', jsParams: 's', ret: 'int',
    tests: [t('trailing pair', ['(()'], 2), t('middle run', [')()())'], 4), t('empty', [''], 0), t('nested and side by side', ['()(())'], 6), t('open at the end', ['(()('], 2), t('reversed', [')('], 0)],
    hints: ['Push indexes. Start the stack with -1 as the base of the current valid run.', 'On ")", pop; if the stack is empty push this index as the new base, else the run length is i - top.'] }),
  fn(ST, { slug: 'largest-rectangle-histogram', title: 'Largest Rectangle in Histogram', difficulty: 'hard', summary: 'Biggest rectangle that fits under a bar chart.',
    scenario: 'Bars of width 1 have heights `heights`. Return the area of the largest rectangle that fits entirely under the bars.',
    py: 'largest_rectangle', js: 'largestRectangle', params: 'heights: list[int]', jsParams: 'heights', ret: 'int',
    tests: [t('classic', [[2, 1, 5, 6, 2, 3]], 10), t('two bars', [[2, 4]], 4), t('empty', [[]], 0), t('flat', [[3, 3, 3]], 9), t('single', [[1]], 1)],
    hints: ['Keep a stack of indexes with increasing heights.', 'When a lower bar arrives, pop: the popped bar\'s rectangle spans from the new top + 1 to i - 1.'] }),

  custom(LL, { slug: 'palindrome-linked-list', title: 'Palindrome Linked List', difficulty: 'easy', summary: 'Does a linked list read the same both ways?',
    scenario: 'Implement `is_palindrome(head)` / `isPalindrome(head)`: return `true` if the values read the same forwards and backwards. Try for `O(1)` extra space.',
    kind: 'function', entry: { python: 'solve', javascript: 'solve' },
    starter: {
      python: `${LIST_PY}

def is_palindrome(head):
    # your code here
    return False


# test glue: leave as is
def solve(values):
    return is_palindrome(build(values))
`,
      javascript: `${LIST_JS}
function isPalindrome(head) {
  // your code here
  return false;
}

// test glue: leave as is
function solve(values) {
  return isPalindrome(build(values));
}
`,
    },
    tests: [t('even', [[1, 2, 2, 1]], true), t('not one', [[1, 2]], false), t('empty', [[]], true), t('single', [[1]], true), t('odd', [[1, 2, 1]], true)],
    hints: ['Find the middle with slow and fast pointers.', 'Reverse the second half, then compare it with the first half.'] }),
  custom(LL, { slug: 'reorder-list', title: 'Reorder List', difficulty: 'medium', summary: 'Interleave a list with its own reverse: first, last, second, second-last…',
    scenario: 'Implement `reorder_list(head)` / `reorderList(head)`: change `L0 → L1 → … → Ln` into `L0 → Ln → L1 → Ln-1 → …` **in place** by re-wiring nodes. It returns nothing.',
    kind: 'function', entry: { python: 'solve', javascript: 'solve' },
    starter: {
      python: `${LIST_PY}

def reorder_list(head):
    # your code here
    pass


# test glue: leave as is
def solve(values):
    head = build(values)
    reorder_list(head)
    return to_list(head)
`,
      javascript: `${LIST_JS}
function reorderList(head) {
  // your code here
}

// test glue: leave as is
function solve(values) {
  const head = build(values);
  reorderList(head);
  return toList(head);
}
`,
    },
    tests: [t('even', [[1, 2, 3, 4]], [1, 4, 2, 3]), t('odd', [[1, 2, 3, 4, 5]], [1, 5, 2, 4, 3]), t('single', [[1]], [1]), t('empty', [[]], []), t('two', [[1, 2]], [1, 2])],
    hints: ['Three steps: find the middle, reverse the second half, merge the two halves alternately.'] }),
  custom(LL, { slug: 'swap-nodes-in-pairs', title: 'Swap Nodes in Pairs', difficulty: 'medium', summary: 'Swap every two adjacent nodes.',
    scenario: 'Implement `swap_pairs(head)` / `swapPairs(head)`: swap every two adjacent nodes and return the new head. Re-wire nodes; do not just swap values.',
    kind: 'function', entry: { python: 'solve', javascript: 'solve' },
    starter: {
      python: `${LIST_PY}

def swap_pairs(head):
    # your code here
    return head


# test glue: leave as is
def solve(values):
    return to_list(swap_pairs(build(values)))
`,
      javascript: `${LIST_JS}
function swapPairs(head) {
  // your code here
  return head;
}

// test glue: leave as is
function solve(values) {
  return toList(swapPairs(build(values)));
}
`,
    },
    tests: [t('four nodes', [[1, 2, 3, 4]], [2, 1, 4, 3]), t('empty', [[]], []), t('one node', [[1]], [1]), t('odd count', [[1, 2, 3]], [2, 1, 3])],
    hints: ['A dummy node before the head makes every swap look the same.'] }),

  fn(BS, { slug: 'split-array-largest-sum', title: 'Split Array Largest Sum', difficulty: 'hard', summary: 'Split a list into k parts so the biggest part is as small as possible.',
    scenario: 'Split `nums` into `k` non-empty contiguous parts. Return the smallest possible value of the largest part\'s sum.',
    py: 'split_array', js: 'splitArray', params: 'nums: list[int], k: int', jsParams: 'nums, k', ret: 'int',
    tests: [t('two parts', [[7, 2, 5, 10, 8], 2], 18), t('ascending', [[1, 2, 3, 4, 5], 2], 9), t('one each', [[1, 4, 4], 3], 4), t('single', [[5], 1], 5)],
    hints: ['Binary-search the answer between max(nums) and sum(nums).', 'For a limit, greedily count how many parts you need.'] }),
  fn(BS, { slug: 'kth-smallest-sorted-matrix', title: 'Kth Smallest Element in a Sorted Matrix', difficulty: 'medium', summary: 'Find the k-th smallest value in a matrix sorted by rows and columns.',
    scenario: 'Every row and every column of the square `matrix` is sorted ascending. Return the `k`-th smallest value (counting duplicates).',
    py: 'kth_smallest', js: 'kthSmallest', params: 'matrix: list[list[int]], k: int', jsParams: 'matrix, k', ret: 'int',
    tests: [t('three by three', [[[1, 5, 9], [10, 11, 13], [12, 13, 15]], 8], 13), t('single', [[[-5]], 1], -5), t('duplicates', [[[1, 2], [1, 3]], 2], 1), t('largest', [[[1, 2], [1, 3]], 4], 3)],
    hints: ['Binary-search the value: count how many entries are <= mid by walking from the bottom-left corner.'] }),
  fn(BS, { slug: 'minimum-shipping-capacity', title: 'Minimum Shipping Capacity', difficulty: 'medium', summary: 'Smallest ship that delivers every package, in order, within the days.',
    scenario: 'Packages with weights `weights` must ship in the given order. Each day the ship takes packages from the front until the next one would exceed its capacity. Return the smallest capacity that ships everything within `days` days.',
    py: 'ship_capacity', js: 'shipCapacity', params: 'weights: list[int], days: int', jsParams: 'weights, days', ret: 'int',
    tests: [t('ten packages', [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5], 15), t('three days', [[3, 2, 2, 4, 1, 4], 3], 6), t('four days', [[1, 2, 3, 1, 1], 4], 3), t('one package', [[10], 1], 10)],
    hints: ['The capacity is at least the heaviest package and at most the total.', 'Binary-search it, counting the days each candidate needs.'] }),

  fn(HP, { slug: 'find-k-closest-elements', title: 'Find K Closest Elements', difficulty: 'medium', summary: 'The k values in a sorted list closest to x.',
    scenario: '`arr` is sorted. Return the `k` values closest to `x`, sorted ascending. On a tie in distance, the smaller value wins.',
    py: 'closest_elements', js: 'closestElements', params: 'arr: list[int], k: int, x: int', jsParams: 'arr, k, x', ret: 'list[int]',
    tests: [t('x inside', [[1, 2, 3, 4, 5], 4, 3], [1, 2, 3, 4]), t('x below', [[1, 2, 3, 4, 5], 4, -1], [1, 2, 3, 4]), t('duplicates', [[1, 1, 2, 3, 4, 5], 4, -1], [1, 1, 2, 3]), t('tie', [[1, 3], 1, 2], [1]), t('tie far apart', [[1, 10, 15, 25, 35, 45, 50, 59], 1, 30], [25])],
    hints: ['A max-heap of size k keyed on (distance, value) works.', 'Faster: binary-search the left edge of the k-wide window.'] }),
  custom(HP, { slug: 'median-from-data-stream', title: 'Median from Data Stream', difficulty: 'hard', summary: 'Keep the running median while numbers arrive.',
    scenario: 'Implement a class `MedianFinder` with `add(num)` and `median()`. The median of an even count is the average of the two middle values. Aim for `O(log n)` per add.',
    kind: 'class', entry: { python: 'MedianFinder', javascript: 'MedianFinder' },
    starter: {
      python: 'class MedianFinder:\n    def __init__(self):\n        pass\n\n    def add(self, num: int) -> None:\n        pass\n\n    def median(self) -> float:\n        pass\n',
      javascript: 'class MedianFinder {\n  constructor() {}\n\n  add(num) {}\n\n  median() {}\n}\n',
    },
    tests: [
      { name: 'three numbers', ops: [['new', []], ['add', [1]], ['add', [2]], ['median', [], 1.5], ['add', [3]], ['median', [], 2]] },
      { name: 'unsorted arrivals', ops: [['new', []], ['add', [5]], ['median', [], 5], ['add', [15]], ['median', [], 10], ['add', [1]], ['median', [], 5], ['add', [3]], ['median', [], 4]] },
    ],
    hints: ['Two heaps: a max-heap for the lower half and a min-heap for the upper half.', 'Keep their sizes equal or the lower half one bigger.'] }),
];
