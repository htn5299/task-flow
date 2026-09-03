import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, signAccessToken } from '@/lib/auth/jwt';
import { verifyRefreshToken, rotateRefreshToken } from '@/lib/auth/refresh-token';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_MAX_AGE,
  authCookieOptions,
} from '@/lib/auth/cookies';

export const runtime = 'nodejs';

function setAuthCookiesOnResponse(response: NextResponse, accessToken: string, refreshToken: string) {
  response.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, authCookieOptions(ACCESS_TOKEN_MAX_AGE));
  response.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, authCookieOptions(REFRESH_TOKEN_MAX_AGE));
}

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (accessToken && (await verifyAccessToken(accessToken))) {
    return NextResponse.next();
  }

  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (refreshToken) {
    const record = await verifyRefreshToken(refreshToken);
    if (record) {
      const newRefreshToken = await rotateRefreshToken(record.tokenId, record.userId);
      const newAccessToken = await signAccessToken({ userId: record.userId });
      const response = NextResponse.next();
      setAuthCookiesOnResponse(response, newAccessToken, newRefreshToken);
      return response;
    }
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('from', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/projects/:path*'],
};
