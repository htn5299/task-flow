import { getAccessTokenCookie } from '@/lib/auth/cookies';
import { verifyAccessToken } from '@/lib/auth/jwt';

export class AuthError extends Error {}

export async function getCurrentUser(): Promise<{ userId: string } | null> {
  const token = await getAccessTokenCookie();
  if (!token) return null;
  return verifyAccessToken(token);
}

export async function requireCurrentUser(): Promise<{ userId: string }> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError('Not authenticated');
  return user;
}
