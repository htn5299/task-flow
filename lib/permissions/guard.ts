import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { projectMembers } from '@/lib/db/schema';
import { can, type Action, type Role } from '@/lib/permissions';
import { requireCurrentUser } from '@/lib/auth/session';

export class PermissionError extends Error {}
export class NotAMemberError extends Error {}

export async function getProjectRole(projectId: string, userId: string): Promise<Role | null> {
  const [record] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  return record?.role ?? null;
}

export async function requireMembership(projectId: string): Promise<{ userId: string; role: Role }> {
  const { userId } = await requireCurrentUser();
  const role = await getProjectRole(projectId, userId);
  if (!role) throw new NotAMemberError('Not a member of this project');
  return { userId, role };
}

export async function requirePermission(
  projectId: string,
  action: Action,
): Promise<{ userId: string; role: Role }> {
  const { userId, role } = await requireMembership(projectId);
  if (!can(role, action)) throw new PermissionError(`Role ${role} cannot perform ${action}`);
  return { userId, role };
}
