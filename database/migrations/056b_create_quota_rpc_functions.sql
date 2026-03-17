-- Atomic quota deduction: returns TRUE if deducted, FALSE if exceeded
CREATE OR REPLACE FUNCTION deduct_quota(p_org_id UUID, p_tokens BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
  updated_count INT;
BEGIN
  UPDATE org_quotas
  SET token_used = token_used + p_tokens,
      updated_at = now()
  WHERE org_id = p_org_id
    AND token_used + p_tokens <= token_limit;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Quota correction: adjust by diff, floor at 0
CREATE OR REPLACE FUNCTION correct_quota(p_org_id UUID, p_diff BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE org_quotas
  SET token_used = GREATEST(0, token_used + p_diff),
      updated_at = now()
  WHERE org_id = p_org_id;
END;
$$ LANGUAGE plpgsql;
