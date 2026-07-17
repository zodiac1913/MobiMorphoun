/**
 * Wallpaper Service
 * The main orchestrator that ties image sources, filters, quotes, and
 * the native wallpaper-setting API together.
 * Mirrors Metamorphoun's serviceBackgroundRandom.go pipeline.
 */

import * as FileSystem from 'expo-file-system';
import { Platform, NativeModules, Dimensions } from 'react-native';
import { MobiConfig, PicHistory, WallpaperTarget } from '../types/config';
import { getConfig, saveConfig, updateConfigField } from './configService';
import { fetchRandomImage, cleanupOldWallpapers, FetchedImage, saveOriginalToHistory } from './imageSourceService';
import { applyRandomFilter, applyFilterFromHistory, FilterName } from './filterService';
import { getRandomQuote, updateCurrentQuote, Quote } from './quoteService';
import { logEntry, LogLevel } from './logService';

const MAX_ATTEMPTS = 4;

export interface WallpaperResult {
  success: boolean;
  picHistory?: PicHistory;
  error?: string;
}

/**
 * Main wallpaper generation pipeline (mirrors BackgroundGenerate in Go)
 * 1. Select random image source
 * 2. Fetch image
 * 3. Apply random filter
 * 4. Optionally add quote overlay
 * 5. Set as wallpaper
 * 6. Save to history
 */
export async function generateNewWallpaper(caller: string = 'Manual'): Promise<WallpaperResult> {
  const config = getConfig();

  if (config.backgroundChangeAttempt > MAX_ATTEMPTS) {
    config.backgroundChangeAttempt = 0;
    await saveConfig(config);
    return { success: false, error: 'Too many failed attempts' };
  }

  try {
    logEntry('INFO', 'WallpaperService', 'generateNewWallpaper', `Called from: ${caller}`);

    // Step 1 & 2: Fetch a random image
    let fetchedImage: FetchedImage;
    try {
      fetchedImage = await fetchRandomImage();
    } catch (err) {
      // If the chosen source failed, try any web-based source as fallback
      try {
        const config2 = getConfig();
        const webSources = config2.images.filter(
          img => img.use && img.operation !== 'LocalFolder'
        );
        if (webSources.length > 0) {
          fetchedImage = await fetchRandomImage();
        } else {
          throw err;
        }
      } catch (fallbackErr) {
        config.backgroundChangeAttempt++;
        await saveConfig(config);
        logEntry('ERROR', 'WallpaperService', 'generateNewWallpaper', `Fetch failed: ${err}`);
        return { success: false, error: `Failed to fetch image: ${err}` };
      }
    }

    // Step 3: Apply a random filter
    const filterResult = await applyRandomFilter(fetchedImage.uri);

    // Step 3b: Save original (unfiltered) to history slot 0
    // Shift existing history down first (done after building picHistory below)
    let originalLocalPath = fetchedImage.uri;
    try {
      originalLocalPath = await saveOriginalToHistory(fetchedImage.uri, 0);
    } catch (err) {
      console.warn('Failed to save original to history slot:', err);
    }

    // Step 4: Get a quote if text overlay is enabled
    let quote: Quote | null = null;
    if (config.showTextOverlay) {
      quote = await updateCurrentQuote();
    }

    // Step 5: Render quote onto image via Go native module
    let finalUri = filterResult.uri;
    if (quote && config.showTextOverlay && Platform.OS === 'android' && NativeModules.GoFilters) {
      try {
        const inputPath = finalUri.replace('file://', '');
        const outputDir = (FileSystem.documentDirectory || '').replace('file://', '') + 'wallpapers';
        // Use bundled font — Roboto on Android system
        const fontPath = '/system/fonts/Roboto-Regular.ttf';

        const { width: screenW } = Dimensions.get('screen');

        const quotedPath: string = await NativeModules.GoFilters.renderQuote(
          inputPath,
          outputDir,
          fontPath,
          quote.statement,
          quote.author || '',
          config.textBoxLocation,
          0, // auto-fit font size
          config.quoteFontSizeMax || 28,
          config.quoteAppearanceRandom ? randomHexColor() : config.quoteTextColor,
          config.quoteAppearanceRandom ? randomDarkHexColor() : config.quoteBackgroundColor,
          parseInt(config.quoteBackgroundOpacity, 10) || 180,
          config.quoteMaxChars || 200,
          Math.round(screenW),
        );
        finalUri = quotedPath.startsWith('/') ? `file://${quotedPath}` : quotedPath;
        logEntry('INFO', 'WallpaperService', 'generateNewWallpaper', 'Quote rendered on image');
      } catch (err) {
        // Quote render failed — still set wallpaper without quote
        logEntry('WARN', 'WallpaperService', 'generateNewWallpaper', `Quote render failed: ${err}`);
      }
    }

    // Step 6: Set wallpaper — same pic+quote on all screens
    await setWallpaper(finalUri, config.wallpaperTarget);

    // Step 7: Build PicHistory and save
    const picHistory: PicHistory = {
      picNum: 0,
      originName: fetchedImage.originalUrl,
      saveName: finalUri,
      originalLocalUri: originalLocalPath,
      imageItem: fetchedImage.source,
      filter: filterResult.filterName,
      filterVortices: [],
      filterIntensity: filterResult.intensity,
      filterX: 0,
      filterY: 0,
      sizing: config.wallpaperImageSizing,
      quoteStatement: quote?.statement ?? '',
      quoteAuthor: quote?.author ?? '',
      quoteFont: config.textFontFile,
      quoteFontSize: config.quoteFontSizeMin,
      quoteTextColorR: 255,
      quoteTextColorG: 255,
      quoteTextColorB: 255,
      quoteBackgroundColorR: 0,
      quoteBackgroundColorG: 0,
      quoteBackgroundColorB: 0,
      quoteBackgroundOpacity: parseInt(config.quoteBackgroundOpacity, 10),
      quoteBoxX: 0,
      quoteBoxY: 0,
    };

    // Update history (keep last 5, like Metamorphoun)
    config.picHistories = [picHistory, ...config.picHistories.slice(0, 4)];
    config.backgroundChangeAttempt = 0;
    config.picUpdateCalled = false;
    await saveConfig(config);

    // Cleanup old files
    await cleanupOldWallpapers();

    logEntry('INFO', 'WallpaperService', 'generateNewWallpaper', 'Success');
    return { success: true, picHistory };
  } catch (err) {
    config.backgroundChangeAttempt++;
    await saveConfig(config);
    logEntry('ERROR', 'WallpaperService', 'generateNewWallpaper', `Unexpected error: ${err}`);
    return { success: false, error: String(err) };
  }
}

/**
 * Recall a previous wallpaper from history (mirrors RecallBackground)
 */
export async function recallWallpaper(historyIndex: number): Promise<WallpaperResult> {
  const config = getConfig();

  if (historyIndex >= config.picHistories.length) {
    return { success: false, error: 'History index out of range' };
  }

  const picHistory = config.picHistories[historyIndex];

  try {
    // Check if the saved file still exists
    const fileInfo = await FileSystem.getInfoAsync(picHistory.saveName);
    if (!fileInfo.exists) {
      return { success: false, error: 'Wallpaper file no longer exists' };
    }

    await setWallpaper(picHistory.saveName, config.wallpaperTarget);
    return { success: true, picHistory };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Save current wallpaper as favorite
 */
export async function saveAsFavorite(withQuote: boolean = true): Promise<boolean> {
  const config = getConfig();
  if (config.picHistories.length === 0) {
    return false;
  }

  try {
    const current = config.picHistories[0];
    const favDir = `${FileSystem.documentDirectory}favorites/pictures/`;
    const dirInfo = await FileSystem.getInfoAsync(favDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(favDir, { intermediates: true });
    }

    const ext = current.saveName.split('.').pop() || 'jpg';
    const filename = `fav_${Date.now()}.${ext}`;
    await FileSystem.copyAsync({
      from: current.saveName,
      to: `${favDir}${filename}`,
    });

    logEntry('INFO', 'WallpaperService', 'saveAsFavorite', `Saved: ${filename}`);
    return true;
  } catch (err) {
    logEntry('ERROR', 'WallpaperService', 'saveAsFavorite', String(err));
    return false;
  }
}

/**
 * Set wallpaper using native APIs
 * Android: uses react-native-manage-wallpaper or native module
 * iOS: iOS doesn't allow programmatic wallpaper setting — we save to camera roll
 *      and show instructions
 */
async function setWallpaper(uri: string, target: WallpaperTarget): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      // react-native-manage-wallpaper expects (params, type, callback)
      const ManageWallpaper = NativeModules.ManageWallpaper;
      if (ManageWallpaper) {
        const typeMap: Record<WallpaperTarget, string> = {
          home: 'home',
          lock: 'lock',
          both: 'both',
        };
        await new Promise<void>((resolve, reject) => {
          ManageWallpaper.setWallpaper(
            { uri },
            typeMap[target] ?? 'both',
            (result: { status: string; msg: string; url: string }) => {
              if (result.status === 'success') {
                resolve();
              } else {
                reject(new Error(result.msg || 'Failed to set wallpaper'));
              }
            }
          );
        });
      } else {
        console.warn('ManageWallpaper native module not available');
      }
    } catch (err) {
      console.error('Failed to set wallpaper:', err);
      // Don't throw — wallpaper setting failure shouldn't crash the app
    }
  } else {
    // iOS: Save to Photos library — user sets manually
    try {
      const MediaLibrary = require('expo-media-library');
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        await MediaLibrary.createAssetAsync(uri);
        logEntry('INFO', 'WallpaperService', 'setWallpaper',
          'Saved to Photos. Set as wallpaper from Photos app.');
      }
    } catch (err) {
      console.warn('Failed to save to Photos:', err);
    }
  }
}

/**
 * Get current wallpaper info
 */
export function getCurrentWallpaperInfo(): PicHistory | null {
  const config = getConfig();
  return config.picHistories.length > 0 ? config.picHistories[0] : null;
}

function randomHexColor(): string {
  const r = Math.floor(Math.random() * 200) + 55;
  const g = Math.floor(Math.random() * 200) + 55;
  const b = Math.floor(Math.random() * 200) + 55;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function randomDarkHexColor(): string {
  const r = Math.floor(Math.random() * 60);
  const g = Math.floor(Math.random() * 60);
  const b = Math.floor(Math.random() * 60);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
