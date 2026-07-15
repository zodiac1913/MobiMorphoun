package gofilters

import (
	"fmt"
	"image"
	"image/color"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fogleman/gg"
)

// RenderQuote draws a quote with a translucent background box onto an image.
// fontPath: path to a .ttf font file
// statement: the quote text
// author: the attribution
// boxLocation: topLeft, topRight, bottomLeft, bottomRight, center, random
// fontSize: desired font size (0 = auto-fit)
// maxFontSize: maximum font size for auto-fit
// textColorHex: text color as #RRGGBB
// bgColorHex: background box color as #RRGGBB
// bgOpacity: background opacity 0-255
// outputDir: where to write the result
// screenWidth: actual device screen width in pixels (for multi-page wallpaper constraint)
func RenderQuote(
	inputPath, outputDir, fontPath string,
	statement, author, boxLocation string,
	fontSize, maxFontSize float64,
	textColorHex, bgColorHex string,
	bgOpacity int,
	maxChars int,
	screenWidth int,
) (string, error) {
	img, err := loadImage(inputPath)
	if err != nil {
		return "", fmt.Errorf("load image: %w", err)
	}

	bounds := img.Bounds()
	imgW := float64(bounds.Dx())
	imgH := float64(bounds.Dy())

	// Truncate statement if over maxChars
	if maxChars > 0 && len(statement) > maxChars {
		statement = statement[:maxChars-3] + "..."
	}

	// Create drawing context
	dc := gg.NewContextForImage(img)

	// Load font
	if fontPath == "" || !fileExists(fontPath) {
		// Try to find a system font
		fontPath = findSystemFont()
	}
	if fontPath == "" {
		return inputPath, fmt.Errorf("no font available")
	}

	// Calculate box dimensions — constrain to a single screen viewport
	// On Android, wallpapers can be wider than one screen (multi-page scrolling)
	// We place the quote within a single viewport width, centered on the image
	viewportW := float64(screenWidth)
	if viewportW <= 0 || viewportW > imgW {
		viewportW = imgW
	}

	// The visible viewport is centered on the image
	viewportLeft := (imgW - viewportW) / 2

	// Box is 80% of the viewport width (not the full image width)
	boxW := viewportW * 0.80
	maxBoxH := imgH * 0.30 // Never exceed 30% of image height
	padding := 24.0

	// Auto-fit font size if not specified
	if fontSize == 0 {
		if maxFontSize == 0 {
			maxFontSize = 42
		}
		fontSize = autoFitFont(dc, fontPath, statement, author, boxW-padding*2, maxBoxH-padding*2, 14, maxFontSize)
	}

	// Load the chosen font size
	if err := dc.LoadFontFace(fontPath, fontSize); err != nil {
		return inputPath, fmt.Errorf("load font: %w", err)
	}

	// Calculate actual text height to size the box tightly
	lines := dc.WordWrap(statement, boxW-padding*2)
	lineHeight := fontSize * 1.4
	textHeight := float64(len(lines)) * lineHeight
	if author != "" {
		textHeight += fontSize * 0.75 * 1.4 // author line
		textHeight += lineHeight * 0.3       // spacing before author
	}
	boxH := textHeight + padding*2
	if boxH > maxBoxH {
		boxH = maxBoxH
	}

	// Position box — center within the visible viewport, not the full image
	// Horizontally: center within viewport
	boxX := viewportLeft + (viewportW-boxW)/2

	// Vertically: center third of the screen (between 33% and 66%)
	centerStart := imgH * 0.33
	centerEnd := imgH * 0.66
	boxY := centerStart + (centerEnd-centerStart-boxH)/2

	if boxLocation == "random" {
		// Slight vertical randomization within the center third
		rangeY := centerEnd - centerStart - boxH
		if rangeY > 0 {
			boxY = centerStart + rand.Float64()*rangeY
		}
	}

	// Clamp to ensure box stays within visible viewport
	if boxX < viewportLeft+10 {
		boxX = viewportLeft + 10
	}
	if boxX+boxW > viewportLeft+viewportW-10 {
		boxX = viewportLeft + viewportW - boxW - 10
	}
	if boxY < 10 {
		boxY = 10
	}
	if boxY+boxH > imgH-10 {
		boxY = imgH - boxH - 10
	}

	// Parse colors
	bgR, bgG, bgB := parseHexColor(bgColorHex)
	txtR, txtG, txtB := parseHexColor(textColorHex)

	// Draw translucent background rounded rect
	// Ensure minimum opacity so quote is always readable
	if bgOpacity < 150 {
		bgOpacity = 180
	}
	bgAlpha := float64(bgOpacity) / 255.0
	dc.SetRGBA(float64(bgR)/255, float64(bgG)/255, float64(bgB)/255, bgAlpha)
	dc.DrawRoundedRectangle(boxX, boxY, boxW, boxH, 12)
	dc.Fill()

	// Draw quote text — always white or the configured color on top of the dark box
	// Ensure text color contrasts with background
	if txtR == bgR && txtG == bgG && txtB == bgB {
		// Same color — force white text
		txtR, txtG, txtB = 255, 255, 255
	}
	dc.SetRGBA(float64(txtR)/255, float64(txtG)/255, float64(txtB)/255, 1.0)
	if err := dc.LoadFontFace(fontPath, fontSize); err != nil {
		return inputPath, fmt.Errorf("reload font: %w", err)
	}

	textY := boxY + padding + fontSize
	maxTextY := boxY + boxH - padding // Don't draw past bottom of box

	for _, line := range lines {
		if textY > maxTextY {
			break
		}
		dc.DrawString(line, boxX+padding, textY)
		textY += lineHeight
	}

	// Draw author below quote text
	if author != "" && textY+fontSize*0.75 <= maxTextY+padding {
		authorSize := fontSize * 0.75
		dc.LoadFontFace(fontPath, authorSize)
		textY += lineHeight * 0.2
		dc.DrawString("— "+author, boxX+padding, textY)
	}

	// Save output
	outPath := filepath.Join(outputDir, fmt.Sprintf("quoted_%d.png", time.Now().UnixMilli()))
	if err := dc.SavePNG(outPath); err != nil {
		return "", fmt.Errorf("save: %w", err)
	}
	return outPath, nil
}

// autoFitFont finds the largest font size where text fits in the box
func autoFitFont(dc *gg.Context, fontPath, statement, author string, maxW, maxH, minSize, maxSize float64) float64 {
	for size := maxSize; size >= minSize; size -= 1 {
		dc.LoadFontFace(fontPath, size)
		lines := dc.WordWrap(statement, maxW)
		lineHeight := size * 1.4
		totalH := float64(len(lines)) * lineHeight
		// Add author line
		if author != "" {
			totalH += size * 0.75 * 1.4
		}
		if totalH <= maxH {
			return size
		}
	}
	return minSize
}

func parseHexColor(hex string) (uint8, uint8, uint8) {
	hex = strings.TrimPrefix(hex, "#")
	if len(hex) < 6 {
		return 255, 255, 255
	}
	r := hexToByte(hex[0:2])
	g := hexToByte(hex[2:4])
	b := hexToByte(hex[4:6])
	return r, g, b
}

func hexToByte(s string) uint8 {
	var val uint8
	for _, c := range s {
		val *= 16
		switch {
		case c >= '0' && c <= '9':
			val += uint8(c - '0')
		case c >= 'a' && c <= 'f':
			val += uint8(c - 'a' + 10)
		case c >= 'A' && c <= 'F':
			val += uint8(c - 'A' + 10)
		}
	}
	return val
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func findSystemFont() string {
	// Common Android/iOS font paths
	candidates := []string{
		"/system/fonts/Roboto-Regular.ttf",
		"/system/fonts/DroidSans.ttf",
		"/system/fonts/NotoSans-Regular.ttf",
	}
	for _, p := range candidates {
		if fileExists(p) {
			return p
		}
	}
	return ""
}

// Unused import suppression
var _ = image.Black
var _ = color.Black
var _ = math.Pi
