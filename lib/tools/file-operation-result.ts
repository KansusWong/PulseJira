/**
 * Structured result type for file operations (edit / multi_edit).
 *
 * Aligns with the reference implementation's FileOperationResult which
 * carries `lines_affected` metadata alongside the human-readable message.
 */

export interface FileOperationResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  filePath?: string;
  linesAffected?: number[];
}

/**
 * Format a FileOperationResult into a human-readable string.
 * Includes affected line numbers when available.
 */
export function formatFileResult(r: FileOperationResult): string {
  const parts: string[] = [];

  if (r.success) {
    parts.push(`\u2713 ${r.message}`);
  } else {
    parts.push(`Error: ${r.message}`);
  }

  if (r.linesAffected && r.linesAffected.length > 0) {
    const lineStr = r.linesAffected.length <= 10
      ? r.linesAffected.join(', ')
      : `${r.linesAffected.slice(0, 10).join(', ')}... (${r.linesAffected.length} lines total)`;
    parts.push(`Lines affected: ${lineStr}`);
  }

  return parts.join('\n');
}
