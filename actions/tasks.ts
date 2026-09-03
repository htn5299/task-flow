'use server';

import { eq } from 'drizzle-orm';
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

  await db.update(tasks).set({ ...parsed.data, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  return {};
}

export async function deleteTask(projectId: string, taskId: string): Promise<ActionResult> {
  await requirePermission(projectId, 'task:delete');
  await db.delete(tasks).where(eq(tasks.id, taskId));
  return {};
}

export async function listTasksByProject(projectId: string): Promise<Task[]> {
  await requireMembership(projectId);
  return db.select().from(tasks).where(eq(tasks.projectId, projectId));
}
