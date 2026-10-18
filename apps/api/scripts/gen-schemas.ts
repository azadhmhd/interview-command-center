// Writes the task output contracts (single source of truth: src/tasks/schemas.ts) as JSON Schema into the skill pack.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { OUTPUT_SCHEMAS, TASK_SKILLS } from '../src/tasks/schemas';

const out = join(__dirname, '../../../skills/schemas');
mkdirSync(out, { recursive: true });
for (const [type, schema] of Object.entries(OUTPUT_SCHEMAS)) {
  writeFileSync(join(out, `${type}.schema.json`), JSON.stringify({ $id: `icc/${type}`, title: type, ...z.toJSONSchema(schema, { io: 'input' }) }, null, 2) + '\n');
}
writeFileSync(join(out, 'index.json'), JSON.stringify(TASK_SKILLS, null, 2) + '\n');
console.log(`wrote ${Object.keys(OUTPUT_SCHEMAS).length} schemas to ${out}`);
