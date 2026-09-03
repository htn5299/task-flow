'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await login({ email, password });
      if (result.error) return setError(result.error);
      if (result.fieldErrors) return setError(Object.values(result.fieldErrors)[0]);
      router.push('/projects');
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border p-6">
        <h1 className="text-xl font-semibold">Đăng nhập</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </Button>
        <p className="text-sm text-muted-foreground">
          Chưa có tài khoản? <a href="/register" className="underline">Đăng ký</a>
        </p>
      </form>
    </div>
  );
}
