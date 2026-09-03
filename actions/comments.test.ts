import { describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { users, projects, projectMembers, tasks } from '@/lib/db/schema';

let currentUserId: string;
vi.mock('@/lib/auth/session', () => ({
  requireCurrentUser: vi.fn(async () => ({ userId: currentUserId })),
}));

const { createComment, listCommentsByTask } = await import('./comments');

async function makeUser() {
  const [user] = await db.insert(users).values({
    email: `${crypto.randomUUID()}@test.dev`,
    passwordHash: 'x',
    name: 'Test User',
  }).returning();
  return user;
}

async function makeTaskAs(role: 'owner' | 'admin' | 'member' | 'viewer') {
  const owner = await makeUser();
  const [project] = await db.insert(projects).values({ name: 'P', ownerId: owner.id }).returning();
  await db.insert(projectMembers).values({ projectId: project.id, userId: owner.id, role: 'owner' });
  const [task] = await db.insert(tasks).values({ projectId: project.id, title: 'T', createdBy: owner.id }).returning();

  if (role === 'owner') {
    currentUserId = owner.id;
    return task;
  }
  const other = await makeUser();
  await db.insert(projectMembers).values({ projectId: project.id, userId: other.id, role });
  currentUserId = other.id;
  return task;
}

describe('createComment', () => {
  it('member can comment on a task', async () => {
    const task = await makeTaskAs('member');
    const result = await createComment(task.id, { content: 'Looks good' });
    expect(result.data?.content).toBe('Looks good');
  });

  it('viewer cannot comment', async () => {
    const task = await makeTaskAs('viewer');
    await expect(createComment(task.id, { content: 'Nope' })).rejects.toThrow();
  });
});

describe('listCommentsByTask', () => {
  it('lists comments in creation order for any member', async () => {
    const task = await makeTaskAs('member');
    await createComment(task.id, { content: 'first' });
    await createComment(task.id, { content: 'second' });
    const comments = await listCommentsByTask(task.id);
    expect(comments.map((c) => c.content)).toEqual(['first', 'second']);
  });
});
