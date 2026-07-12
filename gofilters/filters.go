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
	"golang.org/x/image/draw"
)

func init() {
	rand.Seed(time.Now().UnixNano())
}

// ApplyFilter applies the named filter to the image at inputPath,
// writes the result to outputDir, and returns the output file path.
// filterName: Original, BlurSoft, BlurHard, Pixelate, Monochrome,
//             Cartoon, Wavy, Vortex, Mosaic, JigsawPuzzle, Graffiti, Oilify
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
		if px < bounds.Min.X { px = bounds.Min.X }
		if py < bounds.Min.Y { py = bounds.Min.Y }
		if px >= bounds.Min.X+W { px = bounds.Min.X + W - 1 }
		if py >= bounds.Min.Y+H { py = bounds.Min.Y + H - 1 }
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
	if tw == 0 { tw = width }
	if th == 0 { th = height }
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
	if tileW < 2 { tileW = 2 }
	if tileH < 2 { tileH = 2 }

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

			if scaledX+tileWidthScaled > scaledW { tileWidthScaled = scaledW - scaledX }
			if scaledY+tileHeightScaled > scaledH { tileHeightScaled = scaledH - scaledY }
			if tileWidthScaled <= 0 || tileHeightScaled <= 0 { continue }

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
	if rows < 10 { rows = 10 }
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
