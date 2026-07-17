/**
 * Scheduler Service
 * Handles background wallpaper changing on a timer.
 * Uses expo-background-fetch + expo-task-manager for background execution.
 * Mirrors Metamorphoun's startWallpaperScheduler in main.go.
 */

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { Platform, NativeModules } from 'react-native';
import { getConfig, saveConfig } from './configService';
import { generateNewWallpaper } from './wallpaperService';
import { updateCurrentQuote } from './quoteService';
import { logEntry } from './logService';

export const WALLPAPER_TASK = 'MOBIMORPHOUN_WALLPAPER_CHANGE';
export const QUOTE_TASK = 'MOBIMORPHOUN_QUOTE_CHANGE';

/**
 * Define the background task for wallpaper changes
 */
TaskManager.defineTask(WALLPAPER_TASK, async () => {
  try {
    logEntry('INFO', 'Scheduler', 'wallpaperTask', 'Background wallpaper change triggered');
    const result = await generateNewWallpaper('BackgroundTask');

    if (result.success) {
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    return BackgroundFetch.BackgroundFetchResult.Failed;
  } catch (err) {
    logEntry('ERROR', 'Scheduler', 'wallpaperTask', `Task failed: ${err}`);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Define the background task for quote changes
 */
TaskManager.defineTask(QUOTE_TASK, async () => {
  try {
    logEntry('INFO', 'Scheduler', 'quoteTask', 'Background quote change triggered');
    await updateCurrentQuote();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (err) {
    logEntry('ERROR', 'Scheduler', 'quoteTask', `Task failed: ${err}`);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Register the wallpaper change background task
 */
export async function registerWallpaperScheduler(): Promise<void> {
  const config = getConfig();
  const intervalSeconds = config.changeMinutes * 60;

  try {
    await BackgroundFetch.registerTaskAsync(WALLPAPER_TASK, {
      minimumInterval: Math.max(intervalSeconds, 900), // iOS minimum is 15 min
      stopOnTerminate: false,
      startOnBoot: true,
    });
    logEntry('INFO', 'Scheduler', 'register', `Wallpaper task registered (${config.changeMinutes} min)`);
  } catch (err) {
    logEntry('ERROR', 'Scheduler', 'register', `Failed to register wallpaper task: ${err}`);
  }
}

/**
 * Register the quote change background task
 */
export async function registerQuoteScheduler(): Promise<void> {
  const config = getConfig();

  if (!config.showTextOverlay) return;

  const intervalSeconds = config.textChangeMinutes * 60;

  try {
    await BackgroundFetch.registerTaskAsync(QUOTE_TASK, {
      minimumInterval: Math.max(intervalSeconds, 900),
      stopOnTerminate: false,
      startOnBoot: true,
    });
    logEntry('INFO', 'Scheduler', 'register', `Quote task registered (${config.textChangeMinutes} min)`);
  } catch (err) {
    logEntry('ERROR', 'Scheduler', 'register', `Failed to register quote task: ${err}`);
  }
}

/**
 * Unregister all background tasks
 */
export async function unregisterAllTasks(): Promise<void> {
  try {
    await BackgroundFetch.unregisterTaskAsync(WALLPAPER_TASK);
  } catch { /* may not be registered */ }
  try {
    await BackgroundFetch.unregisterTaskAsync(QUOTE_TASK);
  } catch { /* may not be registered */ }
}

/**
 * Check if background fetch is available
 */
export async function checkBackgroundStatus(): Promise<BackgroundFetch.BackgroundFetchStatus | null> {
  return BackgroundFetch.getStatusAsync();
}

/**
 * Initialize all schedulers on app startup
 */
export async function initializeSchedulers(): Promise<void> {
  const config = getConfig();

  // Start the native foreground service (reliable background timer)
  if (Platform.OS === 'android' && NativeModules.WallpaperServiceManager) {
    try {
      await NativeModules.WallpaperServiceManager.startService(config.changeMinutes);
      logEntry('INFO', 'Scheduler', 'init', `Native service started (${config.changeMinutes} min)`);
    } catch (err) {
      console.warn('Failed to start native wallpaper service:', err);
    }
  }

  // Register background fetch as additional fallback
  try {
    await registerWallpaperScheduler();
  } catch (err) {
    console.warn('Failed to register wallpaper scheduler:', err);
  }

  try {
    await registerQuoteScheduler();
  } catch (err) {
    console.warn('Failed to register quote scheduler:', err);
  }

  // Start foreground timers for when the app is active
  startForegroundTimers();
}

// Track interval IDs so we can clear them
let wallpaperIntervalId: ReturnType<typeof setInterval> | null = null;
let quoteIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Start in-app foreground timers that fire while the app is running.
 * Background fetch handles it when the app is closed.
 */
export function startForegroundTimers(): void {
  const config = getConfig();

  // Clear any existing timers
  stopForegroundTimers();

  // Wallpaper change timer
  const wallpaperMs = config.changeMinutes * 60 * 1000;
  wallpaperIntervalId = setInterval(async () => {
    try {
      logEntry('INFO', 'Scheduler', 'foregroundTimer', 'Wallpaper timer fired');
      await generateNewWallpaper('ForegroundTimer');
    } catch (err) {
      console.warn('Foreground wallpaper timer error:', err);
    }
  }, wallpaperMs);

  // Quote change timer (only if text overlay is on)
  if (config.showTextOverlay) {
    const quoteMs = config.textChangeMinutes * 60 * 1000;
    quoteIntervalId = setInterval(async () => {
      try {
        logEntry('INFO', 'Scheduler', 'foregroundTimer', 'Quote timer fired');
        await updateCurrentQuote();
      } catch (err) {
        console.warn('Foreground quote timer error:', err);
      }
    }, quoteMs);
  }

  logEntry('INFO', 'Scheduler', 'foregroundTimers',
    `Started: wallpaper every ${config.changeMinutes}min, quote every ${config.textChangeMinutes}min`);
}

/**
 * Stop foreground timers (call when app goes to background or settings change)
 */
export function stopForegroundTimers(): void {
  if (wallpaperIntervalId !== null) {
    clearInterval(wallpaperIntervalId);
    wallpaperIntervalId = null;
  }
  if (quoteIntervalId !== null) {
    clearInterval(quoteIntervalId);
    quoteIntervalId = null;
  }
}

/**
 * Restart the native service with a new interval (call when settings change)
 */
export async function restartServiceWithInterval(minutes: number): Promise<void> {
  if (Platform.OS === 'android' && NativeModules.WallpaperServiceManager) {
    try {
      await NativeModules.WallpaperServiceManager.stopService();
      await NativeModules.WallpaperServiceManager.startService(minutes);
      logEntry('INFO', 'Scheduler', 'restart', `Service restarted (${minutes} min)`);
    } catch (err) {
      console.warn('Failed to restart service:', err);
    }
  }

  // Also reset foreground timers
  stopForegroundTimers();
  startForegroundTimers();
}
