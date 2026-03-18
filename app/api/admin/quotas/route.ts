import { getAuthContext } from '@/lib/auth';
import { isPlatformAdmin } from '@/lib/auth/platform-admin';
import { supabase } from '@/lib/db/client';

export async function GET() {
  const auth = getAuthContext();
  if (!(await isPlatformAdmin(auth.userId))) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('org_quotas')
    .select('*, organizations(name, slug)')
    .order('updated_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, data });
}

export async function POST(req: Request) {
  const auth = getAuthContext();
  if (!(await isPlatformAdmin(auth.userId))) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const { orgId, tokenLimit, period } = await req.json();
  if (!orgId || !tokenLimit) {
    return Response.json({ error: 'orgId and tokenLimit are required' }, { status: 400 });
  }

  const resetAt = new Date();
  resetAt.setMonth(resetAt.getMonth() + 1);
  resetAt.setDate(1);
  resetAt.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('org_quotas')
    .upsert({
      org_id: orgId,
      token_limit: tokenLimit,
      period: period || 'monthly',
      reset_at: resetAt.toISOString(),
    }, { onConflict: 'org_id' })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, data });
}
