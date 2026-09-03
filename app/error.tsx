'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Không có quyền hoặc đã có lỗi xảy ra</h1>
      <p className="text-muted-foreground">Vui lòng thử lại, hoặc quay về trang danh sách project.</p>
      <div className="flex gap-3">
        <Button onClick={() => reset()}>Thử lại</Button>
        <Button variant="outline" onClick={() => router.push('/projects')}>
          Về trang chủ
        </Button>
      </div>
    </div>
  );
}
