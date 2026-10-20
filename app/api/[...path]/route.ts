import { env, waitUntil } from 'cloudflare:workers';
import { handleApi, r2Store } from '../../data-service.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return handleApi(request,r2Store(env.BUCKET),{waitUntil}); }
