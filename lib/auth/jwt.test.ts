import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken } from './jwt';

describe('access token JWT', () => {
  it('signs and verifies a token round-trip', async () => {
    const token = await signAccessToken({ userId: 'user-123' });
    const payload = await verifyAccessToken(token);
    expect(payload).toEqual({ userId: 'user-123' });
  });

  it('rejects a garbage token', async () => {
    const payload = await verifyAccessToken('not-a-real-token');
    expect(payload).toBeNull();
  });
});
