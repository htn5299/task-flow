import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users, projects, projectMembers, tasks } from '@/lib/db/schema';

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

    // admin can delete
    const adminProject = await makeProjectAs('admin');
    const adminCreated = await createTask(adminProject.id, { title: 'Admin task' });
    const adminTaskId = adminCreated.data!.id;
    const deleteResult = await deleteTask(adminProject.id, adminTaskId);
    expect(deleteResult.error).toBeUndefined();
    const remaining = await db.select().from(tasks).where(eq(tasks.id, adminTaskId));
    expect(remaining).toEqual([]);
  });

  it('cannot update or delete a task belonging to a different project via IDOR (owner/admin of project A against project B task)', async () => {
    // Project B: a task owned by a different project entirely.
    const projectB = await makeProjectAs('owner');
    const taskB = await createTask(projectB.id, { title: 'Project B task' });
    const taskBId = taskB.data!.id;

    // Project A: attacker is owner/admin of their OWN project, and tries to
    // pass projectA.id (which they have permission on) but taskB.id (which
    // belongs to a project they are not a member of).
    const projectA = await makeProjectAs('owner');

    const updateResult = await updateTask(projectA.id, taskBId, { title: 'Hacked' });
    expect(updateResult.error).toBeDefined();
    expect(updateResult.fieldErrors).toBeUndefined();

    const deleteResult = await deleteTask(projectA.id, taskBId);
    expect(deleteResult.error).toBeDefined();

    // Confirm project B's task is completely untouched.
    const [untouched] = await db.select().from(tasks).where(eq(tasks.id, taskBId));
    expect(untouched).toBeDefined();
    expect(untouched.title).toBe('Project B task');
    expect(untouched.projectId).toBe(projectB.id);
  });
});

describe('listTasksByProject', () => {
  it('lists tasks for any member', async () => {
    const project = await makeProjectAs('viewer');
    const list = await listTasksByProject(project.id);
    expect(list).toEqual([]);
  });
});
