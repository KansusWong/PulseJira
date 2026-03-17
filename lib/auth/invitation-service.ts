import 'server-only';
import crypto from 'crypto';
import { supabase } from '@/lib/db/client';

export async function createInvitation(orgId: string, email: string, role: string, invitedBy: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('org_invitations')
    .insert({ org_id: orgId, email, role, invited_by: invitedBy, token, expires_at: expiresAt })
    .select()
    .single();

  if (error) throw new Error(`Failed to create invitation: ${error.message}`);
  return { ...data, token };
}

export async function acceptInvitation(token: string, userId: string, userEmail: string) {
  const { data: invitation, error } = await supabase
    .from('org_invitations')
    .select('*')
    .eq('token', token)
    .is('accepted_at', null)
    .single();

  if (error || !invitation) throw new Error('Invalid or expired invitation');
  if (new Date(invitation.expires_at) < new Date()) throw new Error('Invitation expired');
  if (invitation.email !== userEmail) throw new Error('Email does not match invitation');

  const { error: memberErr } = await supabase
    .from('org_members')
    .insert({ org_id: invitation.org_id, user_id: userId, role: invitation.role });
  if (memberErr && !memberErr.message.includes('duplicate')) {
    throw new Error(`Failed to add to org: ${memberErr.message}`);
  }

  await supabase
    .from('org_invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)
    .is('accepted_at', null);

  return invitation;
}
