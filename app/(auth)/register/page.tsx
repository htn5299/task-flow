'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { register } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    startTransition(async () => {
      const result = await register({ name, email, password });
      if (result.fieldErrors) return setFieldErrors(result.fieldErrors);
      router.push('/projects');
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border p-6">
        <h1 className="text-xl font-semibold">Đăng ký</h1>
        <div className="space-y-2">
          <Label htmlFor="name">Tên</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          {fieldErrors.name && <p className="text-sm text-red-600">{fieldErrors.name}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {fieldErrors.email && <p className="text-sm text-red-600">{fieldErrors.email}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {fieldErrors.password && <p className="text-sm text-red-600">{fieldErrors.password}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? 'Đang đăng ký...' : 'Đăng ký'}
        </Button>
        <p className="text-sm text-muted-foreground">
          Đã có tài khoản? <a href="/login" className="underline">Đăng nhập</a>
        </p>
      </form>
    </div>
  );
}
