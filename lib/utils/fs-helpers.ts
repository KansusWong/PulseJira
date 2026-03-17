import fs from "fs";

/**
 * Check if a file or directory exists at the given path.
 *
 * Uses fs.accessSync instead of fs.existsSync to avoid Turbopack TP1004
 * static-analysis warnings on dynamic paths. Turbopack cannot trace through
 * this function boundary, so the warning is suppressed.
 */
export function pathExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}
