'use client';

import { useEffect, useState, useTransition } from 'react';
import { updateTask, deleteTask } from '@/actions/tasks';
import { createComment, listCommentsByTask } from '@/actions/comments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Task, TaskComment } from '@/lib/db/schema';
import type { MemberSummary } from '@/actions/members';

export function TaskDetailModal({
  projectId,
  task,
  members,
  canEdit,
  canDelete,
  canComment,
  onClose,
  onUpdated,
  onDeleted,
}: {
  projectId: string;
  task: Task;
  members: MemberSummary[];
  canEdit: boolean;
  canDelete: boolean;
  canComment: boolean;
  onClose: () => void;
  onUpdated: (task: Task) => void;
  onDeleted: (taskId: string) => void;
}) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [description, setDescription] = useState(task.description ?? '');
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    listCommentsByTask(task.id).then(setComments);
  }, [task.id]);

  function handleStatusChange(status: Task['status']) {
    startTransition(async () => {
      const result = await updateTask(projectId, task.id, { status });
      if (!result.error && !result.fieldErrors) onUpdated({ ...task, status });
    });
  }

  function handlePriorityChange(priority: Task['priority']) {
    startTransition(async () => {
      const result = await updateTask(projectId, task.id, { priority });
      if (!result.error && !result.fieldErrors) onUpdated({ ...task, priority });
    });
  }

  function handleAssigneeChange(value: string) {
    const assigneeId = value || null;
    startTransition(async () => {
      const result = await updateTask(projectId, task.id, { assigneeId });
      if (!result.error && !result.fieldErrors) onUpdated({ ...task, assigneeId });
    });
  }

  function handleDueDateChange(value: string) {
    const dueDate = value ? new Date(value) : null;
    startTransition(async () => {
      const result = await updateTask(projectId, task.id, { dueDate });
      if (!result.error && !result.fieldErrors) onUpdated({ ...task, dueDate });
    });
  }

  function handleDescriptionBlur() {
    if (description === (task.description ?? '')) return;
    startTransition(async () => {
      const result = await updateTask(projectId, task.id, { description });
      if (!result.error && !result.fieldErrors) onUpdated({ ...task, description });
    });
  }

  function handleDelete() {
    setActionError(null);
    startTransition(async () => {
      try {
        const result = await deleteTask(projectId, task.id);
        if (result.error) {
          setActionError(result.error);
          return;
        }
        onDeleted(task.id);
      } catch {
        setActionError('Không thể xoá task này.');
      }
    });
  }

  function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setActionError(null);
    startTransition(async () => {
      try {
        const result = await createComment(task.id, { content: newComment });
        if (result.data) {
          setComments((prev) => [...prev, result.data!]);
          setNewComment('');
        } else if (result.error) {
          setActionError(result.error);
        }
      } catch {
        setActionError('Không thể gửi bình luận.');
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={handleDescriptionBlur}
            disabled={!canEdit}
            placeholder="Mô tả..."
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Status</p>
              <Select value={task.status} onValueChange={(v) => v && handleStatusChange(v as Task['status'])} disabled={!canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">todo</SelectItem>
                  <SelectItem value="in_progress">in_progress</SelectItem>
                  <SelectItem value="done">done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Priority</p>
              <Select value={task.priority} onValueChange={(v) => v && handlePriorityChange(v as Task['priority'])} disabled={!canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">low</SelectItem>
                  <SelectItem value="medium">medium</SelectItem>
                  <SelectItem value="high">high</SelectItem>
                  <SelectItem value="urgent">urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Assignee</p>
              <Select value={task.assigneeId ?? ''} onValueChange={(v) => handleAssigneeChange(v ?? '')} disabled={!canEdit}>
                <SelectTrigger><SelectValue placeholder="Chưa gán" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Chưa gán</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Due date</p>
              <Input
                type="date"
                defaultValue={task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : ''}
                onChange={(e) => handleDueDateChange(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>

          {actionError && <p className="text-sm text-destructive">{actionError}</p>}

          {canDelete && (
            <Button variant="destructive" size="sm" disabled={isPending} onClick={handleDelete}>
              Xoá task
            </Button>
          )}

          <div>
            <h3 className="mb-2 font-medium">Bình luận</h3>
            <ul className="mb-3 space-y-2">
              {comments.map((c) => (
                <li key={c.id} className="rounded border p-2 text-sm">{c.content}</li>
              ))}
            </ul>
            {canComment ? (
              <form onSubmit={handleAddComment} className="flex gap-2">
                <Input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Viết bình luận..." />
                <Button type="submit" disabled={isPending}>Gửi</Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">Bạn không có quyền bình luận vào task này.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
