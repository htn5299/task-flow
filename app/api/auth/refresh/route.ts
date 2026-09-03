import { NextResponse } from 'next/server';
import { verifyRefreshToken, rotateRefreshToken } from '@/lib/auth/refresh-token';
import { signAccessToken } from '@/lib/auth/jwt';
import { setAuthCookies, clearAuthCookies, getRefreshTokenCookie } from '@/lib/auth/cookies';

export async function POST() {
  const rawToken = await getRefreshTokenCookie();
  if (!rawToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }

  const record = await verifyRefreshToken(rawToken);
  if (!record) {
    await clearAuthCookies();
    return NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 });
  }

  const newRefreshToken = await rotateRefreshToken(record.tokenId, record.userId);
  const newAccessToken = await signAccessToken({ userId: record.userId });
  await setAuthCookies(newAccessToken, newRefreshToken);

  return NextResponse.json({ ok: true });
}
