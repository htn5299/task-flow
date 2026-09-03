'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { projects, projectMembers } from '@/lib/db/schema';
import { requireCurrentUser } from '@/lib/auth/session';
import { requirePermission } from '@/lib/permissions/guard';
import { createProjectSchema, updateProjectSchema } from '@/lib/validation/projects';
import { flattenZodErrors } from '@/lib/validation/flatten-zod-errors';
import type { ActionResult } from '@/actions/auth';
import type { Role } from '@/lib/permissions';

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  role: Role;
}

export async function createProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { userId } = await requireCurrentUser();
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: flattenZodErrors(parsed.error) };

  const [project] = await db.insert(projects).values({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    ownerId: userId,
  }).returning();

  await db.insert(projectMembers).values({ projectId: project.id, userId, role: 'owner' });

  return { data: { id: project.id } };
}

export async function updateProject(projectId: string, input: unknown): Promise<ActionResult> {
  await requirePermission(projectId, 'project:update');
  const parsed = updateProjectSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: flattenZodErrors(parsed.error) };

  await db.update(projects).set({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
  }).where(eq(projects.id, projectId));

  return {};
}

export async function deleteProject(projectId: string): Promise<ActionResult> {
  await requirePermission(projectId, 'project:delete');
  await db.delete(projects).where(eq(projects.id, projectId));
  return {};
}

export async function listProjectsForUser(): Promise<ProjectSummary[]> {
  const { userId } = await requireCurrentUser();

  return db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(eq(projectMembers.userId, userId));
}
