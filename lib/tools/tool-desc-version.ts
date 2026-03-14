/**
 * Tool description version switcher.
 *
 * Reference implementations provide V1 (verbose) and V2 (concise) descriptions
 * for every tool. This module lets the system toggle between them globally.
 */

export type ToolDescVersion = 'v1' | 'v2';

let currentVersion: ToolDescVersion = 'v1';

export function getToolDescVersion(): ToolDescVersion {
  return currentVersion;
}

export function setToolDescVersion(v: ToolDescVersion): void {
  currentVersion = v;
}

/** Return the V1 or V2 string based on the current global setting. */
export function selectDesc(v1: string, v2: string): string {
  return currentVersion === 'v1' ? v1 : v2;
}
