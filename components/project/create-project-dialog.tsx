'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createProject } from '@/actions/projects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function CreateProjectDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createProject({ name, description: description || undefined });
      if (result.fieldErrors) return setError(Object.values(result.fieldErrors)[0]);
      setOpen(false);
      setName('');
      setDescription('');
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Tạo project</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo project mới</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="name">Tên project</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Mô tả (tuỳ chọn)</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Đang tạo...' : 'Tạo project'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
