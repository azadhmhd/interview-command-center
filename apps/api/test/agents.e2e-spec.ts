import { INestApplication } from '@nestjs/common';
import { join } from 'node:path';
import { config } from '../src/config';
import { TaskRunner } from '../src/tasks/runner';
import { boot, register } from './helpers';

describe('Claude Code headless adapter (opt-in, Method A unattended)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    config.claudeCli.enabled = true;
    config.claudeCli.path = join(__dirname, 'fake-claude.js');
    app = await boot();
  });
  afterAll(async () => {
    config.claudeCli.enabled = false;
    await app.close();
  });

  it('routes to the CLI when the LLM is unavailable, runs it with a minimal env and validates the output', async () => {
    const u = await register(app, 'Cli');
    const st = await u.get('/agents/status').expect(200);
    expect(st.body.claudeCli).toMatchObject({ enabled: true, found: true });
    const a = await u.post('/practice/attempts', { prompt: 'What is a B-tree index?', answer: 'A balanced tree...' }).expect(201);
    expect(a.body.task).toMatchObject({ executionMethod: 'agent_cli', state: 'queued' });
    await app.get(TaskRunner).run(a.body.task.id, 'test');
    const t = await u.get(`/tasks/${a.body.task.id}`).expect(200);
    expect(t.body.lastError).toBeNull();
    expect(t.body.state).toBe('completed');
    const view = await u.get(`/practice/attempts/${a.body.attempt.id}`).expect(200);
    expect(view.body.evaluation).toMatchObject({ source: 'agent', score: 8 });
    expect(view.body.evaluation.strongAnswer).toContain('B-tree');
  });
});
