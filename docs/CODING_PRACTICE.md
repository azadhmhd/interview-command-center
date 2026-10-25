# Coding practice

**Prepare → Coding practice** is a sandbox for coding interview problems, grouped into sixteen sections by the pattern
they practise. Pick a section to learn the pattern, then solve its problems in Python or JavaScript in your browser.

## Sections

| # | Section | Problems |
|---|---|---|
| 1 | Two Pointers | 7 |
| 2 | Sliding Window | 5 |
| 3 | Intervals | 5 |
| 4 | Stack | 5 |
| 5 | Linked List | 5 |
| 6 | Binary Search | 5 |
| 7 | Heap | 5 |
| 8 | Depth-First Search | 13 |
| 9 | Breadth-First Search | 8 |
| 10 | Backtracking | 6 |
| 11 | Graphs | 7 |
| 12 | Dynamic Programming | 10 |
| 13 | Greedy | 5 |
| 14 | Trie | 2 |
| 15 | Prefix Sum | 2 |
| 16 | Matrices | 3 |

93 problems in total, each with an original statement, tests, starter code in both languages and hints you reveal one
at a time. Each section page has:

- **See it work**: an animated walk-through you can play, pause, step and slow down. The frames are produced by running
  the real algorithm on a small input (`apps/web/src/lib/sections.ts`), so the picture and the captions always agree.
- An overview (when to reach for the pattern and how it works), a template in Python and JavaScript, the complexity and
  common mistakes.
- The section's problems with their difficulty and whether you have solved them. The index and the section tree beside
  every page show your progress.

The catalog lives in `apps/api/src/coding/`: lessons and the first problems in `dsa-a.ts` and `dsa-b.ts`, more
problems in `dsa-c.ts` to `dsa-e.ts`, and the order of each section in `dsa.ts`. `dsa.spec.ts` runs a reference
solution against every test (for linked-list, tree and graph problems it runs the real starter glue), so a wrong
expected answer fails CI. To add a problem, write it with the `fn`, `custom` or `tree` helper from `dsa-kit.ts`, list
its slug in `dsa.ts` and add a reference solution to the spec.

## Running code

Code runs **only in your browser**, never on the server:

- **JavaScript** runs in a throwaway Web Worker per run.
- **Python** runs in [Pyodide](https://pyodide.org) (CPython in WebAssembly), loaded once from the jsDelivr CDN at a
  pinned version. The first run downloads it (about 10 MB, then cached by the browser).
- A run that passes every test is saved automatically, which marks the problem done.
- A run is stopped after 8 seconds (endless loops); for Python the next run starts a fresh interpreter.
- Linked-list, tree and graph problems pass plain lists in the tests; the starter code builds the nodes (leave its
  "test glue" part as it is) and reads your answer back.
- `print` / `console.log` output is shown under the results. Drafts are kept per problem and language in your browser.

## AI review

**Get AI review** on a problem page saves the run (code, test results, your notes) as a `CodingSubmission` and queues
a `code_review` task. It runs like every other AI task (see [AGENTS.md](AGENTS.md)): on your LLM endpoint, or with
Claude Code (headless adapter or a manual agent session, skill `icc-code-review`). Set routing for `code_review` to `agent` in your workspace
settings to always use Claude Code.

The review returns a verdict, an overall score and per-area scores (correctness, approach, verification, code quality,
communication), strengths, issues with line numbers, missed edge cases, time and space complexity, prioritised next
steps, interview tips for that problem, and a clean solution in the same language. It is coaching feedback, not a
hiring prediction. Your code and notes are treated as untrusted data by the reviewer.
