import { getAuthContext } from '@/lib/auth';
import { getAssetDetail } from '@/lib/services/asset-market-service';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = getAuthContext();
  if (!auth.orgId) return Response.json({ error: 'No org context' }, { status: 403 });

  const asset = await getAssetDetail(params.id, auth.orgId);
  if (!asset) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ success: true, data: asset });
}
