'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { logout } from '@/actions/auth';
import { Button } from '@/components/ui/button';

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await logout();
      router.push('/login');
      router.refresh();
    });
  }

  return (
    <Button variant="outline" disabled={isPending} onClick={handleLogout}>
      {isPending ? 'Đang đăng xuất...' : 'Đăng xuất'}
    </Button>
  );
}
