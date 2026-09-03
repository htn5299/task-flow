'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { updateTask } from '@/actions/tasks';
import type { Task } from '@/lib/db/schema';
import type { MemberSummary } from '@/actions/members';
import type { Role } from '@/lib/permissions';
import { Column } from '@/components/board/column';
import { CreateTaskDialog } from '@/components/board/create-task-dialog';
import { TaskDetailModal } from '@/components/task/task-detail-modal';

const STATUSES = ['todo', 'in_progress', 'done'] as const;
const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  todo: 'Todo',
  in_progress: 'In Progress',
  done: 'Done',
};

export function KanbanBoard({
  projectId,
  initialTasks,
  members,
  myRole,
}: {
  projectId: string;
  initialTasks: Task[];
  members: MemberSummary[];
  myRole: Role;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const canEdit = myRole === 'owner' || myRole === 'admin' || myRole === 'member';
  const canDelete = myRole === 'owner' || myRole === 'admin';
  const canComment = myRole === 'owner' || myRole === 'admin' || myRole === 'member';

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !canEdit) return;
    const taskId = active.id as string;
    const newStatus = over.id as (typeof STATUSES)[number];
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    startTransition(async () => {
      await updateTask(projectId, taskId, { status: newStatus });
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Board</h1>
          <Link href={`/projects/${projectId}/settings`} className="text-sm text-muted-foreground hover:underline">
            Cài đặt project
          </Link>
        </div>
        {canEdit && (
          <CreateTaskDialog projectId={projectId} members={members} onCreated={(task) => setTasks((prev) => [...prev, task])} />
        )}
      </div>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-3 gap-4">
          {STATUSES.map((status) => (
            <Column
              key={status}
              id={status}
              title={STATUS_LABELS[status]}
              tasks={tasks.filter((t) => t.status === status)}
              onTaskClick={setOpenTask}
            />
          ))}
        </div>
      </DndContext>
      {openTask && (
        <TaskDetailModal
          projectId={projectId}
          task={openTask}
          members={members}
          canEdit={canEdit}
          canDelete={canDelete}
          canComment={canComment}
          onClose={() => setOpenTask(null)}
          onUpdated={(updated) => {
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setOpenTask(updated);
          }}
          onDeleted={(id) => {
            setTasks((prev) => prev.filter((t) => t.id !== id));
            setOpenTask(null);
          }}
        />
      )}
    </div>
  );
}
