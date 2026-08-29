// Package gofilters provides image filter functions for MobiMorphoun.
// This package is compiled via gomobile bind for Android (.aar) and iOS (.xcframework).
// All filters take an image file path and return the output file path.
package gofilters

import (
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/disintegration/imaging"
	"github.com/fogleman/gg"
	"golang.org/x/image/draw"
)

func init() {
	rand.Seed(time.Now().UnixNano())
}

// ApplyFilter applies the named filter to the image at inputPath,
// writes the result to outputDir, and returns the output file path.
// filterName: Original, BlurSoft, BlurHard, Pixelate, Monochrome,
//
//	Cartoon, Wavy, Vortex, Mosaic, JigsawPuzzle, Graffiti, Oilify
//
// intensity: filter strength (0 = random default)
// screenWidth, screenHeight: device screen dimensions for scaling
func ApplyFilter(inputPath, outputDir, filterName string, intensity float64, screenWidth, screenHeight int) (string, error) {
	img, err := loadImage(inputPath)
	if err != nil {
		return "", fmt.Errorf("load image: %w", err)
	}

	var result image.Image
	var usedIntensity float64

	switch strings.ToLower(filterName) {
	case "original":
		return inputPath, nil
	case "blursoft":
		sigma := intensity
		if sigma == 0 {
			sigma = 3.0
		}
		result = imaging.Blur(img, sigma)
		usedIntensity = sigma
	case "blurhard":
		sigma := intensity
		if sigma == 0 {
			sigma = 8.0
		}
		result = imaging.Blur(img, sigma)
		usedIntensity = sigma
	case "pixelate":
		pixelSize := int(intensity)
		if pixelSize == 0 {
			pixelSize = rand.Intn(16) + 4
		}
		result = pixelate(img, pixelSize)
		usedIntensity = float64(pixelSize)
	case "monochrome":
		result = monochrome(img)
		usedIntensity = 1
	case "cartoon":
		result = cartoon(img)
		usedIntensity = 6
	case "wavy":
		level := intensity
		if level == 0 {
			level = float64(rand.Intn(15) + 15)
		}
		result = wavy(img, level, screenWidth, screenHeight)
		usedIntensity = level
	case "vortex":
		result = vortex(img)
		usedIntensity = 1
	case "mosaic":
		result = mosaic(img)
		usedIntensity = 1
	case "jigsawpuzzle":
		result = jigsawPuzzle(img)
		usedIntensity = 1
	case "graffiti":
		levels := int(intensity)
		if levels == 0 {
			levels = rand.Intn(3) + 3
		}
		result = graffiti(img, levels)
		usedIntensity = float64(levels)
	case "oilify":
		radius := int(intensity)
		if radius == 0 {
			radius = rand.Intn(4) + 3
		}
		result = oilify(img, radius)
		usedIntensity = float64(radius)
	case "cyberpunk":
		cyberResult, cyberErr := cyberpunkFocus(img)
		if cyberErr != nil {
			return "", fmt.Errorf("cyberpunk: %w", cyberErr)
		}
		result = cyberResult
		usedIntensity = 1
	default:
		return inputPath, nil
	}

	_ = usedIntensity
	outPath := filepath.Join(outputDir, fmt.Sprintf("filtered_%d.jpg", time.Now().UnixMilli()))
	if err := saveImage(result, outPath); err != nil {
		return "", fmt.Errorf("save image: %w", err)
	}
	return outPath, nil
}

// --- Filter implementations (ported from Metamorphoun) ---

func pixelate(img image.Image, pixelSize int) image.Image {
	bounds := img.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	newImg := image.NewRGBA(bounds)

	for y := 0; y < height; y += pixelSize {
		for x := 0; x < width; x += pixelSize {
			var r, g, b, a uint32
			var count int
			for dy := 0; dy < pixelSize; dy++ {
				for dx := 0; dx < pixelSize; dx++ {
					if y+dy < height && x+dx < width {
						r1, g1, b1, a1 := img.At(x+dx+bounds.Min.X, y+dy+bounds.Min.Y).RGBA()
						r += r1
						g += g1
						b += b1
						a += a1
						count++
					}
				}
			}
			if count > 0 {
				r /= uint32(count)
				g /= uint32(count)
				b /= uint32(count)
				a /= uint32(count)
			}
			for dy := 0; dy < pixelSize; dy++ {
				for dx := 0; dx < pixelSize; dx++ {
					if y+dy < height && x+dx < width {
						newImg.Set(x+dx+bounds.Min.X, y+dy+bounds.Min.Y,
							color.RGBA{uint8(r >> 8), uint8(g >> 8), uint8(b >> 8), uint8(a >> 8)})
					}
				}
			}
		}
	}
	return newImg
}

func monochrome(img image.Image) image.Image {
	bounds := img.Bounds()
	grayImg := image.NewGray(bounds)
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, _ := img.At(x, y).RGBA()
			grayValue := uint8((r*299 + g*587 + b*114) / 1000 >> 8)
			grayImg.SetGray(x, y, color.Gray{Y: grayValue})
		}
	}
	return grayImg
}

func cartoon(img image.Image) image.Image {
	// Slight blur to reduce noise
	smoothed := imaging.Blur(img, 2.0)
	bounds := smoothed.Bounds()
	W, H := bounds.Dx(), bounds.Dy()

	// Posterize
	levels := 6 + rand.Intn(4)
	step := 256.0 / float64(levels)
	posterized := image.NewRGBA(bounds)
	for y := 0; y < H; y++ {
		for x := 0; x < W; x++ {
			r, g, b, a := smoothed.At(x+bounds.Min.X, y+bounds.Min.Y).RGBA()
			pr := uint8(math.Floor(float64(r>>8)/step) * step)
			pg := uint8(math.Floor(float64(g>>8)/step) * step)
			pb := uint8(math.Floor(float64(b>>8)/step) * step)
			posterized.SetRGBA(x+bounds.Min.X, y+bounds.Min.Y, color.RGBA{pr, pg, pb, uint8(a >> 8)})
		}
	}

	// Edge detection (Sobel) on grayscale
	grey := imaging.Grayscale(smoothed)
	edgeThreshold := 28.0 + rand.Float64()*20.0

	result := image.NewRGBA(bounds)
	draw.Draw(result, bounds, posterized, bounds.Min, draw.Src)

	pixel := func(px, py int) float64 {
		if px < bounds.Min.X {
			px = bounds.Min.X
		}
		if py < bounds.Min.Y {
			py = bounds.Min.Y
		}
		if px >= bounds.Min.X+W {
			px = bounds.Min.X + W - 1
		}
		if py >= bounds.Min.Y+H {
			py = bounds.Min.Y + H - 1
		}
		r, _, _, _ := grey.At(px, py).RGBA()
		return float64(r >> 8)
	}

	for y := 0; y < H; y++ {
		for x := 0; x < W; x++ {
			ox, oy := x+bounds.Min.X, y+bounds.Min.Y
			gx := -pixel(ox-1, oy-1) - 2*pixel(ox-1, oy) - pixel(ox-1, oy+1) +
				pixel(ox+1, oy-1) + 2*pixel(ox+1, oy) + pixel(ox+1, oy+1)
			gy := -pixel(ox-1, oy-1) - 2*pixel(ox, oy-1) - pixel(ox+1, oy-1) +
				pixel(ox-1, oy+1) + 2*pixel(ox, oy+1) + pixel(ox+1, oy+1)
			mag := math.Sqrt(gx*gx + gy*gy)
			if mag > edgeThreshold {
				result.SetRGBA(ox, oy, color.RGBA{0, 0, 0, 255})
			}
		}
	}
	return result
}

func wavy(img image.Image, intensity float64, screenWidth, screenHeight int) image.Image {
	bounds := img.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	maxDistortion := int(intensity)

	distorted := image.NewNRGBA(bounds)
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			distortedY := y + int(intensity*math.Sin(float64(x)/50))
			if distortedY >= 0 && distortedY < height {
				distorted.Set(x+bounds.Min.X, distortedY+bounds.Min.Y, img.At(x+bounds.Min.X, y+bounds.Min.Y))
			}
		}
	}

	// Clip edges
	clipRect := image.Rect(
		bounds.Min.X+maxDistortion, bounds.Min.Y+maxDistortion,
		bounds.Max.X-maxDistortion, bounds.Max.Y-maxDistortion,
	)
	clipped := distorted.SubImage(clipRect)

	// Resize back to target
	tw, th := screenWidth, screenHeight
	if tw == 0 {
		tw = width
	}
	if th == 0 {
		th = height
	}
	resized := image.NewNRGBA(image.Rect(0, 0, tw, th))
	draw.BiLinear.Scale(resized, resized.Rect, clipped, clipped.Bounds(), draw.Over, nil)
	return resized
}

func vortex(img image.Image) image.Image {
	bounds := img.Bounds()
	width, height := bounds.Dx(), bounds.Dy()

	quadrants := []string{"topLeft", "topRight", "bottomLeft", "bottomRight", "center"}
	// Pick 1-3 random quadrants
	numQuads := rand.Intn(3) + 1
	rand.Shuffle(len(quadrants), func(i, j int) { quadrants[i], quadrants[j] = quadrants[j], quadrants[i] })
	chosen := quadrants[:numQuads]

	spiralLevel := 0.0001 + rand.Float64()*0.0043
	result := img

	for _, q := range chosen {
		var cx, cy float64
		switch q {
		case "topLeft":
			cx, cy = float64(width)*0.25, float64(height)*0.25
		case "topRight":
			cx, cy = float64(width)*0.75, float64(height)*0.25
		case "bottomLeft":
			cx, cy = float64(width)*0.25, float64(height)*0.75
		case "bottomRight":
			cx, cy = float64(width)*0.75, float64(height)*0.75
		case "center":
			cx, cy = float64(width)*0.5, float64(height)*0.5
		}
		result = vortexEffect(result, spiralLevel, cx, cy)
	}
	return result
}

func vortexEffect(img image.Image, level, centerX, centerY float64) image.Image {
	bounds := img.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	newImg := image.NewRGBA(bounds)

	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			dx := float64(x) - centerX
			dy := float64(y) - centerY
			distance := math.Sqrt(dx*dx + dy*dy)
			angle := math.Atan2(dy, dx) + level*distance

			sx := int(centerX + distance*math.Cos(angle))
			sy := int(centerY + distance*math.Sin(angle))

			if sx >= 0 && sx < width && sy >= 0 && sy < height {
				newImg.Set(x+bounds.Min.X, y+bounds.Min.Y, img.At(sx+bounds.Min.X, sy+bounds.Min.Y))
			} else {
				newImg.Set(x+bounds.Min.X, y+bounds.Min.Y, img.At(x+bounds.Min.X, y+bounds.Min.Y))
			}
		}
	}
	return newImg
}

func mosaic(img image.Image) image.Image {
	bounds := img.Bounds()
	origWidth, origHeight := bounds.Dx(), bounds.Dy()

	numberOfTiles := (rand.Intn(50) + 35) * (rand.Intn(3) + 1)
	tileW := origWidth / numberOfTiles
	tileH := origHeight / numberOfTiles
	if tileW < 2 {
		tileW = 2
	}
	if tileH < 2 {
		tileH = 2
	}

	reductionScale := float64(rand.Intn(50)+50) / 100.0
	maxJitter := rand.Intn(2) + 1

	groutColor := color.RGBA{
		R: uint8(rand.Intn(96)),
		G: uint8(rand.Intn(96)),
		B: uint8(rand.Intn(96)),
		A: 255,
	}

	// Fill background with grout
	result := image.NewNRGBA(bounds)
	draw.Draw(result, bounds, &image.Uniform{C: groutColor}, image.Point{}, draw.Src)

	scaledWidth := int(float64(origWidth) * reductionScale)
	scaledImg := imaging.Resize(img, scaledWidth, 0, imaging.Lanczos)
	scaledBounds := scaledImg.Bounds()
	scaledW, scaledH := scaledBounds.Dx(), scaledBounds.Dy()

	stretchRatioX := float64(origWidth) / float64(scaledW)
	stretchRatioY := float64(origHeight) / float64(scaledH)

	numTilesX := origWidth / tileW
	numTilesY := origHeight / tileH

	for xTile := 0; xTile < numTilesX; xTile++ {
		x := xTile * tileW
		for yTile := 0; yTile < numTilesY; yTile++ {
			y := yTile * tileH

			scaledX := int(float64(x) / stretchRatioX)
			scaledY := int(float64(y) / stretchRatioY)
			tileWidthScaled := int(float64(tileW) / stretchRatioX)
			tileHeightScaled := int(float64(tileH) / stretchRatioY)

			if scaledX+tileWidthScaled > scaledW {
				tileWidthScaled = scaledW - scaledX
			}
			if scaledY+tileHeightScaled > scaledH {
				tileHeightScaled = scaledH - scaledY
			}
			if tileWidthScaled <= 0 || tileHeightScaled <= 0 {
				continue
			}

			cropRect := image.Rect(
				scaledX+scaledBounds.Min.X, scaledY+scaledBounds.Min.Y,
				scaledX+tileWidthScaled+scaledBounds.Min.X, scaledY+tileHeightScaled+scaledBounds.Min.Y,
			)
			tile := imaging.Crop(scaledImg, cropRect)

			jitterX := rand.Intn(maxJitter*2+1) - maxJitter
			jitterY := rand.Intn(maxJitter*2+1) - maxJitter
			destPt := image.Pt(x+jitterX+bounds.Min.X, y+jitterY+bounds.Min.Y)
			destRect := tile.Bounds().Add(destPt).Sub(tile.Bounds().Min)
			draw.Draw(result, destRect, tile, tile.Bounds().Min, draw.Over)
		}
	}
	return result
}

func graffiti(img image.Image, levels int) image.Image {
	bounds := img.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	newImg := image.NewRGBA(bounds)
	edgeThreshold := 80.0

	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			edge := sobelEdge(img, x+bounds.Min.X, y+bounds.Min.Y, width, height, bounds)
			if edge > edgeThreshold {
				newImg.Set(x+bounds.Min.X, y+bounds.Min.Y, color.RGBA{20, 20, 20, 255})
			} else {
				r, g, b, a := img.At(x+bounds.Min.X, y+bounds.Min.Y).RGBA()
				pr := posterizeVal(uint8(r>>8), levels)
				pg := posterizeVal(uint8(g>>8), levels)
				pb := posterizeVal(uint8(b>>8), levels)

				maxC := math.Max(float64(pr), math.Max(float64(pg), float64(pb)))
				minC := math.Min(float64(pr), math.Min(float64(pg), float64(pb)))
				if maxC > 0 && maxC != minC {
					boost := 1.3
					mid := (maxC + minC) / 2
					pr = uint8(math.Min(255, mid+(float64(pr)-mid)*boost))
					pg = uint8(math.Min(255, mid+(float64(pg)-mid)*boost))
					pb = uint8(math.Min(255, mid+(float64(pb)-mid)*boost))
				}
				if rand.Intn(100) < 5 {
					noise := uint8(rand.Intn(30))
					pr = uint8(math.Min(255, float64(pr)+float64(noise)))
					pg = uint8(math.Min(255, float64(pg)+float64(noise)))
					pb = uint8(math.Min(255, float64(pb)+float64(noise)))
				}
				newImg.Set(x+bounds.Min.X, y+bounds.Min.Y, color.RGBA{pr, pg, pb, uint8(a >> 8)})
			}
		}
	}
	return newImg
}

func oilify(img image.Image, radius int) image.Image {
	bounds := img.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	newImg := image.NewRGBA(bounds)

	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			hist := make(map[color.Color]int)
			var mostCommon color.Color
			var maxCount int
			for dy := -radius; dy <= radius; dy++ {
				for dx := -radius; dx <= radius; dx++ {
					px, py := x+dx, y+dy
					if px >= 0 && px < width && py >= 0 && py < height {
						c := img.At(px+bounds.Min.X, py+bounds.Min.Y)
						hist[c]++
						if hist[c] > maxCount {
							maxCount = hist[c]
							mostCommon = c
						}
					}
				}
			}
			newImg.Set(x+bounds.Min.X, y+bounds.Min.Y, mostCommon)
		}
	}
	return newImg
}

func jigsawPuzzle(img image.Image) image.Image {
	bounds := img.Bounds()
	W := float64(bounds.Dx())
	H := float64(bounds.Dy())

	cols := 30 + rand.Intn(20)
	pieceW := W / float64(cols)
	rows := int(math.Round(H / pieceW))
	if rows < 10 {
		rows = 10
	}
	pieceH := H / float64(rows)
	lineW := 2.0 + rand.Float64()*2.0

	// Draw grid lines on the image (simplified jigsaw — straight grid)
	result := image.NewRGBA(bounds)
	draw.Draw(result, bounds, img, bounds.Min, draw.Src)

	// Draw horizontal lines
	for row := 1; row < rows; row++ {
		y := int(float64(row) * pieceH)
		for x := 0; x < int(W); x++ {
			for lw := 0; lw < int(lineW); lw++ {
				py := y + lw + bounds.Min.Y
				if py < bounds.Max.Y {
					result.Set(x+bounds.Min.X, py, color.RGBA{30, 30, 30, 255})
				}
			}
		}
	}
	// Draw vertical lines
	for col := 1; col < cols; col++ {
		x := int(float64(col) * pieceW)
		for y := 0; y < int(H); y++ {
			for lw := 0; lw < int(lineW); lw++ {
				px := x + lw + bounds.Min.X
				if px < bounds.Max.X {
					result.Set(px, y+bounds.Min.Y, color.RGBA{30, 30, 30, 255})
				}
			}
		}
	}
	return result
}

// --- Helpers ---

func sobelEdge(img image.Image, x, y, width, height int, bounds image.Rectangle) float64 {
	gray := func(px, py int) float64 {
		if px < bounds.Min.X || px >= bounds.Max.X || py < bounds.Min.Y || py >= bounds.Max.Y {
			return 0
		}
		r, g, b, _ := img.At(px, py).RGBA()
		return float64(r*299+g*587+b*114) / 1000.0 / 256.0
	}
	gx := -gray(x-1, y-1) - 2*gray(x-1, y) - gray(x-1, y+1) +
		gray(x+1, y-1) + 2*gray(x+1, y) + gray(x+1, y+1)
	gy := -gray(x-1, y-1) - 2*gray(x, y-1) - gray(x+1, y-1) +
		gray(x-1, y+1) + 2*gray(x, y+1) + gray(x+1, y+1)
	return math.Sqrt(gx*gx + gy*gy)
}

func posterizeVal(c uint8, levels int) uint8 {
	step := 255.0 / float64(levels-1)
	return uint8(math.Round(float64(c)/step) * step)
}

func loadImage(path string) (image.Image, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	img, _, err := image.Decode(f)
	return img, err
}

func saveImage(img image.Image, path string) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".png":
		return png.Encode(f, img)
	default:
		return jpeg.Encode(f, img, &jpeg.Options{Quality: 90})
	}
}

// --- Cyberpunk filter (ported from Metamorphoun service/filtersSet.go) ---

// cyberpunkFocus finds a visually prominent region of the image and renders it
// with neon linework over a darkened, stylized background with contour rings
// and skyline figures.
func cyberpunkFocus(img image.Image) (image.Image, error) {
	bounds := img.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width == 0 || height == 0 {
		return nil, fmt.Errorf("cannot apply cyberpunk filter to an empty image")
	}

	// Downscaling makes the saliency calculation fast while favoring broad, coherent detail.
	analysis := imaging.Resize(img, 320, 0, imaging.Lanczos)
	analysisBounds := analysis.Bounds()
	analysisWidth, analysisHeight := analysisBounds.Dx(), analysisBounds.Dy()
	softened := imaging.Blur(analysis, 14)
	saliency := image.NewGray(analysisBounds)

	luminanceAt := func(source image.Image, x, y int) float64 {
		if x < analysisBounds.Min.X {
			x = analysisBounds.Min.X
		}
		if x >= analysisBounds.Max.X {
			x = analysisBounds.Max.X - 1
		}
		if y < analysisBounds.Min.Y {
			y = analysisBounds.Min.Y
		}
		if y >= analysisBounds.Max.Y {
			y = analysisBounds.Max.Y - 1
		}
		r, g, b, _ := source.At(x, y).RGBA()
		return 0.2126*float64(r>>8) + 0.7152*float64(g>>8) + 0.0722*float64(b>>8)
	}

	for y := analysisBounds.Min.Y; y < analysisBounds.Max.Y; y++ {
		for x := analysisBounds.Min.X; x < analysisBounds.Max.X; x++ {
			lum := luminanceAt(analysis, x, y)
			localContrast := math.Abs(lum-luminanceAt(softened, x, y)) / 128
			gx := luminanceAt(analysis, x+1, y) - luminanceAt(analysis, x-1, y)
			gy := luminanceAt(analysis, x, y+1) - luminanceAt(analysis, x, y-1)
			edge := math.Min(1, math.Sqrt(gx*gx+gy*gy)/180)
			r, g, b, _ := analysis.At(x, y).RGBA()
			maxChannel := math.Max(float64(r>>8), math.Max(float64(g>>8), float64(b>>8)))
			minChannel := math.Min(float64(r>>8), math.Min(float64(g>>8), float64(b>>8)))
			saturation := (maxChannel - minChannel) / 255
			centerX := (float64(x-analysisBounds.Min.X) / float64(analysisWidth)) - 0.5
			centerY := (float64(y-analysisBounds.Min.Y) / float64(analysisHeight)) - 0.5
			centerBias := math.Exp(-5 * (centerX*centerX + centerY*centerY))
			score := math.Min(1, 0.48*edge+0.24*localContrast+0.16*saturation+0.12*centerBias)
			saliency.SetGray(x, y, color.Gray{Y: uint8(score * 255)})
		}
	}

	// The blurred score chooses an area with sustained visual interest, not a single sharp edge.
	blurredSaliency := imaging.Blur(saliency, 14)
	focusX, focusY := analysisBounds.Min.X+analysisWidth/2, analysisBounds.Min.Y+analysisHeight/2
	var bestScore uint8
	for y := analysisBounds.Min.Y; y < analysisBounds.Max.Y; y++ {
		for x := analysisBounds.Min.X; x < analysisBounds.Max.X; x++ {
			scoreChannel, _, _, _ := blurredSaliency.At(x, y).RGBA()
			score := uint8(scoreChannel >> 8)
			if score > bestScore {
				bestScore = score
				focusX, focusY = x, y
			}
		}
	}

	focusCenterX := float64(bounds.Min.X) + ((float64(focusX-analysisBounds.Min.X) + 0.5) / float64(analysisWidth) * float64(width))
	focusCenterY := float64(bounds.Min.Y) + ((float64(focusY-analysisBounds.Min.Y) + 0.5) / float64(analysisHeight) * float64(height))
	focusWidth := float64(width) * (0.25 + rand.Float64()*0.50)
	focusHeight := float64(height) * (0.25 + rand.Float64()*0.50)
	if rand.Intn(100) < 30 {
		size := math.Min(focusWidth, focusHeight) * (0.85 + rand.Float64()*0.30)
		focusWidth = math.Min(float64(width)*0.75, size)
		focusHeight = math.Min(float64(height)*0.75, size)
	}
	halfFocusWidth := math.Max(1, focusWidth/2)
	halfFocusHeight := math.Max(1, focusHeight/2)
	focusCenterX = clampFloat(focusCenterX+(rand.Float64()-0.5)*halfFocusWidth*0.45, float64(bounds.Min.X)+halfFocusWidth*0.70, float64(bounds.Max.X)-halfFocusWidth*0.70)
	focusCenterY = clampFloat(focusCenterY+(rand.Float64()-0.5)*halfFocusHeight*0.45, float64(bounds.Min.Y)+halfFocusHeight*0.70, float64(bounds.Max.Y)-halfFocusHeight*0.70)
	focus := cyberpunkFocusSpec{
		centerX:    focusCenterX,
		centerY:    focusCenterY,
		halfWidth:  halfFocusWidth,
		halfHeight: halfFocusHeight,
		curvePower: 1.45 + rand.Float64()*3.75,
		softness:   0.10 + rand.Float64()*0.18,
		squared:    rand.Intn(100) < 38,
	}
	smoothed := imaging.Blur(img, 1.1)
	result := image.NewRGBA(bounds)
	edges := image.NewRGBA(bounds)
	contours := image.NewRGBA(bounds)
	figures := image.NewRGBA(bounds)
	drawCyberpunkContours(contours, bounds, focus)
	drawCyberpunkBackgroundFigures(figures, bounds, focus)

	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, a := img.At(x, y).RGBA()
			red, green, blue := float64(r>>8), float64(g>>8), float64(b>>8)
			luminance := 0.2126*red + 0.7152*green + 0.0722*blue
			focusAmount := cyberpunkFocusAmount(float64(x), float64(y), focus)

			background := color.RGBA{R: uint8(luminance * 0.05), G: uint8(luminance * 0.11), B: uint8(14 + luminance*0.20), A: uint8(a >> 8)}
			neon := color.RGBA{
				R: uint8(math.Min(255, luminance*0.34+red*0.24+18)),
				G: uint8(math.Min(255, luminance*0.68+green*0.30+12)),
				B: uint8(math.Min(255, luminance*0.92+blue*0.34+36)),
				A: uint8(a >> 8),
			}
			result.SetRGBA(x, y, mixRGBA(background, neon, focusAmount))

			edge := cyberpunkSobelEdge(smoothed, x, y, bounds)
			if edge > 85 && focusAmount > 0.08 {
				line := color.RGBA{R: 10, G: 235, B: 255, A: uint8(255 * focusAmount)}
				if red > blue {
					line = color.RGBA{R: 255, G: 24, B: 198, A: uint8(255 * focusAmount)}
				}
				edges.SetRGBA(x, y, line)
			}
		}
	}

	glow := imaging.Blur(edges, 6)
	contourGlow := imaging.Blur(contours, math.Max(4, math.Min(float64(width), float64(height))*0.006))
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			focusAmount := cyberpunkFocusAmount(float64(x), float64(y), focus)
			darkness := 1 - focusAmount
			base := result.RGBAAt(x, y)
			fr, fg, fb, fa := figures.At(x, y).RGBA()
			if fa > 0 && darkness > 0.12 {
				amount := math.Min(0.72, (float64(fa>>8)/255)*darkness)
				base = mixRGBA(base, color.RGBA{R: uint8(fr >> 8), G: uint8(fg >> 8), B: uint8(fb >> 8), A: 255}, amount)
				result.SetRGBA(x, y, base)
			}
			cgr, cgg, cgb, cga := contourGlow.At(x, y).RGBA()
			if cga > 0 && darkness > 0.03 {
				amount := math.Min(0.58, (float64(cga>>8)/255)*darkness*0.65)
				base = mixRGBA(result.RGBAAt(x, y), color.RGBA{R: uint8(cgr >> 8), G: uint8(cgg >> 8), B: uint8(cgb >> 8), A: 255}, amount)
				result.SetRGBA(x, y, base)
			}
			glowColor := glow.At(x, y)
			gr, gg, gb, ga := glowColor.RGBA()
			if ga > 0 {
				result.SetRGBA(x, y, mixRGBA(base, color.RGBA{R: uint8(gr >> 8), G: uint8(gg >> 8), B: uint8(gb >> 8), A: 255}, 0.38))
			}
			cr, cg, cb, ca := contours.At(x, y).RGBA()
			if ca > 0 && darkness > 0.02 {
				amount := math.Min(0.92, (float64(ca>>8)/255)*math.Max(0.35, darkness))
				result.SetRGBA(x, y, mixRGBA(result.RGBAAt(x, y), color.RGBA{R: uint8(cr >> 8), G: uint8(cg >> 8), B: uint8(cb >> 8), A: 255}, amount))
			}
			_, _, _, edgeAlpha := edges.At(x, y).RGBA()
			if edgeAlpha > 0 {
				er, eg, eb, _ := edges.At(x, y).RGBA()
				result.SetRGBA(x, y, color.RGBA{R: uint8(er >> 8), G: uint8(eg >> 8), B: uint8(eb >> 8), A: 255})
			}
		}
	}

	return result, nil
}

type cyberpunkFocusSpec struct {
	centerX    float64
	centerY    float64
	halfWidth  float64
	halfHeight float64
	curvePower float64
	softness   float64
	squared    bool
}

type cyberpunkContourSpec struct {
	centerX    float64
	centerY    float64
	radiusX    float64
	radiusY    float64
	rotation   float64
	curvePower float64
	squared    bool
}

// cyberpunkSobelEdge computes the Sobel edge magnitude at absolute pixel (x,y),
// scaled to roughly 0-255 to match Metamorphoun's threshold expectations.
func cyberpunkSobelEdge(img image.Image, x, y int, bounds image.Rectangle) float64 {
	gray := func(px, py int) float64 {
		if px < bounds.Min.X {
			px = bounds.Min.X
		}
		if px >= bounds.Max.X {
			px = bounds.Max.X - 1
		}
		if py < bounds.Min.Y {
			py = bounds.Min.Y
		}
		if py >= bounds.Max.Y {
			py = bounds.Max.Y - 1
		}
		r, g, b, _ := img.At(px, py).RGBA()
		return 0.2126*float64(r>>8) + 0.7152*float64(g>>8) + 0.0722*float64(b>>8)
	}
	gx := -gray(x-1, y-1) - 2*gray(x-1, y) - gray(x-1, y+1) +
		gray(x+1, y-1) + 2*gray(x+1, y) + gray(x+1, y+1)
	gy := -gray(x-1, y-1) - 2*gray(x, y-1) - gray(x+1, y-1) +
		gray(x-1, y+1) + 2*gray(x, y+1) + gray(x+1, y+1)
	return math.Sqrt(gx*gx + gy*gy)
}

func cyberpunkFocusAmount(x, y float64, focus cyberpunkFocusSpec) float64 {
	dx := math.Abs(x-focus.centerX) / math.Max(1, focus.halfWidth)
	dy := math.Abs(y-focus.centerY) / math.Max(1, focus.halfHeight)
	distance := math.Max(dx, dy)
	if !focus.squared {
		power := math.Max(1, focus.curvePower)
		distance = math.Pow(math.Pow(dx, power)+math.Pow(dy, power), 1/power)
	}
	amount := 1 - cyberpunkSmoothstep(1-focus.softness, 1+focus.softness, distance)
	return math.Max(0, math.Min(1, amount))
}

func cyberpunkSmoothstep(edge0, edge1, value float64) float64 {
	if edge0 == edge1 {
		if value < edge0 {
			return 0
		}
		return 1
	}
	t := clampFloat((value-edge0)/(edge1-edge0), 0, 1)
	return t * t * (3 - 2*t)
}

func clampFloat(value, minValue, maxValue float64) float64 {
	if minValue > maxValue {
		return (minValue + maxValue) / 2
	}
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func randomCyberpunkColor(alpha uint8) color.RGBA {
	palette := []color.RGBA{
		{R: 0, G: 244, B: 255, A: alpha},
		{R: 255, G: 28, B: 205, A: alpha},
		{R: 255, G: 238, B: 38, A: alpha},
		{R: 0, G: 255, B: 137, A: alpha},
		{R: 255, G: 83, B: 35, A: alpha},
		{R: 126, G: 58, B: 255, A: alpha},
	}
	return palette[rand.Intn(len(palette))]
}

func drawCyberpunkContours(layer *image.RGBA, bounds image.Rectangle, focus cyberpunkFocusSpec) {
	dc := gg.NewContextForRGBA(layer)
	minDimension := math.Max(1, math.Min(float64(bounds.Dx()), float64(bounds.Dy())))
	count := 5 + rand.Intn(7)
	for i := 0; i < count; i++ {
		angle := rand.Float64() * math.Pi * 2
		push := 0.85 + rand.Float64()*0.75
		contour := cyberpunkContourSpec{
			centerX:    focus.centerX + math.Cos(angle)*focus.halfWidth*push,
			centerY:    focus.centerY + math.Sin(angle)*focus.halfHeight*push,
			radiusX:    focus.halfWidth * (0.40 + rand.Float64()*1.05),
			radiusY:    focus.halfHeight * (0.26 + rand.Float64()*0.92),
			rotation:   angle + (rand.Float64()-0.5)*0.9,
			curvePower: 1.4 + rand.Float64()*4.6,
			squared:    rand.Intn(100) < 42,
		}
		bands := 1 + rand.Intn(3)
		for band := 0; band < bands; band++ {
			strokeWidth := minDimension*(0.0025+rand.Float64()*0.0065) + float64(band)*minDimension*0.002
			contourColor := randomCyberpunkColor(uint8(145 + rand.Intn(95)))
			dc.SetColor(contourColor)
			dc.SetLineWidth(strokeWidth)
			bandContour := contour
			bandContour.radiusX += float64(band) * strokeWidth * 2.7
			bandContour.radiusY += float64(band) * strokeWidth * 2.7
			traceCyberpunkContour(dc, bandContour)
			dc.Stroke()
		}
	}
}

func traceCyberpunkContour(dc *gg.Context, contour cyberpunkContourSpec) {
	if contour.squared {
		corner := math.Min(contour.radiusX, contour.radiusY) * (0.04 + rand.Float64()*0.16)
		points := [][2]float64{
			{-contour.radiusX + corner, -contour.radiusY}, {contour.radiusX - corner, -contour.radiusY}, {contour.radiusX, -contour.radiusY + corner}, {contour.radiusX, contour.radiusY - corner},
			{contour.radiusX - corner, contour.radiusY}, {-contour.radiusX + corner, contour.radiusY}, {-contour.radiusX, contour.radiusY - corner}, {-contour.radiusX, -contour.radiusY + corner},
		}
		for index, point := range points {
			x, y := rotatePoint(point[0], point[1], contour.rotation)
			if index == 0 {
				dc.MoveTo(contour.centerX+x, contour.centerY+y)
			} else {
				dc.LineTo(contour.centerX+x, contour.centerY+y)
			}
		}
		dc.ClosePath()
		return
	}

	steps := 96
	power := math.Max(1, contour.curvePower)
	for step := 0; step <= steps; step++ {
		angle := (float64(step) / float64(steps)) * math.Pi * 2
		cosine := math.Cos(angle)
		sine := math.Sin(angle)
		px := math.Copysign(math.Pow(math.Abs(cosine), 2/power)*contour.radiusX, cosine)
		py := math.Copysign(math.Pow(math.Abs(sine), 2/power)*contour.radiusY, sine)
		rx, ry := rotatePoint(px, py, contour.rotation)
		if step == 0 {
			dc.MoveTo(contour.centerX+rx, contour.centerY+ry)
		} else {
			dc.LineTo(contour.centerX+rx, contour.centerY+ry)
		}
	}
	dc.ClosePath()
}

func rotatePoint(x, y, rotation float64) (float64, float64) {
	cosine := math.Cos(rotation)
	sine := math.Sin(rotation)
	return x*cosine - y*sine, x*sine + y*cosine
}

func drawCyberpunkBackgroundFigures(layer *image.RGBA, bounds image.Rectangle, focus cyberpunkFocusSpec) {
	dc := gg.NewContextForRGBA(layer)
	width, height := float64(bounds.Dx()), float64(bounds.Dy())
	minDimension := math.Max(1, math.Min(width, height))
	drawCyberpunkCelestialBodies(dc, bounds, focus, width, height, minDimension)
	drawCyberpunkBuildings(dc, bounds, focus, width, height)
}

func drawCyberpunkCelestialBodies(dc *gg.Context, bounds image.Rectangle, focus cyberpunkFocusSpec, width, height, minDimension float64) {
	for i := 0; i < 3+rand.Intn(5); i++ {
		x := float64(bounds.Min.X) + rand.Float64()*width
		y := float64(bounds.Min.Y) + rand.Float64()*height*0.70
		if cyberpunkFocusAmount(x, y, focus) > 0.25 {
			continue
		}
		radius := minDimension * (0.018 + rand.Float64()*0.055)
		if rand.Intn(100) < 42 {
			drawCyberpunkMoon(dc, x, y, radius*(1.15+rand.Float64()*0.65))
		} else {
			bodyColor := randomCyberpunkColor(82)
			dc.SetColor(bodyColor)
			dc.SetLineWidth(math.Max(1.5, radius*0.08))
			dc.DrawCircle(x, y, radius)
			dc.Stroke()
			dc.SetColor(randomCyberpunkColor(58))
			dc.SetLineWidth(math.Max(1, radius*0.04))
			dc.DrawEllipse(x, y, radius*(1.45+rand.Float64()*0.80), radius*(0.24+rand.Float64()*0.22))
			dc.Stroke()
		}
	}
}

func drawCyberpunkBuildings(dc *gg.Context, bounds image.Rectangle, focus cyberpunkFocusSpec, width, height float64) {
	buildingCount := 4 + rand.Intn(8)
	for i := 0; i < buildingCount; i++ {
		buildingWidth := width * (0.018 + rand.Float64()*0.045)
		buildingHeight := height * (0.10 + rand.Float64()*0.28)
		x := float64(bounds.Min.X) + rand.Float64()*(width-buildingWidth)
		y := float64(bounds.Max.Y) - buildingHeight
		if cyberpunkFocusAmount(x+buildingWidth/2, y+buildingHeight/2, focus) > 0.40 {
			continue
		}
		dc.SetColor(color.RGBA{R: 3, G: 8, B: 22, A: 170})
		dc.DrawRectangle(x, y, buildingWidth, buildingHeight)
		dc.Fill()
		windowColor := randomCyberpunkColor(135)
		dc.SetColor(windowColor)
		columns := 2 + rand.Intn(3)
		rows := 4 + rand.Intn(8)
		windowWidth := buildingWidth / float64(columns*3)
		windowHeight := buildingHeight / float64(rows*5)
		for row := 0; row < rows; row++ {
			for col := 0; col < columns; col++ {
				if rand.Intn(100) < 45 {
					continue
				}
				wx := x + buildingWidth*0.20 + float64(col)*buildingWidth/float64(columns)
				wy := y + buildingHeight*0.12 + float64(row)*buildingHeight/float64(rows)
				dc.DrawRectangle(wx, wy, windowWidth, windowHeight)
				dc.Fill()
			}
		}
	}
}

func drawCyberpunkMoon(dc *gg.Context, x, y, radius float64) {
	moonColor := color.RGBA{R: 24, G: 202, B: 255, A: 132}
	hotEdge := color.RGBA{R: 114, G: 247, B: 255, A: 210}
	dc.SetColor(moonColor)
	dc.DrawCircle(x, y, radius)
	dc.Fill()
	dc.SetColor(color.RGBA{R: 0, G: 0, B: 16, A: 205})
	dc.DrawCircle(x+radius*(0.30+rand.Float64()*0.30), y-radius*(0.04+rand.Float64()*0.12), radius*(0.78+rand.Float64()*0.18))
	dc.Fill()
	dc.SetColor(hotEdge)
	dc.SetLineWidth(math.Max(1.5, radius*0.11))
	dc.DrawArc(x, y, radius, math.Pi*0.58, math.Pi*1.42)
	dc.Stroke()
	dc.SetColor(color.RGBA{R: 255, G: 36, B: 210, A: 92})
	dc.SetLineWidth(math.Max(1, radius*0.045))
	dc.DrawArc(x, y, radius*1.16, math.Pi*0.56, math.Pi*1.44)
	dc.Stroke()
}

func mixRGBA(left, right color.RGBA, amount float64) color.RGBA {
	amount = math.Max(0, math.Min(1, amount))
	return color.RGBA{
		R: uint8(float64(left.R)*(1-amount) + float64(right.R)*amount),
		G: uint8(float64(left.G)*(1-amount) + float64(right.G)*amount),
		B: uint8(float64(left.B)*(1-amount) + float64(right.B)*amount),
		A: uint8(float64(left.A)*(1-amount) + float64(right.A)*amount),
	}
}
