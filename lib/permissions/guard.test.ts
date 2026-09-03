import { describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { users, projects, projectMembers } from '@/lib/db/schema';

let currentUserId: string | null = null;
vi.mock('@/lib/auth/session', () => ({
  requireCurrentUser: vi.fn(async () => {
    if (!currentUserId) throw new Error('no user set for test');
    return { userId: currentUserId };
  }),
}));

const { requirePermission, requireMembership, getProjectRole, PermissionError, NotAMemberError } = await import('./guard');

async function makeUser(email: string) {
  const [user] = await db.insert(users).values({ email, passwordHash: 'x', name: email }).returning();
  return user;
}

async function makeProjectWithMember(role: 'owner' | 'admin' | 'member' | 'viewer') {
  const owner = await makeUser(`owner-${crypto.randomUUID()}@test.dev`);
  const [project] = await db.insert(projects).values({ name: 'P', ownerId: owner.id }).returning();
  await db.insert(projectMembers).values({ projectId: project.id, userId: owner.id, role: 'owner' });

  const member = await makeUser(`member-${crypto.randomUUID()}@test.dev`);
  await db.insert(projectMembers).values({ projectId: project.id, userId: member.id, role });

  return { project, member };
}

describe('requirePermission', () => {
  it('resolves when the caller has permission', async () => {
    const { project, member } = await makeProjectWithMember('admin');
    currentUserId = member.id;
    const result = await requirePermission(project.id, 'member:invite');
    expect(result.role).toBe('admin');
  });

  it('throws PermissionError when the caller lacks permission', async () => {
    const { project, member } = await makeProjectWithMember('viewer');
    currentUserId = member.id;
    await expect(requirePermission(project.id, 'task:create')).rejects.toBeInstanceOf(PermissionError);
  });

  it('throws NotAMemberError when the caller is not on the project', async () => {
    const { project } = await makeProjectWithMember('member');
    const outsider = await makeUser(`outsider-${crypto.randomUUID()}@test.dev`);
    currentUserId = outsider.id;
    await expect(requirePermission(project.id, 'task:comment')).rejects.toBeInstanceOf(NotAMemberError);
  });
});

describe('requireMembership', () => {
  it('resolves for any member regardless of role', async () => {
    const { project, member } = await makeProjectWithMember('viewer');
    currentUserId = member.id;
    const result = await requireMembership(project.id);
    expect(result.role).toBe('viewer');
  });
});

describe('getProjectRole', () => {
  it('returns null for a non-member', async () => {
    const { project } = await makeProjectWithMember('member');
    const outsider = await makeUser(`outsider2-${crypto.randomUUID()}@test.dev`);
    expect(await getProjectRole(project.id, outsider.id)).toBeNull();
  });
});
