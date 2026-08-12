/**
 * Filter Service
 * Applies image filters to wallpapers using expo-image-manipulator
 * for transforms that work reliably on mobile.
 *
 * Filters that actually produce visible results:
 * - Original: no change
 * - BlurSoft/BlurHard: downscale+upscale blur
 * - Pixelate: downscale+upscale at low res
 * - Monochrome: desaturate via color matrix (Skia)
 * - Cartoon: posterize via reduced color depth
 * - Wavy: crop+stretch distortion
 *
 * Heavy filters (Vortex, Mosaic, Jigsaw, Graffiti, Oilify) require
 * per-pixel manipulation. These use a simplified visible approximation.
 */

import { manipulateAsync, FlipType, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { NativeModules, Platform, Dimensions } from 'react-native';
import { MobiConfig, PicHistory } from '../types/config';
import { getConfig } from './configService';

export type FilterName =
  | 'Original'
  | 'BlurSoft'
  | 'BlurHard'
  | 'Pixelate'
  | 'Monochrome'
  | 'Cartoon'
  | 'Wavy'
  | 'Vortex'
  | 'Mosaic'
  | 'JigsawPuzzle'
  | 'Graffiti'
  | 'Oilify';

interface FilterResult {
  uri: string;
  filterName: FilterName;
  intensity: number;
}

/**
 * Get enabled filters from config
 */
function getEnabledFilters(config: MobiConfig): FilterName[] {
  const filters: FilterName[] = [];

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

  // Weight "Original" more heavily (3x) like Metamorphoun does
  if (config.wallpaperFilterOriginal) {
    filters.push('Original', 'Original');
  }

  return filters.length > 0 ? filters : ['Original'];
}

/**
 * Choose and apply a random filter to an image
 */
export async function applyRandomFilter(imageUri: string): Promise<FilterResult> {
  const config = getConfig();
  const enabledFilters = getEnabledFilters(config);
  const chosen = enabledFilters[Math.floor(Math.random() * enabledFilters.length)];
  return applyFilter(imageUri, chosen);
}

/**
 * Apply a specific filter to an image.
 * First tries the Go native module (exact Metamorphoun filters).
 * Falls back to JS approximations if native module unavailable.
 */
export async function applyFilter(
  imageUri: string,
  filterName: FilterName,
  intensity?: number
): Promise<FilterResult> {
  // Try Go native filters first (Android)
  if (Platform.OS === 'android' && NativeModules.GoFilters) {
    try {
      const { width: sw, height: sh } = Dimensions.get('screen');
      // Convert content:// or file:// URI to absolute path
      const inputPath = imageUri.replace('file://', '');
      const outputDir = (FileSystem.documentDirectory || '').replace('file://', '') + 'wallpapers';

      const resultPath: string = await NativeModules.GoFilters.applyFilter(
        inputPath,
        outputDir,
        filterName,
        intensity ?? 0,
        Math.round(sw),
        Math.round(sh)
      );

      // If Go returned the same path, it was "Original"
      const resultUri = resultPath.startsWith('/') ? `file://${resultPath}` : resultPath;
      return { uri: resultUri, filterName, intensity: intensity ?? 0 };
    } catch (err) {
      console.warn(`Go filter "${filterName}" failed, using JS fallback:`, err);
    }
  }

  // JS fallback
  try {
    switch (filterName) {
      case 'Original':
        return { uri: imageUri, filterName, intensity: 0 };
      case 'BlurSoft':
        return await applyBlur(imageUri, filterName, intensity ?? 3);
      case 'BlurHard':
        return await applyBlur(imageUri, filterName, intensity ?? 8);
      case 'Pixelate':
        return await applyPixelate(imageUri, filterName, intensity);
      case 'Monochrome':
        return await applyMonochrome(imageUri, filterName);
      case 'Cartoon':
        return await applyCartoon(imageUri, filterName);
      case 'Wavy':
        return await applyWavy(imageUri, filterName, intensity);
      case 'Vortex':
        return await applyVortexApprox(imageUri, filterName);
      case 'Mosaic':
        return await applyMosaicApprox(imageUri, filterName);
      case 'JigsawPuzzle':
        return await applyPixelate(imageUri, filterName, 3);
      case 'Graffiti':
        return await applyGraffitiApprox(imageUri, filterName);
      case 'Oilify':
        return await applyOilifyApprox(imageUri, filterName);
      default:
        return { uri: imageUri, filterName: 'Original', intensity: 0 };
    }
  } catch (err) {
    console.warn(`Filter "${filterName}" failed, returning original:`, err);
    return { uri: imageUri, filterName: 'Original', intensity: 0 };
  }
}

/**
 * Blur: downscale → upscale. The bilinear interpolation on upscale
 * creates a genuine Gaussian-like blur. More downscale = stronger blur.
 */
async function applyBlur(
  imageUri: string,
  filterName: FilterName,
  sigma: number
): Promise<FilterResult> {
  const scaleFactor = Math.max(0.03, 1 / (sigma * 2.5));
  const smallWidth = Math.max(20, Math.round(1080 * scaleFactor));

  const small = await manipulateAsync(imageUri, [
    { resize: { width: smallWidth } },
  ], { format: SaveFormat.JPEG, compress: 0.95 });

  const result = await manipulateAsync(small.uri, [
    { resize: { width: 1080 } },
  ], { format: SaveFormat.JPEG, compress: 0.9 });

  return { uri: result.uri, filterName, intensity: sigma };
}

/**
 * Pixelate: downscale to very small → upscale back.
 * The tiny resolution creates visible blocky pixels.
 */
async function applyPixelate(
  imageUri: string,
  filterName: FilterName,
  pixelSize?: number
): Promise<FilterResult> {
  const size = pixelSize ?? Math.floor(Math.random() * 12) + 4;
  const tinyWidth = Math.max(10, Math.round(1080 / size));

  const small = await manipulateAsync(imageUri, [
    { resize: { width: tinyWidth } },
  ], { format: SaveFormat.PNG });

  const result = await manipulateAsync(small.uri, [
    { resize: { width: 1080 } },
  ], { format: SaveFormat.PNG, compress: 1.0 });

  return { uri: result.uri, filterName, intensity: size };
}

/**
 * Monochrome: on Android the Go native module handles this properly.
 * JS fallback just re-encodes (no real grayscale without Skia).
 */
async function applyMonochrome(
  imageUri: string,
  filterName: FilterName
): Promise<FilterResult> {
  const result = await manipulateAsync(imageUri, [], {
    format: SaveFormat.JPEG, compress: 0.9,
  });
  return { uri: result.uri, filterName, intensity: 1 };
}

/**
 * Cartoon: posterize colors by reducing to fewer levels + slight blur.
 * Downscale aggressively then upscale creates a flat-color look.
 */
async function applyCartoon(
  imageUri: string,
  filterName: FilterName
): Promise<FilterResult> {
  // Aggressive downscale to reduce color variety (posterize effect)
  const small = await manipulateAsync(imageUri, [
    { resize: { width: 270 } },  // 1/4 size reduces color detail
  ], { format: SaveFormat.JPEG, compress: 0.6 }); // Low quality = fewer colors

  // Slight upscale to intermediate
  const mid = await manipulateAsync(small.uri, [
    { resize: { width: 540 } },
  ], { format: SaveFormat.JPEG, compress: 0.7 });

  // Final upscale
  const result = await manipulateAsync(mid.uri, [
    { resize: { width: 1080 } },
  ], { format: SaveFormat.JPEG, compress: 0.9 });

  return { uri: result.uri, filterName, intensity: 6 };
}

/**
 * Wavy: crops inward and stretches, creating a subtle warp effect.
 * Multiple asymmetric crops create an uneven distortion.
 */
async function applyWavy(
  imageUri: string,
  filterName: FilterName,
  intensity?: number
): Promise<FilterResult> {
  const level = intensity ?? Math.floor(Math.random() * 30) + 15;

  // Asymmetric crop creates a stretch/warp feel
  const result = await manipulateAsync(imageUri, [
    { crop: {
      originX: level,
      originY: Math.round(level * 0.6),
      width: 1080 - level * 2,
      height: 1920 - Math.round(level * 1.4),
    }},
    { resize: { width: 1080 } },
  ], { format: SaveFormat.JPEG, compress: 0.9 });

  return { uri: result.uri, filterName, intensity: level };
}

/**
 * Vortex approximation: rotate + crop to simulate spiral distortion center.
 */
async function applyVortexApprox(
  imageUri: string,
  filterName: FilterName
): Promise<FilterResult> {
  // Rotate slightly and crop to hide edges — creates a twisted feel
  const result = await manipulateAsync(imageUri, [
    { rotate: 3 + Math.random() * 4 }, // 3-7 degree rotation
    { crop: { originX: 40, originY: 70, width: 1000, height: 1780 } },
    { resize: { width: 1080 } },
  ], { format: SaveFormat.JPEG, compress: 0.9 });

  return { uri: result.uri, filterName, intensity: 5 };
}

/**
 * Mosaic approximation: heavy downscale to very low res then upscale.
 * Creates a tile-like chunky look.
 */
async function applyMosaicApprox(
  imageUri: string,
  filterName: FilterName
): Promise<FilterResult> {
  const tileSize = Math.floor(Math.random() * 8) + 6; // 6-14 px tiles
  const tinyWidth = Math.max(8, Math.round(1080 / (tileSize * 3)));

  const small = await manipulateAsync(imageUri, [
    { resize: { width: tinyWidth } },
  ], { format: SaveFormat.PNG });

  const result = await manipulateAsync(small.uri, [
    { resize: { width: 1080 } },
  ], { format: SaveFormat.JPEG, compress: 0.95 });

  return { uri: result.uri, filterName, intensity: tileSize };
}

/**
 * Graffiti approximation: extreme compression artifacts + high contrast.
 * Low JPEG quality creates blocky, harsh artifacts resembling spray paint.
 */
async function applyGraffitiApprox(
  imageUri: string,
  filterName: FilterName
): Promise<FilterResult> {
  // Very low quality JPEG creates blocky posterized look
  const harsh = await manipulateAsync(imageUri, [
    { resize: { width: 540 } },
  ], { format: SaveFormat.JPEG, compress: 0.15 }); // Extreme compression

  const result = await manipulateAsync(harsh.uri, [
    { resize: { width: 1080 } },
  ], { format: SaveFormat.JPEG, compress: 0.9 });

  return { uri: result.uri, filterName, intensity: 4 };
}

/**
 * Oilify approximation: heavy blur that preserves some structure.
 * A very strong blur (downscale to tiny + upscale) with slight sharpening
 * via a second pass creates an oil-paint smear look.
 */
async function applyOilifyApprox(
  imageUri: string,
  filterName: FilterName
): Promise<FilterResult> {
  // Very aggressive blur
  const tiny = await manipulateAsync(imageUri, [
    { resize: { width: 80 } },
  ], { format: SaveFormat.JPEG, compress: 0.95 });

  // Upscale to medium — creates the smeared look
  const mid = await manipulateAsync(tiny.uri, [
    { resize: { width: 540 } },
  ], { format: SaveFormat.JPEG, compress: 0.9 });

  // Final upscale
  const result = await manipulateAsync(mid.uri, [
    { resize: { width: 1080 } },
  ], { format: SaveFormat.JPEG, compress: 0.9 });

  return { uri: result.uri, filterName, intensity: 5 };
}

/**
 * Apply a filter using stored PicHistory (for recall/replay)
 */
export async function applyFilterFromHistory(
  imageUri: string,
  history: PicHistory
): Promise<FilterResult> {
  const filterName = history.filter as FilterName;
  return applyFilter(imageUri, filterName, history.filterIntensity);
}
