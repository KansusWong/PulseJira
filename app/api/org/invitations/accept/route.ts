import { getAuthContext } from '@/lib/auth';
import { acceptInvitation } from '@/lib/auth/invitation-service';
import { supabase } from '@/lib/db/client';

export async function POST(req: Request) {
  const auth = getAuthContext();
  if (!auth.userId) return Response.json({ error: 'Must be logged in' }, { status: 401 });

  const { token } = await req.json();
  if (!token) return Response.json({ error: 'Token is required' }, { status: 400 });

  const { data: user } = await supabase
    .from('users')
    .select('email')
    .eq('id', auth.userId)
    .single();

  if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

  const invitation = await acceptInvitation(token, auth.userId, user.email);

  return Response.json({
    success: true,
    data: { orgId: invitation.org_id },
    message: 'Please refresh your session to access the new organization.',
  });
}
