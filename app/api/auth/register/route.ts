import { createUser, getUserByEmail } from '@/lib/services/user-service';

export async function POST(req: Request) {
  const { email, name, password } = await req.json();
  if (!email || !password) {
    return Response.json({ error: 'Email and password required' }, { status: 400 });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return Response.json({ error: 'User already exists' }, { status: 409 });
  }

  const user = await createUser(email, name || email.split('@')[0], password);
  return Response.json({ success: true, user });
}
