'use client';
import { Check, Loader2, X } from 'lucide-react';
import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/*
 * Resume editor look on the app theme tokens (light or dark with the app): surface cards with 16px radius on the page
 * background, accent for primary actions, 12px tabs, surface-2 inputs.
 */
export const FONT = 'var(--font-sans)';
export const GRADIENT = 'bg-accent';
export const GRADIENT_TEXT = 'text-accent';

export function FCard({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-border bg-surface shadow-[2px_1px_7px_rgba(0,0,0,0.05)]', className)} {...p}>{children}</div>;
}

export const FInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn('h-11 w-full rounded-lg border-0 bg-surface-2 px-3 text-[15px] text-text outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/30', className)} {...p} />
));
FInput.displayName = 'FInput';

export const FTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn('min-h-24 w-full rounded-lg border-0 bg-surface-2 px-3 py-2.5 text-[15px] leading-6 text-text outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/30', className)} {...p} />
));
FTextarea.displayName = 'FTextarea';

export function FField({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-2 block text-[15px] font-semibold leading-[23px] text-text">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[13px] text-muted">{hint}</span>}
    </label>
  );
}

export function GradientButton({ className, loading, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button type="button" className={cn(GRADIENT, 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-accent-fg shadow-sm transition-opacity hover:opacity-95 disabled:opacity-50', className)} disabled={p.disabled || loading} {...p}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}
    </button>
  );
}

export function GhostButton({ className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cn('inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-4 text-[15px] font-medium text-text hover:bg-surface-2 disabled:opacity-50', className)} {...p}>{children}</button>;
}

export function IconButton({ label, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" aria-label={label} title={label} className={cn('inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text', className)} {...p}>{children}</button>;
}

/** Card under an edit form with a centred gradient "Done". */
export function DoneBar({ onDone }: { onDone: () => void }) {
  return (
    <FCard className="mt-4 flex justify-center px-6 py-5">
      <GradientButton onClick={onDone} className="h-14 w-1/2 text-[17px]"><Check className="h-5 w-5" />Done</GradientButton>
    </FCard>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-[15px] text-text">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? GRADIENT : 'bg-border')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
      {label}
    </label>
  );
}

/** Modal sheet (native <dialog>: Esc, focus trap and backdrop for free). `wide` is the full-width "Add content" sheet. */
export function Sheet({ open, onClose, title, aside, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; aside?: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} style={{ fontFamily: FONT }}
      className={cn('bg-surface p-0 text-[15px] leading-[22.5px] text-text shadow-2xl backdrop:bg-black/40', wide ? 'mx-auto mt-[82px] w-[calc(100%-72px)] max-w-[1368px] rounded-[20px]' : 'm-auto w-[calc(100%-2rem)] max-w-lg rounded-3xl')}>
      {open && (
        <div className={cn('relative', wide ? 'px-9 pb-10 pt-9' : 'p-8')}>
          <button type="button" aria-label="Close" onClick={onClose} className="absolute right-2.5 top-2.5 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted hover:bg-surface-2"><X className="h-4 w-4" /></button>
          <div className={cn('flex flex-wrap items-center gap-8', wide ? 'mb-6' : 'mb-6 pr-10')}>
            <h2 className={wide ? 'text-[48px] font-black leading-[48px] tracking-[-2px] text-text' : 'text-[28px] font-bold leading-tight text-text'}>{title}</h2>
            {aside}
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
