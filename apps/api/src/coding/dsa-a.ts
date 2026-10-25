import { BS, custom, DF, fn, HP, IV, LIST_JS, LIST_PY, LL, ST, SW, t, Topic, TP, TREE_JS, TREE_PY } from './dsa-kit';

export const TOPICS_A: Topic[] = [
  {
    ...TP, summary: 'Walk two indexes through a sequence so each step rules out a whole group of answers.',
    lesson: `**Reach for it when** the input is a sorted array (or a string) and you are looking for a pair, a triple or a partition that satisfies a condition.

**How it works.** Put one pointer at each end. Look at the pair they point to: if it is too small, only moving the left pointer can make it bigger; if it is too large, only moving the right pointer can make it smaller. Every move discards every pair that uses the abandoned element, so one pass of \`O(n)\` steps checks what a double loop checks in \`O(n²)\`.

A second shape uses two pointers moving in the **same direction**: a slow pointer marks where the next kept element goes, a fast pointer scans. That is how you compact, de-duplicate or partition an array in place.

**Sorting first** is often what makes the trick possible: \`O(n log n)\` to sort, then a linear sweep.`,
    template: {
      python: 'def pair_with_sum(nums, target):\n    left, right = 0, len(nums) - 1\n    while left < right:\n        s = nums[left] + nums[right]\n        if s == target:\n            return [left, right]\n        if s < target:\n            left += 1   # need a bigger sum\n        else:\n            right -= 1  # need a smaller sum\n    return []\n',
      javascript: 'function pairWithSum(nums, target) {\n  let left = 0, right = nums.length - 1;\n  while (left < right) {\n    const s = nums[left] + nums[right];\n    if (s === target) return [left, right];\n    if (s < target) left++;  // need a bigger sum\n    else right--;            // need a smaller sum\n  }\n  return [];\n}\n',
    },
    complexity: 'O(n) time after sorting (O(n log n) if you sort), O(1) extra space.',
    pitfalls: ['Forgetting the input must be sorted for the converging version.', 'Using left <= right and pairing an element with itself.', 'Not skipping equal neighbours when the answer must not contain duplicates.'],
    problems: [
      fn(TP, { slug: 'two-sum-sorted', title: 'Two Sum (Sorted Array)', difficulty: 'medium', summary: 'Find the two positions in a sorted list whose values add up to a target.',
        scenario: '`nums` is sorted ascending. Return the indexes `[i, j]` (with `i < j`) of the two numbers that add up to `target`, or `[]` if no pair does. There is at most one answer.',
        py: 'pair_with_sum', js: 'pairWithSum', params: 'nums: list[int], target: int', jsParams: 'nums, target', ret: 'list[int]',
        tests: [t('middle pair', [[1, 2, 4, 7, 11], 9], [1, 3]), t('with negatives', [[-3, 0, 2, 5], 5], [1, 3]), t('no pair', [[1, 3, 5], 10], []), t('equal values', [[2, 2], 4], [0, 1])],
        hints: ['Start one pointer at each end of the list.', 'If the sum is too small, which pointer can make it bigger?'] }),
      fn(TP, { slug: 'container-with-most-water', title: 'Container With Most Water', difficulty: 'medium', summary: 'Pick two walls that hold the most water between them.',
        scenario: '`heights[i]` is the height of a wall at position `i`. Two walls and the ground form a container; it holds `min(h1, h2) × distance` units. Return the most water any pair of walls can hold.',
        py: 'max_water', js: 'maxWater', params: 'heights: list[int]', jsParams: 'heights', ret: 'int',
        tests: [t('classic', [[1, 8, 6, 2, 5, 4, 8, 3, 7]], 49), t('two walls', [[1, 1]], 1), t('far apart', [[4, 3, 2, 1, 4]], 16), t('small middle', [[1, 2, 1]], 2)],
        hints: ['Start with the widest container.', 'Moving the taller wall inward can never help: move the shorter one.'] }),
      fn(TP, { slug: 'three-sum', title: '3-Sum', difficulty: 'medium', summary: 'List every distinct triple of numbers that sums to zero.',
        scenario: 'Return every distinct triple `[a, b, c]` from `nums` (different positions) with `a + b + c == 0`. Each triple is sorted ascending and the list of triples is sorted too; no duplicate triples.',
        py: 'zero_triplets', js: 'zeroTriplets', params: 'nums: list[int]', jsParams: 'nums', ret: 'list[list[int]]',
        tests: [t('two triples', [[-1, 0, 1, 2, -1, -4]], [[-1, -1, 2], [-1, 0, 1]]), t('all zeros', [[0, 0, 0, 0]], [[0, 0, 0]]), t('none', [[1, 2, -2, -1]], []), t('shared first value', [[-2, 0, 1, 1, 2]], [[-2, 0, 2], [-2, 1, 1]])],
        hints: ['Sort, fix the first number, then run Two Sum (Sorted Array) on the rest.', 'Skip a value equal to the one before it to avoid duplicate triples.'] }),
    ],
  },
  {
    ...SW, summary: 'Keep a window over a contiguous range and slide it instead of recomputing every range.',
    lesson: `**Reach for it when** the question is about a **contiguous** subarray or substring: the longest, shortest or best one that satisfies a rule.

**Fixed size.** For windows of exactly \`k\` items, add the item entering on the right and remove the one leaving on the left. Each step is \`O(1)\`, so all \`n - k + 1\` windows cost \`O(n)\`.

**Variable size.** Grow the window by moving the right edge. When the window breaks the rule (a repeated letter, a sum over budget), shrink it from the left until it is valid again, then record the answer. Both edges only move forward, so the total work is \`O(n)\`.

Keep whatever summary the rule needs (a running sum, a count per character) and update it as items enter and leave.`,
    template: {
      python: 'def longest_valid(s):\n    seen = {}            # what the window contains\n    left = best = 0\n    for right, ch in enumerate(s):\n        seen[ch] = seen.get(ch, 0) + 1\n        while seen[ch] > 1:  # rule broken: shrink\n            seen[s[left]] -= 1\n            left += 1\n        best = max(best, right - left + 1)\n    return best\n',
      javascript: 'function longestValid(s) {\n  const seen = new Map(); // what the window contains\n  let left = 0, best = 0;\n  for (let right = 0; right < s.length; right++) {\n    const ch = s[right];\n    seen.set(ch, (seen.get(ch) ?? 0) + 1);\n    while (seen.get(ch) > 1) { // rule broken: shrink\n      seen.set(s[left], seen.get(s[left]) - 1);\n      left++;\n    }\n    best = Math.max(best, right - left + 1);\n  }\n  return best;\n}\n',
    },
    complexity: 'O(n) time: each element enters and leaves the window once. Extra space is the size of the window summary.',
    pitfalls: ['Recomputing the window sum from scratch each step (back to O(n·k)).', 'Recording the answer before the window is valid again.', 'Off-by-one in the window length (right - left + 1).'],
    problems: [
      fn(SW, { slug: 'max-sum-subarray-size-k', title: 'Maximum Sum of Subarrays of Size K', difficulty: 'easy', summary: 'Find the highest total over any k consecutive days.',
        scenario: '`revenue[i]` is the revenue of day `i`. Return the largest sum of any `k` consecutive days (`1 <= k <= len(revenue)`).',
        py: 'max_window_sum', js: 'maxWindowSum', params: 'revenue: list[int], k: int', jsParams: 'revenue, k', ret: 'int',
        tests: [t('three days', [[2, 1, 5, 1, 3, 2], 3], 9), t('single day', [[5], 1], 5), t('all losses', [[-1, -2, -3], 2], -3), t('whole list', [[4, 4, 4, 4], 4], 16)],
        hints: ['Compute the first window, then slide: add the new day, subtract the day that left.'] }),
      fn(SW, { slug: 'longest-substring-without-repeats', title: 'Longest Substring Without Repeating Characters', difficulty: 'medium', summary: 'Length of the longest substring with no repeated character.',
        scenario: 'Return the length of the longest contiguous substring of `s` in which no character appears twice.',
        py: 'longest_unique', js: 'longestUnique', params: 's: str', jsParams: 's', ret: 'int',
        tests: [t('repeating block', ['abcabcbb'], 3), t('one letter', ['bbbbb'], 1), t('middle run', ['pwwkew'], 3), t('empty', [''], 0), t('jump back', ['dvdf'], 3)],
        hints: ['Grow the window to the right; when a letter repeats, move the left edge past its earlier copy.'] }),
      fn(SW, { slug: 'longest-repeating-replacement', title: 'Longest Repeating Character Replacement', difficulty: 'medium', summary: 'Longest run of one letter if you may change up to k letters.',
        scenario: 'You may replace at most `k` characters of `s` with any letter. Return the length of the longest substring that can be made of a single repeated letter.',
        py: 'longest_with_edits', js: 'longestWithEdits', params: 's: str, k: int', jsParams: 's, k', ret: 'int',
        tests: [t('two edits', ['ABAB', 2], 4), t('one edit', ['AABABBA', 1], 4), t('no edits needed', ['AAAA', 0], 4), t('all different', ['ABCDE', 1], 2)],
        hints: ['A window is fine if its length minus the count of its most common letter is at most k.'] }),
    ],
  },
  {
    ...IV, summary: 'Sort ranges by start, then sweep once to detect overlaps or merge them.',
    lesson: `**Reach for it when** the input is a list of \`[start, end]\` ranges: meetings, bookings, time slots.

**Sort by start.** After sorting, any interval can only overlap the ones right before it, so one left-to-right sweep is enough.

**Overlap test.** Two sorted intervals \`a\` and \`b\` overlap when \`b.start <= a.end\` (or \`<\` if touching ranges do not count: read the problem carefully).

**Merging.** Keep a result list. For each interval, if it overlaps the last merged one, stretch that one's end to \`max(end, new end)\`; otherwise start a new merged interval.

**Inserting** into an already sorted list needs no sort: copy everything that ends before the new one, merge everything that overlaps it, then copy the rest.`,
    template: {
      python: 'def merge(intervals):\n    merged = []\n    for start, end in sorted(intervals):\n        if merged and start <= merged[-1][1]:\n            merged[-1][1] = max(merged[-1][1], end)\n        else:\n            merged.append([start, end])\n    return merged\n',
      javascript: 'function merge(intervals) {\n  const merged = [];\n  for (const [start, end] of [...intervals].sort((a, b) => a[0] - b[0])) {\n    const last = merged[merged.length - 1];\n    if (last && start <= last[1]) last[1] = Math.max(last[1], end);\n    else merged.push([start, end]);\n  }\n  return merged;\n}\n',
    },
    complexity: 'O(n log n) for the sort, O(n) for the sweep.',
    pitfalls: ['Forgetting to sort first.', 'Taking the new end instead of max(old end, new end) when one interval contains another.', 'Getting touching intervals ([1,4] and [4,5]) wrong for the problem\'s rule.'],
    problems: [
      fn(IV, { slug: 'can-attend-meetings', title: 'Can Attend Meetings', difficulty: 'easy', summary: 'Can one person attend every meeting?',
        scenario: 'Each meeting is `[start, end]`. Return `true` if no two meetings overlap. A meeting may start exactly when another ends.',
        py: 'can_attend', js: 'canAttend', params: 'meetings: list[list[int]]', jsParams: 'meetings', ret: 'bool',
        tests: [t('overlap', [[[0, 30], [5, 10], [15, 20]]], false), t('unsorted, fine', [[[7, 10], [2, 4]]], true), t('no meetings', [[]], true), t('back to back', [[[1, 5], [5, 8]]], true)],
        hints: ['Sort by start; then only neighbours can clash.'] }),
      fn(IV, { slug: 'merge-intervals', title: 'Merge Intervals', difficulty: 'medium', summary: 'Combine overlapping bookings into continuous blocks.',
        scenario: 'Merge all overlapping `[start, end]` bookings and return the blocks sorted by start. Bookings that touch (`[1, 4]` and `[4, 5]`) merge too.',
        py: 'merge', js: 'merge', params: 'bookings: list[list[int]]', jsParams: 'bookings', ret: 'list[list[int]]',
        tests: [t('two merge', [[[1, 3], [2, 6], [8, 10], [15, 18]]], [[1, 6], [8, 10], [15, 18]]), t('touching', [[[1, 4], [4, 5]]], [[1, 5]]), t('unsorted', [[[5, 6], [1, 2]]], [[1, 2], [5, 6]]), t('one covers all', [[[1, 10], [2, 3], [4, 5]]], [[1, 10]])],
        hints: ['Sort, then compare each booking with the last merged block.'] }),
      fn(IV, { slug: 'insert-interval', title: 'Insert Interval', difficulty: 'medium', summary: 'Add a booking to a sorted schedule, merging where needed.',
        scenario: '`bookings` is sorted by start and has no overlaps. Insert `new` and return the schedule, still sorted and without overlaps (touching bookings merge).',
        py: 'insert', js: 'insert', params: 'bookings: list[list[int]], new: list[int]', jsParams: 'bookings, newBooking', ret: 'list[list[int]]',
        tests: [t('merge one', [[[1, 3], [6, 9]], [2, 5]], [[1, 5], [6, 9]]), t('merge three', [[[1, 2], [3, 5], [6, 7], [8, 10], [12, 16]], [4, 8]], [[1, 2], [3, 10], [12, 16]]), t('empty schedule', [[], [5, 7]], [[5, 7]]), t('after the rest', [[[1, 5]], [6, 8]], [[1, 5], [6, 8]])],
        hints: ['Three phases: before the new booking, overlapping it, after it.'] }),
    ],
  },
  {
    ...ST, summary: 'Last in, first out: match pairs, undo nesting and find the next greater element.',
    lesson: `**Reach for it when** something must be matched with the most recent unmatched thing: brackets, nested expressions, "the next warmer day", undo history.

**Matching.** Push openers; on a closer, the top of the stack must be its partner. Anything left on the stack at the end was never closed.

**Monotonic stack.** To find, for each item, the next item that is greater, keep a stack of indexes whose answer is still unknown, with values decreasing from bottom to top. A new item pops (and answers) every smaller item on top, then is pushed itself. Each index is pushed and popped once: \`O(n)\`.

**Nesting.** For "repeat this block k times" problems, push the work-in-progress string and the count when a block opens, and combine when it closes.`,
    template: {
      python: 'def next_greater_distance(values):\n    answer = [0] * len(values)\n    stack = []  # indexes still waiting, values decreasing\n    for i, v in enumerate(values):\n        while stack and values[stack[-1]] < v:\n            j = stack.pop()\n            answer[j] = i - j\n        stack.append(i)\n    return answer\n',
      javascript: 'function nextGreaterDistance(values) {\n  const answer = new Array(values.length).fill(0);\n  const stack = []; // indexes still waiting, values decreasing\n  values.forEach((v, i) => {\n    while (stack.length && values[stack[stack.length - 1]] < v) {\n      const j = stack.pop();\n      answer[j] = i - j;\n    }\n    stack.push(i);\n  });\n  return answer;\n}\n',
    },
    complexity: 'O(n) time, O(n) space for the stack.',
    pitfalls: ['Popping from an empty stack on an unmatched closer.', 'Forgetting to check the stack is empty at the end.', 'Storing values instead of indexes when the answer is a distance.'],
    problems: [
      fn(ST, { slug: 'valid-parentheses', title: 'Valid Parentheses', difficulty: 'easy', summary: 'Check that every bracket is closed in the right order.',
        scenario: '`s` contains only `()[]{}`. Return `true` if every opener is closed by the matching closer in the correct order.',
        py: 'is_balanced', js: 'isBalanced', params: 's: str', jsParams: 's', ret: 'bool',
        tests: [t('pairs', ['()[]{}'], true), t('wrong closer', ['(]'], false), t('nested', ['([{}])'], true), t('unclosed', ['(('], false), t('empty', [''], true), t('closer first', ['}'], false)],
        hints: ['Push openers; a closer must match the top of the stack.'] }),
      fn(ST, { slug: 'daily-temperatures', title: 'Daily Temperatures', difficulty: 'medium', summary: 'For each day, how long until a warmer one?',
        scenario: 'For every day in `temps`, return how many days you wait for a strictly warmer day, or `0` if none comes.',
        py: 'days_until_warmer', js: 'daysUntilWarmer', params: 'temps: list[int]', jsParams: 'temps', ret: 'list[int]',
        tests: [t('mixed week', [[73, 74, 75, 71, 69, 72, 76, 73]], [1, 1, 4, 2, 1, 1, 0, 0]), t('rising', [[30, 40, 50, 60]], [1, 1, 1, 0]), t('falling', [[30, 20, 10]], [0, 0, 0])],
        hints: ['Keep the indexes of days still waiting on a stack.'] }),
      fn(ST, { slug: 'decode-string', title: 'Decode String', difficulty: 'medium', summary: 'Expand nested k[text] codes into the full string.',
        scenario: 'A code `k[text]` means `text` repeated `k` times; codes can nest. Letters outside codes stay as they are. Return the expanded string.',
        py: 'expand', js: 'expand', params: 's: str', jsParams: 's', ret: 'str',
        tests: [t('two codes', ['3[a]2[bc]'], 'aaabcbc'), t('nested', ['3[a2[c]]'], 'accaccacc'), t('with tail', ['2[abc]3[cd]ef'], 'abcabccdcdcdef'), t('no codes', ['xyz'], 'xyz')],
        hints: ['On "[", push the text so far and the count; on "]", pop and repeat.', 'Counts can have more than one digit.'] }),
    ],
  },
  {
    ...LL, summary: 'Re-wire next pointers carefully: dummy heads, fast/slow pointers and in-place reversal.',
    lesson: `**Reach for it when** the data is a chain of nodes where each node only knows the next one.

**Reverse in place.** Walk with \`prev\` and \`curr\`: save \`curr.next\`, point \`curr.next\` back at \`prev\`, then advance both. Draw the three boxes before writing code: losing the saved \`next\` drops the rest of the list.

**Fast and slow pointers.** Move one pointer two steps and one pointer one step. If the list has a loop, the fast one laps the slow one and they meet; if not, the fast one falls off the end. Starting the fast pointer \`n\` steps ahead finds the n-th node from the end in one pass.

**Dummy head.** A placeholder node in front of the real head removes the special case of deleting or inserting at the front.

In these problems the tests pass plain lists; the starter code builds the nodes for you and reads your answer back.`,
    template: {
      python: 'def reverse_list(head):\n    prev, curr = None, head\n    while curr:\n        nxt = curr.next      # save the rest\n        curr.next = prev     # flip one arrow\n        prev, curr = curr, nxt\n    return prev\n',
      javascript: 'function reverseList(head) {\n  let prev = null, curr = head;\n  while (curr) {\n    const next = curr.next; // save the rest\n    curr.next = prev;       // flip one arrow\n    prev = curr;\n    curr = next;\n  }\n  return prev;\n}\n',
    },
    complexity: 'O(n) time, O(1) extra space for pointer re-wiring.',
    pitfalls: ['Overwriting next before saving it.', 'Not handling the empty list or a single node.', 'Deleting the head without a dummy node.'],
    problems: [
      custom(LL, { slug: 'remove-nth-from-end', title: 'Remove Nth Node From End of List', difficulty: 'medium', summary: 'Delete the n-th node counting from the end, in one pass.',
        scenario: 'Implement `remove_nth(head, n)` / `removeNth(head, n)`: remove the n-th node from the end (1 = last node) and return the head. `n` is always valid.',
        kind: 'function', entry: { python: 'solve', javascript: 'solve' },
        starter: {
          python: `${LIST_PY}

def remove_nth(head, n):
    # your code here
    return head


# test glue: leave as is
def solve(values, n):
    return to_list(remove_nth(build(values), n))
`,
          javascript: `${LIST_JS}
function removeNth(head, n) {
  // your code here
  return head;
}

// test glue: leave as is
function solve(values, n) {
  return toList(removeNth(build(values), n));
}
`,
        },
        tests: [t('second from end', [[1, 2, 3, 4, 5], 2], [1, 2, 3, 5]), t('only node', [[1], 1], []), t('last node', [[1, 2], 1], [1]), t('the head', [[1, 2], 2], [2])],
        hints: ['Move a fast pointer n steps ahead, then move both until fast reaches the end.', 'A dummy node before the head handles removing the head.'] }),
      custom(LL, { slug: 'linked-list-cycle', title: 'Linked List Cycle', difficulty: 'easy', summary: 'Detect whether a linked list loops back on itself.',
        scenario: 'Implement `has_cycle(head)` / `hasCycle(head)`: return `true` if following `next` pointers never ends. Tests describe the loop with `pos`, the index the last node points back to (`-1` = no loop).',
        kind: 'function', entry: { python: 'solve', javascript: 'solve' },
        starter: {
          python: `${LIST_PY}

def has_cycle(head):
    # your code here
    return False


# test glue: leave as is
def solve(values, pos):
    head = build(values)
    if pos >= 0:
        tail, target, i, node = None, None, 0, head
        while node:
            if i == pos:
                target = node
            tail, node, i = node, node.next, i + 1
        tail.next = target
    return has_cycle(head)
`,
          javascript: `${LIST_JS}
function hasCycle(head) {
  // your code here
  return false;
}

// test glue: leave as is
function solve(values, pos) {
  const head = build(values);
  if (pos >= 0) {
    let tail = null, target = null, node = head;
    for (let i = 0; node; i++, node = node.next) {
      if (i === pos) target = node;
      tail = node;
    }
    tail.next = target;
  }
  return hasCycle(head);
}
`,
        },
        tests: [t('loop to second', [[3, 2, 0, -4], 1], true), t('loop to head', [[1, 2], 0], true), t('single, no loop', [[1], -1], false), t('no loop', [[1, 2, 3], -1], false)],
        hints: ['Slow moves one step, fast moves two. Do they ever meet?'] }),
    ],
  },
  {
    ...BS, summary: 'Halve the search space each step, on a sorted list or on the answer itself.',
    lesson: `**Reach for it when** the data is sorted, or when the answer is a number and "is \`x\` big enough?" gets more true as \`x\` grows (a monotonic yes/no).

**Classic search.** Keep \`lo\` and \`hi\`. Look at \`mid\`; if it is too small, the answer is right of it, so \`lo = mid + 1\`; otherwise \`hi = mid - 1\` (or \`hi = mid\`, depending on the variant). Each step halves the range: \`O(log n)\`.

**Rotated lists.** One half of \`[lo, mid]\` / \`[mid, hi]\` is always sorted; check whether the target lies inside that half to decide where to go.

**Search on the answer.** For "the smallest speed that finishes in time", binary-search the speed: check one candidate in \`O(n)\`, halve the range of speeds, \`O(n log max)\` in total.`,
    template: {
      python: 'def find_index(nums, target):\n    lo, hi = 0, len(nums) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if nums[mid] == target:\n            return mid\n        if nums[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1\n',
      javascript: 'function findIndex(nums, target) {\n  let lo = 0, hi = nums.length - 1;\n  while (lo <= hi) {\n    const mid = (lo + hi) >> 1;\n    if (nums[mid] === target) return mid;\n    if (nums[mid] < target) lo = mid + 1;\n    else hi = mid - 1;\n  }\n  return -1;\n}\n',
    },
    complexity: 'O(log n) per search; O(n log range) when each check of a candidate answer costs O(n).',
    pitfalls: ['Infinite loops from lo = mid with lo < hi.', 'Mixing "<=" and "<" between the loop and the updates.', 'Searching the answer range with the wrong bounds (start at 1, not 0, for speeds).'],
    problems: [
      fn(BS, { slug: 'search-rotated-sorted-array', title: 'Search in Rotated Sorted Array', difficulty: 'medium', summary: 'Binary search a sorted list that was rotated at an unknown point.',
        scenario: 'A sorted list of distinct values was rotated (e.g. `[0,1,2,4,5,6,7]` became `[4,5,6,7,0,1,2]`). Return the index of `target` or `-1`, in `O(log n)`.',
        py: 'search_rotated', js: 'searchRotated', params: 'nums: list[int], target: int', jsParams: 'nums, target', ret: 'int',
        tests: [t('after the turn', [[4, 5, 6, 7, 0, 1, 2], 0], 4), t('absent', [[4, 5, 6, 7, 0, 1, 2], 3], -1), t('single miss', [[1], 0], -1), t('first item', [[5, 1, 3], 5], 0), t('two items', [[3, 1], 1], 1)],
        hints: ['One of the two halves around mid is always sorted.', 'Check whether the target falls inside the sorted half.'] }),
      fn(BS, { slug: 'koko-eating-bananas', title: 'Koko Eating Bananas', difficulty: 'medium', summary: 'Find the slowest eating speed that finishes every pile in time.',
        scenario: 'Pile `piles[i]` has that many bananas. Eating at `k` bananas an hour, a pile takes `ceil(pile / k)` hours (one pile at a time, leftover time in an hour is wasted). Return the smallest integer `k` that finishes everything within `hours`.',
        py: 'min_speed', js: 'minSpeed', params: 'piles: list[int], hours: int', jsParams: 'piles, hours', ret: 'int',
        tests: [t('roomy', [[3, 6, 7, 11], 8], 4), t('one hour each', [[30, 11, 23, 4, 20], 5], 30), t('one spare hour', [[30, 11, 23, 4, 20], 6], 23), t('tiny piles', [[1, 1, 1, 1], 4], 1)],
        hints: ['If speed k works, every faster speed works too.', 'Binary-search k between 1 and the largest pile.'] }),
    ],
  },
  {
    ...HP, summary: 'A priority queue that hands you the smallest (or largest) item in O(log n).',
    lesson: `**Reach for it when** you repeatedly need the current smallest or largest item while items keep arriving: the k largest, the k closest, merging sorted streams, scheduling.

**How it works.** A binary heap is a complete tree stored in an array; each parent is smaller than its children (a min-heap). Adding an item bubbles it up; removing the root moves the last item to the top and sifts it down. Both take \`O(log n)\`.

**Top k with a small heap.** To keep the \`k\` largest items, keep a **min**-heap of size \`k\`: push each item, and pop whenever the heap grows past \`k\`. The root is then the k-th largest. That is \`O(n log k)\`, better than sorting everything.

Python has \`heapq\` (a min-heap). JavaScript has no built-in heap: write a small one, or (for practice-sized inputs) sort, but say which you chose and why.`,
    template: {
      python: 'import heapq\n\ndef kth_largest(nums, k):\n    heap = []                 # min-heap of the k largest so far\n    for x in nums:\n        heapq.heappush(heap, x)\n        if len(heap) > k:\n            heapq.heappop(heap)   # drop the smallest\n    return heap[0]\n',
      javascript: 'class MinHeap {\n  constructor() { this.a = []; }\n  get size() { return this.a.length; }\n  peek() { return this.a[0]; }\n  push(x) {\n    const a = this.a; a.push(x);\n    for (let i = a.length - 1; i > 0;) {\n      const p = (i - 1) >> 1;\n      if (a[p] <= a[i]) break;\n      [a[p], a[i]] = [a[i], a[p]]; i = p;\n    }\n  }\n  pop() {\n    const a = this.a, top = a[0], last = a.pop();\n    if (a.length) {\n      a[0] = last;\n      for (let i = 0; ;) {\n        const l = 2 * i + 1, r = l + 1; let m = i;\n        if (l < a.length && a[l] < a[m]) m = l;\n        if (r < a.length && a[r] < a[m]) m = r;\n        if (m === i) break;\n        [a[m], a[i]] = [a[i], a[m]]; i = m;\n      }\n    }\n    return top;\n  }\n}\n',
    },
    complexity: 'O(log n) per push or pop, O(1) to look at the root; top-k in O(n log k).',
    pitfalls: ['Using a max-heap when you need to evict the smallest of the top k.', 'Comparing tuples/arrays without a tie-break rule.', 'Sorting everything when a heap of size k was asked for.'],
    problems: [
      fn(HP, { slug: 'kth-largest-element', title: 'Kth Largest Element in an Array', difficulty: 'medium', summary: 'Return the k-th largest number (counting duplicates).',
        scenario: 'Return the `k`-th largest value in `nums` (duplicates count separately). Aim for better than sorting the whole list.',
        py: 'kth_largest', js: 'kthLargest', params: 'nums: list[int], k: int', jsParams: 'nums, k', ret: 'int',
        tests: [t('second largest', [[3, 2, 1, 5, 6, 4], 2], 5), t('with duplicates', [[3, 2, 3, 1, 2, 4, 5, 5, 6], 4], 4), t('single', [[1], 1], 1)],
        hints: ['Keep a min-heap of size k.'] }),
      fn(HP, { slug: 'k-closest-points', title: 'K Closest Points to Origin', difficulty: 'medium', summary: 'Pick the k delivery points nearest the depot.',
        scenario: 'The depot is at `(0, 0)`. Return the `k` points closest to it (straight-line distance), sorted by distance, then by `x`, then by `y`.',
        py: 'k_closest', js: 'kClosest', params: 'points: list[list[int]], k: int', jsParams: 'points, k', ret: 'list[list[int]]',
        tests: [t('one of two', [[[1, 3], [-2, 2]], 1], [[-2, 2]]), t('two of three', [[[3, 3], [5, -1], [-2, 4]], 2], [[3, 3], [-2, 4]]), t('tie on distance', [[[1, 0], [0, 1], [2, 2]], 2], [[0, 1], [1, 0]])],
        hints: ['Compare squared distances: no square roots needed.', 'The tie-break order decides the output order.'] }),
      fn(HP, { slug: 'merge-k-sorted-lists', title: 'Merge K Sorted Lists', difficulty: 'medium', summary: 'Merge several sorted lists into one sorted list.',
        scenario: 'Each list in `feeds` is sorted ascending. Return all values in one ascending list.',
        py: 'merge_feeds', js: 'mergeFeeds', params: 'feeds: list[list[int]]', jsParams: 'feeds', ret: 'list[int]',
        tests: [t('three feeds', [[[1, 4, 5], [1, 3, 4], [2, 6]]], [1, 1, 2, 3, 4, 4, 5, 6]), t('no feeds', [[]], []), t('an empty feed', [[[], [0]]], [0])],
        hints: ['Put the first item of every feed in a min-heap with its feed and position.'] }),
    ],
  },
  {
    ...DF, summary: 'Go deep first: recursion on trees, flood fill on grids, exhaustive search on graphs.',
    lesson: `**Reach for it when** you need to visit everything reachable, or the answer for a node is built from the answers of its children (depth, sums, validity).

**On trees.** Write a recursive function that answers the question for one node, assuming it already works for the children: a base case for \`None\`, then combine \`left\` and \`right\`. Decide what the function **returns** (a depth, a bool) and what it **receives** (the sum so far).

**On grids.** Treat each cell as a node with up to four neighbours. Start a DFS from every unvisited land cell; the DFS marks the whole connected region, so the number of starts is the number of regions.

**Iterative DFS** uses an explicit stack instead of recursion, which avoids recursion limits on deep inputs.

Tree problems pass level-order lists (\`null\` = no child); the starter builds the tree.`,
    template: {
      python: 'def max_depth(node):\n    if node is None:\n        return 0                     # base case\n    return 1 + max(max_depth(node.left), max_depth(node.right))\n\n\ndef fill(grid, r, c, seen):\n    if not (0 <= r < len(grid) and 0 <= c < len(grid[0])) or (r, c) in seen or grid[r][c] != "1":\n        return\n    seen.add((r, c))\n    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):\n        fill(grid, r + dr, c + dc, seen)\n',
      javascript: 'function maxDepth(node) {\n  if (!node) return 0; // base case\n  return 1 + Math.max(maxDepth(node.left), maxDepth(node.right));\n}\n\nfunction fill(grid, r, c, seen) {\n  if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length) return;\n  if (seen.has(`${r},${c}`) || grid[r][c] !== "1") return;\n  seen.add(`${r},${c}`);\n  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) fill(grid, r + dr, c + dc, seen);\n}\n',
    },
    complexity: 'O(nodes + edges): every node and grid cell is visited once. Recursion depth = tree height.',
    pitfalls: ['Missing the base case for an empty node.', 'Marking a cell visited too late and visiting it twice.', 'Treating a node with one child as a leaf in root-to-leaf problems.'],
    problems: [
      custom(DF, { slug: 'max-depth-binary-tree', title: 'Maximum Depth of Binary Tree', difficulty: 'easy', summary: 'Count the nodes on the longest root-to-leaf path.',
        scenario: 'Implement `max_depth(root)` / `maxDepth(root)`: the number of nodes on the longest path from the root down to a leaf (0 for an empty tree).',
        kind: 'function', entry: { python: 'solve', javascript: 'solve' },
        starter: {
          python: `${TREE_PY}

def max_depth(root):
    # your code here
    return 0


# test glue: leave as is
def solve(values):
    return max_depth(build(values))
`,
          javascript: `${TREE_JS}
function maxDepth(root) {
  // your code here
  return 0;
}

// test glue: leave as is
function solve(values) {
  return maxDepth(build(values));
}
`,
        },
        tests: [t('three levels', [[3, 9, 20, null, null, 15, 7]], 3), t('empty', [[]], 0), t('right chain', [[1, null, 2]], 2)],
        hints: ['Depth of a node = 1 + the deeper of its children.'] }),
      custom(DF, { slug: 'path-sum', title: 'Path Sum', difficulty: 'easy', summary: 'Is there a root-to-leaf path adding up to a target?',
        scenario: 'Implement `has_path_sum(root, target)` / `hasPathSum(root, target)`: `true` if some path from the root to a **leaf** (no children) has values summing to `target`.',
        kind: 'function', entry: { python: 'solve', javascript: 'solve' },
        starter: {
          python: `${TREE_PY}

def has_path_sum(root, target):
    # your code here
    return False


# test glue: leave as is
def solve(values, target):
    return has_path_sum(build(values), target)
`,
          javascript: `${TREE_JS}
function hasPathSum(root, target) {
  // your code here
  return false;
}

// test glue: leave as is
function solve(values, target) {
  return hasPathSum(build(values), target);
}
`,
        },
        tests: [t('deep path', [[5, 4, 8, 11, null, 13, 4, 7, 2, null, null, null, 1], 22], true), t('no such path', [[1, 2, 3], 5], false), t('empty tree', [[], 0], false), t('root is not a leaf', [[1, 2], 1], false)],
        hints: ['Pass the remaining target down; check it only at leaves.'] }),
      fn(DF, { slug: 'number-of-islands', title: 'Number of Islands', difficulty: 'medium', summary: 'Count separate islands of land on a map grid.',
        scenario: '`grid` is a list of strings of `1` (land) and `0` (water). Land cells connect up, down, left and right. Return the number of islands.',
        py: 'count_islands', js: 'countIslands', params: 'grid: list[str]', jsParams: 'grid', ret: 'int',
        tests: [t('one big island', [['11110', '11010', '11000', '00000']], 1), t('three islands', [['11000', '11000', '00100', '00011']], 3), t('empty map', [[]], 0), t('single cell', [['1']], 1)],
        hints: ['Each DFS from an unvisited land cell marks one whole island.'] }),
    ],
  },
];
