import crypto from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { refreshTokens } from '@/lib/db/schema';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export async function createRefreshToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  return rawToken;
}

export interface RefreshTokenResult {
  tokenId: string;
  userId: string;
}

export async function verifyRefreshToken(rawToken: string): Promise<RefreshTokenResult | null> {
  const tokenHash = hashToken(rawToken);
  const [record] = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
    .limit(1);

  if (!record) return null;
  if (record.expiresAt.getTime() < Date.now()) return null;

  return { tokenId: record.id, userId: record.userId };
}

export async function revokeRefreshToken(tokenId: string): Promise<void> {
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, tokenId));
}

export async function rotateRefreshToken(tokenId: string, userId: string): Promise<string> {
  await revokeRefreshToken(tokenId);
  return createRefreshToken(userId);
}
