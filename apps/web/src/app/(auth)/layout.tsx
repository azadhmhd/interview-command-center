import { Target } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg"><Target className="h-4 w-4" /></span>
          <span className="font-semibold">{process.env.NEXT_PUBLIC_APP_NAME || 'Interview Command Center'}</span>
        </div>
        {children}
      </div>
    </main>
  );
}
