import { getAuthContext } from '@/lib/auth';
import { isPlatformAdmin } from '@/lib/auth/platform-admin';
import { storeSecret } from '@/lib/services/secret-service';
import { supabase } from '@/lib/db/client';

export async function GET() {
  const auth = getAuthContext();
  if (!(await isPlatformAdmin(auth.userId))) return Response.json({ error: 'Forbidden' }, { status: 403 });

  // List all secrets (without decrypted values)
  const { data, error } = await supabase
    .from('platform_secrets')
    .select('id, org_id, key_name, provider, is_active, priority, key_version, created_at')
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, data });
}

export async function POST(req: Request) {
  const auth = getAuthContext();
  if (!(await isPlatformAdmin(auth.userId))) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const { orgId, keyName, plainValue, provider, priority } = await req.json();
  if (!keyName || !plainValue || !provider) {
    return Response.json({ error: 'keyName, plainValue, and provider are required' }, { status: 400 });
  }

  const secret = await storeSecret({
    orgId: orgId || null,
    keyName,
    plainValue,
    provider,
    priority,
    createdBy: auth.userId || undefined,
  });
  return Response.json({ success: true, data: { id: secret.id, key_name: secret.key_name } });
}
