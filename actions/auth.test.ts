import { describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    set: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
  })),
}));

const { register, login } = await import('./auth');

describe('register', () => {
  it('creates a user with a hashed password', async () => {
    const result = await register({ email: 'new@test.dev', password: 'password123', name: 'New User' });
    expect(result.error).toBeUndefined();
    expect(result.fieldErrors).toBeUndefined();

    const [user] = await db.select().from(users).where(eq(users.email, 'new@test.dev')).limit(1);
    expect(user).toBeTruthy();
    expect(user.passwordHash).not.toBe('password123');
  });

  it('rejects a duplicate email', async () => {
    await register({ email: 'dup@test.dev', password: 'password123', name: 'First' });
    const result = await register({ email: 'dup@test.dev', password: 'password123', name: 'Second' });
    expect(result.fieldErrors?.email).toBeTruthy();
  });

  it('rejects an invalid input shape', async () => {
    const result = await register({ email: 'not-an-email', password: '123', name: '' });
    expect(result.fieldErrors).toBeTruthy();
  });
});

describe('login', () => {
  it('succeeds with correct credentials', async () => {
    await register({ email: 'login@test.dev', password: 'password123', name: 'Login User' });
    const result = await login({ email: 'login@test.dev', password: 'password123' });
    expect(result.error).toBeUndefined();
  });

  it('fails with wrong password', async () => {
    await register({ email: 'login2@test.dev', password: 'password123', name: 'Login User 2' });
    const result = await login({ email: 'login2@test.dev', password: 'wrong' });
    expect(result.error).toBeTruthy();
  });

  it('fails for an unknown email', async () => {
    const result = await login({ email: 'nobody@test.dev', password: 'password123' });
    expect(result.error).toBeTruthy();
  });
});
