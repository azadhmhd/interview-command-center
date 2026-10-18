# API overview

Live, generated OpenAPI documentation: **http://localhost:4000/api/docs** (request bodies are generated from the same
Zod schemas used for validation). All routes are under `/api`. Authentication: session cookie `icc_session` (set by
login/register) or `Authorization: Bearer <token>`. Optional `x-workspace-id` header selects a workspace (default:
your personal workspace). Errors: `{ statusCode, message, issues? }`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/me` |
| Workspaces | `POST /workspaces`, `GET/PATCH /workspaces/current`, `PUT /workspaces/current/settings`, `GET /workspaces/current/members`, `PATCH/DELETE /workspaces/current/members/:id`, `POST /workspaces/current/invitations`, `DELETE /workspaces/current/invitations/:id`, `POST /workspaces/invitations/accept`, `GET /workspaces/current/audit` |
| Sharing | `POST /shares`, `GET /shares`, `DELETE /shares/:id`, `GET /shared`, `GET /shared/applications/:id`, `POST /shared/applications/:id/notes`, `GET /shared/courses/:id`, `PATCH /shared/courses/:id/lessons/:lessonId` |
| Profile & CVs | `GET/PUT /profile`, `GET/POST /resumes`, `GET /resumes/:id`, `GET /resumes/:id/file`, `PATCH /resumes/:id/default`, `POST /resumes/:id/confirm` |
| Applications | `GET/POST /applications`, `GET /applications/duplicates`, `GET/PATCH/DELETE /applications/:id`, `POST /applications/:id/activities`, `POST/PATCH/DELETE /applications/:id/contacts[/:contactId]`, `POST /applications/:id/links`, `POST /applications/:id/attachments`, `GET/DELETE /applications/:id/attachments/:attId`, `POST /applications/:id/research` |
| Rounds | `POST /applications/:id/rounds`, `POST /applications/:id/rounds/reorder`, `GET /rounds`, `GET/PATCH/DELETE /rounds/:id`, `POST /rounds/:id/prepare` |
| Journal & knowledge base | `POST /rounds/:roundId/questions`, `POST /rounds/:roundId/questions/extract`, `GET/PATCH/DELETE /occurrences/:id`, `POST /occurrences/:id/improve`, `GET /questions`, `GET /questions/tags`, `GET/PATCH /questions/:id`, `GET /search?q=`, `GET /revision/queue`, `POST /revision/:id/review` |
| Courses | `GET /courses`, `GET/DELETE /courses/:id`, `PATCH /courses/:id/lessons/:lessonId`, `POST /courses/:id/lessons/:lessonId/regenerate`, `POST /courses/:id/revision-notes` |
| Practice & mocks | `POST/GET /practice/attempts`, `GET /practice/attempts/:id`, `POST /practice/attempts/:id/self-evaluation`, `POST /practice/attempts/:id/revise`, `POST/GET /practice/sessions`, `GET /practice/sessions/:id`, `POST /practice/sessions/:id/complete` |
| LLM | `GET/PUT/DELETE /llm/config`, `POST /llm/test`, `GET /llm/usage` |
| Tasks & agents | `GET /tasks`, `GET /tasks/:id`, `POST /tasks/:id/{cancel,retry,handoff,submitted,import,sync,approve,reject}`, `GET /tasks/:id/package`, `GET /agents/status` |
| Dashboard | `GET /dashboard`, `GET /analytics`, `POST /reminders/:id/{done,dismiss}` |
| Account | `GET /health`, `GET /account/export`, `DELETE /account`, `POST /account/sessions/revoke-others` |

Idempotency: `POST /practice/attempts` accepts `clientKey`; task creation is keyed by an internal idempotency key;
agent imports are de-duplicated by output hash; notes import skips already-recorded questions.
