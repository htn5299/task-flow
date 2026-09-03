'use server';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tasks, type Task } from '@/lib/db/schema';
import { requirePermission, requireMembership } from '@/lib/permissions/guard';
import { createTaskSchema, updateTaskSchema } from '@/lib/validation/tasks';
import { flattenZodErrors } from '@/lib/validation/flatten-zod-errors';
import type { ActionResult } from '@/actions/auth';

export async function createTask(projectId: string, input: unknown): Promise<ActionResult<Task>> {
  const { userId } = await requirePermission(projectId, 'task:create');
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: flattenZodErrors(parsed.error) };

  const [task] = await db.insert(tasks).values({
    projectId,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    status: 'todo',
    priority: parsed.data.priority,
    assigneeId: parsed.data.assigneeId ?? null,
    dueDate: parsed.data.dueDate ?? null,
    createdBy: userId,
  }).returning();

  return { data: task };
}

export async function updateTask(projectId: string, taskId: string, input: unknown): Promise<ActionResult> {
  await requirePermission(projectId, 'task:update');
  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: flattenZodErrors(parsed.error) };

  const updated = await db
    .update(tasks)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)))
    .returning({ id: tasks.id });

  if (updated.length === 0) return { error: 'Task không tồn tại trong project này' };
  return {};
}

export async function deleteTask(projectId: string, taskId: string): Promise<ActionResult> {
  await requirePermission(projectId, 'task:delete');

  const deleted = await db
    .delete(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)))
    .returning({ id: tasks.id });

  if (deleted.length === 0) return { error: 'Task không tồn tại trong project này' };
  return {};
}

export async function listTasksByProject(projectId: string): Promise<Task[]> {
  await requireMembership(projectId);
  return db.select().from(tasks).where(eq(tasks.projectId, projectId)).orderBy(tasks.createdAt);
}
