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
import { MobiConfig } from '../types/config';
import { generateNewWallpaper } from './wallpaperService';
import { updateCurrentQuote, getEnabledQuotePool } from './quoteService';
import { logEntry } from './logService';

/**
 * Build the comma-separated list of enabled filter names from config,
 * mirroring filterService.getEnabledFilters (minus the Original weighting,
 * which the native side applies itself).
 */
function buildEnabledFiltersString(config: MobiConfig): string {
  const filters: string[] = [];
  if (config.wallpaperFilterOriginal) filters.push('Original');
  if (config.wallpaperFilterBlurSoft) filters.push('BlurSoft');
  if (config.wallpaperFilterBlurHard) filters.push('BlurHard');
  if (config.wallpaperFilterPixelate) filters.push('Pixelate');
  if (config.wallpaperFilterMonochrome) filters.push('Monochrome');
  if (config.wallpaperFilterCartoon) filters.push('Cartoon');
  if (config.wallpaperFilterWavy) filters.push('Wavy');
  if (config.wallpaperFilterVortex) filters.push('Vortex');
  if (config.wallpaperFilterMosaic) filters.push('Mosaic');
  if (config.wallpaperFilterJigsawPuzzle) filters.push('JigsawPuzzle');
  if (config.wallpaperFilterGraffiti) filters.push('Graffiti');
  if (config.wallpaperFilterOilify) filters.push('Oilify');
  if (config.wallpaperFilterCyberpunk) filters.push('Cyberpunk');
  return filters.join(',');
}

/**
 * Sync the enabled wallpaper filters to the native service so the background
 * timer only applies filters the user turned on.
 */
export async function syncFiltersToNative(config?: MobiConfig): Promise<void> {
  if (Platform.OS === 'android' && NativeModules.WallpaperServiceManager?.syncEnabledFilters) {
    try {
      const cfg = config || getConfig();
      const enabledFilters = buildEnabledFiltersString(cfg);
      await NativeModules.WallpaperServiceManager.syncEnabledFilters(enabledFilters);
      logEntry('INFO', 'Scheduler', 'syncFilters', `Filters synced: ${enabledFilters}`);
    } catch (err) {
      console.warn('Failed to sync filters:', err);
    }
  }
}

/**
 * Sync the pool of quotes from the user's enabled quote libraries to the
 * native service. Sent as newline-separated "statement|author" entries.
 */
export async function syncQuotesToNative(config?: MobiConfig): Promise<void> {
  if (Platform.OS === 'android' && NativeModules.WallpaperServiceManager?.syncQuotes) {
    try {
      const pool = await getEnabledQuotePool();
      // Sanitize: strip newlines/pipes from within statements so the
      // delimiter-based format stays intact on the native side.
      const blob = pool
        .map(q => {
          const statement = (q.statement || '').replace(/[\r\n|]+/g, ' ').trim();
          const author = (q.author || '').replace(/[\r\n|]+/g, ' ').trim();
          return `${statement}|${author}`;
        })
        .filter(line => line.length > 1)
        .join('\n');
      await NativeModules.WallpaperServiceManager.syncQuotes(blob);
      logEntry('INFO', 'Scheduler', 'syncQuotes', `Quotes synced: ${pool.length} entries`);
    } catch (err) {
      console.warn('Failed to sync quotes:', err);
    }
  }
}

/**
 * Sync the full config (sources, filters, quotes, API keys) to the native
 * service. Call whenever settings change so the background service stays in
 * step with what the user configured.
 */
export async function syncConfigToNative(config?: MobiConfig): Promise<void> {
  const cfg = config || getConfig();
  await syncImageSourcesToNative(cfg);
  await syncFiltersToNative(cfg);
  await syncQuotesToNative(cfg);
}

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
      await NativeModules.WallpaperServiceManager.startService(config.changeMinutes, config.textChangeMinutes);
      // Sync the full config (sources, filters, quotes, API keys) to native service
      await syncConfigToNative(config);
      logEntry('INFO', 'Scheduler', 'init', `Native service started (pic=${config.changeMinutes}min, quote=${config.textChangeMinutes}min)`);
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
      const config = getConfig();
      await NativeModules.WallpaperServiceManager.stopService();
      await NativeModules.WallpaperServiceManager.startService(minutes, config.textChangeMinutes);
      // Sync the full config (sources, filters, quotes, API keys) to native service
      await syncConfigToNative(config);
      logEntry('INFO', 'Scheduler', 'restart', `Service restarted (pic=${minutes}min, quote=${config.textChangeMinutes}min)`);
    } catch (err) {
      console.warn('Failed to restart service:', err);
    }
  }

  stopForegroundTimers();
  startForegroundTimers();
}

/**
 * Sync image sources to the native service's SharedPreferences.
 * Call this whenever image source toggles change.
 */
export async function syncImageSourcesToNative(config?: MobiConfig): Promise<void> {
  if (Platform.OS === 'android' && NativeModules.WallpaperServiceManager) {
    try {
      const cfg = config || getConfig();
      const enabledSources = cfg.images
        .filter(img => img.use)
        .map(img => img.name)
        .join(',');
      await NativeModules.WallpaperServiceManager.syncImageSources(enabledSources);
      // Also sync API keys
      if (cfg.pexelsApiKey) {
        await NativeModules.WallpaperServiceManager.syncApiKey('pexels', cfg.pexelsApiKey);
      }
      logEntry('INFO', 'Scheduler', 'syncSources', `Sources synced: ${enabledSources}`);
    } catch (err) {
      console.warn('Failed to sync image sources:', err);
    }
  }
}
