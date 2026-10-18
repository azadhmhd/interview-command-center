'use client';
/**
 * shadcn/ui-style primitives (copied-in components, Tailwind + CVA), kept in one file.
 * Native elements (<dialog>, <select>, <input type="datetime-local">) are used wherever they do the job.
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import Link from 'next/link';
import {
  createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:opacity-90',
        secondary: 'bg-surface-2 text-text hover:bg-border',
        outline: 'border border-border bg-surface hover:bg-surface-2',
        ghost: 'hover:bg-surface-2',
        danger: 'bg-danger text-white hover:opacity-90',
        link: 'text-accent underline-offset-4 hover:underline px-0',
      },
      size: { sm: 'h-8 px-2.5 text-xs', md: 'h-9 px-3.5', lg: 'h-10 px-5', icon: 'h-8 w-8' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { loading?: boolean }>(
  ({ className, variant, size, loading, children, disabled, type = 'button', ...p }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...p}>
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export function LinkButton({ href, children, variant, size, className }: { href: string; children: ReactNode; className?: string } & VariantProps<typeof buttonVariants>) {
  return <Link href={href} className={cn(buttonVariants({ variant, size }), className)}>{children}</Link>;
}

const field = 'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cn(field, 'h-9', className)} {...p} />);
Input.displayName = 'Input';
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} className={cn(field, 'min-h-20', className)} {...p} />);
Textarea.displayName = 'Textarea';
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => <select ref={ref} className={cn(field, 'h-9 py-0', className)} {...p} />);
Select.displayName = 'Select';

/** Label + control. Without htmlFor the <label> wraps the control, so it is still programmatically associated. */
export function Field({ label, hint, error, children, className, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string; htmlFor?: string }) {
  const msg = error ? <p className="text-xs text-danger" role="alert">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null;
  const text = <span className="block text-xs font-medium text-muted">{label}</span>;
  if (!htmlFor) return <div className={cn('space-y-1', className)}><label className="block space-y-1">{text}{children}</label>{msg}</div>;
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={htmlFor}>{text}</label>
      {children}
      {msg}
    </div>
  );
}

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-surface', className)} {...p}>{children}</div>;
}
export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-border px-4 py-3', className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const tones = {
  neutral: 'bg-surface-2 text-muted', accent: 'bg-accent-soft text-accent', success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning', danger: 'bg-danger-soft text-danger', info: 'bg-info-soft text-info',
};
export type Tone = keyof typeof tones;
export function Badge({ tone = 'neutral', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return <span title={title} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

const STATE_TONES: Record<string, Tone> = {
  completed: 'success', passed: 'success', Offer: 'success', mastered: 'success',
  running: 'info', queued: 'info', submitted: 'info', scheduled: 'neutral', reviewing: 'info',
  ready_for_agent: 'warning', awaiting_review: 'warning', retry_wait: 'warning', learning: 'warning', pending: 'neutral',
  failed: 'danger', Rejected: 'danger', cancelled: 'neutral', Withdrawn: 'neutral',
  REPORTED: 'accent', PUBLIC_REPORT: 'info', AI_PREDICTED: 'warning', PRACTICE: 'neutral',
};
export const SOURCE_LABEL: Record<string, string> = { REPORTED: 'Actually asked', PUBLIC_REPORT: 'Public report', AI_PREDICTED: 'AI prediction', PRACTICE: 'Practice' };
export function StateBadge({ value }: { value?: string | null }) {
  if (!value) return null;
  return <Badge tone={STATE_TONES[value] ?? 'neutral'}>{SOURCE_LABEL[value] ?? value.replace(/_/g, ' ')}</Badge>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-muted', className)} aria-label="Loading" />;
}
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex items-center gap-2 p-6 text-sm text-muted"><Spinner />{label}</div>;
}
export function ErrorBox({ error }: { error?: unknown }) {
  if (!error) return null;
  return <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{(error as Error).message ?? String(error)}</div>;
}
export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-md text-xs text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && <Link href={back.href} className="text-xs text-muted hover:text-text">← {back.label}</Link>}
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TEXT_TONE: Record<Tone, string> = { neutral: 'text-text', accent: 'text-accent', success: 'text-success', warning: 'text-warning', danger: 'text-danger', info: 'text-info' };
export function Stat({ label, value, hint, href, tone }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: Tone }) {
  const body = (
    <Card className={cn('p-4 h-full', href && 'transition-colors hover:border-accent/40')}>
      <p className="text-xs text-muted">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tone && TEXT_TONE[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div role="tablist" className="inline-flex rounded-lg border border-border bg-surface p-0.5">
      {items.map((i) => (
        <button key={i.value} role="tab" aria-selected={value === i.value} onClick={() => onChange(i.value)}
          className={cn('rounded-md px-3 py-1 text-xs font-medium transition-colors', value === i.value ? 'bg-accent-soft text-accent' : 'text-muted hover:text-text')}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

/** Native <dialog>: focus trapping, Esc and backdrop for free. */
export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      className={cn('m-auto w-[calc(100%-2rem)] rounded-xl border border-border bg-surface p-0 text-text shadow-xl backdrop:bg-black/40', wide ? 'max-w-3xl' : 'max-w-lg')}>
      {open && (
        <div>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{title}</h2>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
          </div>
          <div className="max-h-[75vh] overflow-y-auto p-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Markdown({ children, className }: { children?: string | null; className?: string }) {
  if (!children) return null;
  return <div className={cn('prose-icc', className)}><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{children}</ReactMarkdown></div>;
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${Math.min(100, Math.max(0, value))}%` }} transition={{ duration: 0.4 }} />
    </div>
  );
}

// ── Toasts ──
type ToastT = { id: number; text: string; tone: 'success' | 'danger' | 'info' };
const ToastCtx = createContext<(text: string, tone?: ToastT['tone']) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastT[]>([]);
  const push = useCallback((text: string, tone: ToastT['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === 'danger' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={cn('rounded-lg border px-3 py-2 text-sm shadow-lg', t.tone === 'danger' ? 'border-danger/30 bg-danger-soft text-danger' : t.tone === 'info' ? 'border-info/30 bg-info-soft text-info' : 'border-success/30 bg-success-soft text-success')}>
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/** Run an async action with loading state and toast on error/success. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(key);
    try {
      const r = await fn();
      if (success) toast(success);
      return r;
    } catch (e) {
      toast((e as Error).message, 'danger');
      return undefined;
    } finally {
      setBusy(null);
    }
  }, [toast]);
  return { busy, run };
}
