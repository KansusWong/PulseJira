import { supabase } from './supabase';

export async function updateSignalStatus(
  signalId: string, 
  status: 'ANALYZED' | 'APPROVED' | 'REJECTED',
  refinedContent?: string
) {
  const updateData: any = { status };
  if (refinedContent) {
    updateData.refined_content = refinedContent;
  }

  const { error } = await supabase
    .from('signals')
    .update(updateData)
    .eq('id', signalId);

  if (error) {
    console.error(`Failed to update signal ${signalId} status to ${status}:`, error);
    throw error;
  }
}

export async function getSignalStatus(signalId: string) {
  const { data, error } = await supabase
    .from('signals')
    .select('status, refined_content, content')
    .eq('id', signalId)
    .single();

  if (error) {
    console.error(`Failed to get signal ${signalId} status:`, error);
    return null;
  }
  return data;
}
