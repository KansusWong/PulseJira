import { getAuthContext } from '@/lib/auth';
import { listOrgAssets } from '@/lib/services/asset-market-service';

export async function GET(req: Request) {
  const auth = getAuthContext();
  if (!auth.orgId) return Response.json({ error: 'No org context' }, { status: 403 });

  const url = new URL(req.url);
  const type = url.searchParams.get('type') || undefined;
  const tag = url.searchParams.get('tag') || undefined;
  const search = url.searchParams.get('q') || undefined;

  const assets = await listOrgAssets(auth.orgId, { type, tag, search });
  return Response.json({ success: true, data: assets });
}
