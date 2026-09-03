'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateProject } from '@/actions/projects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function RenameProjectForm({
  projectId,
  initialName,
  initialDescription,
}: {
  projectId: string;
  initialName: string;
  initialDescription: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateProject(projectId, { name, description: description || undefined });
      if (result.fieldErrors) return setError(Object.values(result.fieldErrors)[0]);
      if (result.error) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded border p-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="project-name">Tên project</Label>
        <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="project-description">Mô tả</Label>
        <Textarea id="project-description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
      </Button>
    </form>
  );
}
