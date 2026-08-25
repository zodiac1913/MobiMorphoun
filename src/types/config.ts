/**
 * MobiMorphoun Configuration Types
 * Mirrors Metamorphoun's config structure adapted for mobile
 */

export interface ImageSource {
  use: boolean;
  name: string;
  title: string;
  location: string;
  operation: 'Webpage' | 'Folder' | 'WebPicPage' | 'LocalFolder';
  allowDistort: boolean;
  inherent: boolean;
}

export interface TextLibrary {
  use: boolean;
  name: string;
  title: string;
  location: string;
  citation: string;
  creators: string;
  info: string;
  inherent: boolean;
}

export interface Quote {
  statement: string;
  author: string;
}

export interface PicHistoryVortex {
  filterQuadrant: string;
  filterIntensity: number;
  filterX: number;
  filterY: number;
}

export interface PicHistory {
  picNum: number;
  originName: string;
  saveName: string;
  originalLocalUri: string;
  imageItem: ImageSource;
  filter: string;
  filterVortices: PicHistoryVortex[];
  filterIntensity: number;
  filterX: number;
  filterY: number;
  sizing: string;
  quoteStatement: string;
  quoteAuthor: string;
  quoteFont: string;
  quoteFontSize: number;
  quoteTextColorR: number;
  quoteTextColorG: number;
  quoteTextColorB: number;
  quoteBackgroundColorR: number;
  quoteBackgroundColorG: number;
  quoteBackgroundColorB: number;
  quoteBackgroundOpacity: number;
  quoteBoxX: number;
  quoteBoxY: number;
}

export type WallpaperTarget = 'home' | 'lock' | 'both';
export type ImageSizing = 'fill' | 'fit' | 'center' | 'stretch';
export type TextBoxLocation = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'center' | 'random';

export interface MobiConfig {
  version: string;
  // Scheduling
  changeMinutes: number;
  changeWallpaperOnStartup: boolean;
  wallpaperTarget: WallpaperTarget;

  // Image sources
  images: ImageSource[];
  wallpaperImageSizing: ImageSizing;

  // Filters
  wallpaperFilterOriginal: boolean;
  wallpaperFilterBlurSoft: boolean;
  wallpaperFilterBlurHard: boolean;
  wallpaperFilterPixelate: boolean;
  wallpaperFilterOilify: boolean;
  wallpaperFilterWavy: boolean;
  wallpaperFilterVortex: boolean;
  wallpaperFilterMosaic: boolean;
  wallpaperFilterJigsawPuzzle: boolean;
  wallpaperFilterGraffiti: boolean;
  wallpaperFilterCartoon: boolean;
  wallpaperFilterMonochrome: boolean;

  // Text overlay
  showTextOverlay: boolean;
  textChangeMinutes: number;
  textLibraries: TextLibrary[];
  textFontFile: string;
  textBoxLocation: TextBoxLocation;
  quoteAppearanceRandom: boolean;
  quoteFontRandom: boolean;
  quoteTextColor: string;
  quoteBackgroundColor: string;
  quoteBackgroundOpacity: string;
  quoteFontSizeMin: number;
  quoteFontSizeMax: number;
  quoteMaxChars: number;

  // State
  currentQuoteStatement: string;
  currentQuoteAuthor: string;
  picHistories: PicHistory[];
  picUpdateCalled: boolean;
  backgroundChangeAttempt: number;

  // MBC Mode
  mbcMode: boolean;
  mbcMonth: number;
  mbcValue: number;
}

export const DEFAULT_CONFIG: MobiConfig = {
  version: '1.0.0',
  changeMinutes: 30,
  changeWallpaperOnStartup: false,
  wallpaperTarget: 'both',

  images: [
    {
      use: true,
      name: 'Bing',
      title: 'Bing Photo of the Day',
      location: 'https://bing.gifposter.com',
      operation: 'Webpage',
      allowDistort: true,
      inherent: true,
    },
    {
      use: false,
      name: 'NASA',
      title: 'NASA Astronomy Picture of the Day',
      location: 'https://apod.nasa.gov/apod/astropix.html',
      operation: 'Webpage',
      allowDistort: true,
      inherent: true,
    },
    {
      use: true,
      name: 'PicSum',
      title: 'Lorem Picsum (Random Photos)',
      location: 'https://picsum.photos',
      operation: 'WebPicPage',
      allowDistort: true,
      inherent: true,
    },
    {
      use: false,
      name: 'Favorites',
      title: 'Favorites',
      location: 'favorites',
      operation: 'LocalFolder',
      allowDistort: true,
      inherent: true,
    },
    {
      use: true,
      name: 'CameraRoll',
      title: 'Camera Roll / Photos',
      location: 'device-photos',
      operation: 'LocalFolder',
      allowDistort: true,
      inherent: true,
    },
    {
      use: false,
      name: 'Unsplash',
      title: 'Unsplash (Random Photos)',
      location: 'https://unsplash.com',
      operation: 'WebPicPage',
      allowDistort: true,
      inherent: true,
    },
  ],
  wallpaperImageSizing: 'fill',

  wallpaperFilterOriginal: true,
  wallpaperFilterBlurSoft: true,
  wallpaperFilterBlurHard: false,
  wallpaperFilterPixelate: true,
  wallpaperFilterOilify: false,
  wallpaperFilterWavy: true,
  wallpaperFilterVortex: false,
  wallpaperFilterMosaic: false,
  wallpaperFilterJigsawPuzzle: false,
  wallpaperFilterGraffiti: false,
  wallpaperFilterCartoon: true,
  wallpaperFilterMonochrome: true,

  showTextOverlay: true,
  textChangeMinutes: 60,
  textLibraries: [
    { use: true, name: 'Augustine', title: 'Augustine', location: 'quotes/augustine.json', citation: '', creators: 'Augustine of Hippo', info: 'Church father quotes', inherent: true },
    { use: true, name: 'BibleKJV', title: 'Bible (KJV)', location: 'quotes/biblekjv.json', citation: '', creators: 'King James', info: 'Bible verses KJV', inherent: true },
    { use: false, name: 'CallOfDuty', title: 'Call of Duty', location: 'quotes/callOfDuty.json', citation: '', creators: 'Activision', info: 'Call of Duty game quotes', inherent: true },
    { use: true, name: 'CharlesSpurgeon', title: 'Charles Spurgeon', location: 'quotes/charlesSpurgeon.json', citation: '', creators: 'Charles Spurgeon', info: 'Spurgeon quotes', inherent: true },
    { use: true, name: 'CSLewis', title: 'C.S. Lewis', location: 'quotes/csLewis.json', citation: '', creators: 'C.S. Lewis', info: 'C.S. Lewis quotes', inherent: true },
    { use: true, name: 'Inspirations', title: 'Inspirations', location: 'quotes/inspirations.json', citation: '', creators: 'Various', info: 'Inspirational quotes', inherent: true },
    { use: false, name: 'JamesFT', title: 'James F.T.', location: 'quotes/JamesFTquotes.json', citation: '', creators: 'James F.T.', info: 'James F.T. quotes', inherent: true },
    { use: true, name: 'JohnCalvin', title: 'John Calvin', location: 'quotes/johnCalvin.json', citation: '', creators: 'John Calvin', info: 'Calvin quotes', inherent: true },
    { use: false, name: 'Macarthur', title: 'John MacArthur', location: 'quotes/macarthur.json', citation: '', creators: 'John MacArthur', info: 'MacArthur quotes', inherent: true },
    { use: false, name: 'MarkTwain', title: 'Mark Twain', location: 'quotes/markTwain.json', citation: '', creators: 'Mark Twain', info: 'Mark Twain quotes', inherent: true },
    { use: true, name: 'MartinLuther', title: 'Martin Luther', location: 'quotes/martinLuther.json', citation: '', creators: 'Martin Luther', info: 'Reformation quotes', inherent: true },
    { use: false, name: 'NasrulHazim', title: 'Nasrul Hazim', location: 'quotes/NasrulHazimQuotes.json', citation: '', creators: 'Nasrul Hazim', info: 'Nasrul Hazim quotes', inherent: true },
    { use: false, name: 'Patton', title: 'General Patton', location: 'quotes/patton.json', citation: '', creators: 'George S. Patton', info: 'Military quotes', inherent: true },
    { use: true, name: 'RichardBaxter', title: 'Richard Baxter', location: 'quotes/richardBaxter.json', citation: '', creators: 'Richard Baxter', info: 'Puritan quotes', inherent: true },
    { use: false, name: 'Talmud', title: 'Talmud', location: 'quotes/21TalmudQuotes.json', citation: '', creators: 'Talmudic sages', info: 'Talmud wisdom', inherent: true },
    { use: false, name: 'WillRogers', title: 'Will Rogers', location: 'quotes/willRogers.json', citation: '', creators: 'Will Rogers', info: 'Will Rogers humor', inherent: true },
    { use: true, name: 'SenatorKennedy', title: 'Senator John Kennedy', location: 'quotes/senatorKennedy.json', citation: '', creators: 'Sen. John Kennedy (R-LA)', info: 'Louisiana senator quips and one-liners', inherent: true },
  ],
  textFontFile: 'default',
  textBoxLocation: 'random',
  quoteAppearanceRandom: true,
  quoteFontRandom: false,
  quoteTextColor: '#FFFFFF',
  quoteBackgroundColor: '#000000',
  quoteBackgroundOpacity: '206',
  quoteFontSizeMin: 16,
  quoteFontSizeMax: 28,
  quoteMaxChars: 200,

  currentQuoteStatement: '',
  currentQuoteAuthor: '',
  picHistories: [],
  picUpdateCalled: false,
  backgroundChangeAttempt: 0,

  mbcMode: false,
  mbcMonth: 1,
  mbcValue: 0,
};
