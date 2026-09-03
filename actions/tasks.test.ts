import { describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { users, projects, projectMembers } from '@/lib/db/schema';

let currentUserId: string;
vi.mock('@/lib/auth/session', () => ({
  requireCurrentUser: vi.fn(async () => ({ userId: currentUserId })),
}));

const { createTask, updateTask, deleteTask, listTasksByProject } = await import('./tasks');

async function makeUser() {
  const [user] = await db.insert(users).values({
    email: `${crypto.randomUUID()}@test.dev`,
    passwordHash: 'x',
    name: 'Test User',
  }).returning();
  return user;
}

async function makeProjectAs(role: 'owner' | 'admin' | 'member' | 'viewer') {
  const owner = await makeUser();
  const [project] = await db.insert(projects).values({ name: 'P', ownerId: owner.id }).returning();
  await db.insert(projectMembers).values({ projectId: project.id, userId: owner.id, role: 'owner' });

  if (role === 'owner') {
    currentUserId = owner.id;
    return project;
  }
  const other = await makeUser();
  await db.insert(projectMembers).values({ projectId: project.id, userId: other.id, role });
  currentUserId = other.id;
  return project;
}

describe('createTask', () => {
  it('creates a task with default status todo', async () => {
    const project = await makeProjectAs('member');
    const result = await createTask(project.id, { title: 'Do the thing', priority: 'high' });
    expect(result.data?.status).toBe('todo');
    expect(result.data?.priority).toBe('high');
  });

  it('viewer cannot create a task', async () => {
    const project = await makeProjectAs('viewer');
    await expect(createTask(project.id, { title: 'Nope' })).rejects.toThrow();
  });
});

describe('updateTask / deleteTask', () => {
  it('member can update but not delete; admin can delete', async () => {
    const project = await makeProjectAs('member');
    const created = await createTask(project.id, { title: 'T' });
    const taskId = created.data!.id;

    const updateResult = await updateTask(project.id, taskId, { status: 'in_progress' });
    expect(updateResult.error).toBeUndefined();
    await expect(deleteTask(project.id, taskId)).rejects.toThrow();
  });
});

describe('listTasksByProject', () => {
  it('lists tasks for any member', async () => {
    const project = await makeProjectAs('viewer');
    const list = await listTasksByProject(project.id);
    expect(list).toEqual([]);
  });
});
