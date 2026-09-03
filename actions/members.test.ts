import { describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { users, projects, projectMembers } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

let currentUserId: string;
vi.mock('@/lib/auth/session', () => ({
  requireCurrentUser: vi.fn(async () => ({ userId: currentUserId })),
}));

const { inviteMember, removeMember, changeMemberRole, listMembers } = await import('./members');

async function makeUser(email?: string) {
  const [user] = await db.insert(users).values({
    email: email ?? `${crypto.randomUUID()}@test.dev`,
    passwordHash: 'x',
    name: 'Test User',
  }).returning();
  return user;
}

async function makeOwnedProject() {
  const owner = await makeUser();
  currentUserId = owner.id;
  const [project] = await db.insert(projects).values({ name: 'P', ownerId: owner.id }).returning();
  await db.insert(projectMembers).values({ projectId: project.id, userId: owner.id, role: 'owner' });
  return { owner, project };
}

describe('inviteMember', () => {
  it('adds an existing user to the project with the given role', async () => {
    const { project } = await makeOwnedProject();
    const invitee = await makeUser('invitee@test.dev');

    const result = await inviteMember(project.id, { email: 'invitee@test.dev', role: 'member' });
    expect(result.error).toBeUndefined();
    expect(result.fieldErrors).toBeUndefined();

    const [membership] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, invitee.id)));
    expect(membership.role).toBe('member');
  });

  it('rejects an email with no account', async () => {
    const { project } = await makeOwnedProject();
    const result = await inviteMember(project.id, { email: 'nobody@test.dev', role: 'member' });
    expect(result.fieldErrors?.email).toBeTruthy();
  });

  it('rejects when caller is not owner/admin', async () => {
    const { project } = await makeOwnedProject();
    const nonAdmin = await makeUser();
    await db.insert(projectMembers).values({ projectId: project.id, userId: nonAdmin.id, role: 'member' });
    currentUserId = nonAdmin.id;

    await expect(inviteMember(project.id, { email: 'x@test.dev', role: 'member' })).rejects.toThrow();
  });
});

describe('changeMemberRole', () => {
  it('only owner can change roles', async () => {
    const { project } = await makeOwnedProject();
    const target = await makeUser();
    await db.insert(projectMembers).values({ projectId: project.id, userId: target.id, role: 'member' });

    const result = await changeMemberRole(project.id, target.id, { role: 'admin' });
    expect(result.error).toBeUndefined();

    const [membership] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, target.id)));
    expect(membership.role).toBe('admin');
  });
});

describe('removeMember and listMembers', () => {
  it('removes a member and reflects it in listMembers', async () => {
    const { project } = await makeOwnedProject();
    const target = await makeUser();
    await db.insert(projectMembers).values({ projectId: project.id, userId: target.id, role: 'viewer' });

    await removeMember(project.id, target.id);
    const members = await listMembers(project.id);
    expect(members.find((m) => m.userId === target.id)).toBeUndefined();
  });
});
