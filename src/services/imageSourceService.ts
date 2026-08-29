/**
 * Image Source Service
 * Fetches wallpaper images from various sources (Bing, NASA, PicSum, Pexels, local folders).
 * Mirrors Metamorphoun's serviceBing.go, serviceNASA.go, servicePicSum.go, etc.
 */

import * as FileSystem from 'expo-file-system';
import { ImageSource } from '../types/config';
import { getConfig } from './configService';

const WALLPAPER_DIR = `${FileSystem.documentDirectory}wallpapers/`;

export interface FetchedImage {
  uri: string;
  source: ImageSource;
  originalUrl: string;
}

/**
 * Ensure the wallpapers directory exists
 */
export async function ensureWallpaperDir(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(WALLPAPER_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(WALLPAPER_DIR, { intermediates: true });
  }
}

/**
 * Select a random enabled image source and fetch an image from it
 */
export async function fetchRandomImage(): Promise<FetchedImage> {
  const config = getConfig();
  const enabledSources = config.images.filter(img => img.use);

  if (enabledSources.length === 0) {
    throw new Error('No image sources are enabled');
  }

  // Shuffle sources so we try different ones on failure
  const shuffled = [...enabledSources].sort(() => Math.random() - 0.5);

  for (const source of shuffled) {
    try {
      switch (source.name) {
        case 'Bing':
          return await fetchBingImage(source);
        case 'NASA':
          return await fetchNASAImage(source);
        case 'PicSum':
          return await fetchPicSumImage(source);
        case 'CameraRoll':
          return await fetchCameraRollImage(source);
        case 'Favorites':
          return await fetchLocalImage(source);
        default:
          if (source.operation === 'WebPicPage') {
            return await fetchPicSumImage(source);
          }
          if (source.operation === 'LocalFolder') {
            return await fetchLocalImage(source);
          }
          return await fetchPicSumImage(source);
      }
    } catch (err) {
      console.warn(`Source "${source.name}" failed:`, err);
      // For Camera Roll, log more detail since this is the most common user source
      if (source.name === 'CameraRoll') {
        console.error('CAMERA ROLL DETAILED ERROR:', JSON.stringify(err));
      }
      // Try next source
      continue;
    }
  }

  // All sources failed — do NOT fall back to a different source
  throw new Error('All enabled image sources failed. Enable other sources or retry later.');
}

/**
 * Bing Photo of the Day
 */
async function fetchBingImage(source: ImageSource): Promise<FetchedImage> {
  try {
    // Bing's API endpoint for the daily image
    const response = await fetch(
      'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=en-US'
    );
    const data = await response.json();

    if (data.images && data.images.length > 0) {
      const randomIdx = Math.floor(Math.random() * data.images.length);
      const imageUrl = `https://www.bing.com${data.images[randomIdx].url}`;

      const localUri = await downloadImage(imageUrl, `bing_${Date.now()}.jpg`);
      return { uri: localUri, source, originalUrl: imageUrl };
    }
  } catch (err) {
    console.warn('Bing fetch failed:', err);
  }

  throw new Error('Bing image source is unavailable');
}

/**
 * NASA Astronomy Picture of the Day (random date)
 */
async function fetchNASAImage(source: ImageSource): Promise<FetchedImage> {
  try {
    // Generate a random date between 1995-06-16 (APOD start) and today
    const start = new Date(1995, 5, 16).getTime();
    const end = Date.now();
    const randomDate = new Date(start + Math.random() * (end - start));
    const dateStr = randomDate.toISOString().split('T')[0];

    const response = await fetch(
      `https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&date=${dateStr}`
    );
    const data = await response.json();

    if (data.media_type === 'image' && data.hdurl) {
      const localUri = await downloadImage(data.hdurl, `nasa_${Date.now()}.jpg`);
      return { uri: localUri, source, originalUrl: data.hdurl };
    }
  } catch (err) {
    console.warn('NASA fetch failed, falling back to PicSum:', err);
  }

  return fetchPicSumImage(source);
}

/**
 * Lorem Picsum - Random high-quality photos
 */
async function fetchPicSumImage(source: ImageSource): Promise<FetchedImage> {
  // PicSum provides random images at specified dimensions
  const width = 1080;
  const height = 1920;
  const imageUrl = `https://picsum.photos/${width}/${height}?random=${Date.now()}`;

  const localUri = await downloadImage(imageUrl, `picsum_${Date.now()}.jpg`);
  return { uri: localUri, source, originalUrl: imageUrl };
}

/**
 * Camera Roll / Photo Library — the mobile equivalent of ~/Pictures
 * Android: DCIM + Pictures folders
 * iOS: Photos library
 * Uses expo-media-library to pick a random photo from the device
 */
async function fetchCameraRollImage(source: ImageSource): Promise<FetchedImage> {
  const MediaLibrary = require('expo-media-library');

  // Request permission explicitly
  const permResult = await MediaLibrary.requestPermissionsAsync();
  console.log('Camera Roll permission status:', permResult.status);
  if (permResult.status !== 'granted') {
    throw new Error(`Photo library permission: ${permResult.status}`);
  }

  // Get photos
  const { assets, totalCount } = await MediaLibrary.getAssetsAsync({
    mediaType: MediaLibrary.MediaType.photo,
    first: 100,
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
  });

  console.log(`Camera Roll: found ${totalCount} total, fetched ${assets.length} assets`);

  if (!assets || assets.length === 0) {
    throw new Error(`No photos found (totalCount: ${totalCount})`);
  }

  // Pick a random photo
  const randomIndex = Math.floor(Math.random() * assets.length);
  const asset = assets[randomIndex];
  console.log(`Camera Roll: picked asset ${asset.id}, uri: ${asset.uri}, filename: ${asset.filename}`);

  // Try to get the local file URI
  let localUri: string | null = null;

  try {
    const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
    localUri = assetInfo.localUri || assetInfo.uri || null;
    console.log('Camera Roll assetInfo localUri:', localUri);
  } catch (infoErr) {
    console.warn('getAssetInfoAsync failed, using asset.uri:', infoErr);
    localUri = asset.uri;
  }

  if (!localUri) {
    // Fallback: use the asset URI directly (content:// on Android)
    localUri = asset.uri;
  }

  if (!localUri) {
    throw new Error('Could not resolve any URI for the photo');
  }

  // Copy to our wallpaper directory
  await ensureWallpaperDir();
  const ext = (asset.filename || 'photo.jpg').split('.').pop() || 'jpg';
  const destUri = `${WALLPAPER_DIR}cameraroll_${Date.now()}.${ext}`;

  try {
    await FileSystem.copyAsync({ from: localUri, to: destUri });
  } catch (copyErr) {
    // If localUri copy fails, try with the raw asset.uri
    console.warn('Copy from localUri failed, trying asset.uri:', copyErr);
    await FileSystem.copyAsync({ from: asset.uri, to: destUri });
  }

  console.log('Camera Roll: successfully copied to', destUri);
  return { uri: destUri, source, originalUrl: localUri };
}

/**
 * Fetch image from local favorites folder
 */
async function fetchLocalImage(source: ImageSource): Promise<FetchedImage> {
  const favDir = `${FileSystem.documentDirectory}favorites/`;
  const dirInfo = await FileSystem.getInfoAsync(favDir);

  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(favDir, { intermediates: true });
    throw new Error('Favorites folder is empty');
  }

  const files = await FileSystem.readDirectoryAsync(favDir);
  const imageFiles = files.filter(f =>
    /\.(jpg|jpeg|png|webp|gif)$/i.test(f)
  );

  if (imageFiles.length === 0) {
    throw new Error('No images in favorites folder');
  }

  const randomFile = imageFiles[Math.floor(Math.random() * imageFiles.length)];
  const uri = `${favDir}${randomFile}`;

  return { uri, source, originalUrl: uri };
}

/**
 * Download an image from a URL to local storage
 */
async function downloadImage(url: string, filename: string): Promise<string> {
  await ensureWallpaperDir();
  const localUri = `${WALLPAPER_DIR}${filename}`;

  const downloadResult = await FileSystem.downloadAsync(url, localUri);

  if (downloadResult.status !== 200) {
    throw new Error(`Failed to download image: HTTP ${downloadResult.status}`);
  }

  return downloadResult.uri;
}

/**
 * Clean up old wallpaper files — keep only named originals and current filtered
 * We use fixed filenames: originalPic0-4.png for history, filteredPic.png for current
 */
export async function cleanupOldWallpapers(): Promise<void> {
  try {
    await ensureWallpaperDir();
    const files = await FileSystem.readDirectoryAsync(WALLPAPER_DIR);

    // Keep: originalPic0-7, filteredPic, and any cameraroll_ files that are recent
    const keepPatterns = /^(originalPic\d|filteredPic)\./;
    const imageFiles = files.filter(f =>
      /\.(jpg|jpeg|png|webp)$/i.test(f) && !keepPatterns.test(f)
    );

    // Remove unnamed temp files older than 20
    if (imageFiles.length > 10) {
      const sorted = imageFiles.sort();
      const toRemove = sorted.slice(0, sorted.length - 10);
      for (const file of toRemove) {
        await FileSystem.deleteAsync(`${WALLPAPER_DIR}${file}`, { idempotent: true });
      }
    }
  } catch (err) {
    console.warn('Cleanup failed:', err);
  }
}

/**
 * Save the original (unfiltered) image to a numbered history slot.
 * Returns the stable local path.
 */
export async function saveOriginalToHistory(sourceUri: string, historyIndex: number): Promise<string> {
  await ensureWallpaperDir();
  const destPath = `${WALLPAPER_DIR}originalPic${historyIndex}.png`;

  // Remove old file at this slot
  try {
    await FileSystem.deleteAsync(destPath, { idempotent: true });
  } catch { /* fine */ }

  // Copy source to the stable slot
  await FileSystem.copyAsync({ from: sourceUri, to: destPath });
  return destPath;
}
