import { getAuthContext } from '@/lib/auth';
import { isPlatformAdmin } from '@/lib/auth/platform-admin';
import { supabase } from '@/lib/db/client';

export async function GET() {
  const auth = getAuthContext();
  if (!(await isPlatformAdmin(auth.userId))) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('organizations')
    .select('*, org_members(count)')
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, data });
}
