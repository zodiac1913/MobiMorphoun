/**
 * Quote Renderer Service
 * Draws quote text with a translucent background box directly onto
 * the wallpaper image, matching Metamorphoun's text overlay behavior.
 *
 * Uses expo-image-manipulator for the base, and a canvas approach
 * via a headless Skia surface to composite text.
 *
 * Since headless Skia rendering is complex on RN, we use a simpler
 * approach: generate an SVG overlay and composite it using
 * expo-image-manipulator's crop/resize pipeline, OR use the
 * native Android Canvas via a small native call.
 *
 * For now: we render via Android's native WallpaperHelper approach —
 * write the quote params to a temp file, and use a lightweight
 * native module or Skia offscreen surface.
 *
 * PRACTICAL APPROACH: Use react-native-skia's offscreen rendering
 * to draw text onto the image buffer.
 */

import * as FileSystem from 'expo-file-system';
import { Platform, Dimensions } from 'react-native';
import { Skia } from '@shopify/react-native-skia';
import { Quote, calculateTextOverlay, TextOverlayInfo } from './quoteService';
import { getConfig } from './configService';
import { logEntry } from './logService';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('screen');

/**
 * Render a quote overlay onto an image and return the new URI.
 * If rendering fails, returns the original image URI unchanged.
 */
export async function renderQuoteOnImage(
  imageUri: string,
  quote: Quote
): Promise<string> {
  try {
    const config = getConfig();
    const overlay = calculateTextOverlay(SCREEN_W, SCREEN_H, quote, config);

    // Load the source image into a Skia surface
    const imageData = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const skData = Skia.Data.fromBase64(imageData);
    const skImage = Skia.Image.MakeImageFromEncoded(skData);

    if (!skImage) {
      logEntry('WARN', 'QuoteRenderer', 'renderQuoteOnImage', 'Failed to decode image');
      return imageUri;
    }

    const imgWidth = skImage.width();
    const imgHeight = skImage.height();

    // Create an offscreen surface at image dimensions
    const surface = Skia.Surface.MakeOffscreen(imgWidth, imgHeight);
    if (!surface) {
      logEntry('WARN', 'QuoteRenderer', 'renderQuoteOnImage', 'Failed to create surface');
      return imageUri;
    }

    const canvas = surface.getCanvas();

    // Draw the original image
    const imgPaint = Skia.Paint();
    canvas.drawImage(skImage, 0, 0, imgPaint);

    // Scale overlay coordinates from screen dims to image dims
    const scaleX = imgWidth / SCREEN_W;
    const scaleY = imgHeight / SCREEN_H;
    const boxX = overlay.x * scaleX;
    const boxY = overlay.y * scaleY;
    const boxW = overlay.width * scaleX;
    const boxH = overlay.height * scaleY;
    const fontSize = overlay.fontSize * Math.min(scaleX, scaleY);

    // Draw translucent background box
    const bgPaint = Skia.Paint();
    const bgColor = hexToRgb(overlay.backgroundColor);
    const bgAlpha = Math.round(overlay.backgroundOpacity * 255);
    bgPaint.setColor(
      Skia.Color(`rgba(${bgColor.r}, ${bgColor.g}, ${bgColor.b}, ${overlay.backgroundOpacity})`)
    );
    const bgRect = Skia.XYWHRect(boxX, boxY, boxW, boxH);
    const rrect = Skia.RRectXY(bgRect, 12 * scaleX, 12 * scaleY);
    canvas.drawRRect(rrect, bgPaint);

    // Draw quote text
    const textColor = hexToRgb(overlay.textColor);
    const textPaint = Skia.Paint();
    textPaint.setColor(
      Skia.Color(`rgba(${textColor.r}, ${textColor.g}, ${textColor.b}, 1)`)
    );

    const padding = 16 * scaleX;

    // Auto-fit font size to the box
    const config2 = getConfig();
    const minFontPx = (config2.quoteFontSizeMin || 14) * Math.min(scaleX, scaleY);
    const maxFontPx = (config2.quoteFontSizeMax || 28) * Math.min(scaleX, scaleY);
    const { fontSize: fittedSize, lines, authorLines } = autoFitFontSize(
      overlay.statement,
      overlay.author,
      boxW,
      boxH,
      padding,
      minFontPx,
      maxFontPx
    );

    const font = Skia.Font(undefined, fittedSize);
    const lineHeight = fittedSize * 1.3;
    let textY = boxY + padding + fittedSize;

    for (const line of lines) {
      canvas.drawText(line, boxX + padding, textY, textPaint, font);
      textY += lineHeight;
    }

    // Draw author
    if (overlay.author && authorLines.length > 0) {
      const authorFontSize = fittedSize * 0.8;
      const authorFont = Skia.Font(undefined, authorFontSize);
      textY += lineHeight * 0.3;
      for (const aLine of authorLines) {
        canvas.drawText(aLine, boxX + padding, textY, textPaint, authorFont);
        textY += authorFontSize * 1.3;
      }
    }

    // Flush and export
    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    if (!snapshot) {
      logEntry('WARN', 'QuoteRenderer', 'renderQuoteOnImage', 'Failed to snapshot');
      return imageUri;
    }

    const encoded = snapshot.encodeToBase64();
    const outputUri = `${FileSystem.documentDirectory}wallpapers/quoted_${Date.now()}.png`;
    await FileSystem.writeAsStringAsync(outputUri, encoded, {
      encoding: FileSystem.EncodingType.Base64,
    });

    logEntry('INFO', 'QuoteRenderer', 'renderQuoteOnImage', 'Quote rendered on image');
    return outputUri;
  } catch (err) {
    logEntry('ERROR', 'QuoteRenderer', 'renderQuoteOnImage', `Failed: ${err}`);
    // Return original image if rendering fails — don't block wallpaper setting
    return imageUri;
  }
}

/**
 * Simple word-wrap using Skia font metrics
 */
function wrapText(text: string, font: any, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const measured = font.measureText(testLine);

    if (measured.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Auto-fit: find the largest font size where the text fits in the box.
 * Starts at maxSize, shrinks by 1px until it fits or hits minSize.
 */
function autoFitFontSize(
  text: string,
  author: string,
  boxW: number,
  boxH: number,
  padding: number,
  minSize: number,
  maxSize: number
): { fontSize: number; lines: string[]; authorLines: string[] } {
  const availW = boxW - padding * 2;
  const availH = boxH - padding * 2;

  for (let size = maxSize; size >= minSize; size -= 1) {
    const font = Skia.Font(undefined, size);
    const lineHeight = size * 1.3;
    const lines = wrapText(text, font, availW);

    // Author takes ~1 line at 80% size
    const authorHeight = author ? size * 0.8 * 1.3 + lineHeight * 0.3 : 0;
    const totalHeight = lines.length * lineHeight + authorHeight;

    if (totalHeight <= availH) {
      const authorFont = Skia.Font(undefined, size * 0.8);
      const authorLines = author ? wrapText(`— ${author}`, authorFont, availW) : [];
      return { fontSize: size, lines, authorLines };
    }
  }

  // At minimum size, just truncate lines to fit
  const font = Skia.Font(undefined, minSize);
  const lineHeight = minSize * 1.3;
  const maxLines = Math.floor((availH) / lineHeight) - 1; // reserve 1 for author
  let lines = wrapText(text, font, availW);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -3) + '...';
  }
  const authorFont = Skia.Font(undefined, minSize * 0.8);
  const authorLines = author ? wrapText(`— ${author}`, authorFont, availW) : [];
  return { fontSize: minSize, lines, authorLines };
}

/**
 * Parse hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16) || 0,
    g: parseInt(clean.substring(2, 4), 16) || 0,
    b: parseInt(clean.substring(4, 6), 16) || 0,
  };
}
