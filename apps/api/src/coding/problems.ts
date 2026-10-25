/**
 * Coding practice problem shape. The catalog itself (sections, lessons and problems) lives in dsa.ts. Tests run in the
 * user's browser; the same data goes to the AI reviewer as context.
 */
import { PROBLEMS } from './dsa';

export type Lang = 'python' | 'javascript';
/** function problems: call(...args) must equal expected. class problems: ops[0] is ['new', ctorArgs]; an op with a third value must return it. */
export interface TestCase { name: string; args?: unknown[]; expected?: unknown; ops?: [string, unknown[], unknown?][] }
export interface Stage { title: string; brief: string; tests: TestCase[] }
export interface Problem {
  slug: string; title: string; pattern: string; difficulty: 'easy' | 'medium' | 'hard'; minutes: number; summary: string;
  scenario: string; kind: 'function' | 'class'; entry: Record<Lang, string>; starter: Record<Lang, string>;
  stages: Stage[]; hints: string[]; aiTips: string[];
  /** the section this problem belongs to (its lesson lives in dsa.ts) */
  topic: string;
}

export const findProblem = (slug: string) => PROBLEMS.find((p) => p.slug === slug);
