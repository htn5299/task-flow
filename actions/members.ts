'use server';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users, projectMembers } from '@/lib/db/schema';
import { requirePermission, requireMembership } from '@/lib/permissions/guard';
import { inviteMemberSchema, changeRoleSchema } from '@/lib/validation/members';
import { flattenZodErrors } from '@/lib/validation/flatten-zod-errors';
import type { ActionResult } from '@/actions/auth';
import type { Role } from '@/lib/permissions';

export interface MemberSummary {
  userId: string;
  email: string;
  name: string;
  role: Role;
}

export async function inviteMember(projectId: string, input: unknown): Promise<ActionResult> {
  await requirePermission(projectId, 'member:invite');
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: flattenZodErrors(parsed.error) };

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (!user) return { fieldErrors: { email: 'Email này chưa có tài khoản' } };

  const [existing] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)))
    .limit(1);
  if (existing) return { fieldErrors: { email: 'Người dùng đã là thành viên' } };

  await db.insert(projectMembers).values({ projectId, userId: user.id, role: parsed.data.role });
  return {};
}

export async function removeMember(projectId: string, userId: string): Promise<ActionResult> {
  await requirePermission(projectId, 'member:remove');
  await db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  return {};
}

export async function changeMemberRole(projectId: string, userId: string, input: unknown): Promise<ActionResult> {
  await requirePermission(projectId, 'member:changeRole');
  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: flattenZodErrors(parsed.error) };

  await db.update(projectMembers).set({ role: parsed.data.role }).where(
    and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
  );
  return {};
}

export async function listMembers(projectId: string): Promise<MemberSummary[]> {
  await requireMembership(projectId);

  return db
    .select({ userId: users.id, email: users.email, name: users.name, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId));
}
