import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

describe('database connectivity', () => {
  it('inserts and reads a user', async () => {
    const [user] = await db.insert(users).values({
      email: 'smoke@test.dev',
      passwordHash: 'x',
      name: 'Smoke Test',
    }).returning();

    expect(user.id).toBeTruthy();
    expect(user.email).toBe('smoke@test.dev');
  });
});
