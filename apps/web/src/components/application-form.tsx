'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, ApiError, refresh, useApi } from '@/lib/api';
import { useSettings } from '@/lib/hooks';
import type { Application, WorkspaceSettings } from '@/lib/types';
import { toLocalInput } from '@/lib/utils';
import { Button, ErrorBox, Field, Input, Loading, Select, Textarea } from './ui';

const num = z.union([z.literal(''), z.coerce.number().int().min(0)]).optional().transform((v) => (v === '' || v === undefined ? null : v));
const schema = z.object({
  companyName: z.string().min(1, 'Required'), jobTitle: z.string().min(1, 'Required'), companyWebsite: z.string().optional(), location: z.string().optional(),
  seniority: z.string().optional(), jobUrl: z.string().optional(), source: z.string().optional(), status: z.string(), priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  appliedAt: z.string().optional(), resumeId: z.string().optional(), salaryExpectation: num, salaryCurrency: z.string().optional(), noticePeriodDays: num,
  jobDescription: z.string().optional(), companyNotes: z.string().optional(), benefits: z.string().optional(), coverLetter: z.string().optional(),
  nextAction: z.string().optional(), nextActionAt: z.string().optional(), offerDetails: z.string().optional(), rejectionReason: z.string().optional(), withdrawalReason: z.string().optional(),
});
type Form = z.input<typeof schema>;

const clean = (v: z.output<typeof schema>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === '' ? null : k.endsWith('At') && x ? new Date(x as string).toISOString() : x]));

type Props = { initial?: Application; onDone: (a: Application) => void };

/** Waits for settings/profile so uncontrolled selects and defaults mount with real values. */
export function ApplicationForm(props: Props) {
  const { settings } = useSettings();
  const { data: resumes } = useApi<{ id: string; label: string; version: number }[]>('/resumes');
  const { data: profile } = useApi<{ salaryTarget?: number; salaryCurrency?: string; noticePeriodDays?: number }>(props.initial ? null : '/profile');
  if (!settings || !resumes || (!props.initial && !profile)) return <Loading />;
  return <Inner {...props} settings={settings} resumes={resumes} profile={profile} />;
}

function Inner({ initial, onDone, settings, resumes, profile }: Props & { settings: WorkspaceSettings; resumes: { id: string; label: string; version: number }[]; profile?: { salaryTarget?: number; salaryCurrency?: string; noticePeriodDays?: number } }) {
  const router = useRouter();
  const [error, setError] = useState<unknown>();
  const [dups, setDups] = useState<{ id: string; companyName: string; jobTitle: string; status: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const { register, handleSubmit, formState, watch, getValues, setValue } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: initial ? {
      ...Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v ?? ''])),
      appliedAt: toLocalInput(initial.appliedAt), nextActionAt: toLocalInput(initial.nextActionAt), resumeId: initial.resumeId ?? '',
    } as Form : { status: 'Saved', priority: 'MEDIUM', salaryCurrency: profile?.salaryCurrency ?? 'USD', salaryExpectation: profile?.salaryTarget ?? '', noticePeriodDays: profile?.noticePeriodDays ?? '' },
  });
  const status = watch('status');

  const submit = (force: boolean) => handleSubmit(async (v) => {
    setError(undefined);
    try {
      const body = clean(v as z.output<typeof schema>);
      const a = initial
        ? await api<Application>(`/applications/${initial.id}`, { method: 'PATCH', body })
        : await api<Application>('/applications', { body: { ...body, force } });
      refresh('/applications', '/dashboard');
      onDone(a);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setDups((e.body as { duplicates: typeof dups }).duplicates ?? []);
      else setError(e);
    }
  });
  const err = formState.errors;

  // Fills only empty fields, so anything already typed is kept.
  const autofill = async () => {
    const url = getValues('jobUrl')?.trim();
    if (!url) return;
    setError(undefined);
    setImporting(true);
    try {
      const data = await api<Partial<Form>>('/applications/import', { body: { url } });
      for (const [k, v] of Object.entries(data) as [keyof Form, string][]) if (v && !getValues(k)) setValue(k, v, { shouldDirty: true });
    } catch (e) {
      setError(e);
    } finally {
      setImporting(false);
    }
  };

  return (
    <form onSubmit={submit(false)} className="space-y-4" noValidate>
      <Field label="Job post URL" htmlFor="jobUrl" hint="Paste a LinkedIn, Indeed, Greenhouse, Lever… link and Autofill fills the empty fields below.">
        <div className="flex gap-2">
          <Input id="jobUrl" type="url" placeholder="https://" {...register('jobUrl')} autoFocus={!initial} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); autofill(); } }} />
          <Button variant="outline" loading={importing} onClick={autofill}>Autofill</Button>
        </div>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company *" htmlFor="companyName" error={err.companyName?.message}><Input id="companyName" {...register('companyName')} autoFocus={!!initial} /></Field>
        <Field label="Job title *" htmlFor="jobTitle" error={err.jobTitle?.message}><Input id="jobTitle" {...register('jobTitle')} /></Field>
        <Field label="Status" htmlFor="status"><Select id="status" {...register('status')}>{settings.statuses.map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <Field label="Priority" htmlFor="priority"><Select id="priority" {...register('priority')}><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></Select></Field>
        <Field label="Location" htmlFor="location"><Input id="location" {...register('location')} placeholder="City, Country / Remote" /></Field>
        <Field label="Seniority" htmlFor="seniority"><Input id="seniority" {...register('seniority')} placeholder="Senior" /></Field>
        <Field label="Company website" htmlFor="companyWebsite"><Input id="companyWebsite" type="url" {...register('companyWebsite')} /></Field>
        <Field label="Source" htmlFor="source"><Input id="source" {...register('source')} placeholder="LinkedIn, referral…" /></Field>
        <Field label="Applied on" htmlFor="appliedAt"><Input id="appliedAt" type="datetime-local" {...register('appliedAt')} /></Field>
        <Field label="CV version submitted" htmlFor="resumeId">
          <Select id="resumeId" {...register('resumeId')}><option value="">—</option>{resumes.map((r) => <option key={r.id} value={r.id}>{r.label} v{r.version}</option>)}</Select>
        </Field>
        <div className="grid grid-cols-[1fr_80px] gap-2">
          <Field label="Salary expectation (monthly)" htmlFor="salaryExpectation"><Input id="salaryExpectation" type="number" min={0} {...register('salaryExpectation')} /></Field>
          <Field label="Currency" htmlFor="salaryCurrency"><Input id="salaryCurrency" {...register('salaryCurrency')} /></Field>
        </div>
        <Field label="Notice period (days)" htmlFor="noticePeriodDays"><Input id="noticePeriodDays" type="number" min={0} {...register('noticePeriodDays')} /></Field>
        <Field label="Next action" htmlFor="nextAction"><Input id="nextAction" {...register('nextAction')} /></Field>
        <Field label="Next action due" htmlFor="nextActionAt"><Input id="nextActionAt" type="datetime-local" {...register('nextActionAt')} /></Field>
      </div>
      <Field label="Job description" htmlFor="jd" hint="Paste the full JD — preparation plans are built from it."><Textarea id="jd" className="min-h-32" {...register('jobDescription')} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company notes" htmlFor="companyNotes"><Textarea id="companyNotes" {...register('companyNotes')} /></Field>
        <Field label="Benefits" htmlFor="benefits"><Textarea id="benefits" {...register('benefits')} /></Field>
      </div>
      {initial && <Field label="Cover letter" htmlFor="coverLetter"><Textarea id="coverLetter" {...register('coverLetter')} /></Field>}
      {status === 'Offer' && <Field label="Offer details" htmlFor="offerDetails"><Textarea id="offerDetails" {...register('offerDetails')} /></Field>}
      {status === 'Rejected' && <Field label="Rejection reason" htmlFor="rejectionReason"><Textarea id="rejectionReason" {...register('rejectionReason')} /></Field>}
      {status === 'Withdrawn' && <Field label="Withdrawal reason" htmlFor="withdrawalReason"><Textarea id="withdrawalReason" {...register('withdrawalReason')} /></Field>}
      {!!dups.length && (
        <div className="rounded-md border border-warning/40 bg-warning-soft p-3 text-sm">
          <p className="font-medium text-warning">Possible duplicate</p>
          <ul className="my-2 list-disc pl-5">{dups.map((d) => <li key={d.id}><button type="button" className="underline" onClick={() => router.push(`/applications/${d.id}`)}>{d.companyName} — {d.jobTitle}</button> ({d.status})</li>)}</ul>
          <Button size="sm" variant="outline" onClick={submit(true)}>Create anyway</Button>
        </div>
      )}
      <ErrorBox error={error} />
      <div className="flex justify-end"><Button type="submit" loading={formState.isSubmitting}>{initial ? 'Save changes' : 'Create application'}</Button></div>
    </form>
  );
}
