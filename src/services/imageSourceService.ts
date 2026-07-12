/**
 * Image Source Service
 * Fetches wallpaper images from various sources (Bing, NASA, PicSum, Unsplash, local folders).
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
        case 'Unsplash':
          return await fetchUnsplashImage(source);
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
      // Try next source
      continue;
    }
  }

  // All sources failed — last resort PicSum
  return fetchPicSumImage(enabledSources[0]);
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
    console.warn('Bing fetch failed, falling back to PicSum:', err);
  }

  // Fallback
  return fetchPicSumImage(source);
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
 * Unsplash random photo
 */
async function fetchUnsplashImage(source: ImageSource): Promise<FetchedImage> {
  try {
    const imageUrl = 'https://source.unsplash.com/random/1080x1920';
    const localUri = await downloadImage(imageUrl, `unsplash_${Date.now()}.jpg`);
    return { uri: localUri, source, originalUrl: imageUrl };
  } catch (err) {
    console.warn('Unsplash fetch failed:', err);
    return fetchPicSumImage(source);
  }
}

/**
 * Camera Roll / Photo Library — the mobile equivalent of ~/Pictures
 * Android: DCIM + Pictures folders
 * iOS: Photos library
 * Uses expo-media-library to pick a random photo from the device
 */
async function fetchCameraRollImage(source: ImageSource): Promise<FetchedImage> {
  try {
    const MediaLibrary = require('expo-media-library');

    // Request permission
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Photo library permission not granted');
    }

    // Get total count of photos
    const { totalCount } = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.photo,
      first: 0,
    });

    if (totalCount === 0) {
      throw new Error('No photos in camera roll');
    }

    // Pick a random offset and grab one photo
    const randomOffset = Math.floor(Math.random() * totalCount);
    const { assets } = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.photo,
      first: 1,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      ...(randomOffset > 0 ? { after: String(randomOffset) } : {}),
    });

    if (assets.length === 0) {
      throw new Error('Could not retrieve photo from library');
    }

    const asset = assets[0];

    // Get the local URI for the asset
    const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
    const localUri = assetInfo.localUri || asset.uri;

    // Copy to our wallpaper directory so we have a stable reference
    await ensureWallpaperDir();
    const ext = localUri.split('.').pop() || 'jpg';
    const destUri = `${WALLPAPER_DIR}cameraroll_${Date.now()}.${ext}`;
    await FileSystem.copyAsync({ from: localUri, to: destUri });

    return { uri: destUri, source, originalUrl: localUri };
  } catch (err) {
    console.warn('Camera Roll fetch failed:', err);
    throw err;
  }
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
 * Clean up old wallpaper files (keep last 5)
 */
export async function cleanupOldWallpapers(): Promise<void> {
  try {
    await ensureWallpaperDir();
    const files = await FileSystem.readDirectoryAsync(WALLPAPER_DIR);
    const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));

    if (imageFiles.length > 10) {
      // Sort by name (contains timestamp) and remove oldest
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
