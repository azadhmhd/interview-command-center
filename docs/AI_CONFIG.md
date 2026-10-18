# LLM configuration and troubleshooting

The app talks to **one OpenAI-compatible endpoint** through the official `openai` SDK with a custom `baseURL`.
There is no provider-specific business logic. The baseline capability is chat completions; JSON mode is detected
during the connection test and used only when the endpoint supports it (otherwise JSON is requested in the prompt,
extracted and validated, with one automatic repair round).

## Option A — environment (self-hosted default)

```env
LLM_ENABLED=true
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=            # empty for local servers
LLM_MODEL=llama3.1:8b
LLM_TIMEOUT_MS=120000
LLM_MAX_RETRIES=2
LLM_DEFAULT_TEMPERATURE=0.2
LLM_EVALUATION_MODEL=   # optional stronger model for answer evaluation (same endpoint)
LLM_EXTERNAL_DATA_CONSENT=false   # must be true to send interview data to a NON-local env endpoint
```

## Option B — per workspace in the UI

**Settings → AI configuration**: base URL, API key, model, optional evaluation model, timeout, retries, temperature,
an enable switch, and an explicit consent checkbox for non-local endpoints. **Test connection** checks `/models`
(when supported), sends a 5-token completion, and detects JSON mode. The last test result and the last successful
call are shown.

The saved key is encrypted with AES-256-GCM (`APP_ENCRYPTION_KEY`). The API only ever returns `hasApiKey` and the
last 4 characters.

### Precedence

1. A workspace configuration with a base URL (saved in the UI) is used for that workspace.
2. Otherwise the environment configuration is used (`LLM_ENABLED` governs it).
3. Otherwise AI actions are disabled; tasks route to manual agent handoff.

Providers are never switched silently. If the endpoint fails, tasks retry with exponential backoff (bounded by
`maxAttempts`), then move to `ready_for_agent` (if the workspace allows agent fallback) or `failed` — always with the
reason recorded on the task.

## Endpoint examples

| Server | Base URL | Key |
|---|---|---|
| Ollama | `http://localhost:11434/v1` | none |
| Ollama, app in Docker | `http://host.docker.internal:11434/v1` | none |
| LM Studio | `http://localhost:1234/v1` | none |
| vLLM | `http://localhost:8000/v1` | optional |
| Hosted OpenAI-compatible provider / gateway | provider's documented `/v1` URL | required |

## Data transmission

Local endpoints (loopback / private network) receive data without extra consent. Non-local endpoints require the
consent checkbox (or `LLM_EXTERNAL_DATA_CONSENT=true` for the env config). Each task sends only the context relevant
to it (e.g. one round's JD excerpt, ≤6k chars of CV, related past questions) — never the whole history.

## SSRF protection

Base URLs must be `http(s)`, may not embed credentials, and are DNS-resolved and checked on save **and** before each
call. Cloud metadata / link-local addresses are always blocked. On shared deployments set
`LLM_ALLOW_PRIVATE_NETWORK=false` to also block loopback and private ranges.

## Troubleshooting

| Message | Meaning / fix |
|---|---|
| `Cannot reach host (ECONNREFUSED)` | Server not running or wrong port. From Docker use `host.docker.internal`. |
| `rejected the API key (401)` | Wrong or missing key. Re-enter it (leaving the field untouched keeps the saved key). |
| `Not found (404) … model … /v1` | Model name wrong, or base URL missing the `/v1` prefix. |
| `timed out after N ms` | Raise the timeout or use a smaller model. Long course generation on CPU-only Ollama can take minutes. |
| `Model output did not match the required schema` | Model too small to follow JSON reliably. Use a larger model or JSON-mode-capable server; the task retries automatically. |
| `Endpoint is not local and sending interview data … not allowed` | Tick the consent checkbox in AI settings (or set `LLM_EXTERNAL_DATA_CONSENT=true`). |
| `Private and loopback addresses are disabled` | `LLM_ALLOW_PRIVATE_NETWORK=false` on this server. |

Token usage per call is recorded (when the endpoint reports it) and shown under AI configuration and Analytics.
Cost estimates are not computed because OpenAI-compatible endpoints do not report prices.
