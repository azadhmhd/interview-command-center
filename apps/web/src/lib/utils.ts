import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

export const fmtDate = (d?: string | Date | null, withTime = false) =>
  d ? new Date(d).toLocaleString(undefined, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }) : '—';

export function relTime(d?: string | Date | null) {
  if (!d) return '—';
  const diff = new Date(d).getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 36e5) return rtf.format(Math.round(diff / 6e4), 'minute');
  if (abs < 864e5) return rtf.format(Math.round(diff / 36e5), 'hour');
  return rtf.format(Math.round(diff / 864e5), 'day');
}

export const label = (s?: string | null) => (s ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '');

/** For datetime-local inputs. */
export const toLocalInput = (d?: string | null) => {
  if (!d) return '';
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
};

export const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
