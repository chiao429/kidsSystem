import type { NextRequest } from 'next/server';
import { pathnameMiddleware } from '@kids/auth/middleware';

export function middleware(req: NextRequest) {
  return pathnameMiddleware(req);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
