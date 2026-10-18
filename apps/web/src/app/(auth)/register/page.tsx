import { Suspense } from 'react';
import { AuthForm } from '@/components/auth-forms';

export default function Page() {
  return <Suspense><AuthForm mode="register" /></Suspense>;
}
