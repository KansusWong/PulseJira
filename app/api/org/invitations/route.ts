import { getAuthContext } from '@/lib/auth';
import { createInvitation } from '@/lib/auth/invitation-service';

export async function POST(req: Request) {
  const auth = getAuthContext();
  if (!auth.orgId || !auth.userId) return Response.json({ error: 'Unauthorized' }, { status: 403 });
  if (!auth.orgRole || !['owner', 'admin'].includes(auth.orgRole)) {
    return Response.json({ error: 'Admin role required' }, { status: 403 });
  }

  const { email, role } = await req.json();
  if (!email) return Response.json({ error: 'Email is required' }, { status: 400 });

  const invitation = await createInvitation(auth.orgId, email, role || 'member', auth.userId);
  return Response.json({ success: true, data: { token: invitation.token } });
}
