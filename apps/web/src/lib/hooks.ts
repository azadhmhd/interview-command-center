'use client';
import { useApi } from './api';
import type { Me, WorkspaceSettings } from './types';

export const useMe = () => useApi<Me>('/auth/me');
export function useSettings() {
  const r = useApi<{ id: string; name: string; personal: boolean; role: string; settings: WorkspaceSettings }>('/workspaces/current');
  return { ...r, settings: r.data?.settings };
}
export function useRoundLabel() {
  const { settings } = useSettings();
  return (key?: string | null) => settings?.roundTypes.find((t) => t.key === key)?.label ?? key?.replace(/_/g, ' ') ?? '';
}
