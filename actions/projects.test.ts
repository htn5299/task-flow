import { describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { users, projectMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

let currentUserId: string;
vi.mock('@/lib/auth/session', () => ({
  requireCurrentUser: vi.fn(async () => ({ userId: currentUserId })),
}));

const { createProject, updateProject, deleteProject, listProjectsForUser } = await import('./projects');

async function makeUser() {
  const [user] = await db.insert(users).values({
    email: `${crypto.randomUUID()}@test.dev`,
    passwordHash: 'x',
    name: 'Test User',
  }).returning();
  currentUserId = user.id;
  return user;
}

describe('createProject', () => {
  it('creates a project and makes the creator its owner', async () => {
    await makeUser();
    const result = await createProject({ name: 'My Project', description: 'desc' });
    expect(result.data?.id).toBeTruthy();

    const [membership] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, result.data!.id), eq(projectMembers.userId, currentUserId)));
    expect(membership.role).toBe('owner');
  });

  it('rejects an empty name', async () => {
    await makeUser();
    const result = await createProject({ name: '' });
    expect(result.fieldErrors?.name).toBeTruthy();
  });
});

describe('updateProject / deleteProject', () => {
  it('owner can update and delete; non-owner cannot', async () => {
    await makeUser();
    const created = await createProject({ name: 'Original' });
    const projectId = created.data!.id;

    const updateResult = await updateProject(projectId, { name: 'Renamed' });
    expect(updateResult.error).toBeUndefined();

    const outsider = await makeUser(); // switches currentUserId to a non-member
    await expect(updateProject(projectId, { name: 'Hijacked' })).rejects.toThrow();
    await expect(deleteProject(projectId)).rejects.toThrow();
  });
});

describe('listProjectsForUser', () => {
  it('returns only projects the user is a member of, with role', async () => {
    await makeUser();
    await createProject({ name: 'Mine' });
    const list = await listProjectsForUser();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Mine', role: 'owner' });
  });
});
