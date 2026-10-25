/**
 * Coding practice: types shared with the API catalog, and the in-browser test runner. Code runs only in the user's
 * browser, inside a Web Worker (JavaScript: a throwaway worker per run; Python: Pyodide, loaded once). Never on the server.
 */
export type Lang = 'python' | 'javascript';
export interface TestCase { name: string; args?: unknown[]; expected?: unknown; ops?: [string, unknown[], unknown?][] }
export interface Stage { title: string; brief: string; tests: TestCase[] }
export interface Problem {
  slug: string; title: string; pattern: string; difficulty: 'easy' | 'medium' | 'hard'; minutes: number; summary: string;
  scenario: string; kind: 'function' | 'class'; entry: Record<Lang, string>; starter: Record<Lang, string>;
  stages: Stage[]; hints: string[]; aiTips: string[];
  /** the section this problem belongs to */
  topic: string;
}
export interface TestResult { name: string; stage: number; passed: boolean; got?: unknown; error?: string }
export interface RunOutput { results: TestResult[]; logs: string[]; error?: string }
export interface Review {
  verdict: 'solved' | 'partially_solved' | 'not_solved'; score: number;
  scores: { correctness: number; approach: number; verification: number; codeQuality: number; communication: number };
  summary: string; strengths: string[]; issues: { severity: 'high' | 'medium' | 'low'; line?: number; problem: string; fix: string }[];
  edgeCases: string[]; complexity: { time: string; space: string }; suggestions: string[]; improvedSolution: string; interviewTips: string[]; confidence: string;
}
export interface Submission {
  id: string; problemSlug: string; language: Lang; stage: number; passed: number; total: number; createdAt: string; reviewedAt?: string | null;
  review?: Review | null; task?: { id: string; state: string; executionMethod: string; lastError?: string | null } | null;
}

/** Tests a run uses: every stage up to and including the chosen one (later stages must not break earlier ones). */
export const testsUpTo = (p: Problem, stage: number) => p.stages.slice(0, stage).flatMap((s, i) => s.tests.map((t) => ({ ...t, stage: i + 1 })));

export const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));

const JS_WORKER = `
const canon = ${canon.toString()};
self.onmessage = (e) => {
  const { code, entry, kind, tests } = e.data;
  const logs = [];
  const log = (...a) => { if (logs.length < 200) logs.push(a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); };
  const sandboxConsole = { log, info: log, warn: log, error: log, debug: log };
  let target;
  try { target = new Function('console', code + '\\n;return typeof ' + entry + ' !== "undefined" ? ' + entry + ' : undefined;')(sandboxConsole); }
  catch (err) { self.postMessage({ results: [], logs, error: 'Your code did not load: ' + err.message }); return; }
  if (typeof target !== 'function') { self.postMessage({ results: [], logs, error: 'Define ' + (kind === 'class' ? 'a class' : 'a function') + ' named ' + entry + '.' }); return; }
  const results = tests.map((t) => {
    try {
      if (kind === 'class') {
        const [[, ctor], ...ops] = t.ops;
        const obj = new target(...structuredClone(ctor));
        for (const [i, [m, args, exp]] of ops.entries()) {
          if (typeof obj[m] !== 'function') return { name: t.name, stage: t.stage, passed: false, error: 'Missing method ' + m };
          const got = obj[m](...structuredClone(args));
          if (exp !== undefined && canon(got) !== canon(exp)) return { name: t.name, stage: t.stage, passed: false, got, error: 'Step ' + (i + 1) + ': ' + m + '(' + args.map((a) => JSON.stringify(a)).join(', ') + ') returned ' + JSON.stringify(got) + ', expected ' + JSON.stringify(exp) };
        }
        return { name: t.name, stage: t.stage, passed: true };
      }
      const got = target(...structuredClone(t.args));
      return { name: t.name, stage: t.stage, passed: canon(got) === canon(t.expected), got };
    } catch (err) { return { name: t.name, stage: t.stage, passed: false, error: String(err && err.message || err) }; }
  });
  self.postMessage({ results, logs });
};`;

const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
const PY_WORKER = `
importScripts('${PYODIDE}pyodide.js');
const ready = loadPyodide({ indexURL: '${PYODIDE}' }).then((py) => { self.postMessage({ type: 'ready' }); return py; }, (err) => { self.postMessage({ type: 'failed', error: String(err) }); });
const HARNESS = ${JSON.stringify(`
import json, sys, io, traceback
p = json.loads(__payload)
buf = io.StringIO()
sys.stdout = buf
def canon(v):
    return json.dumps(v, sort_keys=True, separators=(",", ":"))
def whole(v):
    # 2.0 and 2 are the same answer (JavaScript has one number type)
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, list):
        return [whole(x) for x in v]
    if isinstance(v, dict):
        return {k: whole(x) for k, x in v.items()}
    return v
def plain(v):
    return whole(json.loads(json.dumps(v, default=str)))
res = {"results": [], "logs": []}
ns = {"__name__": "__practice__"}
try:
    exec(p["code"], ns)
except Exception as e:
    res["error"] = "Your code did not load: " + "".join(traceback.format_exception_only(type(e), e)).strip()
else:
    target = ns.get(p["entry"])
    if target is None:
        res["error"] = "Define " + ("a class" if p["kind"] == "class" else "a function") + " named " + p["entry"] + "."
    else:
        for t in p["tests"]:
            r = {"name": t["name"], "stage": t["stage"]}
            try:
                if p["kind"] == "class":
                    ops = t["ops"]
                    obj = target(*plain(ops[0][1]))
                    r["passed"] = True
                    for i, op in enumerate(ops[1:]):
                        m, args = op[0], op[1]
                        got = plain(getattr(obj, m)(*plain(args)))
                        if len(op) > 2 and canon(got) != canon(op[2]):
                            r["passed"] = False
                            r["got"] = got
                            r["error"] = "Step %d: %s(%s) returned %s, expected %s" % (i + 1, m, ", ".join(json.dumps(a) for a in args), json.dumps(got), json.dumps(op[2]))
                            break
                else:
                    got = plain(target(*plain(t["args"])))
                    r["got"] = got
                    r["passed"] = canon(got) == canon(t["expected"])
            except Exception as e:
                r["passed"] = False
                r["error"] = "".join(traceback.format_exception_only(type(e), e)).strip()
            res["results"].append(r)
sys.stdout = sys.__stdout__
res["logs"] = buf.getvalue().splitlines()[:200]
json.dumps(res, default=str)
`)};
self.onmessage = async (e) => {
  const py = await ready;
  if (!py) return;
  try {
    py.globals.set('__payload', JSON.stringify(e.data));
    self.postMessage({ type: 'result', ...JSON.parse(await py.runPythonAsync(HARNESS)) });
  } catch (err) { self.postMessage({ type: 'result', results: [], logs: [], error: String(err) }); }
};`;

const workerFrom = (src: string) => new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));

let python: { worker: Worker; ready: Promise<void> } | null = null;
/** Python worker, loaded once (Pyodide is ~10 MB the first time; the browser caches it after that). */
function pythonWorker() {
  if (!python) {
    const worker = workerFrom(PY_WORKER);
    const ready = new Promise<void>((resolve, reject) => {
      const onMsg = (e: MessageEvent) => {
        if (e.data?.type === 'ready') { worker.removeEventListener('message', onMsg); resolve(); }
        if (e.data?.type === 'failed') { worker.removeEventListener('message', onMsg); python = null; reject(new Error(`Python could not load: ${e.data.error}`)); }
      };
      worker.addEventListener('message', onMsg);
    });
    python = { worker, ready };
  }
  return python;
}

/** Load the Python runtime ahead of the first run (no-op for JavaScript). */
export const warmUp = (lang: Lang) => { if (lang === 'python') pythonWorker().ready.catch(() => undefined); };

/** Run the tests of stages 1..stage in a worker; an endless loop is stopped after timeoutMs. */
export async function runTests(p: Problem, lang: Lang, code: string, stage: number, timeoutMs = 8000): Promise<RunOutput> {
  const payload = { code, entry: p.entry[lang], kind: p.kind, tests: testsUpTo(p, stage) };
  if (lang === 'javascript') {
    const w = workerFrom(JS_WORKER);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { w.terminate(); resolve({ results: [], logs: [], error: `Stopped after ${timeoutMs / 1000}s: is there an endless loop?` }); }, timeoutMs);
      w.onmessage = (e) => { clearTimeout(timer); w.terminate(); resolve(e.data); };
      w.onerror = (e) => { clearTimeout(timer); w.terminate(); resolve({ results: [], logs: [], error: e.message }); };
      w.postMessage(payload);
    });
  }
  const py = pythonWorker();
  await py.ready;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      py.worker.terminate();
      python = null; // the next run starts a fresh interpreter
      resolve({ results: [], logs: [], error: `Stopped after ${timeoutMs / 1000}s: is there an endless loop? The next run restarts Python (about 15 seconds).` });
    }, timeoutMs);
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== 'result') return;
      clearTimeout(timer);
      py.worker.removeEventListener('message', onMsg);
      const { type: _, ...out } = e.data;
      resolve(out as RunOutput);
    };
    py.worker.addEventListener('message', onMsg);
    py.worker.postMessage(payload);
  });
}
