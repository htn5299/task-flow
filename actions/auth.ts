'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { signAccessToken } from '@/lib/auth/jwt';
import { createRefreshToken, verifyRefreshToken, revokeRefreshToken } from '@/lib/auth/refresh-token';
import { setAuthCookies, clearAuthCookies, getRefreshTokenCookie } from '@/lib/auth/cookies';
import { registerSchema, loginSchema } from '@/lib/validation/auth';
import { flattenZodErrors } from '@/lib/validation/flatten-zod-errors';

export interface ActionResult<T = undefined> {
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function register(input: unknown): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: flattenZodErrors(parsed.error) };
  const { email, password, name } = parsed.data;

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { fieldErrors: { email: 'Email đã được sử dụng' } };

  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(users).values({ email, passwordHash, name }).returning();

  const accessToken = await signAccessToken({ userId: user.id });
  const refreshToken = await createRefreshToken(user.id);
  await setAuthCookies(accessToken, refreshToken);

  return {};
}

export async function login(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: flattenZodErrors(parsed.error) };
  const { email, password } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: 'Email hoặc mật khẩu không đúng' };
  }

  const accessToken = await signAccessToken({ userId: user.id });
  const refreshToken = await createRefreshToken(user.id);
  await setAuthCookies(accessToken, refreshToken);

  return {};
}

export async function logout(): Promise<void> {
  const rawToken = await getRefreshTokenCookie();
  if (rawToken) {
    const record = await verifyRefreshToken(rawToken);
    if (record) await revokeRefreshToken(record.tokenId);
  }
  await clearAuthCookies();
}
