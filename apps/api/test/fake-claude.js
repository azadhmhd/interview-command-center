#!/usr/bin/env node
// Stub for `claude -p` used by tests. Fails if app secrets leak into its environment.
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('0.0.0 (fake)'); process.exit(0); }
const leaked = ['DATABASE_URL', 'APP_ENCRYPTION_KEY', 'LLM_API_KEY', 'REDIS_URL'].filter((k) => process.env[k]);
if (leaked.length) { console.log(JSON.stringify({ is_error: true, result: `secrets leaked: ${leaked}` })); process.exit(0); }
const prompt = args[args.indexOf('-p') + 1];
const folder = prompt.match(/Task folder: (\S+)\./)[1];
const task = JSON.parse(fs.readFileSync(path.join(process.cwd(), folder, 'task.json'), 'utf8'));
const out = { score: 8, rubric: { correctness: 8, completeness: 8, depth: 7, clarity: 9 }, missingConcepts: [], incorrectClaims: [], improvements: ['Mention trade-offs'], strongAnswer: `Strong answer to: ${task.context.question}`, followUps: [], confidence: 'medium' };
fs.writeFileSync(path.join(process.cwd(), folder, 'output/result.json'), JSON.stringify(out));
console.log(JSON.stringify({ type: 'result', is_error: false, result: 'done', tools: args[args.indexOf('--tools') + 1] }));
