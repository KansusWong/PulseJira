import { getAuthContext } from '@/lib/auth';
import { deprecateAsset } from '@/lib/services/asset-market-service';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = getAuthContext();
  if (!auth.orgRole || !['owner', 'admin'].includes(auth.orgRole)) {
    return Response.json({ error: 'Admin role required' }, { status: 403 });
  }

  const asset = await deprecateAsset(params.id);
  return Response.json({ success: true, data: asset });
}
