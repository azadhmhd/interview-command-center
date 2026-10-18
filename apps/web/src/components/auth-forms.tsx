'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, setWorkspace } from '@/lib/api';
import { Button, Card, ErrorBox, Field, Input } from './ui';

const loginSchema = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Required') });
const registerSchema = z.object({ name: z.string().min(1, 'Required'), email: z.string().email('Enter a valid email'), password: z.string().min(10, 'Use at least 10 characters') });

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<unknown>();
  const schema = mode === 'login' ? loginSchema : registerSchema;
  const { register, handleSubmit, formState } = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(schema as typeof registerSchema) });
  const onSubmit = handleSubmit(async (v) => {
    setError(undefined);
    try {
      await api(`/auth/${mode}`, { body: v });
      setWorkspace('');
      const next = params.get('next');
      router.push(next?.startsWith('/') ? next : mode === 'register' ? '/settings/profile' : '/dashboard');
    } catch (e) {
      setError(e);
    }
  });
  const err = formState.errors as Record<string, { message?: string } | undefined>;
  return (
    <Card className="p-5">
      <h1 className="mb-4 text-lg font-semibold">{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        {mode === 'register' && <Field label="Name" htmlFor="name" error={err.name?.message}><Input id="name" autoComplete="name" {...register('name')} /></Field>}
        <Field label="Email" htmlFor="email" error={err.email?.message}><Input id="email" type="email" autoComplete="email" {...register('email')} /></Field>
        <Field label="Password" htmlFor="password" error={err.password?.message}><Input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} {...register('password')} /></Field>
        <ErrorBox error={error} />
        <Button type="submit" className="w-full" loading={formState.isSubmitting}>{mode === 'login' ? 'Sign in' : 'Create account'}</Button>
      </form>
      <div className="mt-4 flex justify-between text-xs text-muted">
        {mode === 'login' ? <><Link href="/register" className="hover:text-text">Create account</Link><Link href="/forgot-password" className="hover:text-text">Forgot password?</Link></>
          : <Link href="/login" className="hover:text-text">Already have an account? Sign in</Link>}
      </div>
    </Card>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card className="p-5">
      <h1 className="mb-1 text-lg font-semibold">Reset password</h1>
      <p className="mb-4 text-xs text-muted">We will send a reset link. On self-hosted installs without SMTP, the link appears in the API log.</p>
      {done ? <p className="text-sm">{done}</p> : (
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await api<{ message: string }>('/auth/forgot-password', { body: { email } }).catch((x) => ({ message: x.message })); setDone(r.message); setBusy(false); }}>
          <Field label="Email" htmlFor="email"><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Button type="submit" className="w-full" loading={busy}>Send reset link</Button>
        </form>
      )}
      <Link href="/login" className="mt-4 block text-xs text-muted hover:text-text">Back to sign in</Link>
    </Card>
  );
}

export function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  return (
    <Card className="p-5">
      <h1 className="mb-4 text-lg font-semibold">Choose a new password</h1>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(undefined);
        try { await api('/auth/reset-password', { body: { token, password } }); router.push('/login'); } catch (x) { setError(x); } finally { setBusy(false); }
      }}>
        <Field label="New password" htmlFor="pw" hint="At least 10 characters. All other sessions will be signed out."><Input id="pw" type="password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <Button type="submit" className="w-full" loading={busy} disabled={!token}>Reset password</Button>
      </form>
    </Card>
  );
}

export function InviteAccept() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  return (
    <Card className="p-5">
      <h1 className="mb-2 text-lg font-semibold">Join a workspace</h1>
      <p className="mb-4 text-sm text-muted">Sign in with the email address the invitation was sent to, then accept.</p>
      <ErrorBox error={error} />
      <Button className="mt-3 w-full" loading={busy} disabled={!token} onClick={async () => {
        setBusy(true);
        try { const r = await api<{ workspaceId: string }>('/workspaces/invitations/accept', { body: { token } }); setWorkspace(r.workspaceId); router.push('/dashboard'); } catch (e) { setError(e); } finally { setBusy(false); }
      }}>Accept invitation</Button>
    </Card>
  );
}
