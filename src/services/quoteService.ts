/**
 * Quote Service
 * Manages quote libraries, random quote selection, and text overlay generation.
 * Mirrors Metamorphoun's serviceUpdateQuote.go and quote functionality.
 */

import * as FileSystem from 'expo-file-system';
import { MobiConfig, PicHistory, TextBoxLocation } from '../types/config';
import { getConfig, updateConfigField, saveConfig } from './configService';
import { BUNDLED_LIBRARIES } from '../data/bundledQuotes';

export interface Quote {
  statement: string;
  author: string;
}

const QUOTES_DIR = `${FileSystem.documentDirectory}quotes/`;
const FAVORITES_QUOTES_DIR = `${FileSystem.documentDirectory}favorites/quotes/`;

/**
 * Get a random quote from all enabled libraries, respecting max char limit.
 * Only picks quotes whose FULL statement fits within maxChars — never truncates.
 */
export async function getRandomQuote(): Promise<Quote> {
  const config = getConfig();
  const enabledLibraries = config.textLibraries.filter(lib => lib.use);
  const maxChars = config.quoteMaxChars || 200;

  if (enabledLibraries.length === 0) {
    return { statement: 'Enable a quote library in settings.', author: 'MobiMorphoun' };
  }

  // Collect all quotes from all enabled libraries that fit the char limit
  let allFitting: Quote[] = [];
  for (const library of enabledLibraries) {
    const quotes = await loadQuoteLibrary(library.name, library.location);
    const fitting = quotes.filter(q => q.statement.length <= maxChars);
    allFitting = allFitting.concat(fitting);
  }

  if (allFitting.length === 0) {
    return { statement: 'No quotes fit the character limit. Try increasing it.', author: 'MobiMorphoun' };
  }

  // Pick a random one
  return allFitting[Math.floor(Math.random() * allFitting.length)];
}

/**
 * Build the full pool of quotes from all enabled libraries, respecting the
 * max-char limit. Used to sync the quote pool to the native background service
 * so it renders quotes from the user's chosen libraries.
 */
export async function getEnabledQuotePool(): Promise<Quote[]> {
  const config = getConfig();
  const enabledLibraries = config.textLibraries.filter(lib => lib.use);
  const maxChars = config.quoteMaxChars || 200;

  let all: Quote[] = [];
  for (const library of enabledLibraries) {
    const quotes = await loadQuoteLibrary(library.name, library.location);
    all = all.concat(quotes.filter(q => q.statement.length <= maxChars));
  }
  return all;
}

/**
 * Load a quote library by name/location
 */
async function loadQuoteLibrary(name: string, location: string): Promise<Quote[]> {
  // Check bundled libraries (normalize key: lowercase, no spaces)
  const key = name.toLowerCase().replace(/[\s_-]/g, '');
  if (BUNDLED_LIBRARIES[key]) {
    return BUNDLED_LIBRARIES[key];
  }

  // Also try matching by partial key
  const matchKey = Object.keys(BUNDLED_LIBRARIES).find(k =>
    k.includes(key) || key.includes(k)
  );
  if (matchKey) {
    return BUNDLED_LIBRARIES[matchKey];
  }

  // Check for user-uploaded quote file
  try {
    const filePath = `${QUOTES_DIR}${name.toLowerCase()}.json`;
    const fileInfo = await FileSystem.getInfoAsync(filePath);

    if (fileInfo.exists) {
      const content = await FileSystem.readAsStringAsync(filePath);
      return JSON.parse(content) as Quote[];
    }
  } catch (err) {
    console.warn(`Failed to load quote library "${name}":`, err);
  }

  // Fallback to augustine
  return BUNDLED_LIBRARIES['augustine'] || [];
}

/**
 * Update the current quote in config
 */
export async function updateCurrentQuote(): Promise<Quote> {
  const config = getConfig();

  const quote = await getRandomQuote();
  config.currentQuoteStatement = quote.statement;
  config.currentQuoteAuthor = quote.author;
  await saveConfig(config);
  return quote;
}

/**
 * Save a quote as a favorite
 */
export async function saveFavoriteQuote(quote: Quote): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(FAVORITES_QUOTES_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(FAVORITES_QUOTES_DIR, { intermediates: true });
    }

    const filePath = `${FAVORITES_QUOTES_DIR}favorites.json`;
    let favorites: Quote[] = [];

    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (fileInfo.exists) {
      const content = await FileSystem.readAsStringAsync(filePath);
      favorites = JSON.parse(content) as Quote[];
    }

    // Avoid duplicates
    const alreadySaved = favorites.some(
      q => q.statement === quote.statement && q.author === quote.author
    );
    if (!alreadySaved) {
      favorites.push(quote);
      await FileSystem.writeAsStringAsync(filePath, JSON.stringify(favorites, null, 2));
    }
  } catch (err) {
    console.error('Failed to save favorite quote:', err);
  }
}

/**
 * Upload a custom quote library (JSON file)
 */
export async function uploadQuoteLibrary(
  name: string,
  content: string
): Promise<boolean> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(QUOTES_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(QUOTES_DIR, { intermediates: true });
    }

    // Validate JSON
    const quotes = JSON.parse(content) as Quote[];
    if (!Array.isArray(quotes) || quotes.length === 0) {
      throw new Error('Invalid quote file format');
    }

    // Validate structure
    for (const q of quotes.slice(0, 5)) {
      if (!q.statement || typeof q.statement !== 'string') {
        throw new Error('Each quote must have a "statement" field');
      }
    }

    const filePath = `${QUOTES_DIR}${name.toLowerCase()}.json`;
    await FileSystem.writeAsStringAsync(filePath, content);

    return true;
  } catch (err) {
    console.error('Failed to upload quote library:', err);
    return false;
  }
}

/**
 * Calculate text overlay positioning and styling
 * Mirrors Metamorphoun's CalculateBoxInfo + LocateBox
 */
export function calculateTextOverlay(
  screenWidth: number,
  screenHeight: number,
  quote: Quote,
  config: MobiConfig
): TextOverlayInfo {
  const fontSize = config.quoteFontSizeMin +
    Math.random() * (config.quoteFontSizeMax - config.quoteFontSizeMin);

  // Calculate box position based on config
  let x: number;
  let y: number;
  const boxWidth = screenWidth * 0.8;
  const boxHeight = screenHeight * 0.25;
  const padding = 20;

  const location = config.textBoxLocation === 'random'
    ? (['topLeft', 'topRight', 'bottomLeft', 'bottomRight', 'center'] as TextBoxLocation[])[
        Math.floor(Math.random() * 5)
      ]
    : config.textBoxLocation;

  switch (location) {
    case 'topLeft':
      x = padding;
      y = screenHeight * 0.1;
      break;
    case 'topRight':
      x = screenWidth - boxWidth - padding;
      y = screenHeight * 0.1;
      break;
    case 'bottomLeft':
      x = padding;
      y = screenHeight * 0.6;
      break;
    case 'bottomRight':
      x = screenWidth - boxWidth - padding;
      y = screenHeight * 0.6;
      break;
    case 'center':
    default:
      x = (screenWidth - boxWidth) / 2;
      y = (screenHeight - boxHeight) / 2;
      break;
  }

  // Parse colors
  const textColor = config.quoteAppearanceRandom
    ? randomColor()
    : config.quoteTextColor;
  const bgColor = config.quoteAppearanceRandom
    ? randomDarkColor()
    : config.quoteBackgroundColor;
  const bgOpacity = parseInt(config.quoteBackgroundOpacity, 10) / 255;

  return {
    x,
    y,
    width: boxWidth,
    height: boxHeight,
    fontSize,
    textColor,
    backgroundColor: bgColor,
    backgroundOpacity: bgOpacity,
    statement: quote.statement,
    author: quote.author,
    location,
  };
}

export interface TextOverlayInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  statement: string;
  author: string;
  location: TextBoxLocation;
}

function randomColor(): string {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function randomDarkColor(): string {
  const r = Math.floor(Math.random() * 80);
  const g = Math.floor(Math.random() * 80);
  const b = Math.floor(Math.random() * 80);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
