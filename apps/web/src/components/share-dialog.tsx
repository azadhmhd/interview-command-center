'use client';
import { useState } from 'react';
import { api, useApi } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { Badge, Button, Dialog, Field, Input, Select, useAction } from './ui';

interface Share { id: string; permission: string; createdAt: string; grantee: { email: string; name: string } }

export function ShareDialog({ open, onClose, resourceType, resourceId, note }: { open: boolean; onClose: () => void; resourceType: 'APPLICATION' | 'COURSE'; resourceId: string; note: string }) {
  const { data, mutate } = useApi<Share[]>(open ? `/shares?resourceType=${resourceType}&resourceId=${resourceId}` : null);
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState('VIEW');
  const { busy, run } = useAction();
  return (
    <Dialog open={open} onClose={onClose} title="Share">
      <p className="mb-3 text-xs text-muted">{note} Everything else in your workspace stays private.</p>
      <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await run('share', () => api('/shares', { body: { resourceType, resourceId, email, permission } }), 'Shared'); if (r) { setEmail(''); mutate(); } }}>
        <Field label="Person's account email" htmlFor="share-email" className="flex-1"><Input id="share-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Select aria-label="Permission" value={permission} onChange={(e) => setPermission(e.target.value)} className="w-28"><option value="VIEW">Can view</option><option value="EDIT">Can edit</option></Select>
        <Button type="submit" loading={busy === 'share'}>Share</Button>
      </form>
      <ul className="mt-4 divide-y divide-border">
        {data?.map((s) => (
          <li key={s.id} className="flex items-center justify-between py-2 text-sm">
            <span>{s.grantee.name} <span className="text-xs text-muted">{s.grantee.email} · since {fmtDate(s.createdAt)}</span></span>
            <span className="flex items-center gap-2"><Badge>{s.permission.toLowerCase()}</Badge><Button size="sm" variant="ghost" className="text-danger" onClick={async () => { await run(s.id, () => api(`/shares/${s.id}`, { method: 'DELETE' }), 'Access revoked'); mutate(); }}>Revoke</Button></span>
          </li>
        ))}
        {data && !data.length && <li className="py-2 text-xs text-muted">Not shared with anyone.</li>}
      </ul>
    </Dialog>
  );
}
