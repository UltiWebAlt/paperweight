/**
 * Owns the main log path so IPC can expose it for support diagnostics.
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

let logPath: string | null = null;

export function initFileLog(path: string): void {
  logPath = path;
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    // ignore
  }
}

export function getFileLogPath(): string {
  return logPath ?? "";
}
