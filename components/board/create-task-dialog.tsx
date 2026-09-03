'use client';

import { useState, useTransition } from 'react';
import { createTask } from '@/actions/tasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { Task } from '@/lib/db/schema';
import type { MemberSummary } from '@/actions/members';

export function CreateTaskDialog({
  projectId,
  members,
  onCreated,
}: {
  projectId: string;
  members: MemberSummary[];
  onCreated: (task: Task) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createTask(projectId, {
        title,
        description: description || undefined,
        priority,
        assigneeId: assigneeId || null,
      });
      if (result.fieldErrors) return setError(Object.values(result.fieldErrors)[0]);
      if (result.data) onCreated(result.data);
      setOpen(false);
      setTitle('');
      setDescription('');
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Tạo task</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo task mới</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="title">Tiêu đề</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Mô tả</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">low</SelectItem>
                <SelectItem value="medium">medium</SelectItem>
                <SelectItem value="high">high</SelectItem>
                <SelectItem value="urgent">urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Assignee</Label>
            <Select value={assigneeId} onValueChange={(v) => setAssigneeId(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="Chưa gán" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Đang tạo...' : 'Tạo task'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
