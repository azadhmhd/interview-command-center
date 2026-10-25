'use client';
import useSWR, { mutate as globalMutate, type SWRConfiguration } from 'swr';

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
  }
}

const WS_KEY = 'icc.workspace';
export const getWorkspace = () => { try { return localStorage.getItem(WS_KEY) || ''; } catch { return ''; } };
export const setWorkspace = (id: string) => { try { localStorage.setItem(WS_KEY, id); } catch { /* private mode */ } };

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const ws = getWorkspace();
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers: { ...(opts.body !== undefined && { 'content-type': 'application/json' }), ...(ws && { 'x-workspace-id': ws }) },
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch { // e.g. a proxy's plain-text "Internal Server Error" or an HTML gateway page
    throw new ApiError(res.ok ? 'The server sent an unreadable response' : `Server error (${res.status}). Try again in a moment.`, res.status, text.slice(0, 500));
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !location.pathname.match(/^\/(login|register|forgot-password|reset-password)/)) {
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    }
    if (res.status === 403 && ws && data?.message === 'No access to this workspace') setWorkspace('');
    const msg = Array.isArray(data?.issues) ? `${data.message}: ${data.issues.map((i: { path: string; message: string }) => `${i.path} ${i.message}`.trim()).join('; ')}` : data?.message;
    throw new ApiError(typeof msg === 'string' ? msg : `Request failed (${res.status})`, res.status, data);
  }
  return data as T;
}

/** SWR keyed by path + workspace so switching workspaces refetches everything. */
export function useApi<T = unknown>(path: string | null, cfg?: SWRConfiguration) {
  const ws = typeof window === 'undefined' ? '' : getWorkspace();
  return useSWR<T>(path ? [path, ws] : null, ([p]: [string]) => api<T>(p), { revalidateOnFocus: true, ...cfg });
}

/** Revalidate every cached request whose path starts with one of the prefixes. */
export const refresh = (...prefixes: string[]) =>
  globalMutate((key) => Array.isArray(key) && typeof key[0] === 'string' && prefixes.some((p) => (key[0] as string).startsWith(p)));
