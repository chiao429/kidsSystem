import 'server-only';
import { timingSafeEqual } from 'node:crypto';

/** 以 Bearer token 驗證；未設定 token 時回傳 404（不暴露端點） */
export function checkBearer(req: Request, envName: 'SYNC_TOKEN' | 'MIGRATE_TOKEN'): Response | null {
  const token = process.env[envName];
  if (!token) return Response.json({ error: 'not_found' }, { status: 404 });
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got);
  const b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return null;
}

export function requireMongo(): Response | null {
  return process.env.DATA_BACKEND === 'mongo' ? null : Response.json({ error: 'DATA_BACKEND 不是 mongo' }, { status: 409 });
}
