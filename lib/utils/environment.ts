/**
 * Environment context utility — provides real-world date/time facts for agent prompts.
 * Extracted to a standalone module to avoid circular dependencies.
 */
export function getEnvironmentContext(): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0];
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'zh-CN';
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  return [
    `Current date: ${date} (${dayOfWeek})`,
    `Current time: ${time}`,
    `Timezone: ${tz}`,
    `Locale: ${locale}`,
  ].join('\n');
}
