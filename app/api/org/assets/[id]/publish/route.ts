import { getAuthContext } from '@/lib/auth';
import { publishAsset } from '@/lib/services/asset-market-service';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = getAuthContext();
  if (!auth.orgId || !auth.userId) return Response.json({ error: 'Unauthorized' }, { status: 403 });
  if (!auth.orgRole || !['owner', 'admin'].includes(auth.orgRole)) {
    return Response.json({ error: 'Admin role required' }, { status: 403 });
  }

  const asset = await publishAsset(params.id, auth.userId);
  return Response.json({ success: true, data: asset });
}
