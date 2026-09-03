'use client';

import { useDraggable } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import type { Task } from '@/lib/db/schema';

const PRIORITY_VARIANT: Record<Task['priority'], 'default' | 'secondary' | 'destructive'> = {
  low: 'secondary',
  medium: 'default',
  high: 'destructive',
  urgent: 'destructive',
};

export function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className="cursor-pointer rounded border bg-background p-3 shadow-sm hover:shadow"
    >
      <p className="font-medium">{task.title}</p>
      <div className="mt-2 flex items-center gap-2">
        <Badge variant={PRIORITY_VARIANT[task.priority]}>{task.priority}</Badge>
        {task.dueDate && <span className="text-xs text-muted-foreground">{new Date(task.dueDate).toLocaleDateString('vi-VN')}</span>}
      </div>
    </div>
  );
}
