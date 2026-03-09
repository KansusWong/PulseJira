import { calculateCostUsd, getKnownModels } from '../model-pricing';

describe('calculateCostUsd', () => {
  it('calculates cost for gpt-4o', () => {
    // gpt-4o: $2.5/1M prompt, $10/1M completion
    const cost = calculateCostUsd('gpt-4o', 1_000_000, 1_000_000);
    expect(cost).toBe(2.5 + 10);
  });

  it('calculates cost for gpt-4o-mini', () => {
    // gpt-4o-mini: $0.15/1M prompt, $0.6/1M completion
    const cost = calculateCostUsd('gpt-4o-mini', 500_000, 200_000);
    expect(cost).toBeCloseTo(0.075 + 0.12, 6);
  });

  it('returns null for unknown model', () => {
    expect(calculateCostUsd('unknown-model-v99', 1000, 1000)).toBeNull();
  });

  it('returns null for null/undefined model', () => {
    expect(calculateCostUsd(null, 1000, 1000)).toBeNull();
    expect(calculateCostUsd(undefined, 1000, 1000)).toBeNull();
  });

  it('matches versioned model names via prefix', () => {
    // "gpt-4o-2024-08-06" should match "gpt-4o"
    const cost = calculateCostUsd('gpt-4o-2024-08-06', 1_000_000, 0);
    expect(cost).toBe(2.5);
  });

  it('returns 0 for zero tokens', () => {
    expect(calculateCostUsd('gpt-4o', 0, 0)).toBe(0);
  });

  it('handles deepseek-chat', () => {
    const cost = calculateCostUsd('deepseek-chat', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.27 + 1.1, 6);
  });
});

describe('getKnownModels', () => {
  it('returns an array of model names', () => {
    const models = getKnownModels();
    expect(models).toContain('gpt-4o');
    expect(models).toContain('gpt-4o-mini');
    expect(models).toContain('deepseek-chat');
    expect(models.length).toBeGreaterThanOrEqual(5);
  });
});
