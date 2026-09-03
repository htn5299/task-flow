'use client';

import { useDroppable } from '@dnd-kit/core';
import { TaskCard } from '@/components/board/task-card';
import type { Task } from '@/lib/db/schema';

export function Column({
  id,
  title,
  tasks,
  onTaskClick,
}: {
  id: string;
  title: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className={`min-h-[200px] rounded-lg border p-3 ${isOver ? 'bg-accent' : ''}`}>
      <h2 className="mb-3 font-medium">{title} ({tasks.length})</h2>
      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
        ))}
      </div>
    </div>
  );
}
