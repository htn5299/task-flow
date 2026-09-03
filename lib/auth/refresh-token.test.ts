import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { createRefreshToken, verifyRefreshToken, revokeRefreshToken, rotateRefreshToken } from './refresh-token';

async function makeUser() {
  const [user] = await db.insert(users).values({
    email: `${crypto.randomUUID()}@test.dev`,
    passwordHash: 'x',
    name: 'Test User',
  }).returning();
  return user;
}

describe('refresh tokens', () => {
  it('creates and verifies a token', async () => {
    const user = await makeUser();
    const rawToken = await createRefreshToken(user.id);
    const result = await verifyRefreshToken(rawToken);
    expect(result?.userId).toBe(user.id);
  });

  it('rejects an unknown token', async () => {
    const result = await verifyRefreshToken('does-not-exist');
    expect(result).toBeNull();
  });

  it('rejects a revoked token', async () => {
    const user = await makeUser();
    const rawToken = await createRefreshToken(user.id);
    const record = await verifyRefreshToken(rawToken);
    await revokeRefreshToken(record!.tokenId);
    expect(await verifyRefreshToken(rawToken)).toBeNull();
  });

  it('rotates a token: old is revoked, new one verifies', async () => {
    const user = await makeUser();
    const rawToken = await createRefreshToken(user.id);
    const record = await verifyRefreshToken(rawToken);
    const newRawToken = await rotateRefreshToken(record!.tokenId, user.id);

    expect(await verifyRefreshToken(rawToken)).toBeNull();
    const newResult = await verifyRefreshToken(newRawToken);
    expect(newResult?.userId).toBe(user.id);
  });
});
