'use client';
import { Globe, KeyRound, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AutoApplyNav } from '@/components/auto-apply-bits';
import { Badge, Button, Card, CardHeader, ErrorBox, Field, Input, Loading, PageHeader, Select, Textarea, useAction } from '@/components/ui';
import { api, refresh, useApi } from '@/lib/api';
import { fmtDate, relTime } from '@/lib/utils';

interface Prefs { titles: string[]; locations: string[]; keywords: string[]; excludeKeywords: string[]; languages: string[]; minSalary?: number; salaryCurrency?: string; salaryPeriod?: 'year' | 'month'; remoteOk: boolean; maxAgeDays: number; searchLocations: string[]; searchCountry: string; sites: string[]; maxSearchQueries: number }
interface Standing {
  fullName?: string; email?: string; phone?: string; linkedinUrl?: string; githubUrl?: string; websiteUrl?: string; currentLocation?: string; noticePeriod?: string;
  salaryExpectation?: string; workAuthorization?: string; requiresSponsorship?: 'yes' | 'no'; willingToRelocate?: 'yes' | 'no'; demographics: 'decline' | 'ask_me';
  consentToPrivacyNotices: boolean; consentToAccuracyDeclarations: boolean; custom: { match: string; answer: string }[];
}
interface Config { preferences: Prefs; standingAnswers: Standing; autoSubmit: boolean; minShortlistScore: number; minAutoApplyScore: number; dailyApplyCap: number; allowAiFreeText: boolean; discoveryHours: number }

interface Provider { type: string; label: string; id: string | null; enabled: boolean; hasKey: boolean; apiKeyLast4: string | null; monthlyBudget: number; usedThisMonth: number; everyHours: number; lastRunAt: string | null; lastError: string | null; lastFoundCount: number }

const SITES = [['linkedin', 'LinkedIn'], ['indeed', 'Indeed'], ['bayt', 'Bayt'], ['gulftalent', 'GulfTalent'], ['naukrigulf', 'Naukrigulf'], ['company', 'Company career pages'], ['other', 'Other job sites']] as const;
const PROVIDER_HELP: Record<string, React.ReactNode> = {
  GOOGLE_JOBS: <>Google's job index: LinkedIn, Indeed, Bayt, GulfTalent, Naukrigulf and company pages in one search. Free key (250 searches/month) at <a className="underline" href="https://serpapi.com/users/sign_up" target="_blank" rel="noreferrer">serpapi.com</a>.</>,
  JOOBLE: <>Job aggregator with its own index. Free key from <a className="underline" href="https://jooble.org/api/about" target="_blank" rel="noreferrer">jooble.org/api/about</a>.</>,
};

function ProviderRow({ p }: { p: Provider }) {
  const { busy, run } = useAction();
  const [key, setKey] = useState('');
  const [budget, setBudget] = useState(String(p.monthlyBudget));
  const [hours, setHours] = useState(String(p.everyHours));
  const save = async (body: Record<string, unknown>, msg = 'Saved') => { if (await run('s', () => api(`/autoapply/providers/${p.type}`, { method: 'PUT', body }), msg)) { setKey(''); refresh('/autoapply'); } };
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm font-medium">{p.label} {p.hasKey ? <Badge tone="success">key …{p.apiKeyLast4}</Badge> : <Badge>no key</Badge>} {p.hasKey && !p.enabled && <Badge>paused</Badge>}</p>
        {p.hasKey && <Button size="sm" variant="ghost" onClick={() => save({ enabled: !p.enabled })}>{p.enabled ? 'Pause' : 'Resume'}</Button>}
        {p.id && p.hasKey && <Button size="sm" variant="outline" loading={busy === 'run'} onClick={async () => { const r = await run('run', () => api<{ found: number; created: number; error?: string }>(`/autoapply/sources/${p.id}/run`, { method: 'POST' })); if (r) refresh('/autoapply'); }}>Search now</Button>}
      </div>
      <p className="text-xs text-muted">{PROVIDER_HELP[p.type]}</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_140px_140px_auto] sm:items-end">
        <Field label={p.hasKey ? 'Replace API key' : 'API key'}><Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={p.hasKey ? 'stored encrypted' : 'paste key'} /></Field>
        <Field label="Searches / month"><Input type="number" min={1} value={budget} onChange={(e) => setBudget(e.target.value)} /></Field>
        <Field label="Search every (hours)"><Input type="number" min={1} max={168} value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
        <Button size="sm" loading={busy === 's'} onClick={() => save({ ...(key.trim() && { apiKey: key.trim(), enabled: true }), monthlyBudget: Number(budget) || undefined, everyHours: Number(hours) || undefined })}>Save</Button>
      </div>
      <p className="text-xs text-muted">Used {p.usedThisMonth} / {p.monthlyBudget} this month · last search {p.lastRunAt ? relTime(p.lastRunAt) : 'never'}{p.lastRunAt && !p.lastError && ` · ${p.lastFoundCount} matching jobs`}
        {p.hasKey && <button type="button" className="ml-2 text-danger underline" onClick={() => confirm(`Remove the ${p.label} key?`) && save({ apiKey: '', enabled: false }, 'Key removed')}>remove key</button>}</p>
      {p.lastError && <p className="text-xs text-danger">Last error: {p.lastError}</p>}
    </div>
  );
}

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined)) as T;

export default function AutoApplySettings() {
  const { data, error, isLoading, mutate } = useApi<Config>('/autoapply/config');
  const { data: presets } = useApi<Record<string, Prefs>>('/autoapply/presets');
  const { data: providers } = useApi<Provider[]>('/autoapply/providers');
  const { data: tokens, mutate: mutateTokens } = useApi<{ id: string; label: string; createdAt: string; expiresAt: string }[]>('/autoapply/runner-tokens');
  const { busy, run } = useAction();
  const [p, setP] = useState<Record<string, string | boolean>>({});
  const [s, setS] = useState<Standing | null>(null);
  const [g, setG] = useState({ autoSubmit: false, minShortlistScore: 60, minAutoApplyScore: 75, dailyApplyCap: 10, allowAiFreeText: true, discoveryHours: 12 });
  const [newToken, setNewToken] = useState('');
  const fillPrefs = (x: Prefs) => setP({ titles: x.titles.join(', '), locations: x.locations.join(', '), keywords: x.keywords.join(', '), excludeKeywords: x.excludeKeywords.join(', '), languages: x.languages.join(', '), minSalary: x.minSalary ? String(x.minSalary) : '', salaryCurrency: x.salaryCurrency ?? '', salaryPeriod: x.salaryPeriod ?? 'month', remoteOk: x.remoteOk, maxAgeDays: String(x.maxAgeDays), searchLocations: x.searchLocations.join(', '), searchCountry: x.searchCountry, sites: x.sites.join(','), maxSearchQueries: String(x.maxSearchQueries) });
  useEffect(() => {
    if (!data) return;
    fillPrefs(data.preferences);
    setS({ ...data.standingAnswers, custom: data.standingAnswers.custom ?? [] });
    setG({ autoSubmit: data.autoSubmit, minShortlistScore: data.minShortlistScore, minAutoApplyScore: data.minAutoApplyScore, dailyApplyCap: data.dailyApplyCap, allowAiFreeText: data.allowAiFreeText, discoveryHours: data.discoveryHours });
  }, [data]);
  if (isLoading || !s) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;

  const save = async () => {
    const preferences = {
      titles: list(String(p.titles)), locations: list(String(p.locations)), keywords: list(String(p.keywords)), excludeKeywords: list(String(p.excludeKeywords)), languages: list(String(p.languages)),
      remoteOk: !!p.remoteOk, maxAgeDays: Number(p.maxAgeDays) || 45,
      searchLocations: list(String(p.searchLocations)), searchCountry: String(p.searchCountry || 'ae').toLowerCase(), sites: list(String(p.sites)), maxSearchQueries: Number(p.maxSearchQueries) || 6, ...(p.minSalary ? { minSalary: Number(p.minSalary), salaryCurrency: String(p.salaryCurrency).toUpperCase(), salaryPeriod: p.salaryPeriod } : {}),
    };
    const standingAnswers = { ...clean(s), custom: s.custom.filter((c) => c.match.trim() && c.answer.trim()) };
    const r = await run('save', () => api<{ rescored: number }>('/autoapply/config', { method: 'PUT', body: { preferences, standingAnswers, ...g } }));
    if (r) { mutate(); }
  };
  const setStanding = (k: keyof Standing) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setS({ ...s, [k]: e.target.value || undefined } as Standing);

  return (
    <div className="space-y-4">
      <PageHeader title="Auto Apply settings" description="What to look for, how far automation may go, and the answers it is allowed to use." actions={<Button onClick={save} loading={busy === 'save'}>Save settings</Button>} />
      <AutoApplyNav />

      <Card className={g.autoSubmit ? 'border-success/40' : ''}>
        <CardHeader title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Automation level</span>} />
        <div className="space-y-3 p-4 text-sm">
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={g.autoSubmit} onChange={(e) => setG({ ...g, autoSubmit: e.target.checked })} />
            <span><strong>Auto-submit, no stop</strong>: jobs that pass every guardrail are approved and submitted by the apply runner without asking you.
              <span className="block text-xs text-muted">Off: the runner fills the form and you click Submit yourself. Either way it stops on CAPTCHA/login, never invents answers, never applies twice and records proof.</span></span></label>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Shortlist at score ≥"><Input type="number" min={0} max={100} value={g.minShortlistScore} onChange={(e) => setG({ ...g, minShortlistScore: Number(e.target.value) })} /></Field>
            <Field label="Auto-apply at score ≥"><Input type="number" min={0} max={100} value={g.minAutoApplyScore} onChange={(e) => setG({ ...g, minAutoApplyScore: Number(e.target.value) })} /></Field>
            <Field label="Max automatic applications / 24h"><Input type="number" min={0} max={100} value={g.dailyApplyCap} onChange={(e) => setG({ ...g, dailyApplyCap: Number(e.target.value) })} /></Field>
            <Field label="Scan sources every (hours)"><Input type="number" min={1} max={168} value={g.discoveryHours} onChange={(e) => setG({ ...g, discoveryHours: Number(e.target.value) })} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={g.allowAiFreeText} onChange={(e) => setG({ ...g, allowAiFreeText: e.target.checked })} />Let AI draft open-ended answers ("Why us?") from your profile (needs an LLM endpoint)</label>
          <p className="text-xs text-muted">Auto-submit guardrails: score ≥ threshold · no blockers · every required answer verified · supported form (Greenhouse, Lever, Ashby) · not applied before (here or in your tracker) · under the daily cap.</p>
        </div>
      </Card>

      <Card>
        <CardHeader title="What to look for" description="Changing these re-scores jobs you haven't acted on yet." action={presets && <Select aria-label="Preset" className="h-8 w-56 text-xs" value="" onChange={(e) => presets[e.target.value] && fillPrefs(presets[e.target.value])}><option value="">Load a preset…</option>{Object.keys(presets).map((k) => <option key={k}>{k}</option>)}</Select>} />
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Target titles (comma separated)"><Textarea value={String(p.titles ?? '')} onChange={(e) => setP({ ...p, titles: e.target.value })} className="min-h-16" /></Field>
          <Field label="Locations"><Textarea value={String(p.locations ?? '')} onChange={(e) => setP({ ...p, locations: e.target.value })} className="min-h-16" placeholder="Dubai, Abu Dhabi, United Arab Emirates" /></Field>
          <Field label="Skills / keywords that count"><Input value={String(p.keywords ?? '')} onChange={(e) => setP({ ...p, keywords: e.target.value })} /></Field>
          <Field label="Exclude jobs containing"><Input value={String(p.excludeKeywords ?? '')} onChange={(e) => setP({ ...p, excludeKeywords: e.target.value })} placeholder="intern, PHP" /></Field>
          <Field label="Languages you work in"><Input value={String(p.languages ?? '')} onChange={(e) => setP({ ...p, languages: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Minimum salary"><Input type="number" min={0} value={String(p.minSalary ?? '')} onChange={(e) => setP({ ...p, minSalary: e.target.value })} /></Field>
            <Field label="Currency"><Input value={String(p.salaryCurrency ?? '')} onChange={(e) => setP({ ...p, salaryCurrency: e.target.value })} placeholder="AED" /></Field>
            <Field label="Per"><Select value={String(p.salaryPeriod ?? 'month')} onChange={(e) => setP({ ...p, salaryPeriod: e.target.value })}><option value="month">month</option><option value="year">year</option></Select></Field>
          </div>
          <Field label="Ignore jobs older than (days)"><Input type="number" min={1} value={String(p.maxAgeDays ?? '45')} onChange={(e) => setP({ ...p, maxAgeDays: e.target.value })} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={!!p.remoteOk} onChange={(e) => setP({ ...p, remoteOk: e.target.checked })} />Remote roles are fine</label>
        </div>
      </Card>

      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Globe className="h-4 w-4" />Where to search</span>} description="Jobs are found by your target titles × search locations, then scored and queued automatically. No company or URL needed." />
        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
            <Field label="Search in" hint="One search per title per place"><Input value={String(p.searchLocations ?? '')} onChange={(e) => setP({ ...p, searchLocations: e.target.value })} placeholder="Dubai, Abu Dhabi" /></Field>
            <Field label="Country code" hint="ae, sa, gb, us…"><Input maxLength={2} value={String(p.searchCountry ?? 'ae')} onChange={(e) => setP({ ...p, searchCountry: e.target.value })} /></Field>
            <Field label="Max searches per run" hint="titles × places, capped"><Input type="number" min={1} max={30} value={String(p.maxSearchQueries ?? '6')} onChange={(e) => setP({ ...p, maxSearchQueries: e.target.value })} /></Field>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Apply through these sites (the best allowed link is picked per job: a supported company form first, then the careers page, then job boards)</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
              {SITES.map(([v, label]) => {
                const on = String(p.sites ?? '').split(',').includes(v);
                return <label key={v} className="flex items-center gap-1.5"><input type="checkbox" checked={on} onChange={(e) => { const cur = String(p.sites ?? '').split(',').filter(Boolean); setP({ ...p, sites: (e.target.checked ? [...cur, v] : cur.filter((x) => x !== v)).join(',') }); }} />{label}</label>;
              })}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted">Search providers (keys are stored encrypted and never shown again)</p>
            {providers?.map((x) => <ProviderRow key={`${x.type}${x.hasKey}${x.monthlyBudget}${x.everyHours}`} p={x} />)}
            <p className="text-xs text-muted">LinkedIn and Indeed have no public job-search API and forbid crawling: their jobs come through Google Jobs, or paste their alert emails on Discover. Company boards you follow closely can still be added under Sources.</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Standing answers" description="The ONLY source for factual and sensitive form answers. Leave blank to be asked per job; nothing is ever guessed." />
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <Field label="Full name (as on applications)"><Input value={s.fullName ?? ''} onChange={setStanding('fullName')} /></Field>
          <Field label="Email for applications"><Input type="email" value={s.email ?? ''} onChange={setStanding('email')} /></Field>
          <Field label="Phone"><Input value={s.phone ?? ''} onChange={setStanding('phone')} placeholder="+971 …" /></Field>
          <Field label="LinkedIn URL"><Input type="url" value={s.linkedinUrl ?? ''} onChange={setStanding('linkedinUrl')} /></Field>
          <Field label="GitHub URL"><Input type="url" value={s.githubUrl ?? ''} onChange={setStanding('githubUrl')} /></Field>
          <Field label="Website / portfolio"><Input type="url" value={s.websiteUrl ?? ''} onChange={setStanding('websiteUrl')} /></Field>
          <Field label="Current location"><Input value={s.currentLocation ?? ''} onChange={setStanding('currentLocation')} /></Field>
          <Field label="Notice period / start"><Input value={s.noticePeriod ?? ''} onChange={setStanding('noticePeriod')} placeholder="30 days" /></Field>
          <Field label="Salary expectation (exact wording)"><Input value={s.salaryExpectation ?? ''} onChange={setStanding('salaryExpectation')} placeholder="AED 20,000 per month" /></Field>
          <Field label="Work authorisation answer"><Input value={s.workAuthorization ?? ''} onChange={setStanding('workAuthorization')} placeholder="Yes" /></Field>
          <Field label="Need visa sponsorship?"><Select value={s.requiresSponsorship ?? ''} onChange={setStanding('requiresSponsorship')}><option value="">Ask me per job</option><option value="no">No</option><option value="yes">Yes</option></Select></Field>
          <Field label="Willing to relocate?"><Select value={s.willingToRelocate ?? ''} onChange={setStanding('willingToRelocate')}><option value="">Ask me per job</option><option value="yes">Yes</option><option value="no">No</option></Select></Field>
        </div>
        <div className="space-y-2 border-t border-border p-4 text-sm">
          <p className="text-xs font-medium text-muted">Explicit decisions (off by default)</p>
          <Field label="Demographic / EEO questions"><Select value={s.demographics} onChange={(e) => setS({ ...s, demographics: e.target.value as Standing['demographics'] })} className="sm:w-72"><option value="ask_me">Leave them for me</option><option value="decline">Always choose “decline to answer”</option></Select></Field>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={s.consentToPrivacyNotices} onChange={(e) => setS({ ...s, consentToPrivacyNotices: e.target.checked })} /><span>I consent to standard privacy / data-processing notices on job applications <span className="block text-xs text-muted">Unticked: any form with such a checkbox stops for you.</span></span></label>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={s.consentToAccuracyDeclarations} onChange={(e) => setS({ ...s, consentToAccuracyDeclarations: e.target.checked })} /><span>I agree to “I certify my information is accurate” declarations</span></label>
        </div>
        <div className="space-y-2 border-t border-border p-4">
          <p className="text-xs font-medium text-muted">Custom answers: used when a question label contains the phrase</p>
          {s.custom.map((c, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <Input aria-label="Question contains" value={c.match} placeholder="years of Python" onChange={(e) => setS({ ...s, custom: s.custom.map((x, j) => (j === i ? { ...x, match: e.target.value } : x)) })} />
              <Input aria-label="Answer" value={c.answer} placeholder="7" onChange={(e) => setS({ ...s, custom: s.custom.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)) })} />
              <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => setS({ ...s, custom: s.custom.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setS({ ...s, custom: [...s.custom, { match: '', answer: '' }] })}><Plus className="h-3.5 w-3.5" />Add custom answer</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4" />Apply runner</span>} description="A small program on your computer that opens approved jobs in a dedicated browser profile and fills them in." />
        <div className="space-y-3 p-4 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-xs">
            <li>Create a token below (shown once).</li>
            <li>In the project folder run: <code className="rounded bg-surface-2 px-1">pnpm install &amp;&amp; npx playwright install chromium</code></li>
            <li>Start it: <code className="block mt-1 rounded bg-surface-2 px-2 py-1">ICC_API_URL=http://localhost:3000 ICC_RUNNER_TOKEN=&lt;token&gt; pnpm apply:runner</code></li>
          </ol>
          <p className="text-xs text-muted">It uses its own browser profile (~/.icc-apply-runner/profiles/jobs), never your everyday Chrome. If a site asks you to log in or solve a CAPTCHA, it stops and the job shows “Needs attention”.</p>
          <div className="flex gap-2"><Button size="sm" loading={busy === 'tok'} onClick={async () => { const t = await run('tok', () => api<{ token: string }>('/autoapply/runner-tokens', { body: { label: 'apply-runner' } })); if (t) { setNewToken(t.token); mutateTokens(); } }}>Create runner token</Button></div>
          {newToken && <p className="break-all rounded-md border border-warning/40 bg-warning-soft p-2 font-mono text-xs">{newToken}<span className="mt-1 block font-sans text-warning">Copy it now; it won't be shown again.</span></p>}
          <ul className="divide-y divide-border">{tokens?.map((t) => <li key={t.id} className="flex items-center justify-between py-1.5 text-xs"><span>{t.label} <Badge>created {fmtDate(t.createdAt)}</Badge> <span className="text-muted">expires {fmtDate(t.expiresAt)}</span></span><Button size="sm" variant="ghost" className="text-danger" onClick={async () => { await run('rv', () => api(`/autoapply/runner-tokens/${t.id}`, { method: 'DELETE' }), 'Token revoked'); mutateTokens(); }}>Revoke</Button></li>)}</ul>
        </div>
      </Card>
      <div className="flex justify-end"><Button onClick={save} loading={busy === 'save'}>Save settings</Button></div>
    </div>
  );
}
