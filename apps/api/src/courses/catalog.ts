/**
 * Built-in, AI-free topic catalog. It gives every round type a sensible baseline plan when no LLM or agent is
 * available. Questions here are template PRACTICE questions — never presented as questions a company asked.
 */
export interface CatalogTopic {
  key: string;
  title: string;
  kind: 'concept' | 'coding' | 'system_design' | 'behavioral' | 'recruiter' | 'take_home';
  roundTypes: string[];
  minutes: number;
  keywords: string[];
  objectives: string[];
  explanation: string;
  questions: string[];
  criteria: string[];
  mistakes: string[];
}

const B = ['backend', 'technical_screen'];
const AI = ['ai_llm', 'technical_screen'];

export const CATALOG: CatalogTopic[] = [
  // ── Recruiter / HR ──
  {
    key: 'career-narrative', title: 'Career narrative & introduction', kind: 'recruiter', roundTypes: ['recruiter_screen', 'behavioral'], minutes: 45,
    keywords: [], objectives: ['Deliver a 90-second introduction tied to this role', 'Explain each career move with a positive reason'],
    explanation: 'Structure: present (current role, scope, one measurable win) → past (2 formative roles, what you learned) → future (why this role, why now). Tie every sentence to the job description. Keep it under two minutes and end with a hook the interviewer can ask about.',
    questions: ['Walk me through your background.', 'Why are you looking to move now?', 'Why this company and this role?'],
    criteria: ['Under two minutes', 'Mentions concrete impact with numbers', 'Connects explicitly to the role'],
    mistakes: ['Reciting the CV chronologically', 'Negative comments about current employer', 'No clear reason for the move'],
  },
  {
    key: 'logistics-salary', title: 'Salary, notice period & logistics', kind: 'recruiter', roundTypes: ['recruiter_screen'], minutes: 30,
    keywords: ['salary', 'compensation', 'visa', 'relocation'], objectives: ['State a researched salary range confidently', 'Answer notice period and availability precisely'],
    explanation: 'Anchor with a range whose floor is your real target, stated as total monthly package. Defer if asked too early ("I\'d like to understand the scope first; based on market data I\'m targeting X–Y"). Be exact about notice period and the earliest start date; mention flexibility only if real.',
    questions: ['What are your salary expectations?', 'What is your notice period?', 'Are you interviewing elsewhere?'],
    criteria: ['Gives a range, not a single number', 'Consistent with profile target', 'No apology or hedging'],
    mistakes: ['Naming a number below target', 'Disclosing current salary unprompted', 'Vague availability'],
  },
  {
    key: 'questions-for-recruiter', title: 'Questions to ask the interviewer', kind: 'recruiter', roundTypes: ['recruiter_screen', 'behavioral', 'technical_screen', 'system_design'], minutes: 20,
    keywords: [], objectives: ['Prepare 5 role-specific questions', 'Learn the remaining interview process'],
    explanation: 'Ask about the process (rounds, timeline, decision makers), the team (size, on-call, how work is planned) and success criteria (what does great look like at 6 months). Avoid questions the job post already answers.',
    questions: ['What questions do you have for me?'],
    criteria: ['Questions show research', 'At least one about success criteria'], mistakes: ['Asking nothing', 'Asking only about perks'],
  },
  // ── Behavioral ──
  {
    key: 'star-stories', title: 'STAR story bank', kind: 'behavioral', roundTypes: ['behavioral', 'recruiter_screen'], minutes: 90,
    keywords: ['ownership', 'leadership', 'mentor', 'stakeholder', 'collaborat'], objectives: ['Prepare 6 stories covering ownership, conflict, failure, delivery, leadership, ambiguity', 'Quantify each result'],
    explanation: 'Situation (1–2 lines) → Task (your responsibility) → Action (70% of the time; "I", specific decisions and trade-offs) → Result (numbers, what you learned). One story can serve several prompts; map each story to competencies. Rehearse aloud; time each under 3 minutes.',
    questions: ['Tell me about a time you owned a problem end to end.', 'Describe a conflict with a colleague and how you resolved it.', 'Tell me about a failure and what you changed afterwards.', 'Tell me about delivering under a tight deadline.'],
    criteria: ['Clear personal actions', 'Quantified result', 'Reflection / learning'], mistakes: ['Using "we" throughout', 'No result', 'Stories longer than 4 minutes'],
  },
  {
    key: 'engineering-judgment', title: 'Engineering judgment & trade-offs', kind: 'behavioral', roundTypes: ['behavioral'], minutes: 45,
    keywords: ['architecture', 'technical debt', 'lead'], objectives: ['Explain a significant technical decision and its alternatives', 'Show how you balance speed vs quality'],
    explanation: 'Hiring managers probe how you decide. For each major decision: constraints, options considered, why you chose, what you would change now. Show you measure outcomes and revisit decisions.',
    questions: ['Tell me about a technical decision you would make differently today.', 'How do you handle technical debt against feature pressure?'],
    criteria: ['Names alternatives', 'Explains constraints', 'Honest retrospective'], mistakes: ['Presenting decisions as obvious', 'Blaming others'],
  },
  // ── Backend ──
  {
    key: 'python-internals', title: 'Python internals & concurrency', kind: 'concept', roundTypes: [...B], minutes: 60,
    keywords: ['python', 'asyncio', 'gil', 'django', 'fastapi'], objectives: ['Explain the GIL and when threads, processes or asyncio fit', 'Explain generators, context managers and decorators'],
    explanation: 'The GIL lets one thread execute Python bytecode at a time: threads help for I/O-bound work, multiprocessing for CPU-bound work, asyncio for many concurrent I/O tasks on one thread with cooperative scheduling. Blocking calls inside async code stall the event loop — use run_in_executor or async libraries. Know memory management (refcount + cyclic GC), mutable default arguments, and how descriptors power properties and ORMs.',
    questions: ['When would you use asyncio vs threads vs multiprocessing?', 'What happens if you call a blocking function inside an async endpoint in FastAPI?', 'How does a decorator with arguments work?'],
    criteria: ['Correct GIL explanation', 'Concrete examples', 'Mentions event loop blocking'], mistakes: ['Claiming threads never help in Python', 'Confusing concurrency and parallelism'],
  },
  {
    key: 'django-fastapi', title: 'Django & FastAPI in production', kind: 'concept', roundTypes: [...B], minutes: 60,
    keywords: ['django', 'fastapi', 'orm', 'celery', 'pydantic'], objectives: ['Diagnose N+1 queries and fix with select_related/prefetch_related', 'Explain FastAPI dependency injection and sync vs async routes'],
    explanation: 'Django ORM: querysets are lazy; N+1 shows up in loops over related objects — use select_related (FK joins) and prefetch_related (separate query). Use transactions (atomic) and select_for_update for consistency. FastAPI: sync routes run in a threadpool, async routes on the loop; dependencies compose auth, DB sessions and settings; Pydantic validates I/O. Background work belongs in a queue (Celery/RQ/arq), not request handlers.',
    questions: ['How do you find and fix N+1 queries in Django?', 'How does FastAPI handle a sync def route vs async def?', 'How would you structure a long-running job triggered by an API call?'],
    criteria: ['Names specific ORM tools', 'Understands threadpool vs loop'], mistakes: ['Doing heavy work in the request cycle'],
  },
  {
    key: 'postgres-performance', title: 'PostgreSQL: indexes, plans & transactions', kind: 'concept', roundTypes: [...B, 'system_design'], minutes: 75,
    keywords: ['postgres', 'postgresql', 'sql', 'database', 'query'], objectives: ['Read EXPLAIN ANALYZE output', 'Choose isolation levels and explain MVCC'],
    explanation: 'B-tree indexes serve equality/range and ordering; composite index column order matters (leftmost prefix). Use EXPLAIN (ANALYZE, BUFFERS) to compare estimated vs actual rows. MVCC gives readers snapshots without blocking writers; vacuum reclaims dead tuples. Default Read Committed allows non-repeatable reads; use Repeatable Read/Serializable or SELECT ... FOR UPDATE for invariants. Partial, covering (INCLUDE) and GIN indexes solve specific problems.',
    questions: ['A query got slow after data grew 10x. How do you investigate?', 'Explain MVCC and why long transactions hurt.', 'How do you prevent double-spending in a balance update?'],
    criteria: ['Uses EXPLAIN', 'Knows index trade-offs', 'Correct locking strategy'], mistakes: ['Indexing everything', 'Ignoring write amplification'],
  },
  {
    key: 'caching-redis', title: 'Caching & Redis', kind: 'concept', roundTypes: [...B, 'system_design'], minutes: 45,
    keywords: ['redis', 'cache', 'caching', 'memcached'], objectives: ['Compare cache-aside, write-through and write-behind', 'Handle stampedes, invalidation and TTLs'],
    explanation: 'Cache-aside is the default: read cache → miss → load DB → set with TTL. Invalidate on write (delete, not update) to avoid races. Stampede protection: request coalescing, locks, or probabilistic early refresh. Redis also serves rate limiting (INCR + EXPIRE, sliding windows), distributed locks (with fencing caveats), queues and pub/sub. Know persistence (RDB/AOF) and eviction policies.',
    questions: ['How do you keep a cache consistent with the database?', 'Design a rate limiter with Redis.', 'What is a cache stampede and how do you prevent it?'],
    criteria: ['Mentions invalidation race', 'Knows eviction and TTL'], mistakes: ['Treating Redis locks as perfectly safe'],
  },
  {
    key: 'queues-async', title: 'Queues, background jobs & idempotency', kind: 'concept', roundTypes: [...B, 'system_design'], minutes: 45,
    keywords: ['kafka', 'rabbitmq', 'celery', 'queue', 'event', 'async', 'sqs'], objectives: ['Explain at-least-once delivery and idempotent consumers', 'Compare Kafka with RabbitMQ/SQS'],
    explanation: 'Most queues deliver at least once, so consumers must be idempotent (idempotency keys, upserts, dedupe tables). Use retries with exponential backoff and dead-letter queues. Kafka is a partitioned log (ordering per partition, replay, consumer groups); RabbitMQ/SQS are message brokers with per-message acks. The outbox pattern makes DB writes and event publishing consistent.',
    questions: ['How do you guarantee a payment webhook is processed exactly once?', 'When would you choose Kafka over RabbitMQ?', 'Explain the transactional outbox pattern.'],
    criteria: ['Knows exactly-once is effectively idempotency', 'Mentions DLQ'], mistakes: ['Assuming exactly-once delivery'],
  },
  {
    key: 'api-design-security', title: 'API design, auth & security', kind: 'concept', roundTypes: [...B], minutes: 45,
    keywords: ['api', 'rest', 'graphql', 'grpc', 'oauth', 'jwt', 'security', 'auth'], objectives: ['Design resource-oriented REST APIs with pagination and versioning', 'Compare session cookies, JWT and OAuth2 flows'],
    explanation: 'Use nouns, proper status codes, cursor pagination for large sets, idempotency keys for unsafe retries, and consistent error bodies. Auth: server sessions are revocable; JWTs are stateless but hard to revoke — keep them short-lived with refresh tokens. OWASP basics: injection, broken access control (check ownership server-side on every request), SSRF, rate limiting, secrets management.',
    questions: ['How would you paginate an endpoint returning millions of rows?', 'JWT vs server sessions — trade-offs?', 'How do you make a POST endpoint safe to retry?'],
    criteria: ['Mentions authorization per object', 'Cursor vs offset reasoning'], mistakes: ['Relying on frontend checks'],
  },
  {
    key: 'observability-debugging', title: 'Testing, observability & production debugging', kind: 'concept', roundTypes: [...B], minutes: 40,
    keywords: ['observability', 'monitoring', 'testing', 'sre', 'incident', 'prometheus', 'grafana', 'opentelemetry'], objectives: ['Walk through debugging a latency spike', 'Explain the test pyramid for a backend service'],
    explanation: 'Logs (structured, correlated by request id), metrics (RED/USE, percentiles not averages), traces (spans across services). Debugging: confirm impact → check recent deploys → dashboards → narrow by dimension → hypothesis → mitigate first (rollback/feature flag) → root cause → postmortem. Tests: many unit, fewer integration (real DB via containers), few end-to-end.',
    questions: ['p99 latency doubled after a deploy. Walk me through your investigation.', 'How do you test code that talks to PostgreSQL and Redis?'],
    criteria: ['Mitigation before root cause', 'Uses percentiles'], mistakes: ['Jumping to a fix without data'],
  },
  {
    key: 'go-concurrency', title: 'Go: goroutines, channels & context', kind: 'concept', roundTypes: [...B], minutes: 45,
    keywords: ['go', 'golang', 'goroutine'], objectives: ['Explain goroutines, channels and select', 'Use context for cancellation and timeouts'],
    explanation: 'Goroutines are cheap, multiplexed onto OS threads by the runtime scheduler. Channels synchronize and communicate; unbuffered channels hand off, buffered decouple. Use sync.WaitGroup, errgroup, and context.Context for cancellation; always prevent goroutine leaks. Interfaces are satisfied implicitly; errors are values — wrap with %w.',
    questions: ['How do you avoid goroutine leaks?', 'Implement a worker pool with bounded concurrency.'],
    criteria: ['Uses context', 'Closes channels correctly'], mistakes: ['Writing to a closed channel'],
  },
  // ── Coding ──
  {
    key: 'dsa-patterns', title: 'Core DSA patterns', kind: 'coding', roundTypes: ['coding', 'technical_screen'], minutes: 120,
    keywords: ['algorithm', 'data structure', 'leetcode', 'coding'], objectives: ['Recognise hash map, two pointers, sliding window, BFS/DFS, heap and binary search patterns', 'State time/space complexity for each solution'],
    explanation: 'Interview loop: clarify (inputs, constraints, edge cases) → examples → brute force + complexity → optimise with a pattern → code cleanly → test with edge cases aloud. Patterns: hash map for lookups/counting, two pointers/sliding window for subarrays, BFS for shortest path in unweighted graphs, heap for top-k/streams, binary search on answer space, DP when subproblems overlap.',
    questions: ['Given an array and target, return indices of two numbers summing to target.', 'Find the length of the longest substring without repeating characters.', 'Return the k most frequent elements.', 'Merge overlapping intervals.'],
    criteria: ['Clarifies constraints', 'Correct complexity', 'Tests edge cases'], mistakes: ['Coding before clarifying', 'Silent coding'],
  },
  {
    key: 'coding-communication', title: 'Thinking aloud & code quality under time', kind: 'coding', roundTypes: ['coding'], minutes: 30,
    keywords: [], objectives: ['Narrate trade-offs while coding', 'Write readable, testable code in 30 minutes'],
    explanation: 'Interviewers grade communication and code quality, not only correctness. Name variables well, extract helpers, handle edge cases explicitly, and walk a test case through your code before saying "done". If stuck, say what you are considering and ask for a hint rather than going silent.',
    questions: ['Implement an LRU cache with O(1) get and put.'],
    criteria: ['Readable names', 'Self-tests'], mistakes: ['Going silent when stuck'],
  },
  // ── System design ──
  {
    key: 'sd-framework', title: 'System design interview framework', kind: 'system_design', roundTypes: ['system_design'], minutes: 60,
    keywords: ['system design', 'architecture', 'scalab', 'distributed', 'capacity', 'estimat'], objectives: ['Run a 45-minute design with clear phases', 'Make capacity estimates quickly'],
    explanation: 'Requirements (functional + non-functional, ~5 min) → core entities and API → high-level design that satisfies functional requirements → deep dives driven by non-functional requirements (scale, latency, consistency, availability) → bottlenecks and trade-offs. Estimate only what changes the design (QPS, storage, read/write ratio). State assumptions and keep a visible diagram.',
    questions: ['Design a URL shortener.', 'Design a rate limiter for a public API.', 'Design a notification service sending email, SMS and push.'],
    criteria: ['Clarifies requirements', 'Justifies each component', 'Discusses trade-offs'], mistakes: ['Drawing boxes before requirements', 'Name-dropping tech without reasons'],
  },
  {
    key: 'sd-data-consistency', title: 'Data modelling, sharding & consistency', kind: 'system_design', roundTypes: ['system_design'], minutes: 60,
    keywords: ['shard', 'partition', 'consistency', 'replication', 'nosql', 'cassandra', 'dynamo'], objectives: ['Choose SQL vs NoSQL per access pattern', 'Explain replication, partitioning and consistency trade-offs'],
    explanation: 'Start from access patterns. Replication: leader-follower (read scaling, replica lag), multi-leader, leaderless quorums. Partition by a key that spreads load and keeps related data together; beware hot keys. CAP is about partitions — choose behaviour under partition per feature. Use idempotency and sagas instead of distributed transactions across services.',
    questions: ['How would you shard a table of 5 billion messages?', 'How do you handle read-your-writes with read replicas?'],
    criteria: ['Access-pattern driven', 'Mentions hot keys'], mistakes: ['Sharding prematurely'],
  },
  {
    key: 'sd-reliability', title: 'Scalability, reliability & failure handling', kind: 'system_design', roundTypes: ['system_design'], minutes: 45,
    keywords: ['availability', 'reliability', 'latency', 'load balanc', 'cdn'], objectives: ['Design for failure with timeouts, retries, circuit breakers', 'Scale reads and writes independently'],
    explanation: 'Stateless services behind load balancers; caches and CDNs for reads; queues to smooth write bursts; async processing for slow work. Every network call needs a timeout, bounded retries with jitter, and idempotency. Use bulkheads and circuit breakers to contain failures; degrade gracefully. Define SLOs and monitor them.',
    questions: ['Your service depends on a flaky third-party API. How do you design around it?', 'How do you deploy a schema change with zero downtime?'],
    criteria: ['Timeouts + retries + idempotency', 'Graceful degradation'], mistakes: ['Retrying without backoff'],
  },
  // ── AI / LLM ──
  {
    key: 'rag-fundamentals', title: 'RAG: chunking, embeddings, retrieval & reranking', kind: 'concept', roundTypes: [...AI, 'system_design'], minutes: 75,
    keywords: ['rag', 'retrieval', 'embedding', 'vector', 'llm', 'search', 'pgvector'], objectives: ['Design an end-to-end RAG pipeline', 'Diagnose retrieval vs generation failures'],
    explanation: 'Pipeline: ingest → clean → chunk (structure-aware, overlap) → embed → index (vector + keyword/BM25 for hybrid) → retrieve top-k → rerank (cross-encoder) → assemble context with citations → generate → evaluate. Most failures are retrieval failures: measure recall@k on a labelled set before tuning prompts. Metadata filters, query rewriting and hybrid search fix many issues.',
    questions: ['Design a RAG system over 1M internal documents with access control.', 'Answers are wrong but sources look relevant — how do you debug?', 'How do you choose chunk size?'],
    criteria: ['Separates retrieval and generation evaluation', 'Mentions hybrid search and reranking', 'Access control at retrieval time'], mistakes: ['Tuning prompts before measuring retrieval'],
  },
  {
    key: 'llm-evaluation', title: 'LLM evaluation & observability', kind: 'concept', roundTypes: [...AI], minutes: 45,
    keywords: ['evaluation', 'eval', 'llm', 'quality', 'benchmark'], objectives: ['Build an offline eval set and metrics', 'Monitor LLM features in production'],
    explanation: 'Create a golden dataset from real traffic; define task-specific metrics (exact match, rubric scores, groundedness, citation accuracy). LLM-as-judge needs calibration against human labels. Track latency, token cost, refusal and error rates; log prompts/responses with PII controls; run regression evals on every prompt or model change.',
    questions: ['How would you evaluate a customer-support chatbot before launch?', 'What are the pitfalls of LLM-as-a-judge?'],
    criteria: ['Golden set', 'Regression testing', 'Judge calibration'], mistakes: ['Only vibe-checking outputs'],
  },
  {
    key: 'agents-tools', title: 'Agents, tool calling & structured outputs', kind: 'concept', roundTypes: [...AI], minutes: 45,
    keywords: ['agent', 'agentic', 'tool', 'function calling', 'langchain', 'langgraph'], objectives: ['Explain a tool-calling loop and its failure modes', 'Enforce structured outputs safely'],
    explanation: 'Agent loop: model proposes a tool call → app validates and executes → result appended → repeat until final answer, with step and cost limits. Validate tool arguments with schemas; make tools idempotent and least-privilege. Structured outputs via JSON schema/constrained decoding plus server-side validation and repair. Prefer simple workflows over open-ended agents when the path is known.',
    questions: ['Design an agent that books meetings using calendar and email tools.', 'How do you stop an agent from looping forever?'],
    criteria: ['Bounded loops', 'Validated tool args'], mistakes: ['Trusting model-generated arguments'],
  },
  {
    key: 'llm-security', title: 'Prompt injection & guardrails', kind: 'concept', roundTypes: [...AI], minutes: 30,
    keywords: ['security', 'guardrail', 'prompt injection', 'safety'], objectives: ['Explain direct vs indirect prompt injection', 'Design defence in depth'],
    explanation: 'Treat all retrieved content and tool output as untrusted data. Defences: privilege separation (the model cannot call dangerous tools without checks), allow-lists, output validation, human confirmation for side effects, content isolation in prompts, and monitoring. No prompt alone fully prevents injection.',
    questions: ['A RAG app ingests web pages. How could an attacker exploit it, and how do you defend?'],
    criteria: ['Mentions indirect injection', 'Defence in depth'], mistakes: ['Believing a system prompt is a security boundary'],
  },
  {
    key: 'model-serving', title: 'Model serving, latency & cost', kind: 'concept', roundTypes: [...AI, 'system_design'], minutes: 45,
    keywords: ['serving', 'inference', 'vllm', 'latency', 'gpu', 'cost', 'ollama'], objectives: ['Explain batching, KV cache and quantisation trade-offs', 'Reduce cost and latency of an LLM feature'],
    explanation: 'Latency = time to first token + tokens × time per token. Servers like vLLM use continuous batching and paged KV cache for throughput. Quantisation trades quality for memory/speed. Cost levers: smaller models for easy tasks (routing), caching, shorter prompts, prompt caching, streaming for perceived latency, async batch for offline work.',
    questions: ['Your LLM endpoint costs too much. What do you do?', 'Self-host vs API — how do you decide?'],
    criteria: ['Quantified reasoning', 'Routing by difficulty'], mistakes: ['Ignoring time to first token'],
  },
  // ── Take-home ──
  {
    key: 'take-home-execution', title: 'Take-home: plan, build, test, submit', kind: 'take_home', roundTypes: ['take_home'], minutes: 45,
    keywords: ['take-home', 'assignment'], objectives: ['Break the assignment into a time-boxed plan', 'Produce a reviewer-friendly submission'],
    explanation: 'Read requirements twice; list explicit and implicit requirements and ask clarifying questions early. Time-box: core flow first, then tests, then polish. Submission checklist: README with setup in one command, design decisions and trade-offs, what you would do with more time, tests that pass, no secrets, clean commit history.',
    questions: ['How would you approach a 4-hour take-home to build a small REST service?'],
    criteria: ['README quality', 'Tests', 'Explicit trade-offs'], mistakes: ['Over-building', 'No README'],
  },
];

export const ROUND_EXPECTATIONS: Record<string, { expectations: string; competencies: string[]; questionsToAsk: string[] }> = {
  recruiter_screen: {
    expectations: 'Short (20–30 min) conversation checking motivation, communication, logistics and salary alignment. Usually not technical.',
    competencies: ['Career narrative', 'Motivation for the role', 'Communication', 'Salary and availability alignment'],
    questionsToAsk: ['What does the rest of the process look like?', 'What is the team size and structure?', 'What would make someone successful in the first six months?'],
  },
  technical_screen: {
    expectations: 'Rapid short-answer questions and concept comparisons, followed by deeper follow-ups on whatever you claim.',
    competencies: ['Breadth of backend fundamentals', 'Precision of explanations', 'Handling follow-ups'],
    questionsToAsk: ['What does the team\'s stack look like today?', 'What are the biggest technical challenges this year?'],
  },
  coding: {
    expectations: 'One or two algorithmic or practical coding problems. Graded on problem solving, correctness, complexity analysis, code quality and communication.',
    competencies: ['Problem decomposition', 'Data structures', 'Complexity analysis', 'Testing', 'Communication while coding'],
    questionsToAsk: ['How does the team approach code review?', 'What does a typical week of engineering work look like?'],
  },
  backend: {
    expectations: 'Deep dive into backend engineering: APIs, databases, caching, queues, concurrency, testing and production operations, often grounded in your past projects.',
    competencies: ['Python/Go depth', 'PostgreSQL', 'Caching and queues', 'API design', 'Production debugging'],
    questionsToAsk: ['How do you handle on-call and incidents?', 'How are services deployed and observed?'],
  },
  system_design: {
    expectations: '45–60 minute open-ended design. Graded on requirements gathering, high-level design, deep dives, trade-offs and communication.',
    competencies: ['Requirements', 'Capacity estimation', 'Data modelling', 'Scalability', 'Reliability', 'Trade-off reasoning'],
    questionsToAsk: ['What scale does the team operate at today?', 'What is a recent architecture decision the team debated?'],
  },
  ai_llm: {
    expectations: 'Discussion of LLM application engineering: RAG, evaluation, agents, structured outputs, safety, serving and cost, often with a design exercise.',
    competencies: ['RAG design', 'Evaluation', 'Agents and tool calling', 'Prompt injection defence', 'Serving, latency and cost'],
    questionsToAsk: ['How do you evaluate LLM features before release?', 'Which models and serving stack do you use?'],
  },
  behavioral: {
    expectations: 'Hiring manager explores ownership, collaboration, conflict, failure, delivery and judgment through past examples.',
    competencies: ['Ownership', 'Collaboration', 'Conflict resolution', 'Learning from failure', 'Engineering judgment'],
    questionsToAsk: ['How do you measure success for this role?', 'How does the team give feedback?', 'What is the biggest challenge facing the team?'],
  },
  take_home: {
    expectations: 'Build a small project in limited time; graded on correctness, structure, tests, documentation and trade-off communication. Often followed by a review call.',
    competencies: ['Task breakdown', 'Code quality', 'Testing', 'Documentation'],
    questionsToAsk: ['What will the review call focus on?', 'Is there a preferred stack or constraints?'],
  },
};

export const expectationsFor = (roundType: string) =>
  ROUND_EXPECTATIONS[roundType] ?? { expectations: 'Custom round type: preparation is based on the job description and your history.', competencies: [], questionsToAsk: ROUND_EXPECTATIONS.behavioral.questionsToAsk };
