'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tasks, taskComments, type TaskComment } from '@/lib/db/schema';
import { requirePermission, requireMembership } from '@/lib/permissions/guard';
import { createCommentSchema } from '@/lib/validation/comments';
import { flattenZodErrors } from '@/lib/validation/flatten-zod-errors';
import type { ActionResult } from '@/actions/auth';

async function getTaskProjectId(taskId: string): Promise<string> {
  const [task] = await db.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) throw new Error('Task not found');
  return task.projectId;
}

export async function createComment(taskId: string, input: unknown): Promise<ActionResult<TaskComment>> {
  const projectId = await getTaskProjectId(taskId);
  const { userId } = await requirePermission(projectId, 'task:comment');
  const parsed = createCommentSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: flattenZodErrors(parsed.error) };

  const [comment] = await db.insert(taskComments).values({
    taskId,
    authorId: userId,
    content: parsed.data.content,
  }).returning();

  return { data: comment };
}

export async function listCommentsByTask(taskId: string): Promise<TaskComment[]> {
  const projectId = await getTaskProjectId(taskId);
  await requireMembership(projectId);
  return db.select().from(taskComments).where(eq(taskComments.taskId, taskId));
}
