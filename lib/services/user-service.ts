import 'server-only';
import { supabase } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';

export async function createUser(email: string, name: string, password?: string) {
  const passwordHash = password ? await hashPassword(password) : null;
  const { data, error } = await supabase
    .from('users')
    .insert({ email, name, password_hash: passwordHash })
    .select('id, email, name, avatar_url')
    .single();
  if (error) throw new Error(`Failed to create user: ${error.message}`);
  return data;
}

export async function getUserByEmail(email: string) {
  const { data } = await supabase
    .from('users')
    .select('id, email, name, avatar_url')
    .eq('email', email)
    .single();
  return data;
}

export async function getUserById(id: string) {
  const { data } = await supabase
    .from('users')
    .select('id, email, name, avatar_url')
    .eq('id', id)
    .single();
  return data;
}
