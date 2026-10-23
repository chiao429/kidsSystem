import { NextResponse, type NextRequest } from 'next/server';
import { PATHNAME_HEADER } from './paths';

/** 各 app 的 middleware：把目前完整路徑（含 basePath、query）放進 request header，供登入後返回 */
export function pathnameMiddleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set(PATHNAME_HEADER, `${req.nextUrl.basePath}${req.nextUrl.pathname}${req.nextUrl.search}`);
  return NextResponse.next({ request: { headers } });
}
