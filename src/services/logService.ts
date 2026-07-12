/**
 * Log Service
 * Mirrors Metamorphoun's morphLog package.
 * Stores structured logs in JSON format, organized by date.
 */

import * as FileSystem from 'expo-file-system';

const LOGS_DIR = `${FileSystem.documentDirectory}logs/`;

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface LogItem {
  timeStamp: string;
  message: string;
  level: LogLevel;
  library: string;
  operation: string;
  origin: string;
}

/**
 * Write a log entry
 */
export function logEntry(
  level: LogLevel,
  library: string,
  operation: string,
  message: string,
  origin: string = ''
): void {
  const entry: LogItem = {
    timeStamp: new Date().toISOString(),
    message,
    level,
    library,
    operation,
    origin,
  };

  // Log to console in dev
  if (__DEV__) {
    console.log(`[${level}] ${library}.${operation}: ${message}`);
  }

  // Async write to file (fire and forget)
  appendLog(entry).catch(err => {
    console.warn('Failed to write log:', err);
  });
}

async function appendLog(entry: LogItem): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(LOGS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(LOGS_DIR, { intermediates: true });
  }

  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const filePath = `${LOGS_DIR}log_${date}.json`;

  let logs: LogItem[] = [];
  const fileInfo = await FileSystem.getInfoAsync(filePath);
  if (fileInfo.exists) {
    try {
      const content = await FileSystem.readAsStringAsync(filePath);
      logs = JSON.parse(content);
    } catch {
      logs = [];
    }
  }

  // Prepend (newest first, like Metamorphoun)
  logs = [entry, ...logs];

  // Cap at 500 entries per day
  if (logs.length > 500) {
    logs = logs.slice(0, 500);
  }

  await FileSystem.writeAsStringAsync(filePath, JSON.stringify(logs, null, 2));
}

/**
 * Get logs for a specific date
 */
export async function getLogs(date?: string): Promise<LogItem[]> {
  const targetDate = date ?? new Date().toISOString().split('T')[0];
  const filePath = `${LOGS_DIR}log_${targetDate}.json`;

  try {
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (!fileInfo.exists) return [];

    const content = await FileSystem.readAsStringAsync(filePath);
    return JSON.parse(content) as LogItem[];
  } catch {
    return [];
  }
}

/**
 * Clean up old log files (keep last 7 days)
 */
export async function cleanupOldLogs(): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(LOGS_DIR);
    if (!dirInfo.exists) return;

    const files = await FileSystem.readDirectoryAsync(LOGS_DIR);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    for (const file of files) {
      // Extract date from filename: log_YYYY-MM-DD.json
      const match = file.match(/log_(\d{4}-\d{2}-\d{2})\.json/);
      if (match && match[1] < cutoffStr) {
        await FileSystem.deleteAsync(`${LOGS_DIR}${file}`, { idempotent: true });
      }
    }
  } catch (err) {
    console.warn('Log cleanup failed:', err);
  }
}
