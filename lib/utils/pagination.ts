export function parsePagination(url: string, defaults = { limit: 50, maxLimit: 200 }) {
  const { searchParams } = new URL(url);
  const limit = Math.min(
    Math.max(parseInt(searchParams.get('limit') || String(defaults.limit), 10) || defaults.limit, 1),
    defaults.maxLimit,
  );
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);
  return { limit, offset };
}
